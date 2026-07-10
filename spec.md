# Backlog Tracker — Spec

> **Status key:** ✅ shipped · 🔲 Phase 2

---

## Game states (derived, never stored) ✅

| State | Rule |
|---|---|
| **Current** | Last played **or started** within the current window (default: this calendar year; user-switchable to N days). The window is checked against the most recent of `last_played` and `start_date` |
| **Recently Played** | Last played within the recent window (default 14 days; configurable). Shown separately on the Games screen; **mutually exclusive with Current** — a game appears in only one section |
| **Backlog (started)** | Total playtime above the played threshold (default 29 min) or a `start_date`, but not within the current window |
| **Backlog** | Total playtime ≤ played threshold and no `start_date` — a brief boot-up doesn't count as played |
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
- Completed date, rating (1–5 stars, editable on the game page & edit modal, filterable), final note

**Cover art** can also be changed by tapping the cover image itself on game
detail ("tap to change" hint underneath). Opens an IGDB search modal
(auto-searched on the game's title, editable query) showing all matching
covers in a grid; tap one to apply it, or **Remove cover** to fall back to
the initials placeholder. Requires IGDB credentials (Settings) — otherwise
prompts to configure them or use the Edit modal's cover URL field instead.
This only changes the art; it does not touch tags, year, or the IGDB link,
so a hand-picked cover is never overwritten by the metadata sync below.

---

## Progress tracking ✅

Three methods per game (switchable):

1. **Checkbox milestones** (default) — named checkboxes. Regular milestones span 0–100%; each completed stretch goal adds one milestone-share beyond 100%.
2. **Manual %** — direct percentage input.
3. **Walkthrough position** — paste walkthrough text; mark position; % = position ÷ length.

- 100% triggers a completion prompt (rating / final note). The auto-set
  `completed_at` is the game's **last-played date** (you finished it when you
  last played, not when you ticked the box); falls back to today if the game
  has no recorded play date. Manual edits via the edit modal are untouched.
- Progress bar renders gracefully above 100% (gold colour, e.g. "115%").

---

## Games screen (primary view) ✅

- **Played Today** drop zone + per-card ▶ quick-log button.
- **Recently Played** section (expanded by default) — sorted most-recent-first.
- Current / Backlog (started) / Backlog / On Hold / Completed — collapsed by default.
- Search by title: while searching, all sections auto-expand and Played Today hides.
- Genre/tag filter chips.
- Per-game 🔥 streak counter. Streak = played days; grace period (1/2/3 days) is configurable.
- Session quick-log modal: ±15 min stepper **plus direct minutes input** (type any value directly).
- One session per game per calendar day (upsert). Past-midnight (before 5am) counts to previous day.
- **+ Add Game** button in header.

---

## Genre blocker ✅

Trigger: logging a session (with no existing session that day) while the game is still **never-played** (total playtime ≤ played threshold, default 29 min). Since the threshold is checked against the running total rather than a one-time flag, it can in principle re-trigger on an early day if the total is still at/under the threshold — a minor, accepted edge case.
- Counts active games (Current + Backlog started) sharing ≥1 `genre:` tag.
- If count ≥ threshold (default 1): non-blocking warning with game list, progress %, last-played. [Start anyway] / [Cancel].
- **Only fires for today's date.** Backfilling a forgotten session or editing a past day never triggers the blocker.

---

## Per-game session calendar ✅

Accessible via the **Sessions tab** on any game's detail screen.

- **📅 Calendar / ☰ List toggle** — switch between a heat-map month grid and a flat chronological list.
- **Month grid** (`MonthGrid` component, shared with the global Calendar screen): cells shaded by session minutes, today highlighted with an accent border, selected day with a subtle border.
- **`← session` / `session →` arrows** jump between this game's actual play-session dates (sorted), auto-snapping the visible month. Arrows are greyed out at the first/last session.
- **`‹ ›` month steppers** let you browse to months with no sessions (e.g. to backfill a forgotten day). Tapping the month label jumps back to today's month.
- **Tap any day** → selected-day panel:
  - *Session exists:* shows minutes + note, with **✎ Edit** and **🗑 Delete** buttons.
  - *No session:* shows **+ Add session**.
  - Edit/Add opens the Session Log modal pre-filled with existing data; saving upserts (add or replace).
