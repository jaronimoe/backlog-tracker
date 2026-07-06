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
import { STEAM_MARKER_NOTE } from "../services/steam";

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
    // Genre blocker: first session of a never-played game. Only when logging
    // for today — backfilling a forgotten day or fixing history shouldn't nag.
    if (isNeverPlayed(gameId) && !existing && day === playDay()) {
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
    const finish = () => {
      logSession(gameId, day, minutes, note.trim() || null);
      if (maybeMarkCompleted(gameId)) promptCompletion(gameId);
      onClose(true);
    };
    // Shrinking a Steam-attributed session (e.g. a multi-week playtime delta
    // dumped onto one day): offer to keep the removed time as undated base
    // playtime so the lifetime total stays accurate.
    const existing = sessionFor(gameId, day);
    if (
      existing &&
      existing.note?.includes(STEAM_MARKER_NOTE) &&
      minutes < existing.minutes
    ) {
      const diff = existing.minutes - minutes;
      Alert.alert(
        "Steam-synced session",
        `You're removing ${fmtMinutes(diff)} that Steam sync attributed to this day. Keep it as undated base playtime (total stays accurate), or discard it?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Discard time", style: "destructive", onPress: finish },
          {
            text: "Keep time",
            isPreferred: true,
            onPress: () => {
              const g = getGame(gameId);
              updateGame(gameId, {
                imported_minutes: (g?.imported_minutes ?? 0) + diff,
              });
              finish();
            },
          },
        ]
      );
      return;
    }
    finish();
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
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  marginBottom: 18,
                }}
              >
                <Text style={{ color: C.textMuted, fontSize: 12 }}>
                  or exactly
                </Text>
                <Input
                  value={String(minutes)}
                  onChangeText={(t) =>
                    setMinutes(Math.max(0, parseInt(t, 10) || 0))
                  }
                  keyboardType="numeric"
                  style={{ width: 80, textAlign: "center" }}
                />
                <Text style={{ color: C.textMuted, fontSize: 12 }}>min</Text>
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
