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

/** A byNorm entry with its tokenisation precomputed once. */
interface CachedEntry {
  norm: string;
  id: number;
  tokens: string[];
  sig: string;
}

interface TokenCache {
  /** How many byNorm entries (in insertion order) are already in `entries`. */
  seen: number;
  entries: CachedEntry[];
}

/**
 * Per-Map tokenisation cache for findFuzzyMatch().
 *
 * Importers build one `byNorm` Map and call findFuzzyMatch() once per row, so
 * without a cache every row re-splits and re-regexes the whole library
 * (1 000 games × 1 000 rows ≈ a million passes on the JS thread). The cache is
 * keyed by the Map itself and held weakly, so it dies with the import.
 *
 * INVARIANT: callers only ever *append* new keys to `byNorm` while an import
 * runs (`csvImport`/`steam` call `set` only after a lookup missed, so the key
 * is always new, and they never re-`set` an existing key to a different id).
 * Map iteration is insertion-ordered, so `entries[i]` stays aligned with the
 * i-th Map entry and growth only ever means appending at index ≥ `seen`.
 * A shrunken Map means keys were deleted and the alignment is gone, so the
 * cache is rebuilt from scratch. A same-size swap (delete + add, or re-`set`
 * to a new id) would go unnoticed — no caller does that.
 * `findSimilarGame` in db/repo.ts builds a fresh Map per call, so it neither
 * benefits from nor regresses with the cache.
 */
const tokenCaches = new WeakMap<Map<string, number>, TokenCache>();

function cachedEntries(byNorm: Map<string, number>): CachedEntry[] {
  let cache = tokenCaches.get(byNorm);
  if (!cache) {
    cache = { seen: 0, entries: [] };
    tokenCaches.set(byNorm, cache);
  }
  if (byNorm.size < cache.seen) {
    // Entries were deleted — indices no longer line up, so start over.
    cache.seen = 0;
    cache.entries = [];
  }
  if (byNorm.size > cache.seen) {
    let i = 0;
    for (const [candNorm, id] of byNorm) {
      if (i++ < cache.seen) continue; // already tokenised
      const tokens = candNorm.split(" ");
      cache.entries.push({
        norm: candNorm,
        id,
        tokens,
        sig: numberSignature(tokens),
      });
    }
    cache.seen = byNorm.size;
  }
  return cache.entries;
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
  const entries = cachedEntries(byNorm);
  let best: FuzzyMatch | null = null;
  let bestDist = Number.MAX_SAFE_INTEGER;

  for (let i = 0; i < entries.length; i++) {
    const cand = entries[i];
    if (cand.norm === norm || !cand.norm) continue;
    if (cand.sig !== sig) continue;

    if (isSubtitleDrop(tokens, cand.tokens) || isSubtitleDrop(cand.tokens, tokens))
      return { id: cand.id, norm: cand.norm }; // strongest signal — take it immediately

    const budget = typoBudget(Math.min(norm.length, cand.norm.length));
    if (budget === 0) continue;
    const d = boundedLevenshtein(norm, cand.norm, budget);
    if (d <= budget && d < bestDist) {
      bestDist = d;
      best = { id: cand.id, norm: cand.norm };
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