- **List view:** tap a row to edit, long-press to delete. Hint text clarifies the gesture.
- **Editing Steam-attributed sessions:** deleting or shrinking a session whose note contains `STEAM_MARKER_NOTE` ("Last played on Steam") prompts:
  - **Keep time** *(default, bold on iOS)* — moves the removed minutes into `imported_minutes` (undated base playtime). Lifetime total stays accurate; only the calendar attribution changes.
  - **Discard time** — permanently removes the time. The sync watermark (`steam_synced_minutes`) is independent of local sessions, so discarded time is **never re-added** on the next sync. However, if Steam still reports that date as last-played, a 0-minute marker session may reappear on the next sync (without hours).
  - Regular (non-Steam) sessions use a simple Delete confirmation.

## Calendar ✅

- Month grid; day cells heat-map intensity scales with session minutes. Today's cell has an accent border; the selected day has a subtle border.
- **Scope control:** tapping the month label scopes the summary to the month; tapping the year label scopes to the full year; tapping a day cell scopes to that day.
- **Jump to Today button** — resets the calendar to the current month/year and selects today's play-day (respecting the pre-5am roll-over).
- Left/right arrows navigate months (or years when year-scoped).
- **Period play-time card** — header shows the label and total minutes for the *currently displayed period* (day / month / year), not the last-tapped day. Day scope lists individual sessions with notes; month/year scope shows per-game aggregated totals sorted by playtime, each row tappable to the game's detail screen.
- **Summary card** — lists games started and completed within the period. Games that were *both started and completed* in the same period are highlighted in **gold** in both the Started and Completed lists, making it immediately clear which games were fully wrapped up within the window. A legend line appears when any such games exist.
- Navigation from day scope (← / →) returns to month scope.

---

## Stats ✅

