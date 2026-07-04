import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Linking from "expo-linking";
import { C } from "../theme";
import {
  Btn,
  Cover,
  Field,
  Input,
  ProgressBar,
  Stars,
  TagRow,
} from "../components/ui";
import {
  SessionLogModal,
  promptCompletion,
  m,
} from "../components/SessionLogModal";
import {
  addMilestone,
  addNote,
  addTag,
  deleteGame,
  deleteMilestone,
  getGame,
  maybeMarkCompleted,
  milestonesFor,
  notesFor,
  removeTag,
  sessionsForGame,
  setOnHold,
  setOnMind,
  toggleMilestone,
  updateGame,
} from "../db/repo";
import { fmtMinutes } from "../logic/derive";
import { canRecap, getRecap, llmConfigured } from "../services/llm";
import { igdbConfigured, IgdbGame, searchIgdb } from "../services/igdb";
import {
  GameWithMeta,
  Milestone,
  Note,
  ProgressMethod,
  Session,
  StartPrecision,
} from "../types";

/** Accepts YYYY, YYYY-MM, YYYY-MM-DD or empty. */
function parseFuzzyDate(
  s: string
): { date: string | null; precision: StartPrecision | null } | "invalid" {
  const t = s.trim();
  if (!t) return { date: null, precision: null };
  let m2;
  if ((m2 = t.match(/^(\d{4})$/)))
    return { date: `${m2[1]}-01-01`, precision: "year" };
  if ((m2 = t.match(/^(\d{4})-(\d{2})$/)))
    return { date: `${m2[1]}-${m2[2]}-01`, precision: "month" };
  if ((m2 = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)))
    return { date: t, precision: "day" };
  return "invalid";
}

const GROUP_LABEL: Record<string, string> = {
  current: "Current",
  backlog_started: "Backlog (started)",
  backlog: "Backlog",
  on_hold: "On Hold",
  completed: "Completed",
};

