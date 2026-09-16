import { db } from "./database";
import { allGames } from "./repo";
import { daysBetween, isoDate, playDay, splitTag } from "../logic/derive";
import { GameWithMeta } from "../types";

export type Range = "week" | "month" | "year" | "all";
/** Ranges that are windows over dated sessions ("all" is not date-bounded). */
export type DatedRange = Exclude<Range, "all">;

/**
 * First day of the range. "Today" is the current *play day* (5-hour shift, the
 * same day sessions are dated with), so a session logged at 01:00 on Monday —
 * dated Sunday — still falls in the week that ended that Sunday.
 */
export function rangeStart(
  range: Range,
  today = new Date(playDay() + "T12:00")
): string | null {
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

/**
 * Minutes of *dated* play in the range — logged sessions only. All-time
 * playtime is not a session sum: it is the sum of every game's `totalMinutes`
 * (see `rankingFromGames`), which also covers Steam and base time.
 */
export function totalPlaytime(range: DatedRange): number {
  const from = rangeStart(range);
  const row = db.getFirstSync<{ t: number }>(
    "SELECT COALESCE(SUM(minutes),0) t FROM sessions WHERE date >= ?",
    [from]
  );
  return row?.t ?? 0;
}

export interface RankEntry {
  game_id: number;
  title: string;
  minutes: number;
  sessions: number;
}

/**
 * Ranking over dated sessions in the range. Zero-minute Steam marker sessions
 * are not play, so they never count towards `sessions`.
 */
export function ranking(range: DatedRange): RankEntry[] {
  const from = rangeStart(range);
  return db.getAllSync<RankEntry>(
    `SELECT s.game_id, g.title, SUM(s.minutes) minutes,
            SUM(CASE WHEN s.minutes > 0 THEN 1 ELSE 0 END) sessions
     FROM sessions s JOIN games g ON g.id = s.game_id WHERE s.date >= ?
     GROUP BY s.game_id ORDER BY minutes DESC`,
    [from]
  );
}

/**
 * All-time ranking, from the enriched game list rather than from `sessions`:
 * `totalMinutes` (= max(Steam total, base + logged sessions)) is *the*
 * definition of a game's playtime, so Stats must agree with the game rows and
 * the detail header. Games with no playtime at all are dropped.
 */
export function rankingFromGames(games: GameWithMeta[]): RankEntry[] {
  return games
    .filter((g) => g.totalMinutes > 0)
    .map((g) => ({
      game_id: g.id,
      title: g.title,
      minutes: g.totalMinutes,
      sessions: g.sessionCount,
    }))
    .sort((a, b) => b.minutes - a.minutes);
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
export function longestToComplete(games: GameWithMeta[] = allGames()): LongestEntry[] {
  return games
    .filter((g) => g.completed_at && g.start_date)
    .map((g) => ({
      game: g,
      days: daysBetween(g.start_date!, g.completed_at!),
      fuzzy: g.start_precision !== "day",
    }))
    .sort((a, b) => b.days - a.days);
}

/** Rated games, best first (rating desc, playtime breaks ties). */
export function allTimeFaves(games: GameWithMeta[] = allGames()): GameWithMeta[] {
  return games
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
export function favesByYear(
  topN = 3,
  games: GameWithMeta[] = allGames()
): YearFaves[] {
  const byYear = new Map<string, GameWithMeta[]>();
  for (const g of allTimeFaves(games)) {
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
export function wrapItUp(games: GameWithMeta[] = allGames()): GameWithMeta[] {
  return games
    .filter((g) => g.group !== "completed" && g.progress > 0)
    .sort((a, b) => b.progress - a.progress);
}
