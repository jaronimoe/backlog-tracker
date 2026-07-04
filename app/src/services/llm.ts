import { getSetting, setSetting, SETTINGS, LLM_DEFAULTS } from "../db/database";
import { updateGame } from "../db/repo";
import { GameWithMeta } from "../types";

/**
 * On-demand LLM "Where was I?" recap.
 *
 * Defaults target GitHub Models (free, rate-limited) via an OpenAI-compatible
 * endpoint, but the base URL and model are user-configurable so any compatible
 * provider (OpenRouter, a paid OpenAI/Anthropic-compatible gateway, a local
 * Ollama, …) works by only changing Settings — no code change.
 *
 * Hard constraint discovered empirically: GitHub Models caps a single request
 * at 8000 input tokens for gpt-4.1. We stay well under that with a self-imposed
 * budget and only ever send a *window of the walkthrough up to the player's
 * marked position* — never the whole guide, never anything ahead of them.
 */

// Self-imposed input budget, comfortably under the 8000-token hard cap.
const INPUT_TOKEN_BUDGET = 6000;
// Rough bytes-per-token for English prose. Deliberately conservative.
const CHARS_PER_TOKEN = 4;
// Reserve headroom for the system prompt + instructions (~500 tokens).
const RESERVED_TOKENS = 500;
// Max characters of walkthrough context we'll send.
export const CONTEXT_CHAR_BUDGET =
  (INPUT_TOKEN_BUDGET - RESERVED_TOKENS) * CHARS_PER_TOKEN;

export interface LlmConfig {
  token: string;
  baseUrl: string;
  model: string;
}

export function llmConfig(): LlmConfig {
  return {
    token: getSetting(SETTINGS.llmToken, ""),
    baseUrl: getSetting(SETTINGS.llmBaseUrl, LLM_DEFAULTS.baseUrl),
    model: getSetting(SETTINGS.llmModel, LLM_DEFAULTS.model),
  };
}

export function llmConfigured(): boolean {
  return llmConfig().token.trim().length > 0;
}

export function saveLlmConfig(token: string, baseUrl: string, model: string) {
  setSetting(SETTINGS.llmToken, token.trim());
  setSetting(SETTINGS.llmBaseUrl, (baseUrl.trim() || LLM_DEFAULTS.baseUrl).replace(/\/+$/, ""));
  setSetting(SETTINGS.llmModel, model.trim() || LLM_DEFAULTS.model);
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function chat(
  cfg: LlmConfig,
  messages: ChatMessage[],
  maxTokens = 400
): Promise<string> {
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: cfg.model, messages, max_tokens: maxTokens }),
    });
  } catch (e: any) {
    throw new Error(`Network error reaching the model: ${String(e?.message ?? e)}`);
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = j?.error?.message || j?.message || detail;
    } catch {}
    if (res.status === 401 || res.status === 403)
      throw new Error(`Auth rejected (${detail}). Check your token & its Models permission.`);
    if (res.status === 429)
      throw new Error(`Rate limit hit (${detail}). Wait a bit and try again.`);
    if (res.status === 413)
      throw new Error(`Request too large (${detail}). This shouldn't happen — report it.`);
    throw new Error(detail);
  }
  const j = await res.json();
  const text = j?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Model returned an empty response.");
  return text;
}

/** Lightweight PONG round-trip to validate token + endpoint + model. */
export async function verifyLlm(cfg: LlmConfig): Promise<void> {
  const reply = await chat(
    cfg,
    [{ role: "user", content: "Reply with exactly: PONG" }],
    5
  );
  if (!/pong/i.test(reply)) {
    throw new Error(`Unexpected reply from model: "${reply.slice(0, 40)}"`);
  }
}

/**
 * The slice of walkthrough text leading UP TO the player's marked position,
 * trimmed to the context budget (keeping the most recent text) and snapped to
 * a paragraph boundary so we never start mid-sentence.
 */
export function recapContext(text: string, position: number): string {
  const upto = text.slice(0, Math.max(0, position));
  if (upto.length <= CONTEXT_CHAR_BUDGET) return upto.trim();
  const tail = upto.slice(upto.length - CONTEXT_CHAR_BUDGET);
  // Drop a partial leading paragraph so the excerpt starts cleanly.
  const nl = tail.indexOf("\n\n");
  return (nl >= 0 ? tail.slice(nl + 2) : tail).trim();
}

/** Cache key: recap is valid only for this exact position + walkthrough text. */
function recapKey(text: string, position: number): string {
  // Cheap, stable content hash (djb2) — collisions are irrelevant here since we
  // also fold in position and text length.
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${position}:${text.length}:${h >>> 0}`;
}

export interface RecapResult {
  text: string;
  cached: boolean;
}

export function canRecap(game: GameWithMeta): boolean {
  return (
    game.progress_method === "walkthrough" &&
    !!game.walkthrough_text &&
    game.walkthrough_text.trim().length > 0 &&
    game.walkthrough_position > 0
  );
}

/**
 * Return a "Where was I?" recap for a walkthrough-tracked game. Uses the cached
 * recap when the position + text are unchanged, unless `force` is set.
 */
export async function getRecap(
  game: GameWithMeta,
  force = false
): Promise<RecapResult> {
  if (!llmConfigured())
    throw new Error("No model configured. Add a token in Settings → AI recap.");
  if (!canRecap(game))
    throw new Error(
      "Recap needs a walkthrough with your position marked. Open the Walkthrough tab and tap where you stopped."
    );

  const text = game.walkthrough_text!;
  const key = recapKey(text, game.walkthrough_position);
  if (!force && game.recap_key === key && game.recap_text) {
    return { text: game.recap_text, cached: true };
  }

  const context = recapContext(text, game.walkthrough_position);
  const cfg = llmConfig();
  const recap = await chat(cfg, [
    {
      role: "system",
      content:
        "You help a player remember where they left off in a video game. " +
        "You are given the excerpt of a walkthrough leading UP TO the exact point " +
        "where they stopped playing. Using ONLY this excerpt, write a short, warm " +
        '"Where was I?" recap: 2-4 sentences on what they just accomplished and ' +
        "where they now stand. Do NOT reveal or hint at anything that comes after " +
        "their stopping point. Do NOT invent facts not present in the excerpt. " +
        "Address the player as \"you\". No preamble, just the recap.",
    },
    {
      role: "user",
      content: `Game: ${game.title}\n\nWalkthrough excerpt (ends where I stopped):\n"""\n${context}\n"""`,
    },
  ]);

  updateGame(game.id, { recap_text: recap, recap_key: key });
  return { text: recap, cached: false };
}
