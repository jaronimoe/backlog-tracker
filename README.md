# Backlog Tracker

A personal gaming diary for people who juggle multiple games. Track your backlog, log play sessions, follow walkthroughs, and import your full library from Steam or a CSV — all stored locally on-device with no account or backend required.

Built with **React Native + Expo**, targeting iOS and Android.

---

## Features

### Games view
- All games grouped by derived state: **Current**, **Backlog (started)**, **Backlog**, **On Hold**, **Completed**
- **Played Today** zone with one-tap session logging (±15 min stepper)
- **Recently Played** section (configurable window, default 14 days) — mutually exclusive with Current so games don't appear twice
- Search by title + filter by genre/platform tag chips
- Per-game 🔥 streak counter with configurable grace period

### Game states (derived, never set manually)
| State | Rule |
|---|---|
| **Current** | Played within the current window (default: this calendar year) |
| **Backlog (started)** | Has playtime but not played within current window |
| **Backlog** | No sessions and no imported time |
| **On Hold** | Manual flag — requires a reason note |
| **Completed** | Progress ≥ 100% or `completed_at` date set |

### Adding games
- Minimum input: **title only** — everything else is optional and editable later
- IGDB metadata search (cover art, release year, platform, genre → auto-tagged)
- Calendar date picker (defaults to today) for start date; time played optional
- GameFAQs search button pre-filled with the game title

### Game detail
- **✎ Edit** modal: title, release year, platform, cover URL, start date (fuzzy: `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`), base playtime, completed date, rating, final note
- Three progress methods: **checkbox milestones** (default, supports stretch goals beyond 100%), **manual %**, **walkthrough position**
- Walkthrough tab: paste URL + full text; in-app scrollable reader with position marker; GameFAQs search shortcut
- Notes tab: freeform timestamped notes
- Sessions tab: full play history
- On Hold toggle (with reason) at the bottom, above Delete

### Progress
- Checkbox milestones with optional **stretch goals** (push progress past 100%)
- Manual percentage
- Walkthrough text: position in text ÷ total length = %
- Progress bar renders gracefully above 100% (gold colour)

### Calendar
- Month grid; tap any day to see sessions, games played, and notes

### Stats
- Playtime totals: week / month / year / all-time
- Rankings by playtime and session count (same filters)
- Genre distribution (bar chart)
- **Longest to complete** (days from start to completion)
- **Wrap it up** tab (almost-finished games ranked by progress %)

### On My Mind
- Flag any game from any state
- Dedicated view; event timestamps stored

### Import

#### Steam library (Settings → Steam library)
- Fetches owned games via the Steam Web API (requires Web API key + SteamID64; profile "Game details" must be Public)
- **Merge policy:** games matching an existing entry by normalized title are *merged* into it rather than duplicated — enriched with `source:steam` + `platform:steam` tags, a Steam appid link, and playtime (only if the existing entry has no tracked time, to avoid double-counting)
- **Playtime as dated sessions:** on re-sync, any *new* playtime since the last sync is logged as a real session on Steam's "last played" date — so playing a game and then syncing shows those hours on your calendar/stats for that day (counted exactly once via a per-game watermark, so repeated syncs never double up). When there's no new time, a 0-minute marker session still surfaces the game on its last-played day without touching playtime or overwriting a manually logged session
- **Per-game sync:** a Steam-linked game's detail screen has a **Sync playtime from Steam** button to refresh just that game's playtime + last-played date on demand (no full library re-import needed)
- Zero-playtime games get an additional `status:unplayed` tag
- Fully idempotent — already-linked games are skipped on re-import; new purchases are picked up automatically
- Runs **non-blocking** (chunked, yields to UI between batches); progress visible on a temporary 📥 Import tab that vanishes when done

#### CSV bulk import (Settings → Bulk add from CSV)
- Header: `title, original_entry, platform, year_started, year_completed, status, hours, notes`
- Status values: `completed`, `in_progress`, `halted`, `abandoned`, `backlog`, `maybe`
- Quoted fields (commas in notes/titles) handled correctly
- Fuzzy hours (`20?`, `21.5`) parsed correctly
- Dedup via **normalized titles** (strips ®™©, edition suffixes, converts roman numerals) plus a conservative **fuzzy tier** — safe to re-run
- Same live Import tab as Steam

#### JSON backup (Settings → Backup & Sync)
- Full export / import of all data as JSON
- Use for manual backups or cross-device migration

### Settings
| Setting | Default | Notes |
|---|---|---|
| Recently Played window | 14 days | |
| Current window | This year | Can switch to N days |
| Streak grace period | 1 day | 1/2/3 day gap before streak resets |
| Genre blocker threshold | 1 | Warn when ≥ N games of same genre active |
| IGDB Client ID / Secret | — | From Twitch dev console; verified on save |
| Steam Web API key / SteamID64 | — | For Steam library import |

### Genre Blocker
Advisory check when logging the first session of a never-played game. Shows all active games sharing a genre tag with progress % and last-played date. Never a hard block.

---

## Architecture

