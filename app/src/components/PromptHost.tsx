import React, { useState, useSyncExternalStore } from "react";
import { Modal, Text, View } from "react-native";
import { C, themedStyles } from "../theme";
import { Btn, Input } from "./ui";

/**
 * App-wide imperative text prompt — the cross-platform replacement for the
 * `prompt` helper on RN's Alert, which React Native only implements on iOS
 * (on Android the call returns without showing anything).
 *
 * Follows the store pattern of `services/importQueue.ts`: module state plus a
 * listener set, read through `useSyncExternalStore`. No state library.
 * Mount <PromptHost /> exactly once (App.tsx); call promptText() from anywhere.
 */

export interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  secure?: boolean; // secureTextEntry
  multiline?: boolean;
  confirmLabel?: string; // default "OK"
  cancelLabel?: string; // default "Cancel"
}

interface PromptRequest extends PromptOptions {
  id: number;
  resolve: (value: string | null) => void;
}

let nextId = 1;
let current: PromptRequest | null = null;
const queue: PromptRequest[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/**
 * Show a text prompt. Resolves with the trimmed text, or null when cancelled
 * (cancel button or Android back). "" is possible — callers validate.
 * A request made while one is showing is queued and shown after it resolves.
 */
export function promptText(opts: PromptOptions): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const req: PromptRequest = { ...opts, id: nextId++, resolve };
    if (current) queue.push(req);
    else current = req;
    notify();
  });
}

function settle(value: string | null) {
  const req = current;
  current = queue.shift() ?? null;
  notify();
  req?.resolve(value);
}

/** Mount exactly once (App.tsx). */
export function PromptHost(): React.JSX.Element | null {
  const req = useSyncExternalStore(subscribe, () => current);
  if (!req) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => settle(null)}>
      <View style={p.overlay}>
        {/* Keyed so each request starts with fresh input state, while the
            Modal itself stays mounted across a queued hand-over. */}
        <PromptCard key={req.id} req={req} />
      </View>
    </Modal>
  );
}

function PromptCard({ req }: { req: PromptRequest }) {
  const [text, setText] = useState(req.defaultValue ?? "");
  const confirm = () => settle(text.trim());
  const cancel = () => settle(null);
  return (
    <View style={p.card}>
      <Text style={[p.title, req.message ? null : p.titleOnly]}>{req.title}</Text>
      {req.message ? <Text style={p.sub}>{req.message}</Text> : null}
      <Input
        value={text}
        onChangeText={setText}
        placeholder={req.placeholder}
        secureTextEntry={!!req.secure}
        multiline={!!req.multiline}
        autoFocus
        autoCapitalize={req.secure ? "none" : "sentences"}
        autoCorrect={!req.secure}
        returnKeyType="done"
        onSubmitEditing={req.multiline ? undefined : confirm}
        style={req.multiline ? p.inputMultiline : undefined}
      />
      <View style={p.actions}>
        <Btn label={req.cancelLabel ?? "Cancel"} kind="secondary" onPress={cancel} />
        <Btn label={req.confirmLabel ?? "OK"} onPress={confirm} />
      </View>
    </View>
  );
}

// Same look as the session modal (overlay / modal / title / sub); kept local so
// this component stays self-contained.
const p = themedStyles(() => ({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 20,
  },
  card: {
    backgroundColor: C.bgSecondary,
    borderRadius: 12,
    padding: 20,
    width: "100%" as const,
    maxWidth: 480,
  },
  title: {
    color: C.textPrimary,
    fontSize: 17,
    fontWeight: "700" as const,
    marginBottom: 4,
  },
  /** Without a message the title carries the gap above the input itself. */
  titleOnly: { marginBottom: 16 },
  sub: { color: C.textMuted, fontSize: 12, marginBottom: 16 },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: "top" as const,
  },
  actions: {
    flexDirection: "row" as const,
    justifyContent: "flex-end" as const,
    gap: 8,
    marginTop: 16,
  },
}));
