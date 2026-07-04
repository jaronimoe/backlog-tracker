/**
 * Canonical title normalization used by ALL import paths for deduplication.
 * Two titles that normalize to the same string are considered the same game.
 *
 * "The Witcher® 3: Wild Hunt - Game of the Year Edition" -> "witcher 3 wild hunt"
 * "Command & Conquer™ Red Alert™ 3"                      -> "command and conquer red alert 3"
 * "Final Fantasy VII"                                    -> "final fantasy 7"
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

const EDITION_SUFFIX =
  /\s*[-:–—(]?\s*(game of the year|goty|definitive|remastered|remaster|complete|deluxe|enhanced|ultimate|anniversary|legacy|special|gold|premium|hd|director'?s cut)\s*(edition|cut)?\s*\)?\s*$/i;

export function normalizeTitle(raw: string): string {
  let t = raw.toLowerCase().trim();
  t = t.replace(/[®™©]/g, "");
  // strip (possibly stacked) edition suffixes
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
