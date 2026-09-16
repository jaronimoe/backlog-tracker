# 02 — Cross-platform text prompt (replace `Alert.prompt`)

| Severity | Effort | Wave | Files |
|----------|--------|------|-------|
| high (feature silently dead on Android; double dialog on iOS) | M | 2, after 03 | new `app/src/components/PromptHost.tsx`, `app/App.tsx`, `app/src/screens/SettingsScreen.tsx`, `app/src/components/SessionLogModal.tsx`, `app/src/screens/GameDetailScreen.tsx` |

## Problem

React Native implements `Alert.prompt` for iOS only: `node_modules/react-native/Libraries/Alert/Alert.js:154`
is `if (Platform.OS === 'ios') { … }` with no `else`, so on Android the call returns without showing
anything. Three call sites depend on it:

- `screens/SettingsScreen.tsx:237` "🔒 Export encrypted" → on Android the button does nothing.
- `screens/SettingsScreen.tsx:273` encrypted import → on Android picking an encrypted file silently
  does nothing.
- `components/SessionLogModal.tsx:200` `promptCompletion`:
  `Alert.prompt?.(…) ?? Alert.alert(…)`. On iOS `prompt` exists and returns `undefined`, so the
  `??` fallback fires too → two "🎉 Completed!" dialogs. On Android only the fallback shows, so the
  final-note prompt has never worked there.

## Fix

One app-wide, imperative, promise-returning prompt backed by an RN `Modal`, following the store
pattern already used in `services/importQueue.ts` (module state + listener set +
`useSyncExternalStore`; no state library).

### `components/PromptHost.tsx`

```ts
export interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  secure?: boolean;       // secureTextEntry
  multiline?: boolean;
  confirmLabel?: string;  // default "OK"
  cancelLabel?: string;   // default "Cancel"
}
/** Resolves with the trimmed text, or null when cancelled. "" is possible; callers validate. */
export function promptText(opts: PromptOptions): Promise<string | null>;
/** Mount exactly once (App.tsx). */
export function PromptHost(): React.JSX.Element | null;
```

- Module state `{ current: (PromptOptions & { resolve }) | null; queue: [...] }`. A request made
  while one is showing is queued and shown when the current one resolves.
- UI: `Modal transparent animationType="fade" onRequestClose={cancel}` (Android back = cancel);
  overlay + card built with `themedStyles` (same look as the session modal's `overlay`/`modal`/
  `title`/`sub`, which plan 03 has already made themed — copy the values rather than importing `m`,
  so this component stays self-contained). `Input` from `components/ui.tsx` with
  `secureTextEntry={secure}`, `autoFocus`, `multiline`, `onSubmitEditing` → confirm (single-line
  only). `Btn` secondary = cancel, primary = confirm.
- Confirm resolves the trimmed value; cancel resolves `null`. Local input state resets for each
  request.

### `App.tsx`

Render `<PromptHost />` once, as a sibling right after `<Stack.Navigator>` inside
`NavigationContainer`.

### Call sites

- **Export encrypted** (`SettingsScreen.tsx:236-257`):
  ```ts
  const pw = await promptText({ title: "Set export passphrase", message: <existing text>, secure: true, confirmLabel: "Export" });
  if (pw == null) return;
  if (!pw) { Alert.alert("No passphrase", "Passphrase is required for encrypted export."); return; }
  await shareExport(pw)  // keep the existing catch → Alert
  ```
- **Encrypted import** (`SettingsScreen.tsx:272-293`): same shape; `if (!pw) return;` then the
  existing `importEncrypted` → `reloadFromDb` → alert flow.
- **`promptCompletion`** becomes
  ```ts
  export async function promptCompletion(gameId: number, onSaved?: () => void): Promise<void> {
    const text = await promptText({ title: "🎉 Completed!", message: "How'd you like it? Any final thoughts?", placeholder: "Final note (optional)", multiline: true, confirmLabel: "Save" });
    if (text) { updateGame(gameId, { final_note: text }); onSaved?.(); }
  }
  ```
  Delete the `Alert.alert` fallback (that is the double-dialog fix).
- Ordering with the session modal: present the prompt only after the session modal has closed, so
  iOS never has to present one modal from inside another. In `SessionLogModal` `finish`:
  ```ts
  const completed = maybeMarkCompleted(gameId);
  onClose(true);
  if (completed) void promptCompletion(gameId);
  ```
- `GameDetailScreen.tsx:137-140` `checkCompletion`:
  `if (maybeMarkCompleted(id)) void promptCompletion(id, reload); reload();`.

## Acceptance criteria

- `npx tsc --noEmit` passes; `grep -rn "Alert.prompt" app/src` returns nothing.
- iOS: completing a game shows exactly one dialog. Android: passphrase dialogs appear for export and
  encrypted import; the completion dialog appears.
- Cancel (button or Android back) resolves `null`; nothing is written.
- Two rapid `promptText` calls show one after the other, never overlapping.

## Manual test

On both platforms: (1) tick the last milestone of a game → one "Completed!" dialog; type a note →
✎ Edit shows it under Final note. (2) Settings → Export encrypted → passphrase dialog → share sheet.
(3) Import that file → passphrase dialog → "N games restored." (4) Press back/cancel on each dialog →
nothing happens.

## Conflicts

Edits `SessionLogModal.tsx`, `SettingsScreen.tsx`, `GameDetailScreen.tsx`, which plan 03 also
edits. Implement after 03 is merged and rebase on it.