```
app/
├── App.tsx                   # Navigator; Import tab mounts conditionally
├── src/
│   ├── db/
│   │   ├── database.ts       # SQLite open, versioned migrations, settings helpers
│   │   ├── repo.ts           # All DB reads/writes (addGame, updateGame, logSession, …)
│   │   └── stats.ts          # Aggregated playtime/ranking queries for StatsScreen
│   ├── logic/
│   │   ├── derive.ts         # Pure functions: group derivation, streak, progress %, formatting
│   │   └── normalize.ts      # Canonical title normalizer used by all import paths
│   ├── services/
│   │   ├── importQueue.ts    # Generic non-blocking chunked import runner + observable store
│   │   ├── csvImport.ts      # CSV parser + row mapper, feeds importQueue
│   │   ├── steam.ts          # Steam API fetch, merge logic, feeds importQueue
│   │   ├── igdb.ts           # IGDB metadata search + credential verification
│   │   └── exportImport.ts   # JSON full-backup export/import
│   ├── screens/
│   │   ├── GamesScreen.tsx   # Primary view: Played Today + Recently Played + groups + search
│   │   ├── GameDetailScreen.tsx
│   │   ├── AddGameScreen.tsx
│   │   ├── CalendarScreen.tsx
│   │   ├── StatsScreen.tsx
│   │   ├── MindScreen.tsx
│   │   ├── ImportScreen.tsx  # Live import queue (temporary tab)
│   │   └── SettingsScreen.tsx
│   ├── components/
│   │   ├── ui.tsx            # Shared: Btn, Field, Input, Cover, GameRow, Section, ProgressBar, TagRow, FilterChip
│   │   └── SessionLogModal.tsx # Session log + genre blocker panel
│   ├── types.ts              # Game, Session, Milestone, Note, GameWithMeta, StateGroup, …
│   └── theme.ts              # Colour palette + tag-type colours
```

### Database schema (v2)

| Table | Purpose |
|---|---|
| `games` | Core game record |
| `tags` | `game_id, tag` — `UNIQUE(game_id, tag)` |
| `milestones` | Named checkboxes with stretch-goal flag |
| `sessions` | One row per game per calendar day (`UNIQUE(game_id, date)`) |
| `notes` | Timestamped freeform notes |
| `mind_events` | On-My-Mind add/remove history |
| `game_external_ids` | Storefront links: `(game_id, source, external_id)` — `UNIQUE(source, external_id)` |
| `settings` | Key-value store |
| `schema_version` | Current migration level |

Migrations are append-only arrays in `database.ts`. **Never edit an existing migration.**

### Import pipeline

All importers (CSV, Steam, future GOG/eShop) use the same pipeline:

1. **Parse / fetch** — source-specific (CSV parser, Steam API call)
2. **Normalize** — `normalizeTitle()` strips trademarks, edition suffixes, roman numerals; used for cross-source dedup
3. **Dedup tiers**
   - Tier 1: `game_external_ids` lookup by stable ID (instant, idempotent)
   - Tier 2: normalized-title match → **merge** (adds tags + note, fills playtime only if zero)
   - Tier 3: fuzzy title match (subtitle-drop + typo tolerance, numeric-token guarded) / IGDB canonical ID match on manual adds
4. **Queue** — `startImport()` in `importQueue.ts` runs rows in chunks of 15, yielding to the UI between batches via `setTimeout(0)`
5. **UI** — `ImportScreen` subscribes to the queue store via `useImportState()` (`useSyncExternalStore`); the tab is conditionally rendered in `App.tsx` and auto-dismisses after 6 seconds

### Game state derivation

States are computed by `deriveGroup()` in `derive.ts` — never stored. Inputs:
- `last_played`: `MAX(sessions.date, last_played_override)`
- `totalMinutes`: `SUM(sessions.minutes) + imported_minutes`
- `progress`: from milestones / manual % / walkthrough position
- User settings: `currentWindow`, `recentDays`

---

## Getting started

### Prerequisites
- Node.js 20+
- Expo CLI: `npm install -g expo`
- [Expo Go](https://expo.dev/go) on your phone, or a simulator

### Run
```bash
cd app
npm install
npm start          # opens Expo dev server
# scan QR in Expo Go, or press 'i' for iOS sim / 'a' for Android
```

### Optional: IGDB metadata search
1. Create a Twitch developer app at https://dev.twitch.tv/console
2. Copy Client ID and Client Secret
3. Settings → IGDB → paste credentials → Save (credentials are verified on save)

### Optional: Steam library import
1. Get your Web API key: https://steamcommunity.com/dev/apikey
2. Find your SteamID64 at https://steamid.io
3. Set your profile "Game details" to **Public**
4. Settings → Steam library → paste key + SteamID → Import

---

## Tech stack

| | |
|---|---|
| Framework | React Native 0.86 / Expo SDK 57 |
| Navigation | React Navigation (bottom tabs + native stack) |
| Database | expo-sqlite (synchronous API, WAL mode) |
| Date picker | @react-native-community/datetimepicker |
| File access | expo-document-picker, expo-file-system, expo-sharing |
| State | `useState` + `useSyncExternalStore` (import queue) — no external state library |
| Language | TypeScript (strict) |

---

## Roadmap (Phase 2)

- [ ] LLM story recap ("Where was I?") + "What's next?" hint — local model via Ollama / MLX
- [ ] GameFAQs guide list fetching
- [ ] HowLongToBeat time-based progress fallback
- [ ] Visualizations: "The Juggler" animated screensaver
- [ ] Calendar heatmap (GitHub-style) + cover art thumbnails
- [ ] GOG import (unofficial API or paste fallback)
- [ ] Nintendo eShop (paste purchase history)
- [ ] Weekly digest summary card
- [ ] Launch game from local path (Android)
- [ ] Game recommender integration
