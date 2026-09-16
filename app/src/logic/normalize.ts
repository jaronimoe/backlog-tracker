/**
 * Canonical title normalization used by ALL import paths for deduplication.
 * Two titles that normalize to the same string are considered the same game.
 *
 * Rules:
 * - Diacritics are folded onto their ASCII base, so "Pokémon" == "Pokemon"
 *   and "Ōkami" == "Okami".
 * - ®™© dropped, "&" -> " and ", anything outside [a-z0-9] collapsed to a
 *   single space, a leading "the " dropped.
 * - Roman numerals II–XIII become digits (I and X are deliberately skipped).
 * - Only *bundle / SKU-tier* suffixes are stripped — they mark the same build
 *   with extra content or a higher price tier: "game of the year" / "goty"
 *   (bare or with "edition"), plus "complete | deluxe | ultimate | premium |
 *   gold | legacy | collector's | standard" when followed by "edition".
 * - *Re-release* markers are NEVER stripped — "remastered | remaster | remake |
 *   hd | definitive | enhanced | anniversary | director's cut | special
 *   edition" are different builds the user may play, and time, separately from
 *   the original, so they stay separate games.
 *
 * "The Witcher® 3: Wild Hunt - Game of the Year Edition" -> "witcher 3 wild hunt"
 * "Command & Conquer™ Red Alert™ 3"                      -> "command and conquer red alert 3"
 * "Final Fantasy VII"                                    -> "final fantasy 7"
 * "Ōkami HD"                                             -> "okami hd"  (≠ "okami")
 * "Mafia: Definitive Edition"                            -> "mafia definitive edition"
 */

// deliberately excludes "i" and "x": Mega Man X != Mega Man 10
const ROMAN: Record<string, string> = {
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  xi: "11",
  xii: "12",
  xiii: "13",
};

/**
 * Whether this JS engine's String.prototype.normalize really decomposes.
 * Hermes ships it, but the check is cheap and a stripped-down build that
 * lacks it would otherwise silently stop folding accents.
 * (To confirm on device: log `"é".normalize("NFD").length === 2`.)
 */
const CAN_DECOMPOSE = (() => {
  try {
    return "é".normalize("NFD").length === 2;
  } catch {
    return false;
  }
})();

/** Combining diacritical marks, i.e. what NFD splits an accent off into. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Hand-rolled folding, used only when CAN_DECOMPOSE is false. Lower-case in. */
const FOLD_FALLBACK: Array<[RegExp, string]> = [
  [/[àáâãäåā]/g, "a"],
  [/ç/g, "c"],
  [/[èéêëē]/g, "e"],
  [/[ìíîïī]/g, "i"],
  [/ñ/g, "n"],
  [/[òóôõöō]/g, "o"],
  [/[ùúûüū]/g, "u"],
  [/[ýÿ]/g, "y"],
];

/**
 * Letters with no canonical decomposition: NFD leaves them alone, so they are
 * folded by hand on both paths.
 */
const LIGATURES: Array<[RegExp, string]> = [
  [/ø/g, "o"],
  [/æ/g, "ae"],
  [/œ/g, "oe"],
  [/ß/g, "ss"],
];

/** Fold accented letters onto their ASCII base. Input must be lower-cased. */
function foldDiacritics(lower: string): string {
  let t = CAN_DECOMPOSE
    ? lower.normalize("NFD").replace(COMBINING_MARKS, "")
    : FOLD_FALLBACK.reduce((s, [re, to]) => s.replace(re, to), lower);
  for (const [re, to] of LIGATURES) t = t.replace(re, to);
  return t;
}

/**
 * Bundle / SKU-tier suffixes only — same build, extra content or price tier.
 * "game of the year" / "goty" may stand alone; every other marker is stripped
 * only when followed by "edition", so "Pokémon Gold" and "Halo: Combat
 * Evolved" keep their words.
 * Re-release markers (hd, remastered, remaster, remake, definitive, enhanced,
 * anniversary, director's cut, special edition) are deliberately NOT here:
 * they are separate games with separate playtime.
 */
const EDITION_SUFFIX =
  /\s*[-:–—(]?\s*(?:(?:game of the year|goty)(?:\s+edition)?|(?:complete|deluxe|ultimate|premium|gold|legacy|collector[’']?s|standard)\s+edition)\s*\)?\s*$/i;

export function normalizeTitle(raw: string): string {
  let t = foldDiacritics(raw.toLowerCase().trim());
  t = t.replace(/[®™©]/g, "");
  // strip (possibly stacked) bundle/SKU-tier suffixes
  let prev = "";
  while (prev !== t) {
    prev = t;
    t = t.replace(EDITION_SUFFIX, "");
  }
  t = t.replace(/&/g, " and ");
  t = t.replace(/[^a-z0-9]+/g, " ").trim();
  t = t
    .split(" ")
    .map((w) => ROMAN[w] ?? w)
    .join(" ");
  if (t.startsWith("the ")) t = t.slice(4);
  return t;
}

/** Strip trademark symbols / stray whitespace but keep the human-readable title. */
export function cleanTitle(raw: string): string {
  return raw.replace(/[®™©]/g, "").replace(/\s+/g, " ").trim();
}
