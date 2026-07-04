# Agent / AI assistant guide — backlog-tracker

This file is the source of truth for any AI coding agent working on this repo.
Read it fully before writing any code.

---

## Stack

- **React Native 0.86 / Expo SDK 57** — native iOS + Android only (no web build).
  Always read versioned Expo docs at https://docs.expo.dev/versions/v57.0.0/
- **TypeScript strict** — `npx tsc --noEmit` must pass before every commit.
- **expo-sqlite** synchronous API (`db.runSync`, `db.getAllSync`, `db.withTransactionSync`).
  Never use the async variants — they are not needed and add complexity.
- **No external state library.** Local `useState` + `useSyncExternalStore` for the
  import queue store. Do not add Redux, Zustand, MobX, or similar.
- **No new dependencies without discussion.** The dep list is intentionally minimal.

---

## File map

```
app/
├── App.tsx                     Navigator (bottom tabs + native stack). Import tab
│                               renders conditionally: {imp.active && <Tab.Screen …/>}
├── src/
│   ├── db/
│   │   ├── database.ts         SQLite open + versioned MIGRATIONS array + settings helpers
│   │   ├── repo.ts             All DB reads/writes. Pure functions — no React.
│   │   └── stats.ts            Aggregation queries for StatsScreen.
│   ├── logic/
│   │   ├── derive.ts           Pure functions: deriveGroup, isRecentlyPlayed, streak,
│   │   │                       progressPercent, fmtMinutes, isoDate, playDay, …
│   │   ├── normalize.ts        normalizeTitle() + cleanTitle() — used by ALL importers.
│   │   └── fuzzy.ts            findFuzzyMatch() — tier-3 dedup (subtitle-drop + typo
│   │                           tolerance, numeric-token guarded). Used after exact
│   │                           normalized-title lookup misses.
│   ├── services/
│   │   ├── importQueue.ts      Generic non-blocking import runner + observable store.
│   │   │                       All importers call startImport() from here.
│   │   ├── csvImport.ts        CSV parser + row mapper → startImport()
│   │   ├── steam.ts            Steam API fetch + merge logic → startImport()
│   │   ├── igdb.ts             IGDB search + verifyIgdbCreds()
│   │   └── exportImport.ts     JSON full-backup export/import. Add new tables to TABLES.
│   ├── screens/                One file per screen. Screens own local state + call repo.
│   ├── components/
│   │   ├── ui.tsx              Btn, Field, Input, Cover, GameRow, Section,
│   │   │                       ProgressBar, TagRow, FilterChip — use these, don't reinvent.
│   │   └── SessionLogModal.tsx Session log + genre blocker panel.
│   ├── types.ts                All shared types. Add new fields here.
│   └── theme.ts                C (colours) + TAG_TYPE_COLORS. Add new tag types here.
```

---

## Core invariants — never break these

### 1. Game state is always derived, never stored
`group` is computed by `deriveGroup()` in `derive.ts` from `last_played`, `totalMinutes`,
`progress`, and user settings. It is **never written to the DB**. Do not add a `state`
or `group` column.

### 2. Database migrations are append-only
`MIGRATIONS` in `database.ts` is an array of string arrays. **Never edit an existing
entry.** Always append a new array for schema changes. The runner applies only new
migrations starting from `schema_version`.

### 3. Sessions are one-per-game-per-day
`sessions` has `UNIQUE(game_id, date)`. Use `logSession()` (which does an upsert) rather
than raw inserts. `date` is a calendar-day string (`YYYY-MM-DD`); `playDay()` returns
today shifted back 5 hours so past-midnight play logs to the previous day.

### 4. All import paths use importQueue + normalizeTitle
Any new importer (GOG, eShop, etc.) must:
- Call `startImport(label, titles, processRow)` from `importQueue.ts`
- Use `normalizeTitle()` from `logic/normalize.ts` for dedup against existing games,
  falling back to `findFuzzyMatch()` from `logic/fuzzy.ts` when the exact lookup misses
- Insert into `game_external_ids` with `(game_id, source, external_id)` for idempotent re-runs
- Tag merged games with `source:<storefront>` so users can see what was auto-linked

### 5. TypeScript must compile
Run `npx tsc --noEmit` from the `app/` directory before committing. A passing build is
the minimum bar.

---

## Key patterns

### Adding a game
```ts
import { addGame } from "../db/repo";
const id = addGame({
  title: "My Game",
  platform_summary: "PC",
  imported_minutes: 120,
  tags: ["platform:pc", "source:steam"],
});
```
`addGame` always creates one default "Completed" milestone. Do not create it manually.

### Updating a game
```ts
import { updateGame } from "../db/repo";
updateGame(id, { cover_url: "https://...", rating: 8 });
```
Only include changed fields — it builds a dynamic `SET` clause.

