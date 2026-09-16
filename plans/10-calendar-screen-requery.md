# 10 — Calendar screen: stop re-querying on every day tap

| Severity | Effort | Wave | Files |
|----------|--------|------|-------|
| low (perf; every tap costs 2–3 queries plus a calendar-permission round trip) | S | 1 | `app/src/screens/CalendarScreen.tsx` |

## Problem

`reload` (`screens/CalendarScreen.tsx:60-103`) is a single `useCallback` keyed on
`[year, month, selected, scope]` and handed to `useFocusEffect`. Every change to `selected` or
`scope` therefore re-runs everything: the month's `sessionsInRange`, `sessionsForDay`,
`startedCompletedInRange`, and the async `eventsByDay` (permission check + device-calendar fetch).
Tapping days is the screen's main interaction.

## Fix

Split the work by what actually changes:

1. **Month data** — depends on `year`, `month` (and a focus `tick`): `sessionsInRange` for the
   month → `monthRows` state; `eventsByDay` for the month → `dayEvents` (keep the cancellation
   guard). Also `startedCompletedInRange` for the month → `monthSummary`.
2. **Year data** — depends on `year` and runs only while `scope === "year"`: `sessionsInRange` for
   the year → `yearRows`; `startedCompletedInRange` for the year → `yearSummary`.
3. **Day data** — depends on `selected`, runs only while `scope === "day"`:
   `startedCompletedInRange(selected, selected)` → `daySummary` (one cheap query; the day's
   sessions themselves come from `monthRows`, which already carry `title` and `note`).
4. **Derived, no queries** (`useMemo`): `dayTotals` from `monthRows`; `daySessions` =
   `monthRows.filter(r => r.date === selected)` sorted by minutes desc; `gameTotals` and
   `periodTotal` from `monthRows` or `yearRows` by scope; `summary` picks the matching one of the
   three.

Keep `useFocusEffect` to bump a `tick` that re-runs effects 1–3, because sessions change on other
screens. Use plain `useEffect`s for in-screen changes.

## Acceptance criteria

- `npx tsc --noEmit` passes.
- Tapping days performs no SQLite calls except the single-day `startedCompletedInRange` (verify by
  temporarily logging inside `sessionsInRange`/`sessionsForDay`; remove the logging before
  committing). Month arrows, year toggle and Today still refresh their data.
- Logging a session on the Games tab, then returning to Calendar, shows the new minutes (focus
  refresh still works).
- The device-calendar overlay still appears on the grid and in the day panel.