- Playtime totals: week / month / year / all-time.
- Rankings: by playtime and session count (same time filters).
- Genre distribution (bar rows by playtime).
- **Longest to complete**: calendar days from `start_date` to `completed_at`.
- **Wrap it up** tab: unfinished games ranked by progress % descending.
- **All-Time Favourites**: rated games, best first (rating, then playtime).
- **Favourites by Year**: top-rated games per year (completed year, falling back to last played / started).

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
3. **Fuzzy / IGDB canonical** ✅ — conservative fuzzy match on normalized titles (`logic/fuzzy.ts`): subtitle-drop ("witcher 3" ⊆ "witcher 3 wild hunt") + typo tolerance (length-scaled Levenshtein). Numeric tokens must match exactly (RE2 ≠ RE3), expansion markers (episode/chapter/part/…) never merge. Manual adds warn on similar titles; IGDB picks are linked via `game_external_ids(source='igdb')` and dedup on the canonical IGDB id.

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
- Never-played games (total playtime at or below the played threshold, default 29 min) get `status:unplayed` tag.
- Idempotent: re-run picks up new purchases, skips everything already linked.
- Optional **Re-sync playtime** checkbox (Settings, beside the import button): when checked, already-linked games are refreshed instead of skipped — new playtime since the last sync is attributed to a dated session (see "delta attribution" below), the queue shows the delta (e.g. `+3h`), and `last_played_override` is bumped if Steam reports a more recent session. Manually logged sessions are untouched. Unchecked (default) keeps the skip-only behaviour above.
- **Per-game sync:** a Steam-linked game's detail screen shows a **"Sync playtime from Steam"** button (only when the game has a linked appid). It fetches the library, refreshes just that game (same logic as bulk re-sync), and reports the delta (or "already up to date"). If Steam credentials aren't set it offers to open Settings.
- **Unknown-baseline sentinel (v7):** games merged from Steam into entries that already had tracked time never got a playtime lump (anti-double-count policy), so their true Steam total is unknown — migration v7 marks them `steam_synced_minutes = -1`. On their first re-sync the current Steam total is recorded as the baseline **without attributing anything** (result: "baseline set"); only playtime accrued after that becomes dated sessions. The pre-v6 backup-restore re-seed applies the same rule (and only runs for exports with `schema_version < 6`).
- **Playtime watermark + delta attribution:** `imported_minutes` is the *original* Steam lump captured at first import (undated, since Steam exposes no per-day history), frozen thereafter. A separate `steam_synced_minutes` column (migration v6, seeded from `imported_minutes` for existing Steam games) records the last total seen from Steam. On re-sync, `delta = playtime_forever − steam_synced_minutes`; a **positive delta with a known last-played date is logged as a real dated session on that day** (accumulating, note "Last played on Steam"), then the watermark advances. This means playing a game and then syncing shows the new hours on the calendar/stats for that day. Deltas with no reported date (or negative corrections) fold into `imported_minutes` instead. Because the delta is measured against the watermark, new time is counted exactly once and repeated same-day syncs stay correct.
- **Manual correction of Steam-attributed sessions:** if a sync attributes a large playtime dump to a single date (e.g. 19h logged because the game was idle or multiple sessions accrued between syncs), users can open the game's Sessions tab and edit or delete the offending entry. The watermark is unaffected, so the corrected time is never re-added. See "Per-game session calendar" above for the Keep time / Discard time prompt.
- **"Last played" marker sessions:** when there's no new playtime to log (delta ≤ 0) but Steam still reports a `rtime_last_played`, a **0-minute marker session** is stamped on that date (`INSERT OR IGNORE` on `UNIQUE(game_id, date)`) so the game still surfaces on its last-played day without adding playtime or clobbering a real logged session. Never-launched games (`rtime_last_played = 0`) get no marker.

### IGDB metadata sync ✅

Bulk-added games (CSV import, Steam import, title-only manual adds) have no
cover art, genre tags, or release year. **Settings → Sync art & tags from
IGDB** fills in whatever is missing, queued on the same non-blocking Import
tab.

- **Candidates:** games not yet linked to an IGDB id (`game_external_ids
  source='igdb'`) AND missing at least one of cover / release year / genre
  tags. Games picked via the IGDB search on Add are already linked and
  skipped. Re-running is safe — every synced game gets linked, so nothing is
  looked up twice.
- **Matching:** exact normalized-title match preferred among IGDB search
  results; otherwise the top result is used and flagged `≈` in the log so
  mismatches are easy to spot.
- **Fills only what's missing:** existing cover (e.g. Steam capsule art),
  release year, and platform tags are never overwritten. `genre:` tags added
  if none exist; `platform:` tags added only if none exist (so a Steam import
  keeps just `platform:steam` rather than gaining every platform the game
  ever shipped on).
- **Rate-limited** to stay under IGDB's 4 req/s free-tier cap; aborts after 3
  consecutive lookup failures (e.g. bad credentials) instead of grinding
  through the whole library.
- Queue statuses: 🔗 merged (metadata applied, e.g. `+cover +5 tags`), ⏭
  duplicate (nothing was missing), ⚠ invalid (no IGDB match / lookup failed).

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
| Played threshold | 29 min | Total minutes must exceed this to count as "played"; also drives `status:unplayed` on Steam import |
| Genre blocker threshold | 1 | |
| IGDB Client ID + Secret | — | Verified against Twitch OAuth on save |
| Steam Web API key + SteamID64 | — | Saved before import attempt |
| Steam "Re-sync playtime" | Off | Per-import checkbox, not persisted |

---

