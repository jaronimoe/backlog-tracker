# 01 — Steam playtime as its own source (per-appid totals, no dated attribution)

| Severity | Effort | Wave | Files |
|----------|--------|------|-------|
| high (data corruption on every re-sync; model too complex) | M | 1 | `app/src/db/database.ts`, `app/src/db/repo.ts`, `app/src/types.ts`, `app/src/services/steam.ts`, `app/AGENTS.md`, root `README.md` (Steam import section) |

## Decision (user, 2026-09-16 — "Option A")

Steam playtime and the user's own records are kept **side by side and never merged into
sessions**. A game's playtime is
`max(Steam total across its linked appids, base playtime + logged sessions)`, on the reasoning that
both measure the same play and the larger number is the truer one. Steam sync only refreshes the
per-appid totals, the last-played date and the zero-minute calendar marker. There are no deltas
written to `sessions`, no watermark, no baseline sentinel, and the "keep time / discard time"
dialogs become dead code (their removal and the header breakdown are plan 12).

## Problem with the current model

`games.steam_synced_minutes` is one watermark per **game**, and every re-sync turns the growth of
Steam's lifetime total into a dated session on the last-played day (`services/steam.ts:238-258`).
Two failures:

1. **Double counting with merged listings.** A game can be linked to several appids (original +
   remaster, merged by `normalizeTitle`). The merge path at `steam.ts:138-141` overwrites the
   watermark with the merged listing's playtime. With "Skyrim" (500 min, appid A) added first and
   "Skyrim Special Edition" (0 min, appid B) merged after it, the watermark ends at 0; the next
   re-sync computes delta 500 for A and logs a 500-minute session on top of the 500 still in
   `imported_minutes`; B then folds −500 into `imported_minutes` (clamped at 0). Every further
   re-sync adds another 500-minute session.
2. **Collisions with manual sessions.** A multi-week Steam delta lands on one day, on top of or next
   to whatever the user logged by hand; reconciling that needs the watermark, the v7 `-1` sentinel,
   and the two "keep/discard" prompts, and it is still wrong whenever the user logs the same play.

## Fix

### 1. Migration v9 — append to `MIGRATIONS` in `db/database.ts`

```sql
ALTER TABLE game_external_ids ADD COLUMN playtime_minutes INTEGER
UPDATE game_external_ids
   SET playtime_minutes = (SELECT steam_synced_minutes FROM games WHERE games.id = game_external_ids.game_id)
 WHERE source = 'steam'
   AND (SELECT steam_synced_minutes FROM games WHERE games.id = game_external_ids.game_id) >= 0
   AND game_id NOT IN (SELECT game_id FROM game_external_ids WHERE source = 'steam'
                       GROUP BY game_id HAVING COUNT(*) > 1)
```

