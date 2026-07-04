import { db } from "./database";
import { allGames } from "./repo";
import { daysBetween, isoDate, playDay, splitTag } from "../logic/derive";
import { GameWithMeta } from "../types";

export type Range = "week" | "month" | "year" | "all";

export function rangeStart(range: Range, today = new Date()): string | null {
  if (range === "all") return null;
  const d = new Date(today);
  if (range === "week") {
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - dow);
  } else if (range === "month") d.setDate(1);
  else if (range === "year") {
    d.setMonth(0);
    d.setDate(1);
  }
  return isoDate(d);
}

export function totalPlaytime(range: Range): number {
  const from = rangeStart(range);
  const row = from
    ? db.getFirstSync<{ t: number }>(
        "SELECT COALESCE(SUM(minutes),0) t FROM sessions WHERE date >= ?",
        [from]
      )
    : db.getFirstSync<{ t: number }>(
        "SELECT COALESCE(SUM(minutes),0) t FROM sessions"
      );
  return row?.t ?? 0;
}

export interface RankEntry {
  game_id: number;
  title: string;
  minutes: number;
  sessions: number;
}

export function ranking(range: Range): RankEntry[] {
  const from = rangeStart(range);
  const where = from ? "WHERE s.date >= ?" : "";
  return db.getAllSync<RankEntry>(
    `SELECT s.game_id, g.title, SUM(s.minutes) minutes, COUNT(*) sessions
     FROM sessions s JOIN games g ON g.id = s.game_id ${where}
     GROUP BY s.game_id ORDER BY minutes DESC`,
    from ? [from] : []
  );
}

export interface GenreEntry {
  genre: string;
  minutes: number;
  pct: number;
}

export function genreDistribution(range: Range): GenreEntry[] {
  const from = rangeStart(range);
  const where = from ? "AND s.date >= ?" : "";
  const rows = db.getAllSync<{ genre: string; minutes: number }>(
    `SELECT t.tag genre, SUM(s.minutes) minutes
     FROM sessions s
     JOIN tags t ON t.game_id = s.game_id AND t.tag LIKE 'genre:%'
     WHERE 1=1 ${where}
     GROUP BY t.tag ORDER BY minutes DESC`,
    from ? [from] : []
  );
  const total = rows.reduce((a, r) => a + r.minutes, 0) || 1;
  return rows.map((r) => ({
    genre: splitTag(r.genre).value,
    minutes: r.minutes,
    pct: Math.round((r.minutes / total) * 100),
  }));
}

export interface LongestEntry {
  game: GameWithMeta;
  days: number;
  fuzzy: boolean;
}

/** Calendar days from start date to completion date. */
export function longestToComplete(): LongestEntry[] {
  return allGames()
    .filter((g) => g.completed_at && g.start_date)
    .map((g) => ({
      game: g,
      days: daysBetween(g.start_date!, g.completed_at!),
      fuzzy: g.start_precision !== "day",
    }))
    .sort((a, b) => b.days - a.days);
}

/** Rated games, best first (rating desc, playtime breaks ties). */
export function allTimeFaves(): GameWithMeta[] {
  return allGames()
    .filter((g) => g.rating != null)
    .sort((a, b) => b.rating! - a.rating! || b.totalMinutes - a.totalMinutes);
}

export interface YearFaves {
  year: string;
  games: GameWithMeta[];
}

/** The year a rated game belongs to: completed, else last played, else started. */
function faveYear(g: GameWithMeta): string | null {
  const d = g.completed_at ?? g.lastPlayed ?? g.start_date;
  return d ? d.slice(0, 4) : null;
}

/** Top-rated games per year, newest year first. */
export function favesByYear(topN = 3): YearFaves[] {
  const byYear = new Map<string, GameWithMeta[]>();
  for (const g of allTimeFaves()) {
    const y = faveYear(g);
    if (!y) continue;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(g); // allTimeFaves is already sorted best-first
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, games]) => ({ year, games: games.slice(0, topN) }));
}

/** Almost-finished, not completed, ranked by progress desc. */
export function wrapItUp(): GameWithMeta[] {
  return allGames()
    .filter((g) => g.group !== "completed" && g.progress > 0)
    .sort((a, b) => b.progress - a.progress);
}