## Storage ✅

- SQLite via `expo-sqlite` (sync API), file: `backlog.db` in app documents directory.
- Survives OTA updates, EAS binary updates, and TestFlight re-installs.
- Lost only on full uninstall or manual "Clear Data".
- Schema versioned: `schema_version` table + append-only `MIGRATIONS` array.

---

## Device calendar overlay ✅

Overlays events from calendars already synced on the device (Google, Apple,
Outlook, …) on the play calendar to give context for gaps in activity
(travel, busy weeks). Implemented in `src/services/deviceCalendar.ts` via
`expo-calendar` — no API keys or OAuth, just a permission prompt.

- **Settings → Device calendars:** "Choose calendars…" requests read
  permission and lists all device calendars with checkboxes (colour dot +
  account source shown). Selection is stored as a JSON list of calendar IDs
  (`device_calendar_ids` setting); empty = overlay off. "Unlink all" clears it.
- **Calendar screen:** session-free days show a faded, truncated label of the
  first event that day in the month grid; day scope lists all events for the
  selected day (📅, italic, timed events marked). All-day events sort first —
  they're the useful context (trips, holidays).
- **Lightweight:** read-only, fetched on-demand per visible month; events are
  never stored. Fails soft (empty overlay) when unlinked, permission revoked,
  or the fetch errors. All-day events are re-anchored from UTC midnight to
  local dates to avoid off-by-one-day shifts; multi-day events appear on every
  day they span.
- Streaks are **not** adjusted — a vacation breaking a streak is honest
  signal, not noise.
- The per-game session calendar (`MonthGrid` is shared) does **not** show the
  overlay; it's global-calendar-only.

## AI recap — “Where was I?” ✅

On-demand LLM recap for **walkthrough-tracked games**: summarizes what the
player just did and where they are, so they can resume after a break.

- **Scope:** walkthrough progress method only, with walkthrough text pasted and
  a position marked. Button lives on the Walkthrough tab (`🧭 Where was I?`).
  Dropped the LLM “What's next?” hint — the walkthrough *is* what's next; the
  player just reads ahead.
- **Grounding:** we send **only the walkthrough excerpt up to the marked
  position** (never the whole guide, never anything ahead — no spoilers, low
  hallucination). System prompt forbids inventing facts or revealing what
  follows.
- **Provider:** OpenAI-compatible endpoint configured in Settings → AI recap
  (token + base URL + model). Defaults to **GitHub Models** (`gpt-4.1`, free,
  rate-limited) via a fine-grained PAT with Account permission *Models:
  read-only*. Swapping to OpenRouter / a paid gateway / local Ollama is
  config-only, no code change. A “Save & test model” button does a PONG probe.
- **Token limit:** GitHub Models caps a request at **8000 input tokens** for
  gpt-4.1 (measured). We budget ~6000 and window the excerpt to
  `CONTEXT_CHAR_BUDGET` (tail-of-excerpt, snapped to a paragraph boundary).
- **Caching:** recap stored on the game row (`recap_text` + `recap_key`, schema
  v3). Key = position + walkthrough length + content hash, so reopening the
  game is free and the recap silently regenerates when position/text change.
  Manual **Regenerate** button in the recap modal.

## Phase 2 (not yet started)

- 🔲 GameFAQs guide list fetching (web scraping, ToS risk)
- 🔲 HowLongToBeat time-based progress fallback
- 🔲 Visualizations: "The Juggler" animated screensaver + "The Weightlifter"
- 🔲 Calendar heatmap (GitHub-style year view) + cover art thumbnails per day
- 🔲 GOG import (unofficial API or paste-library fallback)
- 🔲 Nintendo eShop (paste purchase history — no official API exists)
- 🔲 Weekly digest summary card
- 🔲 Launch game from local path (Android)
- 🔲 Game recommender integration
- 🔲 Pie chart genre distribution
- 🔲 On My Mind history view
