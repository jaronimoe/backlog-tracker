import React, { useState } from "react";
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Linking from "expo-linking";
import { C } from "../theme";
import { Btn, Field, Input, TagRow } from "../components/ui";
import { addGame } from "../db/repo";
import { isoDate } from "../logic/derive";
import { igdbConfigured, IgdbGame, searchIgdb } from "../services/igdb";

export default function AddGameScreen({ navigation }: any) {
  const [title, setTitle] = useState("");
  const [results, setResults] = useState<IgdbGame[]>([]);
  const [picked, setPicked] = useState<IgdbGame | null>(null);
  const [searching, setSearching] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [alreadyStarted, setAlreadyStarted] = useState(false);
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [hours, setHours] = useState("");
  const [mins, setMins] = useState("");
  const [lastPlayed, setLastPlayed] = useState("");
  const [wtUrl, setWtUrl] = useState("");

  const search = async () => {
    if (!title.trim()) return;
    if (!igdbConfigured()) {
      Alert.alert(
        "IGDB not configured",
        "Add your IGDB credentials in Settings to fetch metadata, or just add the game with its title."
      );
      return;
    }
    setSearching(true);
    try {
      setResults(await searchIgdb(title.trim()));
    } catch (e: any) {
      Alert.alert("IGDB error", String(e?.message ?? e));
    } finally {
      setSearching(false);
    }
  };

  const pick = (r: IgdbGame) => {
    setPicked(r);
    setTitle(r.name);
    setResults([]);
    setTags([
      ...r.platforms.map((p) => `platform:${p}`),
      ...r.genres.map((g) => `genre:${g}`),
    ]);
  };

  const save = () => {
    if (!title.trim()) {
      Alert.alert("Title required", "The minimum to add a game is its name.");
      return;
    }
    const importedMinutes =
      (parseInt(hours || "0", 10) || 0) * 60 + (parseInt(mins || "0", 10) || 0);
    const startIso = alreadyStarted ? isoDate(startDate) : null;
    addGame({
      title: title.trim(),
      cover_url: picked?.coverUrl ?? null,
      release_year: picked?.releaseYear ?? null,
      platform_summary: picked?.platforms.join(", ") ?? null,
      start_date: startIso,
      start_precision: startIso ? "day" : null,
      imported_minutes: importedMinutes,
      last_played_override: lastPlayed.trim() || startIso,
      tags,
      walkthrough_url: wtUrl.trim() || null,
    });
    navigation.goBack();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bgPrimary }}
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
    >
      <Field label="Game title (required)">
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder="Search for a game..."
            style={{ flex: 1 }}
            onSubmitEditing={search}
          />
          <Btn label={searching ? "…" : "🔍"} kind="secondary" onPress={search} />
        </View>
      </Field>

      {results.map((r) => (
        <Pressable
          key={r.id}
          onPress={() => pick(r)}
          style={{
            flexDirection: "row",
            gap: 10,
            backgroundColor: C.bgCard,
            borderRadius: 8,
            padding: 10,
            marginBottom: 6,
            alignItems: "center",
          }}
        >
          {r.coverUrl && (
            <Image source={{ uri: r.coverUrl }} style={{ width: 32, height: 43, borderRadius: 4 }} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.textPrimary, fontSize: 13, fontWeight: "600" }}>
              {r.name}
            </Text>
            <Text style={{ color: C.textMuted, fontSize: 11 }}>
              {r.releaseYear ?? "?"} • {r.genres.join(", ")}
            </Text>
          </View>
        </Pressable>
      ))}

      {picked && (
        <View
          style={{
            backgroundColor: C.bgCard,
            borderRadius: 8,
            padding: 10,
            marginBottom: 14,
          }}
        >
          <Text style={{ color: C.progressFill, fontSize: 12 }}>
            ✓ Found on IGDB: {picked.name} ({picked.releaseYear ?? "?"})
          </Text>
        </View>
      )}

      <Field label="Tags">
        <TagRow tags={tags} onLongPress={(t) => setTags(tags.filter((x) => x !== t))} />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Input
            value={customTag}
            onChangeText={setCustomTag}
            placeholder="Add custom tag..."
            style={{ flex: 1 }}
            onSubmitEditing={() => {
              if (customTag.trim()) {
                setTags([...tags, customTag.trim()]);
                setCustomTag("");
              }
            }}
          />
        </View>
        <Text style={{ color: C.textMuted, fontSize: 10, marginTop: 4 }}>
          Long-press a tag to remove it. Use type:value for typed tags.
        </Text>
      </Field>

      <Field label="Already started playing?">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Switch value={alreadyStarted} onValueChange={setAlreadyStarted} />
          {alreadyStarted &&
            (Platform.OS === "ios" ? (
              <DateTimePicker
                value={startDate}
                mode="date"
                display="compact"
                maximumDate={new Date()}
                onChange={(_, d) => d && setStartDate(d)}
              />
            ) : (
              <Pressable
                onPress={() => setShowPicker(true)}
                style={{
                  backgroundColor: C.bgCard,
                  borderRadius: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: C.textPrimary, fontSize: 13 }}>
                  📅 {isoDate(startDate)}
                </Text>
              </Pressable>
            ))}
        </View>
        {showPicker && Platform.OS !== "ios" && (
          <DateTimePicker
            value={startDate}
            mode="date"
            display="calendar"
            maximumDate={new Date()}
            onChange={(_, d) => {
              setShowPicker(false);
              if (d) setStartDate(d);
            }}
          />
        )}
      </Field>

      {alreadyStarted && (
        <>
          <Field label="Time already spent (optional)">
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Input value={hours} onChangeText={setHours} placeholder="0" keyboardType="numeric" style={{ width: 70, textAlign: "center" }} />
              <Text style={{ color: C.textMuted, fontSize: 12 }}>hours</Text>
              <Input value={mins} onChangeText={setMins} placeholder="0" keyboardType="numeric" style={{ width: 70, textAlign: "center" }} />
              <Text style={{ color: C.textMuted, fontSize: 12 }}>minutes</Text>
            </View>
          </Field>
          <Field label="Last played (optional, YYYY-MM-DD — defaults to start date)">
            <Input value={lastPlayed} onChangeText={setLastPlayed} placeholder="YYYY-MM-DD" />
          </Field>
        </>
      )}

      <Field label="Walkthrough link (optional)">
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Input
            value={wtUrl}
            onChangeText={setWtUrl}
            placeholder="https://gamefaqs.gamespot.com/..."
            autoCapitalize="none"
            style={{ flex: 1 }}
          />
          <Btn
            label="🔎 GameFAQs"
            kind="secondary"
            onPress={() => {
              if (!title.trim()) {
                Alert.alert("Enter a title first", "The search uses the game title.");
                return;
              }
              Linking.openURL(
                `https://gamefaqs.gamespot.com/search?game=${encodeURIComponent(title.trim())}`
              );
            }}
          />
        </View>
        <Text style={{ color: C.textMuted, fontSize: 10, marginTop: 4 }}>
          Searches GameFAQs for the title — copy the guide URL and paste it here.
        </Text>
      </Field>

      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        <Btn label="Cancel" kind="secondary" onPress={() => navigation.goBack()} />
        <Btn label="Add Game" onPress={save} />
      </View>
    </ScrollView>
  );
}