export default function GameDetailScreen({ route, navigation }: any) {
  const id: number = route.params.id;
  const [game, setGame] = useState<GameWithMeta | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tab, setTab] = useState<"progress" | "sessions" | "notes" | "walkthrough">("progress");
  const [logOpen, setLogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [newMilestone, setNewMilestone] = useState("");
  const [newStretch, setNewStretch] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [holdNote, setHoldNote] = useState("");
  const [manualPct, setManualPct] = useState("");
  const [wtText, setWtText] = useState("");
  const [wtEditing, setWtEditing] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapText, setRecapText] = useState<string | null>(null);
  const [recapBusy, setRecapBusy] = useState(false);
  const [recapErr, setRecapErr] = useState<string | null>(null);

  const reload = useCallback(() => {
    const g = getGame(id);
    setGame(g);
    if (g) {
      setMilestones(milestonesFor(id));
      setSessions(sessionsForGame(id));
      setNotes(notesFor(id));
      setManualPct(String(g.manual_percent));
      setWtText(g.walkthrough_text ?? "");
      navigation.setOptions({ title: g.title });
    }
  }, [id]);

  useFocusEffect(reload);

  if (!game) return null;

  const checkCompletion = () => {
    if (maybeMarkCompleted(id)) promptCompletion(id);
    reload();
  };

  const setMethod = (m: ProgressMethod) => {
    updateGame(id, { progress_method: m });
    reload();
  };

  const openCoverPicker = () => {
    if (!igdbConfigured()) {
      Alert.alert(
        "IGDB not configured",
        "Add your IGDB (Twitch) credentials in Settings to search for cover art. You can also set a cover URL via Edit."
      );
      return;
    }
    setCoverOpen(true);
  };

  const toggleHold = () => {
    if (game.on_hold) {
      setOnHold(id, false, null);
      reload();
    } else if (!holdNote.trim()) {
      Alert.alert("Note required", "On Hold needs a reason — why are you setting it aside?");
    } else {
      setOnHold(id, true, holdNote.trim());
      setHoldNote("");
      reload();
    }
  };

  const runRecap = async (force: boolean) => {
    if (!game) return;
    if (!llmConfigured()) {
      Alert.alert(
        "Set up AI recap",
        "Add an API token in Settings → AI recap first.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => navigation.navigate("Tabs", { screen: "Settings" }) },
        ]
      );
      return;
    }
    setRecapOpen(true);
    setRecapBusy(true);
    setRecapErr(null);
    if (force) setRecapText(null);
    try {
      const r = await getRecap(game, force);
      setRecapText(r.text);
      if (!r.cached) reload();
    } catch (e: any) {
      setRecapErr(String(e?.message ?? e));
    } finally {
      setRecapBusy(false);
    }
  };

  const remove = () => {
    Alert.alert("Delete game?", `Remove "${game.title}" and all its data?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteGame(id);
          navigation.goBack();
        },
      },
    ]);
  };



  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bgPrimary }}
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
    >
      {/* header */}
      <View style={{ flexDirection: "row", gap: 16, marginBottom: 16 }}>
        <Pressable onPress={openCoverPicker} hitSlop={6}>
          <Cover game={game} w={90} h={120} />
          <Text style={{ color: C.textMuted, fontSize: 9, textAlign: "center", marginTop: 4 }}>
            tap to change
          </Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <Text style={{ color: C.textPrimary, fontSize: 20, fontWeight: "700", flex: 1 }}>
              {game.title} {game.on_mind ? "💭" : ""}
            </Text>
            <Pressable
              onPress={() => setEditOpen(true)}
              hitSlop={10}
              style={{
                backgroundColor: C.bgCard,
                borderRadius: 6,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: C.textSecondary, fontSize: 13 }}>✎ Edit</Text>
            </Pressable>
          </View>
          <Text style={{ color: C.textSecondary, fontSize: 12, marginTop: 2 }}>
            {[game.release_year, game.platform_summary].filter(Boolean).join(" • ")}
          </Text>
          <Text style={{ color: C.textSecondary, fontSize: 12, marginTop: 8 }}>
            State: <Text style={{ color: C.progressFill }}>{GROUP_LABEL[game.group]}</Text>
            {game.streak > 1 ? `   🔥 ${game.streak} day streak` : ""}
          </Text>
          <Text style={{ color: C.textSecondary, fontSize: 12 }}>
            Playtime: {fmtMinutes(game.totalMinutes)} • {game.sessionCount} sessions
          </Text>
          <View style={{ marginTop: 8 }}>
            <Stars
              rating={game.rating}
              size={22}
              onRate={(r) => {
                updateGame(id, { rating: r });
                reload();
              }}
            />
          </View>
          {game.start_date && (
            <Text style={{ color: C.textSecondary, fontSize: 12 }}>
              Started: {game.start_date} ({game.start_precision})
            </Text>
          )}
          {game.lastPlayed && (
            <Text style={{ color: C.textSecondary, fontSize: 12 }}>
              Last played: {game.lastPlayed}
            </Text>
          )}
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        <Btn label="🎮 Played Today" onPress={() => setLogOpen(true)} />
        <Btn
          label={game.on_mind ? "💭 Off My Mind" : "💭 On My Mind"}
          kind="secondary"
          onPress={() => {
            setOnMind(id, !game.on_mind);
            reload();
          }}
        />
      </View>

      {/* progress */}
      <View style={{ backgroundColor: C.bgSecondary, borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <Text style={{ color: C.textPrimary, fontWeight: "600", fontSize: 14, marginBottom: 8 }}>
          Progress — {Math.round(game.progress)}%
          {game.progress > 100 ? " (postgame!)" : ""}
        </Text>
        <ProgressBar percent={game.progress} width={"100%"} />
      </View>

      {/* tags */}
      <TagRow
        tags={game.tags}
        onLongPress={(t) =>
          Alert.alert("Remove tag?", t, [
            { text: "Cancel", style: "cancel" },
            { text: "Remove", onPress: () => { removeTag(id, t); reload(); } },
          ])
        }
      />
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 16 }}>
        <Input
          value={newTag}
          onChangeText={setNewTag}
          placeholder="Add tag (type:value or plain)..."
          style={{ flex: 1 }}
          onSubmitEditing={() => {
            if (newTag.trim()) { addTag(id, newTag.trim()); setNewTag(""); reload(); }
          }}
        />
      </View>

      {/* tabs */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 12 }}>
        {(["progress", "walkthrough", "sessions", "notes"] as const).map((tb) => (
          <Pressable key={tb} onPress={() => setTab(tb)} style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
            <Text style={{
              color: tab === tb ? C.accent : C.textSecondary,
              fontSize: 13,
              fontWeight: tab === tb ? "600" : "400",
            }}>
              {tb === "progress" ? "Progress" : tb === "walkthrough" ? "Walkthrough" : tb === "sessions" ? `Sessions (${sessions.length})` : `Notes (${notes.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "progress" && (
        <View>
          <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
            {(["checkbox", "manual", "walkthrough"] as ProgressMethod[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMethod(m)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
                  backgroundColor: game.progress_method === m ? C.accent : C.bgCard,
                }}
              >
                <Text style={{ color: game.progress_method === m ? "#fff" : C.textSecondary, fontSize: 12 }}>
                  {m === "checkbox" ? "Milestones" : m === "manual" ? "Manual %" : "Walkthrough"}
                </Text>
              </Pressable>
            ))}
          </View>

          {game.progress_method === "manual" && (
            <Field label="Progress percent (can exceed 100)">
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Input
                  value={manualPct}
                  onChangeText={setManualPct}
                  keyboardType="numeric"
                  style={{ width: 90, textAlign: "center" }}
                />
                <Btn
                  label="Set"
                  kind="secondary"
                  onPress={() => {
                    updateGame(id, { manual_percent: parseFloat(manualPct) || 0 });
                    checkCompletion();
                  }}
                />
              </View>
            </Field>
          )}

          {game.progress_method === "checkbox" && (
            <View>
              {milestones.map((ms) => (
                <Pressable
                  key={ms.id}
                  onPress={() => { toggleMilestone(ms.id, !ms.done); checkCompletion(); }}
                  onLongPress={() =>
                    Alert.alert("Delete milestone?", ms.name, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", onPress: () => { deleteMilestone(ms.id); reload(); } },
                    ])
                  }
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 10,
                    backgroundColor: C.bgSecondary, borderRadius: 8, padding: 12, marginBottom: 6,
                  }}
                >
                  <Text style={{ fontSize: 16 }}>{ms.done ? "☑️" : "⬜"}</Text>
                  <Text style={{ color: C.textPrimary, fontSize: 13, flex: 1 }}>
                    {ms.name}
                  </Text>
                  {!!ms.is_stretch && (
                    <Text style={{ color: C.gold, fontSize: 10 }}>STRETCH (&gt;100%)</Text>
                  )}
                </Pressable>
              ))}
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 8 }}>
                <Input
                  value={newMilestone}
                  onChangeText={setNewMilestone}
                  placeholder="New milestone name..."
                  style={{ flex: 1 }}
                />
                <Text style={{ color: C.textMuted, fontSize: 10 }}>stretch</Text>
                <Switch value={newStretch} onValueChange={setNewStretch} />
              </View>
              <Btn
                label="+ Add milestone"
                kind="secondary"
                style={{ marginTop: 8 }}
                onPress={() => {
                  if (newMilestone.trim()) {
                    addMilestone(id, newMilestone.trim(), newStretch);
                    setNewMilestone("");
                    setNewStretch(false);
                    reload();
                  }
                }}
              />
            </View>
          )}

          {game.progress_method === "walkthrough" && (
            <Text style={{ color: C.textMuted, fontSize: 12 }}>
              Progress = your marked position in the walkthrough text (see Walkthrough tab).
            </Text>
          )}
        </View>
      )}

      {tab === "walkthrough" && (
        <View>
          {game.walkthrough_url ? (
            <Pressable onPress={() => Linking.openURL(game.walkthrough_url!)}>
              <Text style={{ color: C.progressFill, fontSize: 13, marginBottom: 10 }}>
                🔗 {game.walkthrough_url}
              </Text>
            </Pressable>
          ) : null}
          <Field label="Walkthrough link">
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Input
                defaultValue={game.walkthrough_url ?? ""}
                placeholder="https://..."
                autoCapitalize="none"
                style={{ flex: 1 }}
                onEndEditing={(e) => {
                  updateGame(id, { walkthrough_url: e.nativeEvent.text.trim() || null });
                  reload();
                }}
              />
              <Btn
                label="🔎 GameFAQs"
                kind="secondary"
                onPress={() =>
                  Linking.openURL(
                    `https://gamefaqs.gamespot.com/search?game=${encodeURIComponent(game.title)}`
                  )
                }
              />
            </View>
          </Field>
          {canRecap(game) && (
            <Btn
              label="🧭 Where was I?"
              onPress={() => runRecap(false)}
              style={{ marginBottom: 14 }}
            />
          )}
          <Field label="Walkthrough text (paste the relevant parts — fluff hurts progress tracking)">
            {wtEditing ? (
              <>
                <Input
                  value={wtText}
                  onChangeText={setWtText}
                  multiline
                  style={{ minHeight: 160, textAlignVertical: "top" }}
                  placeholder="Paste walkthrough text here..."
                />
                <Btn
                  label="Save text"
                  style={{ marginTop: 8 }}
                  onPress={() => {
                    updateGame(id, { walkthrough_text: wtText || null });
                    setWtEditing(false);
                    reload();
                  }}
                />
              </>
            ) : game.walkthrough_text ? (
              <WalkthroughReader
                text={game.walkthrough_text}
                position={game.walkthrough_position}
                onMark={(pos) => {
                  updateGame(id, { walkthrough_position: pos });
                  checkCompletion();
                }}
                onEdit={() => setWtEditing(true)}
              />
            ) : (
              <Btn label="+ Paste walkthrough text" kind="secondary" onPress={() => setWtEditing(true)} />
            )}
          </Field>
        </View>
      )}

      {tab === "sessions" && (
        <View>
          {sessions.map((sess) => (
            <View key={sess.id} style={{ backgroundColor: C.bgSecondary, borderRadius: 8, padding: 12, marginBottom: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: C.textMuted, fontSize: 12 }}>{sess.date}</Text>
                <Text style={{ color: C.textPrimary, fontSize: 12, fontWeight: "600" }}>
                  {fmtMinutes(sess.minutes)}
                </Text>
              </View>
              {sess.note && (
                <Text style={{ color: C.textSecondary, fontSize: 12, marginTop: 4 }}>
                  {sess.note}
                </Text>
              )}
            </View>
          ))}
          {sessions.length === 0 && (
            <Text style={{ color: C.textMuted, fontSize: 12 }}>No sessions logged yet.</Text>
          )}
        </View>
      )}

      {tab === "notes" && (
        <View>
          {notes.map((n) => (
            <View key={n.id} style={{ backgroundColor: C.bgSecondary, borderRadius: 8, padding: 12, marginBottom: 6 }}>
              <Text style={{ color: C.textMuted, fontSize: 11, marginBottom: 4 }}>
                {n.at.slice(0, 10)}
              </Text>
              <Text style={{ color: C.textPrimary, fontSize: 13, lineHeight: 19 }}>
                {n.text}
              </Text>
            </View>
          ))}
          <Input
            value={newNote}
            onChangeText={setNewNote}
            placeholder="Add a note (why you stopped, tips to self...)"
            multiline
            style={{ minHeight: 60, marginTop: 8, textAlignVertical: "top" }}
          />
          <Btn
            label="+ Add note"
            kind="secondary"
            style={{ marginTop: 8 }}
            onPress={() => {
              if (newNote.trim()) { addNote(id, newNote.trim()); setNewNote(""); reload(); }
            }}
          />
        </View>
      )}

      {/* on hold */}
      <View style={{ backgroundColor: C.bgSecondary, borderRadius: 10, padding: 14, marginTop: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: C.textPrimary, fontSize: 13, fontWeight: "600" }}>
            ⏸ On Hold
          </Text>
          <Switch value={!!game.on_hold} onValueChange={toggleHold} />
        </View>
        {game.on_hold ? (
          <Text style={{ color: C.accent, fontSize: 12, marginTop: 6 }}>
            "{game.on_hold_note}"
          </Text>
        ) : (
          <Input
            value={holdNote}
            onChangeText={setHoldNote}
            placeholder="Why? (required to set On Hold)"
            style={{ marginTop: 8 }}
          />
        )}
      </View>

      <Pressable onPress={remove} style={{ marginTop: 30, alignItems: "center" }}>
        <Text style={{ color: C.accent, fontSize: 12 }}>Delete game</Text>
      </Pressable>

      <SessionLogModal
        gameId={id}
        visible={logOpen}
        onClose={(changed) => { setLogOpen(false); if (changed) reload(); }}
      />

      {editOpen && (
        <EditGameModal
          game={game}
          visible={editOpen}
          onClose={(changed) => { setEditOpen(false); if (changed) reload(); }}
        />
      )}

      {coverOpen && (
        <CoverPickerModal
          game={game}
          visible={coverOpen}
          onClose={(changed) => { setCoverOpen(false); if (changed) reload(); }}
        />
      )}

      <RecapModal
        visible={recapOpen}
        busy={recapBusy}
        text={recapText}
        error={recapErr}
        onRegenerate={() => runRecap(true)}
        onClose={() => setRecapOpen(false)}
      />
    </ScrollView>
  );
}

