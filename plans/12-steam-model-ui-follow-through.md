# 12 — Steam time model: UI follow-through

| Severity | Effort | Wave | Files |
|----------|--------|------|-------|
| medium (dead dialogs that now give wrong advice; totals unexplained) | S | 3, last in the 05 → 06 → 07 → 12 chain | `app/src/components/SessionLogModal.tsx`, `app/src/screens/GameDetailScreen.tsx` |

Depends on plan 01 (Option A): Steam sync no longer writes minutes into `sessions`, and
`GameWithMeta` carries `steamMinutes` and `loggedMinutes`.

## Problems

1. `SessionLogModal.save` (`components/SessionLogModal.tsx:68-98`) still offers "Keep time /
   Discard time" when shrinking a session whose note contains the Steam marker, moving minutes into
   `imported_minutes`. Under the new model that is wrong advice: totals come from Steam's number.
2. `SessionsTab.confirmDelete` (`screens/GameDetailScreen.tsx:731-767`) has the same dialog for
   deletion, and the tab takes an `importedMinutes` prop only for it.
3. The detail header shows one playtime number with no hint that it is `max(Steam, own records)`.
4. The Edit modal's "Base playtime (outside logged sessions)" label no longer says how it relates to
   Steam time.

## Fix

1. `save`: delete the Steam branch; `finish()` runs directly (the completion-prompt ordering from
   plan 02 stays as it is after that plan).
2. `confirmDelete`: keep only the plain "Delete session?" dialog; remove the `importedMinutes` prop
   and its pass-through; drop now-unused imports (`STEAM_MARKER_NOTE`, `updateGame` if unused).
3. Header: under "Playtime: …" add a muted second line when `game.steamMinutes != null`:
   `Steam <fmt> · logged <fmt> · base <fmt>` (omit "base" when 0). When `steamMinutes` is null,
   show nothing extra.
4. Edit modal label: "Base playtime (undated own time, outside logged sessions — Steam time is
   tracked separately)".

## Acceptance criteria

- `npx tsc --noEmit` passes; `grep -rn "Keep time" app/src` matches nothing.
- Shrinking or deleting a session whose note says "Last played on Steam" shows only the plain
  dialogs.
- A Steam-linked game's header shows the breakdown line; a non-Steam game's header is unchanged.
