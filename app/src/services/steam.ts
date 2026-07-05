import { db, getSetting, SETTINGS } from "../db/database";
import {
  accumulateSession,
  addGame,
  addNote,
  addTag,
  ensureMarkerSession,
  isNeverPlayed,
} from "../db/repo";
import { fmtMinutes, isoDate } from "../logic/derive";
import { cleanTitle, normalizeTitle } from "../logic/normalize";
import { findFuzzyMatch } from "../logic/fuzzy";
import { RowResult, startImport } from "./importQueue";

/**
 * Steam library import (IPlayerService/GetOwnedGames).
 *
 * Merge policy (user decision):
 * - Games already linked by appid -> skipped (idempotent re-sync), unless
 *   `resyncPlaytime` is set, in which case their Steam playtime and
 *   last-played date are refreshed from the live library.
 * - Games matching an existing entry by normalized title (exact, or via the
 *   conservative fuzzy tier in logic/fuzzy.ts) -> MERGED into it, flagged
 *   with a `source:steam` tag + an audit note, playtime only filled
 *   if the existing entry has no tracked time (avoids double counting).
 * - Everything else -> added; never-played Steam games additionally get a
 *   `status:unplayed` tag so they don't drown the real backlog.
 */

/** Note stamped on the 0-minute "last played" marker sessions Steam sync adds. */
const STEAM_MARKER_NOTE = "Last played on Steam";

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
    db.runSync(
      "INSERT OR IGNORE INTO game_external_ids (game_id, source, external_id) VALUES (?, 'steam', ?)",
      [existingId, appid]
    );
    linked.set(appid, existingId);
    addTag(existingId, "source:steam");
    addTag(existingId, "platform:steam");

    const row = db.getFirstSync<{
      imported_minutes: number;
      last_played_override: string | null;
      cover_url: string | null;
    }>(
      "SELECT imported_minutes, last_played_override, cover_url FROM games WHERE id = ?",
      [existingId]
    )!;

    const details: string[] = [];
    // fill playtime only if nothing tracked yet (no double counting)
    if (g.playtime_forever > 0 && isNeverPlayed(existingId)) {
      db.runSync("UPDATE games SET imported_minutes = ? WHERE id = ?", [
        g.playtime_forever,
        existingId,
      ]);
      details.push(`+${fmtMinutes(g.playtime_forever)}`);
    }
    // Watermark the Steam total so future re-syncs attribute only new playtime.
    db.runSync("UPDATE games SET steam_synced_minutes = ? WHERE id = ?", [
      g.playtime_forever,
      existingId,
    ]);
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
      detail: (fuzzyNorm ? "≈ " : "") + (details.join(" ") || "linked"),
    };
  }

  // ---- add as new game ----
  const unplayed = g.playtime_forever === 0;
  const tags = ["source:steam", "platform:steam"];
  if (unplayed) tags.push("status:unplayed");

  const id = addGame({
    title,
    cover_url: coverUrl(g.appid),
    platform_summary: "Steam",
    imported_minutes: g.playtime_forever,
    last_played_override: lastPlayed,
    tags,
  });
  db.runSync(
    "INSERT INTO game_external_ids (game_id, source, external_id) VALUES (?, 'steam', ?)",
    [id, appid]
  );
  db.runSync("UPDATE games SET steam_synced_minutes = ? WHERE id = ?", [
    g.playtime_forever,
    id,
  ]);
  linked.set(appid, id);
  byNorm.set(norm, id);
  if (lastPlayed) ensureMarkerSession(id, lastPlayed, STEAM_MARKER_NOTE);

  return {
    status: "added",
    detail: unplayed ? "unplayed" : fmtMinutes(g.playtime_forever),
  };
}

/**
 * Refresh an already-linked Steam entry's playtime + last-played from the
 * live library. `imported_minutes` on a Steam-linked game holds the Steam
 * total, so overwriting it with the fresh total is correct (any manually
 * logged sessions live separately and are untouched).
 */
function resyncLinked(g: SteamGame, existingId: number): RowResult {
  const lastPlayed = lastPlayedDate(g);
  const row = db.getFirstSync<{
    imported_minutes: number;
    steam_synced_minutes: number;
    last_played_override: string | null;
  }>(
    "SELECT imported_minutes, steam_synced_minutes, last_played_override FROM games WHERE id = ?",
    [existingId]
  )!;

  // Delta is measured against the last total we saw from Steam (the watermark),
  // so we only ever count *new* playtime once.
  const delta = g.playtime_forever - row.steam_synced_minutes;
  const details: string[] = [];
  if (delta !== 0) {
    if (delta > 0 && lastPlayed) {
      // New playtime with a known date → log it as a real dated session
      // (accumulates onto that day, so repeated same-day syncs stay correct).
      accumulateSession(existingId, lastPlayed, delta, STEAM_MARKER_NOTE);
    } else {
      // No date to attribute to (or a negative correction) → fold into the
      // undated import lump instead, clamped at zero.
      db.runSync("UPDATE games SET imported_minutes = ? WHERE id = ?", [
        Math.max(0, row.imported_minutes + delta),
        existingId,
      ]);
    }
    db.runSync("UPDATE games SET steam_synced_minutes = ? WHERE id = ?", [
      g.playtime_forever,
      existingId,
    ]);
    details.push((delta > 0 ? "+" : "-") + fmtMinutes(Math.abs(delta)));
  }
  if (lastPlayed && (!row.last_played_override || lastPlayed > row.last_played_override)) {
    db.runSync("UPDATE games SET last_played_override = ? WHERE id = ?", [
      lastPlayed,
      existingId,
    ]);
  }
  // Ensure the game surfaces on its last-played day even when nothing changed
  // (a positive delta already created/updated that day's session above).
  if (lastPlayed && !(delta > 0))
    ensureMarkerSession(existingId, lastPlayed, STEAM_MARKER_NOTE);

  if (details.length === 0)
    return { status: "duplicate", detail: "already up to date" };
  return { status: "merged", detail: details.join(" ") };
}

/** The linked Steam appid for a game, or null if it isn't a Steam entry. */
export function steamAppidFor(gameId: number): string | null {
  return (
    db.getFirstSync<{ external_id: string }>(
      "SELECT external_id FROM game_external_ids WHERE source = 'steam' AND game_id = ? LIMIT 1",
      [gameId]
    )?.external_id ?? null
  );
}

/**
 * Re-sync a single already-linked Steam game's playtime + last-played date
 * (and stamp a marker session on its last-played day). Reuses the same
 * refresh logic as the bulk "Re-sync playtime" import. Returns a short
 * human-readable summary, or throws with a clear message.
 */
export async function syncSteamGame(gameId: number): Promise<string> {
  const appid = steamAppidFor(gameId);
  if (!appid) throw new Error("This game isn't linked to Steam.");
  const games = await fetchSteamLibrary();
  const g = games.find((x) => String(x.appid) === appid);
  if (!g)
    throw new Error(
      `Steam no longer lists this game in your library (appid ${appid}).`
    );
  const r = resyncLinked(g, gameId);
  if (r.status === "duplicate") return "Already up to date with Steam.";
  return `Playtime updated (${r.detail}).`;
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
