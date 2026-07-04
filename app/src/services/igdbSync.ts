import { db, withTx } from "../db/database";
import { addTag } from "../db/repo";
import { normalizeTitle } from "../logic/normalize";
import { igdbConfigured, IgdbGame, searchIgdb } from "./igdb";
import { RowResult, startAsyncImport } from "./importQueue";

/**
 * Bulk IGDB metadata sync for games added without IGDB lookup
 * (CSV import, Steam import, title-only manual adds).
 *
 * A game is a candidate when it is NOT yet linked to an IGDB id AND is
 * missing at least one of: cover art, release year, genre tags. Games
 * picked from the IGDB search on the Add screen are linked and therefore
 * skipped, as is anything a previous sync run already processed — safe to
 * re-run any time.
 *
 * Matching is conservative: an exact normalized-title match among the
 * search results is preferred; otherwise the top result is used and the
 * row is flagged with "≈" so mismatches are easy to spot. Only missing
 * fields are filled — existing covers (e.g. Steam capsule art), years and
 * platform tags are never overwritten.
 */

interface Candidate {
  id: number;
  title: string;
  cover_url: string | null;
  release_year: number | null;
  platform_summary: string | null;
}

/** IGDB free tier allows 4 requests/second — stay comfortably under it. */
const REQUEST_GAP_MS = 300;
/** Abort the whole run after this many back-to-back lookup failures. */
const MAX_CONSECUTIVE_ERRORS = 3;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function metadataSyncCandidates(): Candidate[] {
  return db.getAllSync<Candidate>(
    `SELECT g.id, g.title, g.cover_url, g.release_year, g.platform_summary
     FROM games g
     WHERE g.id NOT IN (
             SELECT game_id FROM game_external_ids WHERE source = 'igdb'
           )
       AND (g.cover_url IS NULL
            OR g.release_year IS NULL
            OR NOT EXISTS (
                 SELECT 1 FROM tags t
                 WHERE t.game_id = g.id AND t.tag LIKE 'genre:%'
               ))
     ORDER BY g.title`
  );
}

function pickMatch(
  title: string,
  results: IgdbGame[]
): { game: IgdbGame; fuzzy: boolean } | null {
  if (results.length === 0) return null;
  const norm = normalizeTitle(title);
  const exact = results.find((r) => normalizeTitle(r.name) === norm);
  if (exact) return { game: exact, fuzzy: false };
  return { game: results[0], fuzzy: true };
}

/** Fill missing fields from the IGDB match. Returns what was changed. */
function applyMetadata(c: Candidate, m: IgdbGame): string[] {
  const details: string[] = [];
  withTx(() => {
    if (!c.cover_url && m.coverUrl) {
      db.runSync("UPDATE games SET cover_url = ? WHERE id = ?", [
        m.coverUrl,
        c.id,
      ]);
      details.push("cover");
    }
    if (c.release_year == null && m.releaseYear != null) {
      db.runSync("UPDATE games SET release_year = ? WHERE id = ?", [
        m.releaseYear,
        c.id,
      ]);
      details.push("year");
    }
    if (!c.platform_summary && m.platforms.length > 0) {
      db.runSync("UPDATE games SET platform_summary = ? WHERE id = ?", [
        m.platforms.join(", "),
        c.id,
      ]);
    }

    const existingTags = db
      .getAllSync<{ tag: string }>("SELECT tag FROM tags WHERE game_id = ?", [
        c.id,
      ])
      .map((r) => r.tag);

    let newTags = 0;
    if (!existingTags.some((t) => t.startsWith("genre:"))) {
      for (const g of m.genres) {
        addTag(c.id, `genre:${g}`);
        newTags++;
      }
    }
    // platform tags only when none exist — a Steam-imported game is owned
    // on Steam, not on every platform the game was ever released for
    if (!existingTags.some((t) => t.startsWith("platform:"))) {
      for (const p of m.platforms) {
        addTag(c.id, `platform:${p}`);
        newTags++;
      }
    }
    if (newTags > 0) details.push(`${newTags} tags`);

    // link the IGDB id so future syncs/adds skip & dedup on it
    db.runSync(
      "INSERT OR IGNORE INTO game_external_ids (game_id, source, external_id) VALUES (?, 'igdb', ?)",
      [c.id, String(m.id)]
    );
  });
  return details;
}

/**
 * Queue a non-blocking metadata sync on the shared Import tab.
 * Returns the number of games queued (0 = nothing to do).
 */
export function startIgdbMetadataSync(): number {
  if (!igdbConfigured())
    throw new Error("Add your IGDB credentials in Settings first");
  const candidates = metadataSyncCandidates();
  if (candidates.length === 0) return 0;

  let consecutiveErrors = 0;

  startAsyncImport(
    "IGDB metadata sync",
    candidates.map((c) => c.title),
    async (i): Promise<RowResult> => {
      const c = candidates[i];
      await sleep(REQUEST_GAP_MS);

      let results: IgdbGame[];
      try {
        results = await searchIgdb(c.title);
        consecutiveErrors = 0;
      } catch (e) {
        if (++consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) throw e;
        return { status: "invalid", detail: "lookup failed" };
      }

      const match = pickMatch(c.title, results);
      if (!match) return { status: "invalid", detail: "no IGDB match" };

      const details = applyMetadata(c, match.game);
      if (details.length === 0)
        return { status: "duplicate", detail: "nothing missing" };
      return {
        status: "merged",
        detail: (match.fuzzy ? "≈ " : "") + "+" + details.join(" +"),
      };
    }
  );
  return candidates.length;
}
