# 08 — Import pipeline: BOM tolerance + fuzzy-match cache

| Severity | Effort | Wave | Files |
|----------|--------|------|-------|
| low (one real-world CSV failure; import CPU time) | S | 1 | `app/src/services/csvImport.ts`, `app/src/logic/fuzzy.ts` |

## Problems

1. **UTF-8 BOM breaks CSV import.** `startCsvImport` (`services/csvImport.ts:156-161`) finds
   columns with `header.indexOf(name)`. Excel and Numbers write a BOM, which makes the first header
   cell `"﻿title"`, so the import fails with `CSV header must contain a "title" column`. The two
   sample files in `sources/` have no BOM, which is why this hasn't been seen.
2. **Fuzzy matching re-tokenises the library for every row.** `findFuzzyMatch`
   (`logic/fuzzy.ts:111-138`) does `candNorm.split(" ")` plus `numberSignature` (a regex per
   token) for every candidate on every call. A 1 000-game library × 1 000-row Steam import is about
   a million split-and-regex passes before any Levenshtein work, all on the JS thread between the
   import queue's UI yields.

## Fix

1. At the top of `startCsvImport` (before `parseCsv`):
   `if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);` with a one-line comment.
2. Cache candidate tokenisation per `byNorm` Map **without changing the exported API** — the callers
   (`services/steam.ts:102`, `services/csvImport.ts:95`, `db/repo.ts:174`) pass a
   `Map<string, number>` and the importers mutate it with `set` while running:
   - Module-level `WeakMap<Map<string, number>, { seen: number; entries: Entry[] }>` where
     `Entry = { norm: string; id: number; tokens: string[]; sig: string }`.
   - On each call: get or create the cache for that Map. If `byNorm.size < cache.seen` (a deletion;
     no current caller does this) rebuild from scratch. If `byNorm.size > cache.seen`, iterate the
     Map and append the entries at index ≥ `cache.seen` (Map iteration is insertion-ordered), then
     set `seen = byNorm.size`.
   - The match loop iterates `cache.entries`. Result semantics must not change: first subtitle-drop
     hit returns immediately; otherwise the smallest Levenshtein distance within budget wins; ties
     keep the earlier entry.
   - Comment the assumption that callers only ever add new keys (never re-`set` an existing key to a
     different id). `findSimilarGame` builds a fresh Map per call, so it neither benefits nor
     regresses.

## Acceptance criteria

- `npx tsc --noEmit` passes.
- A CSV whose first three bytes are `EF BB BF` imports normally (the agent can create one with
  `printf '\xef\xbb\xbftitle,status\nHalo,backlog\n' > /tmp/bom.csv` and hand-trace
  `startCsvImport` on it; the user can import it on device).
- Fuzzy results unchanged for the documented cases: `witcher 3` ↔ `witcher 3 wild hunt` match;
  `half life 2` vs `half life 2 episode one` do **not** match; `fifa 12` vs `fifa 21` do **not**
  match; `hollow knight silk song` ↔ `hollow knight silksong` match.
- A Steam import on a library of several hundred games shows no visible slowdown per chunk.
