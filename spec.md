# Backlog Tracker — Spec

> **Status key:** ✅ shipped · 🔲 Phase 2

---

## Game states (derived, never stored) ✅

| State | Rule |
|---|---|
| **Current** | Last played within the current window (default: this calendar year; user-switchable to N days) |
| **Recently Played** | Last played within the recent window (default 14 days; configurable). Shown separately on the Games screen; **mutually exclusive with Current** — a game appears in only one section |
| **Backlog (started)** | Has playtime or `last_played_override` but not within current window |
| **Backlog** | No sessions and no imported time |
| **On Hold** | Manual flag (requires a reason note). Overrides drift. Shown at the bottom of game detail, above Delete |
| **Completed** | `completed_at` set, or progress ≥ 100% |

State is computed by `deriveGroup()` in `src/logic/derive.ts`. Never stored.

---

## Adding a game ✅

- **Minimum: title only.** All other fields optional and editable later.
- IGDB metadata search: cover art, release year, platforms, genres → auto-tagged as `platform:x` / `genre:x`. Credentials verified on Settings save.
- "Already started?" toggle → calendar date picker (defaults to today, capped at today). iOS: inline compact picker. Android: calendar dialog.
- Time already spent: optional hours + minutes (does not default to 0 if omitted — zero is fine).
- **GameFAQs search** button pre-filled with title → `gamefaqs.gamespot.com/search?game=<title>`.
- All fields editable post-add via **✎ Edit** modal on game detail.

---

## Editing a game ✅

**✎ Edit** button on game detail opens a modal covering:
- Title, release year, platform, cover URL
- Start date (accepts `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`; precision stored accordingly)
- Base playtime (imported minutes, outside logged sessions)
- Completed date, rating (1–10), final note

---

## Progress tracking ✅

Three methods per game (switchable):

1. **Checkbox milestones** (default) — named checkboxes. Regular milestones span 0–100%; each completed stretch goal adds one milestone-share beyond 100%.
2. **Manual %** — direct percentage input.
3. **Walkthrough position** — paste walkthrough text; mark position; % = position ÷ length.

- 100% triggers a completion prompt (rating / final note).
- Progress bar renders gracefully above 100% (gold colour, e.g. "115%").

---

## Games screen (primary view) ✅

- **Played Today** drop zone + per-card ▶ quick-log button.
- **Recently Played** section (expanded by default) — sorted most-recent-first.
- Current / Backlog (started) / Backlog / On Hold / Completed — collapsed by default.
- Search by title: while searching, all sections auto-expand and Played Today hides.
- Genre/tag filter chips.
- Per-game 🔥 streak counter. Streak = played days; grace period (1/2/3 days) is configurable.
- Session quick-log modal: ±15 min stepper, optional note.
- One session per game per calendar day (upsert). Past-midnight (before 5am) counts to previous day.
- **+ Add Game** button in header.

---

## Genre blocker ✅

Trigger: logging the **first session** of a **never-played** game.
- Counts active games (Current + Backlog started) sharing ≥1 `genre:` tag.
- If count ≥ threshold (default 1): non-blocking warning with game list, progress %, last-played. [Start anyway] / [Cancel].

---

## Calendar ✅

- Month grid; day cells show a dot when sessions exist.
- Tap a day: list of sessions with game title, duration, note.

---

## Stats ✅

- Playtime totals: week / month / year / all-time.
- Rankings: by playtime and session count (same time filters).
- Genre distribution (bar rows by playtime).
- **Longest to complete**: calendar days from `start_date` to `completed_at`.
- **Wrap it up** tab: unfinished games ranked by progress % descending.

---

## On My Mind ✅

- Flag any game from any state. Independent of all other state.
- Dedicated view (🧠 tab).
- Flag add/remove timestamps stored in `mind_events`.

---

## Import pipeline ✅

All importers share the same non-blocking queue (`src/services/importQueue.ts`):
- Rows processed in chunks of 15, yielding to the UI between batches (`setTimeout(0)`).
- Progress visible on a temporary 📥 **Import tab** that appears during import and auto-dismisses 6 seconds after completion.
- Each chunk runs in its own SQLite transaction; re-runs are safe (duplicates skipped).