`playtime_minutes` = Steam's lifetime total for that appid as of the last sync; `NULL` = not synced
under the new model yet. Seeding: for single-appid games the old watermark *is* the last Steam total
seen (set at import and on every re-sync), so copy it; multi-appid games and `-1` sentinels stay
`NULL` and are filled by the next sync. Write this reasoning, plus the following invariant, into the
migration comment: for a single-appid game, `imported_minutes + sessions ≥ watermark` always held
(the lump was Steam's total at import and every attributed delta went into sessions or the lump), so
`max(watermark, imported + sessions)` equals the old `imported + sessions` and no displayed total
changes at migration time. `games.steam_synced_minutes` stays in the schema (append-only rule) but is
no longer read or written.

### 2. Data model — `types.ts`, `db/repo.ts`

- `GameWithMeta`: add `steamMinutes: number | null` (sum of `playtime_minutes` over the game's
  `source = 'steam'` rows; `null` when there are no synced rows) and `loggedMinutes: number` (sum of
  session minutes). `totalMinutes = Math.max(steamMinutes ?? 0, imported_minutes + loggedMinutes)`.
- `enrichAll`: add a fourth batch query
  `SELECT game_id, SUM(playtime_minutes) AS steam FROM game_external_ids WHERE source = 'steam' AND playtime_minutes IS NOT NULL ${where} GROUP BY game_id`
  (same `where`/`params` convention as the other three). Update the doc comment ("fixed number of
  queries (4)").
- `isNeverPlayed`: use the same definition (add the Steam sum to the existing two queries).
- Delete `accumulateSession` — its only caller disappears. `ensureMarkerSession` stays.

### 3. `services/steam.ts`

- **New adds**: `addGame({ …, imported_minutes: 0 })` — Steam's number now lives on the link row.
  Insert the external id with `playtime_minutes = g.playtime_forever`. The `status:unplayed` tag
  logic is unchanged.
- **Merge path** (existing-game branch): insert the external id with `playtime_minutes`; delete the
  `isNeverPlayed`-gated `imported_minutes` fill (lines 128-136) and the watermark update
  (138-141). Keep tags, the audit note (still mention "Xh on Steam"), cover fill, the
  `last_played_override` bump and the marker session. Detail string: "linked" or "Xh on Steam".
- **`resyncLinked(g, gameId)`**: read the row's current `playtime_minutes`; `UPDATE` it to
  `g.playtime_forever`; bump `last_played_override` if newer; `ensureMarkerSession` on the
  last-played day. Result: `merged` with "+Xm"/"−Xm" when the total changed (or "synced" when it was
  `NULL`), else `duplicate` "already up to date". Delete the baseline branch, the delta logic, the
  `accumulateSession` call and the `imported_minutes` fold.
- Add `steamAppidsFor(gameId): string[]` (`ORDER BY id`); reimplement `steamAppidFor` as its first
  element so `GameDetailScreen.tsx:128` is untouched. `syncSteamGame` iterates all linked appids,
  aggregates results ("Already up to date with Steam." when all are duplicates, otherwise
  "Playtime updated (…)"), and throws as today when none is in the library.
- Optional, only if it stays small: `fetchSteamLibrary(appids?: number[])` adding
  `&appids_filter[i]=<id>` for a filtered request, skipping the "Steam returned no games" throw for
  filtered calls, with a fallback to the unfiltered fetch when the filtered response is empty. Skip
  and mention it in the report if the URL form can't be confirmed.
- `STEAM_MARKER_NOTE` stays (markers still carry it; plan 06 uses it for the Played Today caption).

### 4. Docs

- `app/AGENTS.md` "Adding a new storefront importer": playtime goes on
  `game_external_ids.playtime_minutes`, never into `imported_minutes`; drop the
  "fill playtime only if `isNeverPlayed()`" line. Add the `max(...)` rule to "Core invariants" as
  invariant 6 ("Storefront playtime is a separate source; totals are max(storefront, own)").
- Root `README.md`, Import → Steam library: rewrite the "Merge policy" playtime clause, the
  "Playtime as dated sessions" and "Per-game sync" paragraphs, and delete the "Steam dump cleanup"
  paragraph under Game detail — Sessions tab, to describe the new model in a few lines.

### Do not touch

`components/SessionLogModal.tsx` and `screens/GameDetailScreen.tsx` (the keep/discard flows still
compile because `updateGame` and `imported_minutes` remain; plan 12 removes them).
`services/exportImport.ts` (plan 04's migration replay will apply v9 to restored data).
`db/stats.ts` (plan 06).

## Acceptance criteria

- `npx tsc --noEmit` passes.
- `grep -rn steam_synced_minutes app/src` matches only `MIGRATIONS` and the back-compat block in
  `exportImport.ts`; `grep -rn accumulateSession app/src` matches nothing.
- Hand-trace in the commit message: Skyrim import → row A 500, row B 0, `imported_minutes` 0,
  total 500. Two re-syncs → rows unchanged, "already up to date", total 500. Play 60 min on Steam →
  row A 560 → "+1h", total 560, **no session written**. Log 30 min by hand that day → total
  `max(560, 0 + 30)` = 560.
- Migration trace: single-appid game with watermark 900, `imported_minutes` 800, sessions 100 →
  after: `max(900, 900)` = 900, unchanged. Multi-appid game → rows `NULL` → total =
  `imported + sessions`, unchanged.

## Manual test (user, on device)

1. Settings → Export encrypted.
2. Install; migration v9 runs.
3. Settings → Steam library, "Re-sync playtime" ticked → every linked game shows "+…", "synced"
   or "already up to date"; totals on Games are unchanged or slightly higher (Steam's number is now
   trusted); the Calendar tab gains no minutes.
4. Play something on Steam, then the game's "Sync playtime from Steam" → "+Xm"; the header total
   rises; no new minutes on the calendar.

## Notes

Sessions that earlier syncs created with minutes (note "Last played on Steam") remain ordinary
sessions. Once synced, totals are governed by Steam's number, so deleting those sessions only
affects the "own records" figure.
