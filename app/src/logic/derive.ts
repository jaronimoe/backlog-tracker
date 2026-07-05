import { Game, GameWithMeta, Milestone, Session, StateGroup } from "../types";

/** Calendar day for a timestamp; play past midnight (before 5am) counts to previous day. */
export function playDay(d: Date = new Date()): string {
  const shifted = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return isoDate(shifted);
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + "T12:00").getTime() - new Date(a + "T12:00").getTime()) /
      86400000
  );
}

/**
 * Progress percent (can exceed 100).
 * - walkthrough: position / text length
 * - manual: direct percent
 * - checkbox: regular milestones span 0–100%; each done stretch goal adds one
 *   regular-milestone share (100 / #regular) beyond 100%.
 */
export function progressPercent(
  // list queries ship length(walkthrough_text) instead of the text itself
  game: Game & { walkthrough_len?: number },
  milestones: Milestone[]
): number {
  if (game.progress_method === "manual") return game.manual_percent;
  if (game.progress_method === "walkthrough") {
    const len = game.walkthrough_len ?? game.walkthrough_text?.length ?? 0;
    if (len === 0) return 0;
    return Math.min(
      100,
      Math.round((game.walkthrough_position / len) * 100)
    );
  }
  const regular = milestones.filter((m) => !m.is_stretch);
  const stretch = milestones.filter((m) => m.is_stretch);
  if (regular.length === 0) return 0;
  const share = 100 / regular.length;
  const base = regular.filter((m) => m.done).length * share;
  const extra = stretch.filter((m) => m.done).length * share;
  return Math.round(base + extra);
}

/** Fuzzy streak: number of actually-played days; a gap of <= grace days doesn't break it. */
export function streak(
  sessionDates: string[], // distinct ISO dates, any order
  grace: number,
  today: string = playDay()
): number {
  if (sessionDates.length === 0) return 0;
  const dates = [...new Set(sessionDates)].sort().reverse();
  // streak is alive only if last play is within grace+1 days of today
  if (daysBetween(dates[0], today) > grace + 1) return 0;
  let count = 1;
  for (let i = 1; i < dates.length; i++) {
    const gap = daysBetween(dates[i], dates[i - 1]);
    if (gap > grace + 1) break;
    count++;
  }
  return count;
}

export interface WindowConfig {
  recentDays: number; // Recently Played window
  currentWindow: "year" | number; // 'year' or number of days
}

export function deriveGroup(
  game: Game,
  lastPlayed: string | null,
  totalMinutes: number,
  progress: number,
  cfg: WindowConfig,
  today: string = playDay()
): StateGroup {
  if (progress >= 100 || game.completed_at) return "completed";
  if (game.on_hold) return "on_hold";
  const started = totalMinutes > 0 || lastPlayed != null || game.start_date != null;
  if (!started) return "backlog";
  // Most recent activity signal: a logged/overridden play date or the start date.
  const refDate =
    [lastPlayed, game.start_date].filter(Boolean).sort().pop() ?? null;
  if (refDate) {
    const inWindow =
      cfg.currentWindow === "year"
        ? refDate.slice(0, 4) === today.slice(0, 4)
        : daysBetween(refDate, today) <= cfg.currentWindow;
    if (inWindow) return "current";
  }
  return "backlog_started";
}

export function isRecentlyPlayed(
  lastPlayed: string | null,
  recentDays: number,
  today: string = playDay()
): boolean {
  return lastPlayed != null && daysBetween(lastPlayed, today) <= recentDays;
}

export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function splitTag(tag: string): { type: string | null; value: string } {
  const i = tag.indexOf(":");
  if (i > 0) return { type: tag.slice(0, i), value: tag.slice(i + 1) };
  return { type: null, value: tag };
}

/** typed tags first, clustered by type, then plain tags */
export function sortTags(tags: string[]): string[] {
  return [...tags].sort((a, b) => {
    const ta = splitTag(a), tb = splitTag(b);
    if (ta.type && !tb.type) return -1;
    if (!ta.type && tb.type) return 1;
    if (ta.type && tb.type && ta.type !== tb.type)
      return ta.type.localeCompare(tb.type);
    return ta.value.localeCompare(tb.value);
  });
}
