# Backlog Tracker — MVP Spec (locked)

Working title: **backlog-tracker**. Platforms: **Android + iOS** (React Native / Expo).
No backend. Local SQLite with **versioned schema migrations** (forward-compatible — app
updates must never require re-import or re-configuration).

---

## 1. Game states (derived, not manually set)

States are **computed** from data, never set directly:

| Group | Rule |
|---|---|
| **Current** | last played within the *current window* (default: this year, user-switchable), ordered by last-played desc |
| **Recently Played** | last played within the *recent window* (default: 2 weeks, user-adjustable). Subset of Current; also feeds future visualizations |
| **Backlog (started)** | playtime > 0 (sessions or imported time) but not played within current window |
| **Backlog (never played)** | no sessions and no imported time |
| **On Hold** | flag is set — overrides drift, shown in its own group, mutually exclusive with backlog drift |
| **Completed** | progress reached 100% |

- **On Hold** is a flag with a **dedicated reason note** (required). Removing the flag drops
  the game back into its derived category based on last-played.
- **On My Mind** is an independent flag on any game (any state). Manual add/remove.
  Add/remove **timestamps are stored** (history view is Phase 2). Own view.
- Completed games replayed still appear in Recently Played.

## 2. Adding a game

- **Minimum requirement: title.** Everything editable later from the game detail.
- IGDB metadata fetch: cover art, platform, genre, release year.
  - Platform/genre auto-converted to **typed tags** (`platform:pc`, `genre:jrpg`).
- Custom tags (plain, no namespace).
- **Start date** (precision: day / month / year; fuzzy dates resolve to first day/month).
  - If a start date is given, **time already spent is mandatory**.
  - Optional **last-played date** (defaults to start date). Needed for correct auto-state.
- State is **auto-assigned** from the above (no date/time → Backlog never-played).
- Walkthrough: paste a **link** and/or paste **text** into a field (no crawling in MVP).
- Bulk import: Phase 2.

## 3. Progress tracking

Three methods, per game:

1. **Walkthrough position** — user pastes curated walkthrough text in-app, marks
   position; % = position ÷ total length.
2. **Manual %** — direct percentage.
3. **Checkbox milestones** (default) — starts with a single "Completed" checkbox.
   User can add **named** checkboxes:
   - regular milestones (count toward 100%)
   - **stretch goals** (postgame — push progress **beyond 100%**)

- **100% = Completed** (triggers the completion prompt: rating / final note).
- Progress bar renders >100% gracefully (e.g. "115%").
- HowLongToBeat time-based fallback: Phase 2.

## 4. Today view (primary)

- **Played Today** drop zone + per-card quick "Played Today" button.
- **Recently Played** list (expanded), other groups collapsed:
  Current / Backlog (started) / Backlog / On Hold / Completed.
- Session quick-log: **±15 min buttons**, optional progress update, optional note.
- **One session per game per calendar day** (edits accumulate).
  Past-midnight play counts toward the **previous day**.
- Filter bar (genre/tag chips), also in Library.
- **Per-game streaks**: 🔥 N days = count of **actually played days** (grace-gap days
  don't count). **Fuzzy grace period** user-configurable: 1 / 2 / 3-day break tolerated
  before a streak resets.

## 5. Genre blocker (advisory)

- **Trigger (adapted for derived states):** logging the **first session of a never-played
  game**.
- Check: count active games (Current + Backlog started) sharing ≥1 `genre:` tag.
- If count ≥ threshold (default 1): non-blocking warning panel listing matching games
  with progress % and last-played. [Start anyway] / [Cancel]. Never a hard block.

## 6. Library

- All games grouped by derived state, search, tag/genre filter.
- Typed tags render before plain tags, color per type.

## 7. Calendar

- Simple month grid: dot on days with sessions, day detail (games + durations + notes).
- Thumbnails / heat intensity / GitHub heatmap: Phase 2.

## 8. On My Mind view

- Games with the flag. Visual concept (head + thought cloud) can be simple in MVP
  (plain list/grid acceptable), fancy visual later.

## 9. Stats (MVP)

- Playtime totals: week / month / year / all-time.
- Rankings: by playtime and by session count (week/month/year/all-time filters).
- Genre distribution (bar rows; pie chart Phase 2).
- **Longest to complete**: calendar **days** from start date to completion date.
- **Wrap it up** tab: almost-finished games ranked by progress % desc.

## 10. Storage & sync

- SQLite (expo-sqlite), **schema_version table + migrations**.
- **JSON export/import** (full data) — manual backup + cross-device transfer.
- File-based sync via iCloud Drive / Google Drive folder (best effort; JSON is the
  escape hatch).

## Phase 2 (not now)

LLM story recap + "What's Next?" · GameFAQs crawling · HowLongToBeat fallback ·
Visualizations (Juggler, Weightlifter — one view, switchable, shared recent window) ·
Calendar heatmap/thumbnails · On My Mind history view · Bulk import (CSV/paste/Steam) ·
Weekly digest · Launch game from local path (Android) · Recommender integration ·
Pie charts.
