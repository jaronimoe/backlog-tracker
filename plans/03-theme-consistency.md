# 03 — Theme consistency

| Severity | Effort | Wave | Files |
|----------|--------|------|-------|
| medium (wrong palette after every theme switch; unreadable text on Beige) | M | 2, before 02 | `app/src/theme.ts`, `components/ui.tsx`, `components/SessionLogModal.tsx`, `screens/ImportScreen.tsx`, `components/MonthGrid.tsx`, `screens/GamesScreen.tsx`, `screens/GameDetailScreen.tsx`, `components/SwipeableRow.tsx`, `screens/SettingsScreen.tsx` |

## Problems

1. **Frozen colours.** `m` in `components/SessionLogModal.tsx:210-268` is a plain object evaluated
   at import time, so `C.bgSecondary`, `C.textPrimary`, … are copied once. It styles the session
   modal and, through `import { m }`, the Edit, Change-cover and Where-was-I modals in
   `screens/GameDetailScreen.tsx` (lines 1087, 1194, 1285). After a theme switch those modals keep
   the previous palette until restart. `STATUS_COLOR` in `screens/ImportScreen.tsx:19` has the same
   defect. Every other file already uses `themedStyles()` (`theme.ts:238`).
2. **White text on card backgrounds.** `components/ui.tsx:421` `btnText` is shared by primary
   (accent background) and secondary (`bgCard` background) buttons; `SessionLogModal.tsx:247`
   `timeBtnText` is white on the `bgCard` "−" stepper. Beige `bgCard` is `#d8cfc0`, so these are
   white-on-beige. Other `"#fff"` uses sit on accent backgrounds and are readable but should use a
   token: `GamesScreen.tsx:260`, `:447`; `GameDetailScreen.tsx:386`, `:799`; `SwipeableRow.tsx:81`.
3. **Hard-coded palette colours.** `components/MonthGrid.tsx:64` heat shading is
   `rgba(78,204,163,…)` (Dark's `progressFill`) on every theme; `GamesScreen.tsx:500` dropZone tint
   is `rgba(233,69,96,0.03)` (Dark's accent).
4. **Customize colours reset.** `ColorRow` (`SettingsScreen.tsx:521`) keeps its local `text` after
   "Reset to theme defaults": the input shows the stale override while the swatch shows the default.
5. **Same file, unrelated:** `Cover` (`ui.tsx:114`) latches `failed` forever; once a cover URL 404s,
   fixing the URL still shows initials until the row remounts.

## Fix

1. Wrap `m` in `themedStyles(() => ({ … }))`. The Proxy resolves `m.modal` lazily, and array styles
   like `[m.modal, { maxHeight: "88%" }]` keep working. Replace `STATUS_COLOR` with a function
   `statusColor(status: QueueItem["status"]): string` that reads `C` when called.
2. Add `textOnAccent: string` to `ThemeColors` and to all three entries of `THEMES`
   (`"#ffffff"` for each; Beige accent `#a5673f` keeps ≥ 4.5:1 with white). It shows up in
   `THEME_COLOR_KEYS` and the customise list automatically; existing overrides are unaffected.
   In `ui.tsx` split `btnText` into `btnTextPrimary` (`C.textOnAccent`) and `btnTextSecondary`
   (`C.textPrimary`); `Btn` picks by `kind`. `timeBtnText`: `C.textPrimary` for the "−" button,
   `C.textOnAccent` for the "+" button (it has an inline accent background). Replace every listed
   `"#fff"` with `C.textOnAccent`.
3. Add `withAlpha(hex: string, alpha: number): string` to `theme.ts`, accepting `#rgb`, `#rgba`,
   `#rrggbb`, `#rrggbbaa` (the forms `HEX_RE` in Settings allows for overrides) and returning
   `rgba(r,g,b,alpha)`; on an unparsable input return the input unchanged. MonthGrid:
   `withAlpha(C.progressFill, intensity)`. GamesScreen dropZone: `withAlpha(C.accent, 0.03)`.
4. `ColorRow`: `useEffect(() => setText(value), [value])`.
5. `Cover`: `useEffect(() => setFailed(false), [game.cover_url])`.

Out of scope: debouncing the per-keystroke SQLite write in `setColorOverride` (correct, just chatty).

## Acceptance criteria

- `npx tsc --noEmit` passes.
- `grep -rn '"#fff"' app/src` → no matches. `grep -rn "rgba(" app/src` → only the
  `rgba(0,0,0,0.7)` overlays and the `rgba(128,128,128,0.4)` swatch border in Settings.
- Switching Dark → Beige → Retro at runtime updates immediately: session modal, ✎ Edit modal,
  Change-cover modal, Where-was-I modal, Import tab status icons, calendar heat-map, Played Today
  box tint.
- On Beige: secondary buttons and the "−" stepper are readable.
- Customize colours → change a colour → Reset to theme defaults → the input shows the default hex.

## Manual test

Settings → Appearance: pick Beige; open a game → 🎮 Played Today → the modal is beige; Cancel;
✎ Edit → beige; Cancel. Calendar tab → heat cells are the Beige green. Back to Dark → all revert.

## Conflicts

Touches most screens. Run first in wave 2; plan 02 rebases onto it and reuses the themed modal look.
