import { db, getSetting, SETTINGS } from "../db/database";
import {
  addGame,
  addNote,
  addTag,
  ensureMarkerSession,
  windowConfig,
} from "../db/repo";
import { fmtMinutes, isoDate } from "../logic/derive";
import { cleanTitle, normalizeTitle } from "../logic/normalize";
import { findFuzzyMatch } from "../logic/fuzzy";
import { RowResult, startImport } from "./importQueue";

/**
 * Steam library import (IPlayerService/GetOwnedGames).
 *
 * Playtime model: Steam's lifetime total per appid lives on the link row
 * (`game_external_ids.playtime_minutes`) and is never merged into sessions or
 * `imported_minutes`. A game's playtime is max(sum of its Steam totals,
 * imported_minutes + logged sessions) — the two measure the same play, so the
 * larger number is the truer one. Sync only refreshes the per-appid totals, the
 * last-played date and the zero-minute calendar marker.
 *
 * Merge policy (user decision):
 * - Games already linked by appid -> skipped (idempotent re-sync), unless
 *   `resyncPlaytime` is set, in which case their Steam playtime and
 *   last-played date are refreshed from the live library.
 * - Games matching an existing entry by normalized title (exact, or via the
 *   conservative fuzzy tier in logic/fuzzy.ts) -> MERGED into it, flagged
 *   with a `source:steam` tag + an audit note; Steam's playtime lands on the
 *   new link row, so nothing the user tracked is touched or double counted.
 * - Everything else -> added; never-played Steam games additionally get a
 *   `status:unplayed` tag so they don't drown the real backlog.
 */

/**
 * Note stamped on the 0-minute "last played" marker sessions Steam sync
 * creates. Sync no longer writes minutes into sessions; older installs may
 * still carry dated sessions with this note from the pre-v9 delta model.
 */
export const STEAM_MARKER_NOTE = "Last played on Steam";

export interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number; // minutes
  rtime_last_played?: number; // unix seconds, 0 = never
}

export function steamConfigured(): boolean {
  return (
    getSetting(SETTINGS.steamApiKey, "").length > 0 &&
    getSetting(SETTINGS.steamId, "").length > 0
  );
}

