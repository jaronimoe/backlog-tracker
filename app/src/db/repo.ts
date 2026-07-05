import { db, getSetting, SETTINGS, withTx } from "./database";
import {
  Game,
  GameWithMeta,
  Milestone,
  Note,
  Session,
  StartPrecision,
} from "../types";
import {
  deriveGroup,
  playDay,
  progressPercent,
  streak,
  WindowConfig,
} from "../logic/derive";
import { normalizeTitle } from "../logic/normalize";
import { findFuzzyMatch } from "../logic/fuzzy";

export function windowConfig(): WindowConfig {
  const recentDays = parseInt(getSetting(SETTINGS.recentDays, "14"), 10);
  const cw = getSetting(SETTINGS.currentWindow, "year");
  return {
    recentDays,
    currentWindow: cw === "year" ? "year" : parseInt(cw, 10),
  };
}

export function streakGrace(): number {
  return parseInt(getSetting(SETTINGS.streakGrace, "1"), 10);
}

// ---------- games ----------

export interface NewGame {
  title: string;
  cover_url?: string | null;
  release_year?: number | null;
  platform_summary?: string | null;
  start_date?: string | null;
  start_precision?: StartPrecision | null;
  imported_minutes?: number;
  last_played_override?: string | null;
  tags?: string[];
  walkthrough_url?: string | null;
}

