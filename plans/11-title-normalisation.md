# 11 — Title normalisation (decided)

| Severity | Effort | Wave | Files |
|----------|--------|------|-------|
| low (dedup misses / over-merges on specific titles) | S | 1 | `app/src/logic/normalize.ts`, `app/AGENTS.md`, root `README.md` (Steam merge policy sentence) |

Two independent changes, both decided by the user on 2026-09-16.

## A. Diacritics — **decided: yes, fold them**

`normalizeTitle` (`logic/normalize.ts:38`) replaces every character outside `[a-z0-9]` with a
space, so "Pokémon" → `pok mon` while a CSV "Pokemon" → `pokemon`. The exact tier misses; the fuzzy
tier rescues it only because a 7-character title gets a Levenshtein budget of 1. "Ōkami" → `kami`.

**Proposed:** fold diacritics before lower-casing:
`raw.normalize("NFD").replace(/[̀-ͯ]/g, "")`. Hermes ships `String.prototype.normalize`;
the agent should verify on device (log `"é".normalize("NFD").length === 2`) and, if it is missing,
fall back to a small replacement map (`àáâãäå→a ç→c èéêë→e ìíîï→i ñ→n òóôõöø→o ùúûü→u ýÿ→y ß→ss
œ→oe æ→ae ō→o`). No migration: normalised titles are never stored; every importer rebuilds its
lookup Map from raw titles.

## B. Edition suffixes — **decided: re-releases are separate games**

User decision (2026-09-16): hours put into an HD/remastered edition and into the original are
tracked separately and must not be summed, so those titles must not merge.

Today `EDITION_SUFFIX` (`normalize.ts:25`) strips every trailing marker, so "Ōkami HD" → `okami`
and merges into "Okami", and "Mafia: Definitive Edition" (a full remake) merges into "Mafia".

**New rule — two groups:**

| Group | Markers | Handling |
|-------|---------|----------|
| Bundle / SKU tier — same build, extra content or price tier | `game of the year`, `goty`, `complete`, `deluxe`, `ultimate`, `premium`, `gold`, `legacy`, `collector's`, `standard` | stripped. `game of the year` and `goty` may be bare; every other marker is stripped only when followed by `edition` (so "Pokémon Gold" and "Halo: Combat Evolved" keep their words) |
| Re-release — a different build the user may play again | `remastered`, `remaster`, `remake`, `hd`, `definitive`, `enhanced`, `anniversary`, `director's cut` | **never stripped** |

**`special edition` — decided: re-release group, never stripped** ("Skyrim Special Edition" is a
remaster; erring on the side of not merging).

Consequences to accept:
- Steam libraries that hold both an original and its remaster get two library entries with their
  own playtime (this is the requested behaviour). Games that were already merged by the old rule
  stay merged; nothing is re-split.
- Root `README.md` "Merge policy" and `app/AGENTS.md` "Gotchas" must describe the new rule.

## Acceptance criteria

- `npx tsc --noEmit` passes.
- The final rule is documented in the `normalize.ts` header comment, `app/AGENTS.md` "Gotchas" and
  the root README merge-policy paragraph.
- Hand-checked examples in the commit message:
  "The Witcher® 3: Wild Hunt – Game of the Year Edition" → `witcher 3 wild hunt`;
  "Ōkami HD" → `okami hd`; "Mafia: Definitive Edition" → `mafia definitive edition`;
  "The Elder Scrolls V: Skyrim Special Edition" → `elder scrolls 5 skyrim special edition`;
  "Pokémon Gold" → `pokemon gold`; "Borderlands 2 Game of the Year" → `borderlands 2`;
  "Dishonored Definitive Edition" → `dishonored definitive edition`;
  "Command & Conquer™ Red Alert™ 3" → `command and conquer red alert 3`;
  "Final Fantasy VII" → `final fantasy 7`.
