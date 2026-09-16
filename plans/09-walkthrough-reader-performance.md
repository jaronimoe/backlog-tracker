# 09 — Walkthrough reader performance

| Severity | Effort | Wave | Files |
|----------|--------|------|-------|
| medium (large guides make the detail screen lag on every state change) | M | 1 | `app/src/screens/GameDetailScreen.tsx` → new `app/src/components/WalkthroughReader.tsx` |

## Problem

`WalkthroughReader` (`screens/GameDetailScreen.tsx:1318-1379`) re-splits the entire walkthrough
into paragraphs on **every** render of the detail screen (any state change: switching tabs, typing
a tag, opening a modal) and mounts one `Pressable` + `Text` per paragraph inside the screen's
`ScrollView`. Guides pasted through the clipboard button are tens of thousands of characters (the
comment at line 521 says so), i.e. hundreds to thousands of paragraphs mounted at once. A nested
`FlatList` would not help: same scroll axis as the parent `ScrollView`, so it doesn't virtualise.

## Fix

1. Move the component to `components/WalkthroughReader.tsx` with the same props
   (`text`, `position`, `onMark`, `onEdit`); import it in the screen. This also shrinks the
   1 400-line screen file that most other plans edit.
2. `useMemo` the paragraph split on `[text]`.
3. **Windowed rendering** instead of virtualisation: state `{ start, end }` over paragraph indices,
   initially `WINDOW = 40` paragraphs centred on the marked paragraph (or from the top when
   `position === 0`). Render a "Show 40 earlier" button above the window when `start > 0` and
   "Show 40 later" below when `end < paragraphs.length`, plus a "Jump to marker" link whenever the
   marker paragraph is outside the window. Reset the window when `text` changes; when `position`
   changes to a paragraph outside the window, re-centre on it.
4. Wrap the paragraph row in `React.memo`; pass primitives (`body`, `done`, `isMark`, `index`) and a
   stable `onPress(index)` so untouched rows don't re-render when the marker moves.
5. Keep `onMark(p.end)` semantics, the "done"/"marker" visuals and the "Edit text" link exactly as
   they are.

## Acceptance criteria

- `npx tsc --noEmit` passes.
- With a ~200 KB text of ~4 000 short paragraphs pasted in (the agent should describe how to
  generate one; the user pastes it on device): the Walkthrough tab opens without a stall, tapping a
  paragraph marks it immediately, and switching to the Progress tab and back is instant.
- Marker position, progress percentage and the "Where was I?" recap (`services/llm.ts`, which reads
  `walkthrough_position` and the text, not the reader) are unchanged.
- Short guides (< 40 paragraphs) render exactly as before, with no window buttons.
