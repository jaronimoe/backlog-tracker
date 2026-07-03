## 2. Game Backlog Tracker & Play Diary

**Problem:** Existing backlog trackers are either too simple (just a list) or too bloated with social/achievement features. None of them let you track *where you are in a game* using actual walkthroughs, or help you pick up a game after months away with a "story so far" recap. I want a tool that mirrors how I actually play: juggling multiple games, needing to remember where I left off, and wanting a lightweight daily log of what I played.

**Core concept:** A personal gaming diary that combines backlog management, daily play logging, walkthrough-based progress tracking, and LLM-generated recaps.

**Relationship to Game Recommender:** Could integrate with the recommender (shared game library, metadata, embeddings) or stand alone. The recommender answers "what should I play next?"; this app answers "where am I in what I'm already playing?" Decision on integration vs. standalone TBD.

---

### Game States

| State | Meaning |
|-------|---------|
| **Current** | Actively playing right now |
| **On Hold** | Intentionally set aside (requires a note: why?) |
| **Backlog (started)** | Started but haven't gotten back to it |
| **Backlog (not started)** | Own it, haven't touched it |
| **Completed** | Finished (however the user defines "finished") |

---

### Workflow

#### 1. Initial Import / Adding a Game

**Single-add mode:**

1. Tap "Add Game" → search by title
2. App pulls metadata automatically:
   - Cover art
   - Platform, genre, release year
   - Tags (from metadata — genre, themes, etc.)
3. App pulls available walkthroughs from **GameFAQs**:
   - Fetches the list of all walkthroughs/guides for that game
   - Walkthroughs are *not* downloaded upfront — listed and downloaded on-click
4. Option to import a custom walkthrough/guide:
   - Paste a URL (app scrapes/stores it)
   - Upload a text document
5. User can:
   - Add **custom tags** (like the platform)
   - Set **time already spent** (for games already in progress)
   - Set **start date** (exact day, or just month, or just year)
   - Set initial **state** (current, backlog-started, etc.)
   - Set **local path** (NEW) for the android version, we should investigate how to launch a game from within the app if it is installed on that device.
   - Set **progress metrics** (NEW) either progress-position in walkthrough OR custom/generic progress metric (i.e.: the game is partitioned into 10 parts (could be achievements or other things to count) and I did 4 of them so far)
6. all these things can also be edited later when opening the game card. the minimum requirement for adding a game is providing its name.

**Bulk-add mode:** (FLESH) paste a list of games, optionally with state, time spent, tags, import from CSV

---

#### 2. Daily Usage — The "Today" View

**Primary interface for daily use.** Answers: "What did I play today? What am I playing lately?"

**Layout:**

```
┌─────────────────────────────────────────┐
│  TODAY — June 10, 2026                  │
│                                         │
│  ┌─ Played Today ─────────────────────┐ │
│  │  (empty — drag games here)         │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ▼ Recently Played (last 2 weeks)       │
│    • Elden Ring          ███████░░ 72%  │
│    • Balatro             ██░░░░░░░ 20%  │
│    • Hollow Knight       █████░░░░ 55%  │
│                                         │
│  ▶ Current              (collapsed)     │
│  ▶ Backlog (started)    (collapsed)     │
│  ▶ Backlog              (collapsed)     │
│  ▶ Completed            (collapsed)     │
└─────────────────────────────────────────┘
```

**Behavior:**

- **Recently Played** is auto-populated: games played within the last 2 weeks, ordered most-recent-first (time frame can be changed in settings)
  - Games here can be from *any* state (current, backlog-started, even completed if revisited)
- All other lists are **collapsed by default**, expandable on tap
- **Drag a game** from any list into the "Played Today" section to log a session
- **"Played Today" button** — each game card (in library or game detail) has a quick-action button to add it to today's view without dragging
- Tapping a game in "Played Today" opens a quick-log:
  - Time spent today — via **+/- 15 minute buttons** (primary input method; tap + to add 15m, tap - to remove 15m)
  - Optional: update progress position
  - Optional: short note / diary entry
- **Filter bar** — filter games by genre/tag chips at the top of the Today view (also available in Library view)
- **Per-game streaks** — show "🔥 7 days" next to a game if you've played *that specific game* on consecutive days

**Quick-resume shortcut:**

- A "📖 Resume" button on recently played games that opens the walkthrough at your saved position directly (one tap to get back in)

