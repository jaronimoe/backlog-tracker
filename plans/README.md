# Fix plans — pre-feature hardening

Source: code review of `app/src` on 2026-09-16 at commit `81b2997` (branch `main`). Each numbered
file is a self-contained plan an implementing agent can execute cold: problem, root cause with
file:line references (line numbers as of `81b2997`), the fix, acceptance criteria, a manual test,
and known conflicts with other plans.

## Ground rules for every plan

- Read `app/AGENTS.md` first and obey it: `npx tsc --noEmit` (run from `app/`) must pass; migrations
  are append-only; use the sync `expo-sqlite` API and `withTx`; no new dependencies; no cross-screen
  imports; derived state is never stored.
- No automated tests exist. Verification = type check + reasoning through the scenarios in each plan
  + the manual test steps, which the user runs on device.
- Scope is exactly what the plan says. Stay off files the plan doesn't list unless a compile error
  forces a one-line touch; report it.

## Plans

| # | Plan | Kind | Severity | Effort | Files |
|---|------|------|----------|--------|-------|
| 01 | [Steam playtime as its own source](01-steam-watermark-per-appid.md) | bug, data corruption + model simplification | high | M | `db/database.ts`, `db/repo.ts`, `types.ts`, `services/steam.ts`, `app/AGENTS.md`, root `README.md` |
| 02 | [Cross-platform text prompt](02-cross-platform-text-prompt.md) | bug (Android no-op, iOS double alert) | high | M | new `components/PromptHost.tsx`, `App.tsx`, `screens/SettingsScreen.tsx`, `components/SessionLogModal.tsx`, `screens/GameDetailScreen.tsx` |
| 03 | [Theme consistency](03-theme-consistency.md) | bug, visual | medium | M | `theme.ts`, `components/ui.tsx`, `components/SessionLogModal.tsx`, `screens/ImportScreen.tsx`, `components/MonthGrid.tsx`, `screens/GamesScreen.tsx`, `screens/GameDetailScreen.tsx`, `components/SwipeableRow.tsx`, `screens/SettingsScreen.tsx` |
| 04 | [Backup/restore hardening](04-backup-restore-hardening.md) | bug + privacy warning | medium | M | `services/exportImport.ts`, `db/database.ts`, `screens/SettingsScreen.tsx` |
| 05 | [Data-entry correctness](05-data-entry-correctness.md) | bug, three small | medium | S | `db/repo.ts`, `screens/AddGameScreen.tsx`, `screens/GameDetailScreen.tsx`, `app/AGENTS.md` |
| 06 | [Stats consistency](06-stats-consistency.md) | bug, semantics | medium | M | `db/stats.ts`, `db/repo.ts`, `screens/StatsScreen.tsx`, `screens/GamesScreen.tsx`, `screens/GameDetailScreen.tsx` |
| 07 | [Settings validation](07-settings-validation.md) | robustness | low | S | `screens/SettingsScreen.tsx`, `db/database.ts`, `db/repo.ts`, `components/SessionLogModal.tsx` |
| 08 | [Import pipeline: BOM + fuzzy cache](08-import-pipeline-bom-and-fuzzy-cache.md) | robustness + perf | low | S | `services/csvImport.ts`, `logic/fuzzy.ts` |
| 09 | [Walkthrough reader performance](09-walkthrough-reader-performance.md) | perf | medium | M | `screens/GameDetailScreen.tsx` → new `components/WalkthroughReader.tsx` |
| 10 | [Calendar screen re-query](10-calendar-screen-requery.md) | perf | low | S | `screens/CalendarScreen.tsx` |
| 11 | [Title normalisation](11-title-normalisation.md) | design, decided | low | S | `logic/normalize.ts`, `app/AGENTS.md`, root `README.md` |
| 12 | [Steam time model: UI follow-through](12-steam-model-ui-follow-through.md) | cleanup after 01 | medium | S | `components/SessionLogModal.tsx`, `screens/GameDetailScreen.tsx` |

## Decisions (all taken on 2026-09-16)

- **01 / 06 / 12 — Option A:** Steam playtime is a separate source stored per appid; a game's
  playtime is `max(Steam total, base + logged sessions)`; sync never writes minutes into sessions.
  All-time stats use that one definition; zero-minute Steam markers are not sessions but still
  count as play days for streaks.
- **04:** plain export keeps secrets; the user is warned before exporting and decides.
- **11:** fold diacritics; re-releases (HD, remastered, definitive, special edition, …) stay
  separate games; only bundle/SKU-tier suffixes are stripped.

## Execution waves for parallel agents

Each agent works in its own git worktree on a branch named after the plan (`fix/01-steam-source`
etc.), commits once with a message that names the plan, and does not push. Merge in wave order;
rebase a branch onto `main` before merging it.

| Wave | Plans | Parallel? | Why |
|------|-------|-----------|-----|
| 1 | 01, 08, 09, 10, 11 | yes, all five at once | disjoint files (01 touches `repo.ts`/`types.ts`, which only wave-3 plans also edit) |
| 2 | 03 then 02 | sequential | both edit `SessionLogModal.tsx`, `SettingsScreen.tsx`, `GameDetailScreen.tsx`; 03 is the large mechanical one, 02 builds on its themed styles |
| 3 | 04 ‖ (05 → 06 → 07 → 12) | two agents | 04 is self-contained; the chain shares `repo.ts`, `GameDetailScreen.tsx`, `GamesScreen.tsx`, `SessionLogModal.tsx` |

`db/database.ts` is touched by 01 (append migration v9), 04 (add `replayMigrations`) and 07 (add
`intSetting`): distinct regions, but merge 01 first because 04's replay must include v9.

## Agent prompt template

```
You are implementing plans/NN-<name>.md in the backlog-tracker repository.
1. Read app/AGENTS.md, then the plan in full, then plans/README.md "Ground rules", then every file the plan lists.
2. Implement exactly the plan's scope.
3. From app/, run `npx tsc --noEmit` until it passes.
4. Commit on the current branch with the message "<plan title> (plans/NN)". Do not push.
5. Report: files changed, any deviation from the plan and why, anything you noticed but did not fix, and the manual test steps from the plan.
```

## After all waves

- Update the root `README.md` where behaviour changed and no plan already did so: session note
  replace semantics (05), plain export warning (04), stats definitions (06).
- Consider a zero-dependency test harness for the pure-logic modules (`logic/*`, `parseCsv`): Node
  22.23 on this machine supports `node --experimental-strip-types --test`, but extension-less relative
  imports in `logic/` would need checking first. Out of scope for these plans.
