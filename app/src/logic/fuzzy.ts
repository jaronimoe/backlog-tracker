import { normalizeTitle } from "./normalize";

/**
 * Tier-3 dedup: conservative fuzzy matching on *normalized* titles
 * (see normalizeTitle()). Catches what exact normalization misses:
 *
 *   "The Witcher 3"      vs "The Witcher III: Wild Hunt"  (dropped subtitle)
 *   "Resident Evil 2"    vs "Resident Evil 2 Remake"      (dropped qualifier)
 *   "Hollow Knight: Silk Song" vs "Hollow Knight: Silksong" (typo/spacing)
 *
 * Deliberately conservative — false merges are worse than missed merges:
 * - Numeric tokens must be identical ("resident evil 2" never matches
 *   "resident evil 3", "fifa 12" never matches "fifa 21").
 * - Subtitle-drop only applies when the shorter title ends in a number
 *   ("witcher 3" ⊂ "witcher 3 wild hunt" ✓, but "god of war" does NOT
 *   match "god of war ragnarok" — those are different games).
 * - Typo tolerance scales with length and is disabled for short titles.
 */

export interface FuzzyMatch {
  id: number;
  /** the existing game's normalized title that was matched */
  norm: string;
}

/** Comma-joined sequence of numeric tokens, e.g. "half life 2 episode 1" -> "2,1" */
function numberSignature(tokens: string[]): string {
  return tokens.filter((t) => /^\d+$/.test(t)).join(",");
}

/**
 * Tokens that indicate the longer title is an expansion/episode rather than
 * the same game with a subtitle: "Half-Life 2" must NOT match
 * "Half-Life 2: Episode One".
 */
const EXPANSION_MARKERS = new Set([
  "episode",
  "chapter",
  "part",
  "vol",
  "volume",
  "season",
  "act",
  "book",
  "dlc",
  "expansion",
]);

/**
 * True when `short` is a token-prefix of `long` and looks like a sequel
 * title missing its subtitle: at least 2 tokens, ending in a number, and
 * the extra tokens are not an expansion/episode qualifier.
 */
function isSubtitleDrop(short: string[], long: string[]): boolean {
  if (short.length < 2 || long.length <= short.length) return false;
  if (!/^\d+$/.test(short[short.length - 1])) return false;
  if (!short.every((t, i) => t === long[i])) return false;
  return !long.slice(short.length).some((t) => EXPANSION_MARKERS.has(t));
}

/** Levenshtein distance, bailing out early once it exceeds `max`. */
export function boundedLevenshtein(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Allowed edit distance for a pair of normalized titles of this min length. */
function typoBudget(minLen: number): number {
  if (minLen >= 12) return 2;
  if (minLen >= 6) return 1;
  return 0;
}

/**
 * Whether two normalized titles refer to the same game.
 * Both inputs MUST already be normalizeTitle() output.
 */
export function isFuzzyMatch(a: string, b: string): boolean {
  if (!a || !b || a === b) return a === b && a !== "";
  const ta = a.split(" ");
  const tb = b.split(" ");
  if (numberSignature(ta) !== numberSignature(tb)) return false;
  if (isSubtitleDrop(ta, tb) || isSubtitleDrop(tb, ta)) return true;
  const budget = typoBudget(Math.min(a.length, b.length));
  return budget > 0 && boundedLevenshtein(a, b, budget) <= budget;
}

/**
 * Find an existing game whose normalized title fuzzily matches `norm`.
 * Call only after the exact byNorm lookup missed. Subtitle-drop matches
 * are preferred over typo matches; among typo matches the closest wins.
 */
export function findFuzzyMatch(
  norm: string,
  byNorm: Map<string, number>
): FuzzyMatch | null {
  if (!norm) return null;
  const tokens = norm.split(" ");
  const sig = numberSignature(tokens);
  let best: FuzzyMatch | null = null;
  let bestDist = Number.MAX_SAFE_INTEGER;

  for (const [candNorm, id] of byNorm) {
    if (candNorm === norm || !candNorm) continue;
    const candTokens = candNorm.split(" ");
    if (numberSignature(candTokens) !== sig) continue;

    if (isSubtitleDrop(tokens, candTokens) || isSubtitleDrop(candTokens, tokens))
      return { id, norm: candNorm }; // strongest signal — take it immediately

    const budget = typoBudget(Math.min(norm.length, candNorm.length));
    if (budget === 0) continue;
    const d = boundedLevenshtein(norm, candNorm, budget);
    if (d <= budget && d < bestDist) {
      bestDist = d;
      best = { id, norm: candNorm };
    }
  }
  return best;
}

/** Convenience: fuzzy-match a raw (un-normalized) title. */
export function findFuzzyMatchForTitle(
  title: string,
  byNorm: Map<string, number>
): FuzzyMatch | null {
  return findFuzzyMatch(normalizeTitle(title), byNorm);
}
