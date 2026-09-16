# 06 — Stats consistency (one playtime definition, marker sessions, play-day ranges)

| Severity | Effort | Wave | Files |
|----------|--------|------|-------|
| medium (numbers on Stats contradict numbers on Games) | M | 3, after 05 and after plan 01 is merged | `app/src/db/stats.ts`, `app/src/db/repo.ts`, `app/src/screens/StatsScreen.tsx`, `app/src/screens/GamesScreen.tsx`, `app/src/screens/GameDetailScreen.tsx` |

Depends on plan 01 (Option A): `GameWithMeta.totalMinutes` is now
`max(steamMinutes ?? 0, imported_minutes + loggedMinutes)` and is **the** definition of a game's
playtime. Stats must use it rather than re-deriving playtime from `sessions`.

Decisions (user, 2026-09-16): All-time figures use `totalMinutes`; zero-minute Steam marker
sessions do not count as sessions but still count as play days for streaks.

## Problems

1. `totalPlaytime` and `ranking` (`db/stats.ts:22-51`) sum `sessions` only, while game rows,
   favourites and the detail header show `totalMinutes`. Someone with 500 h of Steam history sees
   "All Time 3h" on Stats.
2. Zero-minute marker sessions created by Steam sync (`ensureMarkerSession`) are counted as
   sessions in `ranking` (`COUNT(*)`), in `enrichAll` (`repo.ts:468`), in the detail tab label
   "Sessions (N)" (`GameDetailScreen.tsx:368`), and Played Today lists them as "0m today"
   (`GamesScreen.tsx:314-331`).
3. `rangeStart` (`stats.ts:8`) starts from `new Date()`, but sessions are dated with `playDay()`
   (5-hour shift): a session logged at 01:00 on Monday is dated Sunday, and "Week" starts Monday.

## Fix

1. **One definition.**
   - All-time tile: `games.reduce((a, g) => a + g.totalMinutes, 0)` in `StatsScreen` (it already
     loads `allGames()` per focus). Week/Month/Year tiles stay session-based SQL (dated play only);
     the All-time tile gets a muted caption "incl. Steam & base time".
   - `ranking("all")` → new `rankingFromGames(games: GameWithMeta[]): RankEntry[]` in `stats.ts`
     (`minutes = totalMinutes`, `sessions = sessionCount`, sorted by minutes desc, rows with 0
     minutes dropped). Ranged rankings stay SQL on `sessions` but replace `COUNT(*)` with
     `SUM(CASE WHEN s.minutes > 0 THEN 1 ELSE 0 END)`. `StatsScreen` uses `rankingFromGames` when the
     range is `all`, `ranking(range)` otherwise; "Times Played" sorts by `sessions` and drops zeros.
   - Genre distribution stays session-based (it needs dates); add a caption "logged sessions only".
2. **Marker sessions.**
   - `enrichAll`: count only rows with `minutes > 0` for `sessionCount` (add a counter to the
     per-game aggregate; keep pushing every date so `streak()` is unchanged).
   - Detail tab label: `sessions.filter((s) => s.minutes > 0).length`.
   - Played Today: keep marker rows visible (tapping one is how the user adds real minutes) but when
     `sess.minutes === 0 && sess.note?.includes(STEAM_MARKER_NOTE)` render
     "synced from Steam — tap to add time" instead of "0m today". Import `STEAM_MARKER_NOTE` from
     `services/steam` (a service import is allowed).
3. **Play-day ranges.** `rangeStart(range, today = new Date(playDay() + "T12:00"))`.

## Acceptance criteria

- `npx tsc --noEmit` passes.
- A Steam-linked game with 600 Steam minutes and no sessions: All-time tile ≥ 10h; it appears in
  the All-time playtime ranking with "0 sessions"; it does not appear in Times Played.
- After a Steam sync creates a marker for today: Played Today shows the game with the Steam
  caption; Times Played unchanged; the detail header says "0 sessions" for a game with only markers.
- Week/Month/Year tiles unchanged for daytime sessions; a session logged at 01:00 Monday counts in
  the week that ends that Sunday.

## Conflicts

Shares `repo.ts`, `GameDetailScreen.tsx`, `GamesScreen.tsx` with 05/07/12 and 03. Same agent as
05, 07 and 12, in the order 05 → 06 → 07 → 12, on a branch rebased onto merged plan 01.