### Tag helpers
```ts
addTag(gameId, "genre:rpg");   // INSERT OR IGNORE
removeTag(gameId, "genre:rpg");
```

### Linking an external ID (required for all storefront imports)
```ts
db.runSync(
  "INSERT OR IGNORE INTO game_external_ids (game_id, source, external_id) VALUES (?, ?, ?)",
  [gameId, "steam", String(appid)]
);
```

### Reading all games (enriched with group, tags, streak, etc.)
```ts
import { allGames } from "../db/repo";
const games: GameWithMeta[] = allGames(); // call on useFocusEffect
```
`GameWithMeta` extends `Game` with `tags`, `totalMinutes`, `lastPlayed`, `progress`,
`group`, `streak`.

### Adding a new screen
1. Create `src/screens/MyScreen.tsx`.
2. Import and add to the appropriate navigator in `App.tsx`.
3. If it needs a tab icon, add the name → emoji entry to `ICONS` in `App.tsx`.

### Adding a new setting
1. Add a key constant to `SETTINGS` in `database.ts`.
2. Read with `getSetting(SETTINGS.myKey, "default")`.
3. Write with `setSetting(SETTINGS.myKey, value)`.
4. Add a UI field in `SettingsScreen.tsx`.

### Adding a new tag type (for styling)
Add an entry to `TAG_TYPE_COLORS` in `theme.ts`:
```ts
export const TAG_TYPE_COLORS: Record<string, string> = {
  platform: "#00b4d8",
  genre: "#533483",
  source: "#417a9b",
  status: "#8d5a2b",
  mytype: "#hex",
};
```
Tags with that prefix will automatically render in that colour via `Tag` in `ui.tsx`.

### Adding a new storefront importer
1. Create `src/services/mystore.ts`.
2. Fetch the library (async, can throw — caller handles).
3. Sort played-first so canonical entries are created before remasters/editions.
4. Build two Maps before starting:
   - `linked: Map<externalId, gameId>` — from `game_external_ids WHERE source='mystore'`
   - `byNorm: Map<normalizedTitle, gameId>` — from all games
5. Process each game row:
   - Check `linked` → duplicate
   - Check `byNorm` via `normalizeTitle(name)`, then `findFuzzyMatch(norm, byNorm)` → merge
     (add external id, tags, note; fill playtime only if `isNeverPlayed()`; mark fuzzy
     merges with a `≈` detail prefix + mention the match in the audit note)
   - Otherwise → `addGame()` + insert external id + update both Maps
6. Call `startImport(label, names, processRow)` — the queue handles chunking + UI.
7. Add credentials to `SETTINGS` + a section in `SettingsScreen.tsx`.

---

## What NOT to do

- Do not use `db.runAsync` / `db.getAllAsync` — the sync API is fine and simpler.
- Do not store derived state (group, progress, lastPlayed) in the DB.
- Do not import from one screen into another (except `FilterChip` from `GamesScreen`
  which is re-used in `StatsScreen` — that's the only approved cross-screen import).
- Do not add a backend, network proxy, or any server-side component. The app is
  intentionally 100% local and offline-first.
- Do not wrap the entire `allGames()` result in a single massive transaction — it already
  does per-game DB calls; keep it that way for correctness.
- Do not use `expo-file-system` v2+ API (`FileSystem.readAsStringAsync` is the v1/legacy
  path — import from `expo-file-system/legacy` as already done in the codebase).

---

## Gotchas

- `playDay()` shifts the current time back 5 hours. Use it (not `new Date()`) everywhere
  a "today" date string is needed for session logic.
- `isoDate(d: Date)` formats a Date as `YYYY-MM-DD`. Do not use `toISOString().slice(0,10)` 
  (timezone issues on device).
- `normalizeTitle()` strips roman numerals II–XIII and V, but intentionally skips I and X
  (`Mega Man X` ≠ `Mega Man 10`). Do not add I or X to the ROMAN map.
- The `sessions` table uses `ON CONFLICT ... DO UPDATE` upsert. A second log call on the
  same day *replaces* minutes (it doesn't add). This is intentional — the session modal
  always shows the total for the day, not an increment.
- The Import tab is conditionally rendered: `{imp.active && <Tab.Screen …/>}`. React
  Navigation re-mounts screens when tabs appear/disappear, which is correct behaviour
  for `ImportScreen` (it reads from the store, not local state).
- `secureTextEntry` on the Steam API key field masks it visually but does not encrypt
  storage. Credentials are stored in plaintext in the `settings` SQLite table.
- After a CSV or Steam import, call `allGames()` fresh (via `useFocusEffect`) — the
  import runs outside React's render cycle and does not trigger re-renders automatically.
