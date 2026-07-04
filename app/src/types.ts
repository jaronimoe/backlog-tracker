export type ProgressMethod = "checkbox" | "manual" | "walkthrough";
export type StartPrecision = "day" | "month" | "year";

export interface Game {
  id: number;
  title: string;
  cover_url: string | null;
  release_year: number | null;
  platform_summary: string | null;
  created_at: string;
  start_date: string | null; // ISO date, fuzzy resolved to first day/month
  start_precision: StartPrecision | null;
  imported_minutes: number;
  last_played_override: string | null; // ISO date
  on_hold: number; // 0/1
  on_hold_note: string | null;
  on_mind: number; // 0/1
  completed_at: string | null;
  rating: number | null;
  final_note: string | null;
  progress_method: ProgressMethod;
  manual_percent: number;
  walkthrough_url: string | null;
  walkthrough_text: string | null;
  walkthrough_position: number;
  recap_text: string | null;
  recap_key: string | null;
}

export interface Session {
  id: number;
  game_id: number;
  date: string; // ISO date (calendar day)
  minutes: number;
  note: string | null;
}

export interface Milestone {
  id: number;
  game_id: number;
  name: string;
  is_stretch: number;
  done: number;
  sort: number;
}

export interface Note {
  id: number;
  game_id: number;
  at: string;
  text: string;
}

export type StateGroup =
  | "current"
  | "backlog_started"
  | "backlog"
  | "on_hold"
  | "completed";

export interface GameWithMeta extends Game {
  tags: string[];
  totalMinutes: number;
  sessionCount: number;
  lastPlayed: string | null; // ISO date
  progress: number; // percent, can exceed 100
  group: StateGroup;
  streak: number;
}
