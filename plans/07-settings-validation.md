# 07 — Settings validation

| Severity | Effort | Wave | Files |
|----------|--------|------|-------|
| low (a typo silently breaks grouping app-wide) | S | 3, after 06 | `app/src/screens/SettingsScreen.tsx`, `app/src/db/database.ts`, `app/src/db/repo.ts`, `app/src/components/SessionLogModal.tsx` |

## Problem

`save()` (`screens/SettingsScreen.tsx:106-111`) stores the raw input strings, and every reader
(`windowConfig`/`streakGrace` in `db/repo.ts:20-32`, the genre-blocker threshold in
`components/SessionLogModal.tsx:49`) does a bare `parseInt`. One stray character turns the value into
NaN with no error shown:

- `recentDays` NaN → `isRecentlyPlayed` is false for every game; the Recently Played header reads
  "last NaN days".
- `currentWindow` NaN → `daysBetween(...) <= NaN` is false → every started game drops to Backlog
  (started).
- `playedThreshold` NaN → `total > NaN` is false → `deriveGroup` never sees a game as started via
  playtime, and `isNeverPlayed` is always false, which also disables the genre blocker and the
  Steam merge playtime fill.

## Fix

1. **Validate on save.** Parse each numeric field before writing anything; on the first failure
   alert `"<Field label>: enter a whole number between A and B"` and return without saving. Ranges:
   Recently Played days 1–365; Current window `year` (case-insensitive) or 1–3650 days; played
   threshold 0–100000; streak grace 0–3; genre-blocker threshold 1–99. Persist normalised strings
   (`String(int)`, `"year"` lower-cased).
2. **Defensive reads.** Add to `database.ts`:
   ```ts
   export function intSetting(key: string, fallback: number, min = -Infinity, max = Infinity): number
   ```
   returning `fallback` when the stored value is missing, not an integer, or out of range. Use it in
   `windowConfig` (`recentDays`, `playedThreshold`; `currentWindow` stays `"year"` unless the value
   is a valid 1–3650 integer), `streakGrace`, and the genre-blocker read in `SessionLogModal`.

## Acceptance criteria

- `npx tsc --noEmit` passes.
- Typing `abc` into Recently Played and pressing Save → alert, nothing written (the previous value
  is still shown after reopening Settings).
- With a deliberately bad value in the `settings` table (e.g. from a hand-edited restored export),
  grouping and Recently Played behave as with the defaults.