### Deduplication tiers (all importers)
1. **External ID** — `game_external_ids(source, external_id)` unique constraint. Instant, fully idempotent.
2. **Normalized title** — `normalizeTitle()` strips ®™©, edition suffixes (GOTY / Definitive / Remastered / …), converts roman numerals (II–XIII, V; intentionally excludes I and X), drops leading "the", normalizes `&` → "and". Cross-source match → **merge**.
3. **Fuzzy / IGDB canonical** 🔲 Phase 2.

### Merge behaviour
When a new import entry matches an existing game:
- External ID linked in `game_external_ids`.
- `source:<storefront>` + `platform:<storefront>` tags added.
- Playtime filled **only if the existing game has zero tracked time** (avoids double-counting).
- `last_played_override` updated to whichever date is later.
- Cover URL filled if missing.
- Audit note added: "Merged from Steam import (appid …, Xh on Steam)".
- Queue shows 🔗 **merged** status (gold).

### CSV import ✅
Header: `title, original_entry, platform, year_started, year_completed, status, hours, notes`

| Status value | Becomes |
|---|---|
| `completed` | `completed_at` set, "Completed" milestone ticked |
| `in_progress` | Started; lands in Backlog (started) or Current based on year |
| `halted` / `abandoned` | On Hold with note; `abandoned` also gets `status:abandoned` tag |
| `backlog` | Backlog (no playtime) |
| `maybe` | Backlog + `status:maybe` tag |

Fuzzy hours (`20?`, `21.5`) parsed correctly. Quoted fields with embedded commas handled. Overflow columns folded into notes.

### Steam library import ✅
- Requires: Steam Web API key + SteamID64; profile "Game details" = Public.
- Fetches via `IPlayerService/GetOwnedGames` (React Native fetch, no CORS restriction).
- Played games processed first (so canonical entries exist before their remastered duplicates try to merge).
- Never-played games (0 minutes) get `status:unplayed` tag.
- Idempotent: re-run picks up new purchases, skips everything already linked.

### JSON backup ✅
Full export / import of all tables as JSON. All tables including `game_external_ids` are included. Safe for cross-device migration and manual backups.

---

## Typed tags ✅

Tags support `type:value` namespace prefix.

| Type | Colour | Source |
|---|---|---|
| `platform` | Steel blue | IGDB auto-tag, CSV import, Steam import |
| `genre` | Purple | IGDB auto-tag |
| `source` | Dark steel blue | Storefront imports (`source:steam`, future `source:gog`) |
| `status` | Amber-brown | Importer flags (`status:unplayed`, `status:abandoned`, `status:maybe`) |

Only the value portion renders in the UI. Typed tags sort before plain tags. Each type has a distinct background colour (defined in `theme.ts → TAG_TYPE_COLORS`).

---

## Settings ✅

| Key | Default | Notes |
|---|---|---|
| Recently Played window | 14 days | |
| Current window | This year | Switchable to N days |
| Streak grace period | 1 day | 1/2/3 days |
| Genre blocker threshold | 1 | |
| IGDB Client ID + Secret | — | Verified against Twitch OAuth on save |
| Steam Web API key + SteamID64 | — | Saved before import attempt |

---

## Storage ✅

- SQLite via `expo-sqlite` (sync API), file: `backlog.db` in app documents directory.
- Survives OTA updates, EAS binary updates, and TestFlight re-installs.
- Lost only on full uninstall or manual "Clear Data".
- Schema versioned: `schema_version` table + append-only `MIGRATIONS` array.

---

## Phase 2 (not yet started)

- 🔲 LLM story recap ("Where was I?") + "What's next?" hint — local Ollama / MLX Swift
- 🔲 GameFAQs guide list fetching (web scraping, ToS risk)
- 🔲 HowLongToBeat time-based progress fallback
- 🔲 Visualizations: "The Juggler" animated screensaver + "The Weightlifter"
- 🔲 Calendar heatmap (GitHub-style year view) + cover art thumbnails per day
- 🔲 GOG import (unofficial API or paste-library fallback)
- 🔲 Nintendo eShop (paste purchase history — no official API exists)
- 🔲 Weekly digest summary card
- 🔲 Launch game from local path (Android)
- 🔲 Game recommender integration
- 🔲 Fuzzy / IGDB-canonical dedup tier (Phase 3 of import pipeline)
- 🔲 Pie chart genre distribution
- 🔲 On My Mind history view