export async function fetchSteamLibrary(): Promise<SteamGame[]> {
  const key = getSetting(SETTINGS.steamApiKey, "").trim();
  const sid = getSetting(SETTINGS.steamId, "").trim();
  if (!key || !sid)
    throw new Error("Enter your Steam Web API key and SteamID64 first");
  const res = await fetch(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${sid}&include_appinfo=1&include_played_free_games=1&format=json`
  );
  if (res.status === 401 || res.status === 403)
    throw new Error("Steam rejected the API key (HTTP " + res.status + ")");
  if (!res.ok) throw new Error(`Steam API error (HTTP ${res.status})`);
  const j = await res.json();
  const games: SteamGame[] = j?.response?.games ?? [];
  if (games.length === 0)
    throw new Error(
      "Steam returned no games — check the SteamID64 and make sure the profile's \"Game details\" privacy setting is Public"
    );
  return games;
}

function coverUrl(appid: number): string {
  // portrait capsule; Cover component falls back to initials on 404
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
}

function lastPlayedDate(g: SteamGame): string | null {
  return g.rtime_last_played ? isoDate(new Date(g.rtime_last_played * 1000)) : null;
}

function importSteamRow(
  g: SteamGame,
  linked: Map<string, number>,
  byNorm: Map<string, number>,
  resyncPlaytime: boolean
): RowResult {
  const appid = String(g.appid);
  const title = cleanTitle(g.name);
  if (!title) return { status: "invalid", detail: "empty name" };
  if (linked.has(appid)) {
    if (!resyncPlaytime)
      return { status: "duplicate", detail: "already linked" };
    return resyncLinked(g, linked.get(appid)!);
  }

  const norm = normalizeTitle(title);
  const lastPlayed = lastPlayedDate(g);
  let existingId = byNorm.get(norm);
  let fuzzyNorm: string | null = null; // set when the tier-3 fuzzy match hit
  if (existingId == null) {
    const fm = findFuzzyMatch(norm, byNorm);
    if (fm) {
      existingId = fm.id;
      fuzzyNorm = fm.norm;
    }
  }

  if (existingId != null) {
    // ---- merge into existing entry, flag it ----
    // Steam's total goes on the link row, never into imported_minutes: the
    // game's playtime is max(Steam, own records), so nothing double counts.
    db.runSync(
      `INSERT OR IGNORE INTO game_external_ids (game_id, source, external_id, playtime_minutes)
       VALUES (?, 'steam', ?, ?)`,
      [existingId, appid, g.playtime_forever]
    );
    linked.set(appid, existingId);
    addTag(existingId, "source:steam");
    addTag(existingId, "platform:steam");

    const row = db.getFirstSync<{
      last_played_override: string | null;
      cover_url: string | null;
    }>(
      "SELECT last_played_override, cover_url FROM games WHERE id = ?",
      [existingId]
    )!;

    if (lastPlayed && (!row.last_played_override || lastPlayed > row.last_played_override)) {
      db.runSync("UPDATE games SET last_played_override = ? WHERE id = ?", [
        lastPlayed,
        existingId,
      ]);
    }
    if (lastPlayed) ensureMarkerSession(existingId, lastPlayed, STEAM_MARKER_NOTE);
    if (!row.cover_url) {
      db.runSync("UPDATE games SET cover_url = ? WHERE id = ?", [
        coverUrl(g.appid),
        existingId,
      ]);
    }
    addNote(
      existingId,
      `Merged from Steam import (appid ${appid}` +
        (g.playtime_forever > 0 ? `, ${fmtMinutes(g.playtime_forever)} on Steam` : "") +
        (fuzzyNorm ? `, fuzzy title match on "${fuzzyNorm}"` : "") +
        `)`
    );
    return {
      status: "merged",
      detail:
        (fuzzyNorm ? "≈ " : "") +
        (g.playtime_forever > 0
          ? `${fmtMinutes(g.playtime_forever)} on Steam`
          : "linked"),
    };
  }

  // ---- add as new game ----
  // Below the played threshold (default 29 min) = not really played yet.
  const unplayed = g.playtime_forever <= windowConfig().playedThreshold;
  const tags = ["source:steam", "platform:steam"];
  if (unplayed) tags.push("status:unplayed");

  // imported_minutes stays 0 — Steam's number lives on the link row.
  const id = addGame({
    title,
    cover_url: coverUrl(g.appid),
    platform_summary: "Steam",
    imported_minutes: 0,
    last_played_override: lastPlayed,
    tags,
  });
  db.runSync(
    `INSERT INTO game_external_ids (game_id, source, external_id, playtime_minutes)
     VALUES (?, 'steam', ?, ?)`,
    [id, appid, g.playtime_forever]
  );
  linked.set(appid, id);
  byNorm.set(norm, id);
  if (lastPlayed) ensureMarkerSession(id, lastPlayed, STEAM_MARKER_NOTE);

  return {
    status: "added",
    detail: unplayed ? "unplayed" : fmtMinutes(g.playtime_forever),
  };
}

/**
 * Refresh one already-linked appid from the live library: store Steam's fresh
 * lifetime total on the link row, bump the last-played date and stamp the
 * zero-minute calendar marker. No minutes are ever written to sessions — the
 * game's playtime is max(Steam total, own records), so a Steam number that
 * grows simply raises the total.
 */
function resyncLinked(g: SteamGame, gameId: number): RowResult {
  const appid = String(g.appid);
  const lastPlayed = lastPlayedDate(g);
  // playtime_minutes NULL = never synced under the per-appid model (a
  // multi-appid game or a pre-v9 unknown baseline): record it, don't compare.
  const link = db.getFirstSync<{ playtime_minutes: number | null }>(
    "SELECT playtime_minutes FROM game_external_ids WHERE source = 'steam' AND external_id = ?",
    [appid]
  );
  const prev = link?.playtime_minutes ?? null;
  const delta = prev == null ? 0 : g.playtime_forever - prev;
  if (prev == null || delta !== 0) {
    db.runSync(
      "UPDATE game_external_ids SET playtime_minutes = ? WHERE source = 'steam' AND external_id = ?",
      [g.playtime_forever, appid]
    );
  }

  const row = db.getFirstSync<{ last_played_override: string | null }>(
    "SELECT last_played_override FROM games WHERE id = ?",
    [gameId]
  );
  if (lastPlayed && (!row?.last_played_override || lastPlayed > row.last_played_override)) {
    db.runSync("UPDATE games SET last_played_override = ? WHERE id = ?", [
      lastPlayed,
      gameId,
    ]);
  }
  // Surface the game on its last-played day without adding any minutes.
  if (lastPlayed) ensureMarkerSession(gameId, lastPlayed, STEAM_MARKER_NOTE);

  if (prev == null) return { status: "merged", detail: "synced" };
  if (delta !== 0)
    return {
      status: "merged",
      detail: (delta > 0 ? "+" : "-") + fmtMinutes(Math.abs(delta)),
    };
  return { status: "duplicate", detail: "already up to date" };
}

/** Every Steam appid linked to a game, oldest link first. */
export function steamAppidsFor(gameId: number): string[] {
  return db
    .getAllSync<{ external_id: string }>(
      "SELECT external_id FROM game_external_ids WHERE source = 'steam' AND game_id = ? ORDER BY id",
      [gameId]
    )
    .map((r) => r.external_id);
}

/** The first linked Steam appid for a game, or null if it isn't a Steam entry. */
export function steamAppidFor(gameId: number): string | null {
  return steamAppidsFor(gameId)[0] ?? null;
}

/**
 * Re-sync a single game's Steam playtime + last-played date across *all* of
 * its linked appids (a merged original + remaster keeps one row each), and
 * stamp a marker session on each last-played day. Reuses the same refresh
 * logic as the bulk "Re-sync playtime" import. Returns a short human-readable
 * summary, or throws with a clear message.
 */
export async function syncSteamGame(gameId: number): Promise<string> {
  const appids = steamAppidsFor(gameId);
  if (appids.length === 0) throw new Error("This game isn't linked to Steam.");
  const games = await fetchSteamLibrary();
  const results: RowResult[] = [];
  for (const appid of appids) {
    const g = games.find((x) => String(x.appid) === appid);
    if (g) results.push(resyncLinked(g, gameId));
  }
  if (results.length === 0)
    throw new Error(
      `Steam no longer lists this game in your library (appid ${appids.join(", ")}).`
    );
  const changed = results.filter((r) => r.status !== "duplicate");
  if (changed.length === 0) return "Already up to date with Steam.";
  return `Playtime updated (${changed.map((r) => r.detail).join(", ")}).`;
}

/** Fetch the library and queue a non-blocking import. */
export async function startSteamImport(resyncPlaytime = false) {
  const games = await fetchSteamLibrary();
  // played games first (nicer to watch, and canonical entries get created
  // before their unplayed remaster/duplicate listings merge onto them)
  games.sort(
    (a, b) =>
      b.playtime_forever - a.playtime_forever || a.name.localeCompare(b.name)
  );

  const linked = new Map<string, number>(
    db
      .getAllSync<{ external_id: string; game_id: number }>(
        "SELECT external_id, game_id FROM game_external_ids WHERE source = 'steam'"
      )
      .map((r) => [r.external_id, r.game_id])
  );
  const byNorm = new Map<string, number>(
    db
      .getAllSync<{ id: number; title: string }>("SELECT id, title FROM games")
      .map((r) => [normalizeTitle(r.title), r.id])
  );

  startImport(
    "Steam library",
    games.map((g) => cleanTitle(g.name)),
    (i) => importSteamRow(games[i], linked, byNorm, resyncPlaytime)
  );
}