**Calendar view:** A separate calendar view shows play history over time — which games were played on which days, time totals per day/week/month.

**Calendar grid enhancements:**

- Each day cell shows the **cover art thumbnail** of the most-played game that day
- **Total time** in small text below the date number
- **Color intensity** based on playtime (darker = more hours, like GitHub's contribution graph)
- **Heatmap mode** — toggle to a year-at-a-glance GitHub-style heatmap (52 weeks × 7 days)

---

#### 3. Game Progress Tracking

**Primary method: Walkthrough-based position tracking**

1. Designate one walkthrough as the "progress tracker" for a game
2. The walkthrough is displayed in-app (scrollable text)
3. User taps/marks their current position in the walkthrough ("I stopped here")
4. Position is translated into a **progress bar** (position in walkthrough ÷ total walkthrough length)

**Fallback method: Time-based (HowLongToBeat)**

- Pull estimated completion time from HowLongToBeat
- Compare against user's actual logged playtime
- Progress = actual time ÷ estimated time (capped at 100%)
- Less precise but works for any game without a walkthrough

**Custom progress:** For games where neither method fits well (sandbox games, multiplayer, etc.), allow manual percentage or custom milestones.

**State transitions:**

- When marking a game **"Completed"** → prompt for a quick rating or final note ("How'd you like it? Any final thoughts?")
- When a backlog game is played for the **first time** → auto-suggest changing state to "Current"
- When moving to **"On Hold"** → require a note explaining why ("burned out", "waiting for patch", etc.)

**Game notes:**

- Attach freeform notes to any game (not tied to a session)
- Primary use case: documenting *why* you stopped playing ("got stuck on boss", "burned out", "waiting for DLC")
- Also useful for general insights, tips-to-self, or reminders
- Visible on the game detail view

**Progress bar is visible:**

- In the Today view (next to each game)
- In the calendar view (per-game)
- In the game detail view

---

#### 4. Story Recap — "Where Was I?"

**Problem:** You haven't played a game in 3 months. You load it up and have no idea what's happening, who the NPCs are, or what you were doing.

**Solution:** Since the app knows your position in the walkthrough, it can generate a recap.

**How it works:**

1. Take walkthrough text from start → user's saved position
2. Feed to LLM with prompt: "Summarize the story/progress so far in 2-3 paragraphs. Be concise and spoiler-free for content beyond this point."
3. Display as a **"Story So Far"** panel

**Additionally — "What's Next?" panel:**

- Extract the next objective/goal from the walkthrough (just past the saved position)
- Display as a collapsible hint: "Next: Head to the Cathedral of the Deep and defeat the Deacons"
- Hidden by default — tap to reveal (avoids unwanted spoilers)

**LLM options:**

- Same local LLM stack as the game recommender (Ollama + Llama 3.2 3B / Phi-4-mini)
- On iOS: on-device via MLX Swift
- Fallback: no recap, just show the walkthrough at saved position

---

### Data Model (Conceptual)

```
Game
  ├── title, cover_art, platform, release_year
  ├── state: current | backlog_started | backlog | completed
  ├── tags: [genre tags from metadata + custom tags]
  ├── start_date (precision: day | month | year)
  ├── total_playtime
  ├── walkthroughs: [
  │     { source: "gamefaqs" | "url" | "uploaded", title, content/url }
  │   ]
  ├── progress_tracker:
  │     { walkthrough_id, position, percentage }
  │     OR { method: "hltb", estimated_time, actual_time }
  │     OR { method: "manual", percentage }
  └── sessions: [
        { date, duration, notes?, progress_update? }
      ]
```

---

### Key Data Sources

| Source | Provides | Access |
|--------|----------|--------|
| **GameFAQs** | Walkthroughs, guides | Web scraping (no official API) |
| **IGDB** | Metadata, cover art, genres, themes | Free API (Twitch dev account) |
| **HowLongToBeat** | Estimated completion times | Web scraping or [howlongtobeat npm](https://www.npmjs.com/package/howlongtobeat) |
| **User input** | Play sessions, progress position, custom tags, notes | Manual |
| **Local LLM** | Story recaps, next-goal extraction | Ollama / MLX Swift |

---

### Stats Page

**Playtime stats:**

- Total playtime per **calendar week**
- Total playtime per **month**
- Total playtime per **year**
- Total playtime **all-time**

**Game rankings:**

- Ranked by **total playtime** (filterable: this week / this month / this year / all-time)
- Ranked by **times played** (number of sessions, same filters: week / month / year / all-time)

**Genre distribution:**

- Genre ranking per week / month / year / all-time (based on playtime per genre)
- 🔮 *Future/backlog:* Pie chart visualization for genre distribution (not essential for v1)

**Weekly digest:**

- Summary card that appears at the start of the week: "Last week: 12h across 4 games. Most played: Elden Ring (6h). You're 72% through it."
- Completion milestones, streak highlights

---

---

### Typed Tags

Tags support an optional `type:value` namespace prefix. Examples: `platform:ps3`, `genre:jrpg`.

**Display:** only the value portion renders in the UI ("ps3", "jrpg"). The prefix is used purely for classification and styling.

**Rendering rules:**

- Typed tags render **before** plain custom tags in all tag lists
- Each tag type has an assigned color, distinct from the plain tag style
- Multiple typed tags of the same type cluster together visually

**Built-in tag types (v1):**

| Type | Example | Notes |
|------|---------|-------|
| `platform` | `platform:ps3`, `platform:pc` | Auto-populated from IGDB metadata on game import |
| `genre` | `genre:jrpg`, `genre:metroidvania` | Auto-populated from IGDB metadata; also used for genre blocking |

User-defined additional types are out of scope for v1.

**Auto-population:** when a game is imported via IGDB, the platform and genre fields from the API response are automatically converted into typed tags (e.g. IGDB genre "Role-playing (RPG)" → `genre:rpg`). User can edit or remove them.

---

### Genre Blocking

An advisory check triggered when the user moves a backlog game into an active state (Current or Backlog Started).

**How it works:**

1. User initiates a state change: backlog → current (or backlog started)
2. App reads the game's `genre:*` typed tags
3. App counts how many games currently in an active state (Current + Backlog Started) share at least one of those genre tags
4. If the count meets the configured threshold: show a **non-blocking warning panel** before confirming the state change

**Warning panel:**

```
⚠️  You're about to start a new JRPG.
    You already have 3 JRPGs in progress:

    • Persona 5 Royal        ████░░░░ 18%  last played: 2 months ago
    • Nier: Automata         █░░░░░░░  8%  last played: 1 year ago
    • Baldur's Gate 3        ██████░░ 65%  last played: 5 days ago

    [Start anyway]   [Cancel]
```

- User can always proceed — it's advisory, never a hard block
- The warning shows all matching active games with cover, progress %, and last-played date
- Configurable threshold: warn if ≥ N games of the genre are already active (default: 1 — always warn)

---

### Screensaver / Visualizations

An animated visualization layer, accessible two ways:

- **Auto-trigger:** activates after a configurable idle period (default: 60 seconds of no interaction)
- **Manual:** via a dedicated **Visuals** tab in the main nav

Any key press or tap exits the screensaver.

**Visual style:** neon pixel art on a dark grey background. All visualizations share this aesthetic.

---

#### Visualization A — "The Juggler"

A pixel-art character juggles the games you've been playing during the current active window.

**Active window:** user-configurable timeframe — 1 week, 2 weeks, 3 weeks, or 1 month. Games played at least once within this window are "in the air". This is the same window used by the Recently Played list.

**Character stress scale based on juggled game count:**

| Games in window | Character state |
|-----------------|----------------|
| 1–2 | Calm, smooth juggling |
| 3–4 | Slight sweat, wobbling |
| 5–6 | Visibly struggling, erratic arcs |
| 7+ | Chaos — dropping things, exaggerated panic animation |

**The Pile:** to one side / in the background sits a heap of games that were started but haven't been played within the active window. These render as dim, dusty pixel-art covers piled up — a visual contrast to the active juggling. The pile grows taller with more abandoned games.

*More visualization ideas TBD.*

---

### Open Questions

- **App name?**
- **Tech stack** — same Python/FastAPI + web UI as recommender? Or native-first (SwiftUI for iOS)?
- **Bulk import** — what formats? Paste a list? Sync from recommender's Steam library?
- **Stats & insights** — what stats to derive? (games per month, time per genre, completion rate, streaks, etc.)
- **GameFAQs scraping** — legal/ToS concerns? Caching strategy?
- **Integration with game recommender** — shared DB? Recommender suggests from backlog? "You haven't played X in 3 months, pick it up again"?
- **Social features** — share progress with friends? Compare backlogs?
- **Platforms** — web first? iOS first? Both?