export function addGame(g: NewGame): number {
  let id = 0;
  withTx(() => {
    const res = db.runSync(
      `INSERT INTO games (title, cover_url, release_year, platform_summary,
        start_date, start_precision, imported_minutes, last_played_override, walkthrough_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        g.title,
        g.cover_url ?? null,
        g.release_year ?? null,
        g.platform_summary ?? null,
        g.start_date ?? null,
        g.start_precision ?? null,
        g.imported_minutes ?? 0,
        g.last_played_override ?? (g.start_date ?? null),
        g.walkthrough_url ?? null,
      ]
    );
    id = res.lastInsertRowId;
    // default milestone: single "Completed" checkbox
    db.runSync(
      "INSERT INTO milestones (game_id, name, is_stretch, done, sort) VALUES (?, 'Completed', 0, 0, 0)",
      [id]
    );
    for (const t of g.tags ?? [])
      db.runSync("INSERT OR IGNORE INTO tags (game_id, tag) VALUES (?, ?)", [
        id,
        t,
      ]);
  });
  return id;
}

export function updateGame(id: number, fields: Partial<Game>) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  db.runSync(
    `UPDATE games SET ${sets} WHERE id = ?`,
    [...keys.map((k) => (fields as any)[k]), id]
  );
}

export function deleteGame(id: number) {
  db.runSync("DELETE FROM games WHERE id = ?", [id]);
}

export function setOnMind(id: number, on: boolean) {
  withTx(() => {
    db.runSync("UPDATE games SET on_mind = ? WHERE id = ?", [on ? 1 : 0, id]);
    db.runSync("INSERT INTO mind_events (game_id, added) VALUES (?, ?)", [
      id,
      on ? 1 : 0,
    ]);
  });
}

export function setOnHold(id: number, on: boolean, note: string | null) {
  db.runSync("UPDATE games SET on_hold = ?, on_hold_note = ? WHERE id = ?", [
    on ? 1 : 0,
    on ? note : null,
    id,
  ]);
}

// ---------- external ids & dedup ----------

/** Game already linked to this (source, external_id), or null. */
export function findByExternalId(
  source: string,
  externalId: string
): number | null {
  const row = db.getFirstSync<{ game_id: number }>(
    "SELECT game_id FROM game_external_ids WHERE source = ? AND external_id = ?",
    [source, externalId]
  );
  return row?.game_id ?? null;
}

export function linkExternalId(
  gameId: number,
  source: string,
  externalId: string
) {
  db.runSync(
    "INSERT OR IGNORE INTO game_external_ids (game_id, source, external_id) VALUES (?, ?, ?)",
    [gameId, source, externalId]
  );
}

/**
 * Tier 2 + 3 dedup against the whole library: exact normalized-title match,
 * falling back to the conservative fuzzy matcher. Used to warn on manual adds.
 */
export function findSimilarGame(
  title: string
): { id: number; title: string } | null {
  const norm = normalizeTitle(title);
  const rows = db.getAllSync<{ id: number; title: string }>(
    "SELECT id, title FROM games"
  );
  const byNorm = new Map<string, number>(
    rows.map((r) => [normalizeTitle(r.title), r.id])
  );
  const id = byNorm.get(norm) ?? findFuzzyMatch(norm, byNorm)?.id;
  if (id == null) return null;
  return rows.find((r) => r.id === id) ?? null;
}

// ---------- tags ----------

export function addTag(gameId: number, tag: string) {
  db.runSync("INSERT OR IGNORE INTO tags (game_id, tag) VALUES (?, ?)", [
    gameId,
    tag.trim(),
  ]);
}

export function removeTag(gameId: number, tag: string) {
  db.runSync("DELETE FROM tags WHERE game_id = ? AND tag = ?", [gameId, tag]);
}

export function allTags(): string[] {
  return db
    .getAllSync<{ tag: string }>("SELECT DISTINCT tag FROM tags ORDER BY tag")
    .map((r) => r.tag);
}

// ---------- sessions ----------

/** One session per game per calendar day: upsert accumulates. */
export function logSession(
  gameId: number,
  date: string,
  minutes: number,
  note?: string | null
) {
  db.runSync(
    `INSERT INTO sessions (game_id, date, minutes, note) VALUES (?, ?, ?, ?)
     ON CONFLICT(game_id, date) DO UPDATE SET
       minutes = excluded.minutes,
       note = COALESCE(excluded.note, sessions.note)`,
    [gameId, date, minutes, note ?? null]
  );
}

export function sessionFor(gameId: number, date: string): Session | null {
  return (
    db.getFirstSync<Session>(
      "SELECT * FROM sessions WHERE game_id = ? AND date = ?",
      [gameId, date]
    ) ?? null
  );
}

export function deleteSession(id: number) {
  db.runSync("DELETE FROM sessions WHERE id = ?", [id]);
}

export function sessionsForGame(gameId: number): Session[] {
  return db.getAllSync<Session>(
    "SELECT * FROM sessions WHERE game_id = ? ORDER BY date DESC",
    [gameId]
  );
}

export function sessionsForDay(date: string): (Session & { title: string })[] {
  return db.getAllSync<Session & { title: string }>(
    `SELECT s.*, g.title FROM sessions s JOIN games g ON g.id = s.game_id
     WHERE s.date = ? ORDER BY s.minutes DESC`,
    [date]
  );
}

export function sessionsInRange(
  from: string,
  to: string
): (Session & { title: string })[] {
  return db.getAllSync<Session & { title: string }>(
    `SELECT s.*, g.title FROM sessions s JOIN games g ON g.id = s.game_id
     WHERE s.date >= ? AND s.date <= ? ORDER BY s.date`,
    [from, to]
  );
}

export interface RangeGameSummary {
  started: { id: number; title: string; date: string }[];
  completed: { id: number; title: string; date: string }[];
}

/**
 * Games started (start_date in range) and completed (completed_at in range).
 * Dates are compared on their first 10 chars (ISO day), so datetime or
 * lower-precision start dates still resolve to a day within the window.
 */
export function startedCompletedInRange(
  from: string,
  to: string
): RangeGameSummary {
  const started = db.getAllSync<{ id: number; title: string; date: string }>(
    `SELECT id, title, start_date AS date FROM games
     WHERE start_date IS NOT NULL
       AND substr(start_date, 1, 10) >= ? AND substr(start_date, 1, 10) <= ?
     ORDER BY start_date, title`,
    [from, to]
  );
  const completed = db.getAllSync<{ id: number; title: string; date: string }>(
    `SELECT id, title, completed_at AS date FROM games
     WHERE completed_at IS NOT NULL
       AND substr(completed_at, 1, 10) >= ? AND substr(completed_at, 1, 10) <= ?
     ORDER BY completed_at, title`,
    [from, to]
  );
  return { started, completed };
}

/** true if this game has never been played (no sessions, no imported time) */
export function isNeverPlayed(gameId: number): boolean {
  const g = db.getFirstSync<{ imported_minutes: number }>(
    "SELECT imported_minutes FROM games WHERE id = ?",
    [gameId]
  );
  const s = db.getFirstSync<{ n: number }>(
    "SELECT COUNT(*) n FROM sessions WHERE game_id = ?",
    [gameId]
  );
  return (g?.imported_minutes ?? 0) === 0 && (s?.n ?? 0) === 0;
}

// ---------- milestones ----------

export function milestonesFor(gameId: number): Milestone[] {
  return db.getAllSync<Milestone>(
    "SELECT * FROM milestones WHERE game_id = ? ORDER BY sort, id",
    [gameId]
  );
}

export function addMilestone(gameId: number, name: string, isStretch: boolean) {
  const max = db.getFirstSync<{ m: number }>(
    "SELECT COALESCE(MAX(sort),0) m FROM milestones WHERE game_id = ?",
    [gameId]
  );
  db.runSync(
    "INSERT INTO milestones (game_id, name, is_stretch, done, sort) VALUES (?, ?, ?, 0, ?)",
    [gameId, name, isStretch ? 1 : 0, (max?.m ?? 0) + 1]
  );
}

export function toggleMilestone(id: number, done: boolean) {
  db.runSync("UPDATE milestones SET done = ? WHERE id = ?", [done ? 1 : 0, id]);
}

export function deleteMilestone(id: number) {
  db.runSync("DELETE FROM milestones WHERE id = ?", [id]);
}

// ---------- notes ----------

export function notesFor(gameId: number): Note[] {
  return db.getAllSync<Note>(
    "SELECT * FROM notes WHERE game_id = ? ORDER BY at DESC",
    [gameId]
  );
}

export function addNote(gameId: number, text: string) {
  db.runSync("INSERT INTO notes (game_id, text) VALUES (?, ?)", [gameId, text]);
}

// ---------- aggregated game list ----------

export function getGame(id: number): GameWithMeta | null {
  const g = db.getFirstSync<Game>("SELECT * FROM games WHERE id = ?", [id]);
  if (!g) return null;
  return enrich(g);
}

export function allGames(): GameWithMeta[] {
  const games = db.getAllSync<Game>("SELECT * FROM games ORDER BY title");
  return games.map(enrich);
}

function enrich(g: Game): GameWithMeta {
  const cfg = windowConfig();
  const tags = db
    .getAllSync<{ tag: string }>(
      "SELECT tag FROM tags WHERE game_id = ? ORDER BY tag",
      [g.id]
    )
    .map((r) => r.tag);
  const agg = db.getFirstSync<{
    total: number;
    n: number;
    last: string | null;
  }>(
    "SELECT COALESCE(SUM(minutes),0) total, COUNT(*) n, MAX(date) last FROM sessions WHERE game_id = ?",
    [g.id]
  );
  const sessionMinutes = agg?.total ?? 0;
  const sessionCount = agg?.n ?? 0;
  const lastSession = agg?.last ?? null;
  const lastPlayed =
    lastSession && g.last_played_override
      ? lastSession > g.last_played_override
        ? lastSession
        : g.last_played_override
      : lastSession ?? g.last_played_override;
  const milestones = milestonesFor(g.id);
  const progress = progressPercent(g, milestones);
  const totalMinutes = sessionMinutes + g.imported_minutes;
  const group = deriveGroup(g, lastPlayed, totalMinutes, progress, cfg);
  const dates = db
    .getAllSync<{ date: string }>(
      "SELECT date FROM sessions WHERE game_id = ?",
      [g.id]
    )
    .map((r) => r.date);
  return {
    ...g,
    tags,
    totalMinutes,
    sessionCount,
    lastPlayed,
    progress,
    group,
    streak: streak(dates, streakGrace()),
  };
}

// ---------- genre blocker ----------

export interface GenreBlockHit {
  game: GameWithMeta;
  sharedGenres: string[];
}

/** Games in an active state (current | backlog_started) sharing a genre tag. */
export function genreBlockCheck(gameId: number): GenreBlockHit[] {
  const target = getGame(gameId);
  if (!target) return [];
  const genres = target.tags.filter((t) => t.startsWith("genre:"));
  if (genres.length === 0) return [];
  return allGames()
    .filter(
      (g) =>
        g.id !== gameId &&
        (g.group === "current" || g.group === "backlog_started")
    )
    .map((g) => ({
      game: g,
      sharedGenres: g.tags.filter((t) => genres.includes(t)),
    }))
    .filter((h) => h.sharedGenres.length > 0);
}

// ---------- completion ----------

/** Mark completed "now" if progress just crossed 100 and not yet marked. */
export function maybeMarkCompleted(gameId: number): boolean {
  const g = getGame(gameId);
  if (!g) return false;
  if (g.progress >= 100 && !g.completed_at) {
    db.runSync("UPDATE games SET completed_at = ? WHERE id = ?", [
      playDay(),
      gameId,
    ]);
    return true; // caller should prompt for rating/final note
  }
  return false;
}