function EditGameModal({
  game,
  visible,
  onClose,
}: {
  game: GameWithMeta;
  visible: boolean;
  onClose: (changed: boolean) => void;
}) {
  const [title, setTitle] = useState(game.title);
  const [year, setYear] = useState(game.release_year ? String(game.release_year) : "");
  const [platform, setPlatform] = useState(game.platform_summary ?? "");
  const [coverUrl, setCoverUrl] = useState(game.cover_url ?? "");
  const [startDate, setStartDate] = useState(
    game.start_date
      ? game.start_precision === "year"
        ? game.start_date.slice(0, 4)
        : game.start_precision === "month"
        ? game.start_date.slice(0, 7)
        : game.start_date
      : ""
  );
  const [impHours, setImpHours] = useState(String(Math.floor(game.imported_minutes / 60)));
  const [impMins, setImpMins] = useState(String(game.imported_minutes % 60));
  const [completedAt, setCompletedAt] = useState(game.completed_at ?? "");
  const [rating, setRating] = useState<number | null>(game.rating);
  const [finalNote, setFinalNote] = useState(game.final_note ?? "");

  const save = () => {
    if (!title.trim()) {
      Alert.alert("Title required");
      return;
    }
    const start = parseFuzzyDate(startDate);
    if (start === "invalid") {
      Alert.alert("Invalid start date", "Use YYYY, YYYY-MM or YYYY-MM-DD (or leave empty).");
      return;
    }
    const completed = completedAt.trim();
    if (completed && !/^\d{4}-\d{2}-\d{2}$/.test(completed)) {
      Alert.alert("Invalid completed date", "Use YYYY-MM-DD (or leave empty).");
      return;
    }
    const importedMinutes =
      (parseInt(impHours || "0", 10) || 0) * 60 + (parseInt(impMins || "0", 10) || 0);
    updateGame(game.id, {
      title: title.trim(),
      release_year: parseInt(year, 10) || null,
      platform_summary: platform.trim() || null,
      cover_url: coverUrl.trim() || null,
      start_date: start.date,
      start_precision: start.precision,
      imported_minutes: importedMinutes,
      completed_at: completed || null,
      rating,
      final_note: finalNote.trim() || null,
    });
    onClose(true);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={m.overlay}>
        <View style={[m.modal, { maxHeight: "88%" }]}>
          <Text style={m.title}>Edit details</Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Field label="Title">
              <Input value={title} onChangeText={setTitle} />
            </Field>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Field label="Release year">
                  <Input value={year} onChangeText={setYear} keyboardType="numeric" placeholder="e.g. 2017" />
                </Field>
              </View>
              <View style={{ flex: 2 }}>
                <Field label="Platform">
                  <Input value={platform} onChangeText={setPlatform} placeholder="e.g. Switch" />
                </Field>
              </View>
            </View>
            <Field label="Cover image URL">
              <Input value={coverUrl} onChangeText={setCoverUrl} autoCapitalize="none" placeholder="https://..." />
            </Field>
            <Field label="Started (YYYY, YYYY-MM or YYYY-MM-DD — empty = not started)">
              <Input value={startDate} onChangeText={setStartDate} placeholder="2021" autoCapitalize="none" />
            </Field>
            <Field label="Base playtime (outside logged sessions)">
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Input value={impHours} onChangeText={setImpHours} keyboardType="numeric" style={{ width: 70, textAlign: "center" }} />
                <Text style={{ color: C.textMuted, fontSize: 12 }}>hours</Text>
                <Input value={impMins} onChangeText={setImpMins} keyboardType="numeric" style={{ width: 70, textAlign: "center" }} />
                <Text style={{ color: C.textMuted, fontSize: 12 }}>minutes</Text>
              </View>
            </Field>
            <Field label="Completed on (YYYY-MM-DD — empty = not completed)">
              <Input value={completedAt} onChangeText={setCompletedAt} placeholder="" autoCapitalize="none" />
            </Field>
            <Field label="Rating (tap again to clear)">
              <Stars rating={rating} size={24} onRate={setRating} />
            </Field>
            {completedAt.trim() !== "" && (
              <>
                <Field label="Final note (optional)">
                  <Input value={finalNote} onChangeText={setFinalNote} multiline style={{ minHeight: 50, textAlignVertical: "top" }} />
                </Field>
              </>
            )}
          </ScrollView>
          <View style={m.actions}>
            <Btn label="Cancel" kind="secondary" onPress={() => onClose(false)} />
            <Btn label="Save" onPress={save} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Pick a new cover from IGDB search results (tap the cover art to open). */
function CoverPickerModal({
  game,
  visible,
  onClose,
}: {
  game: GameWithMeta;
  visible: boolean;
  onClose: (changed: boolean) => void;
}) {
  const [query, setQuery] = useState(game.title);
  const [results, setResults] = useState<IgdbGame[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await searchIgdb(q.trim());
      setResults(r.filter((x) => x.coverUrl));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, []);

  // auto-search with the game title when the modal opens
  useEffect(() => {
    void search(game.title);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (r: IgdbGame) => {
    updateGame(game.id, { cover_url: r.coverUrl });
    onClose(true);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => onClose(false)}>
      <View style={m.overlay}>
        <View style={[m.modal, { maxHeight: "88%" }]}>
          <Text style={m.title}>Change cover</Text>
          <Text style={m.sub}>Covers from IGDB — tap one to use it.</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Search IGDB..."
              style={{ flex: 1 }}
              onSubmitEditing={() => search(query)}
            />
            <Btn label={busy ? "…" : "🔍"} kind="secondary" onPress={() => search(query)} />
          </View>

          {error ? (
            <Text style={{ color: C.accent, fontSize: 12, marginBottom: 10 }}>{error}</Text>
          ) : busy ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator color={C.progressFill} />
            </View>
          ) : results.length === 0 ? (
            <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 10 }}>
              No covers found — try a different search.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 400 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {results.map((r) => (
                  <Pressable key={r.id} onPress={() => pick(r)} style={{ width: 90 }}>
                    <Image
                      source={{ uri: r.coverUrl! }}
                      style={{
                        width: 90,
                        height: 120,
                        borderRadius: 6,
                        backgroundColor: C.bgCard,
                        borderWidth: game.cover_url === r.coverUrl ? 2 : 0,
                        borderColor: C.progressFill,
                      }}
                    />
                    <Text
                      style={{ color: C.textSecondary, fontSize: 10, marginTop: 3 }}
                      numberOfLines={2}
                    >
                      {r.name}
                      {r.releaseYear ? ` (${r.releaseYear})` : ""}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          )}

          <View style={m.actions}>
            {game.cover_url ? (
              <Btn
                label="Remove cover"
                kind="secondary"
                onPress={() => {
                  updateGame(game.id, { cover_url: null });
                  onClose(true);
                }}
              />
            ) : null}
            <Btn label="Cancel" kind="secondary" onPress={() => onClose(false)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Paragraph-based reader: tap a paragraph to mark "I stopped here". */
function RecapModal({
  visible,
  busy,
  text,
  error,
  onRegenerate,
  onClose,
}: {
  visible: boolean;
  busy: boolean;
  text: string | null;
  error: string | null;
  onRegenerate: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={m.overlay} onPress={onClose}>
        <Pressable style={m.modal} onPress={() => {}}>
          <Text style={m.title}>🧭 Where was I?</Text>
          <Text style={m.sub}>From your walkthrough, up to where you stopped.</Text>
          {busy ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator color={C.progressFill} />
              <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 10 }}>
                Reading your walkthrough…
              </Text>
            </View>
          ) : error ? (
            <Text style={{ color: C.accent, fontSize: 13, lineHeight: 20 }}>{error}</Text>
          ) : (
            <ScrollView style={{ maxHeight: 340 }}>
              <Text style={{ color: C.textSecondary, fontSize: 14, lineHeight: 21 }}>{text}</Text>
            </ScrollView>
          )}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
            <Btn
              label="Regenerate"
              kind="secondary"
              onPress={onRegenerate}
              style={{ flex: 1, opacity: busy ? 0.5 : 1 }}
            />
            <Btn label="Done" onPress={onClose} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function WalkthroughReader({
  text,
  position,
  onMark,
  onEdit,
}: {
  text: string;
  position: number;
  onMark: (pos: number) => void;
  onEdit: () => void;
}) {
  const paragraphs: { start: number; end: number; body: string }[] = [];
  let offset = 0;
  for (const p of text.split(/\n\n+/)) {
    const start = text.indexOf(p, offset);
    paragraphs.push({ start, end: start + p.length, body: p });
    offset = start + p.length;
  }
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ color: C.textMuted, fontSize: 11 }}>
          Tap a paragraph to mark your position
        </Text>
        <Pressable onPress={onEdit}>
          <Text style={{ color: C.accent, fontSize: 11 }}>Edit text</Text>
        </Pressable>
      </View>
      {paragraphs.map((p, i) => {
        const done = p.end <= position;
        const isMark = position >= p.start && position <= p.end && position > 0;
        return (
          <Pressable
            key={i}
            onPress={() => onMark(p.end)}
            style={{
              padding: 10,
              borderRadius: 6,
              marginBottom: 4,
              backgroundColor: isMark ? C.bgCard : "transparent",
              borderLeftWidth: 3,
              borderLeftColor: done ? C.progressFill : C.border,
            }}
          >
            <Text style={{
              color: done ? C.textMuted : C.textPrimary,
              fontSize: 12,
              lineHeight: 18,
            }}>
              {p.body}
            </Text>
            {isMark && (
              <Text style={{ color: C.progressFill, fontSize: 10, marginTop: 4 }}>
                📍 You stopped here
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
