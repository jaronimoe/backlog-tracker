import React, { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { C } from "../theme";
import { Btn, Field, Input, ProgressBar, s } from "./ui";
import {
  genreBlockCheck,
  getGame,
  isNeverPlayed,
  logSession,
  maybeMarkCompleted,
  sessionFor,
  updateGame,
} from "../db/repo";
import { getSetting, SETTINGS } from "../db/database";
import { fmtMinutes, playDay, splitTag } from "../logic/derive";

export function SessionLogModal({
  gameId,
  visible,
  onClose,
  date,
}: {
  gameId: number | null;
  visible: boolean;
  onClose: (changed: boolean) => void;
  date?: string;
}) {
  const day = date ?? playDay();
  const [minutes, setMinutes] = useState(15);
  const [note, setNote] = useState("");
  const [title, setTitle] = useState("");
  const [blockerHits, setBlockerHits] = useState<
    ReturnType<typeof genreBlockCheck>
  >([]);
  const [blockerAccepted, setBlockerAccepted] = useState(false);

  useEffect(() => {
    if (!visible || gameId == null) return;
    const g = getGame(gameId);
    setTitle(g?.title ?? "");
    const existing = sessionFor(gameId, day);
    setMinutes(existing?.minutes ?? 15);
    setNote(existing?.note ?? "");
    setBlockerAccepted(false);
    // Genre blocker: first session of a never-played game
    if (isNeverPlayed(gameId) && !existing) {
      const threshold = parseInt(
        getSetting(SETTINGS.genreBlockThreshold, "1"),
        10
      );
      const hits = genreBlockCheck(gameId);
      setBlockerHits(hits.length >= threshold ? hits : []);
    } else {
      setBlockerHits([]);
    }
  }, [visible, gameId]);

  if (gameId == null) return null;

  const save = () => {
    logSession(gameId, day, minutes, note.trim() || null);
    if (maybeMarkCompleted(gameId)) promptCompletion(gameId);
    onClose(true);
  };

  const showBlocker = blockerHits.length > 0 && !blockerAccepted;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={m.overlay}>
        <View style={m.modal}>
          {showBlocker ? (
            <>
              <Text style={m.title}>
                ⚠️ You're about to start a new{" "}
                {splitTag(blockerHits[0].sharedGenres[0]).value.toUpperCase()}
              </Text>
              <Text style={m.sub}>
                You already have {blockerHits.length} game
                {blockerHits.length > 1 ? "s" : ""} of this genre in progress:
              </Text>
              <ScrollView style={{ maxHeight: 220 }}>
                {blockerHits.map((h) => (
                  <View key={h.game.id} style={m.blockRow}>
                    <Text style={m.blockTitle} numberOfLines={1}>
                      {h.game.title}
                    </Text>
                    <ProgressBar percent={h.game.progress} width={70} />
                    <Text style={m.blockMeta}>
                      {h.game.lastPlayed ?? "never"}
                    </Text>
                  </View>
                ))}
              </ScrollView>
              <View style={m.actions}>
                <Btn label="Cancel" kind="secondary" onPress={() => onClose(false)} />
                <Btn label="Start anyway" onPress={() => setBlockerAccepted(true)} />
              </View>
            </>
          ) : (
            <>
              <Text style={m.title}>Log Session — {title}</Text>
              <Text style={m.sub}>{day}</Text>
              <View style={m.timeRow}>
                <Pressable
                  style={m.timeBtn}
                  onPress={() => setMinutes((v) => Math.max(0, v - 15))}
                >
                  <Text style={m.timeBtnText}>−</Text>
                </Pressable>
                <View style={{ alignItems: "center", minWidth: 90 }}>
                  <Text style={m.timeDisplay}>{fmtMinutes(minutes)}</Text>
                  <Text style={m.timeHint}>±15 min per tap</Text>
                </View>
                <Pressable
                  style={[m.timeBtn, { backgroundColor: C.accent }]}
                  onPress={() => setMinutes((v) => v + 15)}
                >
                  <Text style={m.timeBtnText}>+</Text>
                </Pressable>
              </View>
              <Field label="Session note (optional)">
                <Input
                  value={note}
                  onChangeText={setNote}
                  placeholder="What did you do this session?"
                />
              </Field>
              <View style={m.actions}>
                <Btn label="Cancel" kind="secondary" onPress={() => onClose(false)} />
                <Btn label="Save" onPress={save} />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

export function promptCompletion(gameId: number) {
  Alert.prompt?.(
    "🎉 Completed!",
    "How'd you like it? Any final thoughts?",
    (text) => {
      if (text) updateGame(gameId, { final_note: text });
    }
  ) ??
    Alert.alert("🎉 Completed!", "Game marked as completed.", [{ text: "OK" }]);
}

export const m = {
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 20,
  },
  modal: {
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
  sub: { color: C.textMuted, fontSize: 12, marginBottom: 16 },
  timeRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 16,
    marginBottom: 18,
  },
  timeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.bgCard,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  timeBtnText: { color: "#fff", fontSize: 22 },
  timeDisplay: {
    color: C.progressFill,
    fontSize: 26,
    fontWeight: "700" as const,
  },
  timeHint: { color: C.textMuted, fontSize: 10 },
  actions: {
    flexDirection: "row" as const,
    justifyContent: "flex-end" as const,
    gap: 8,
    marginTop: 8,
  },
  blockRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingVertical: 8,
  },
  blockTitle: { color: C.textPrimary, fontSize: 13, flex: 1 },
  blockMeta: { color: C.textMuted, fontSize: 10 },
};
