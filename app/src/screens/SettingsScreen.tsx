import React, { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { C } from "../theme";
import { Btn, Field, Input } from "../components/ui";
import { getSetting, setSetting, SETTINGS, LLM_DEFAULTS } from "../db/database";
import { saveIgdbCreds, verifyIgdbCreds } from "../services/igdb";
import { saveLlmConfig, verifyLlm } from "../services/llm";
import { pickAndImport, shareExport } from "../services/exportImport";
import { useNavigation } from "@react-navigation/native";
import { pickAndStartCsvImport } from "../services/csvImport";
import { startSteamImport } from "../services/steam";

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const [recentDays, setRecentDays] = useState(getSetting(SETTINGS.recentDays, "14"));
  const [currentWindow, setCurrentWindow] = useState(getSetting(SETTINGS.currentWindow, "year"));
  const [grace, setGrace] = useState(getSetting(SETTINGS.streakGrace, "1"));
  const [threshold, setThreshold] = useState(getSetting(SETTINGS.genreBlockThreshold, "1"));
  const [igdbId, setIgdbId] = useState(getSetting(SETTINGS.igdbClientId, ""));
  const [igdbSecret, setIgdbSecret] = useState(getSetting(SETTINGS.igdbClientSecret, ""));
  const [steamKey, setSteamKey] = useState(getSetting(SETTINGS.steamApiKey, ""));
  const [steamId, setSteamId] = useState(getSetting(SETTINGS.steamId, ""));
  const [steamBusy, setSteamBusy] = useState(false);
  const [steamResync, setSteamResync] = useState(false);

  const [verifying, setVerifying] = useState(false);

  const [llmToken, setLlmToken] = useState(getSetting(SETTINGS.llmToken, ""));
  const [llmBaseUrl, setLlmBaseUrl] = useState(getSetting(SETTINGS.llmBaseUrl, LLM_DEFAULTS.baseUrl));
  const [llmModel, setLlmModel] = useState(getSetting(SETTINGS.llmModel, LLM_DEFAULTS.model));
  const [llmBusy, setLlmBusy] = useState(false);

  const saveLlm = async () => {
    saveLlmConfig(llmToken, llmBaseUrl, llmModel);
    if (!llmToken.trim()) {
      Alert.alert("Saved", "AI recap disabled (no token).");
      return;
    }
    setLlmBusy(true);
    try {
      await verifyLlm({
        token: llmToken.trim(),
        baseUrl: (llmBaseUrl.trim() || LLM_DEFAULTS.baseUrl),
        model: llmModel.trim() || LLM_DEFAULTS.model,
      });
      Alert.alert("Saved", "Model reachable ✓");
    } catch (e: any) {
      Alert.alert("Model test failed", `Settings were saved, but the test call failed:\n\n${String(e?.message ?? e)}`);
    } finally {
      setLlmBusy(false);
    }
  };

  const save = async () => {
    setSetting(SETTINGS.recentDays, recentDays || "14");
    setSetting(SETTINGS.currentWindow, currentWindow || "year");
    setSetting(SETTINGS.streakGrace, grace || "1");
    setSetting(SETTINGS.genreBlockThreshold, threshold || "1");
    saveIgdbCreds(igdbId, igdbSecret);
    if (igdbId.trim() && igdbSecret.trim()) {
      setVerifying(true);
      try {
        await verifyIgdbCreds(igdbId, igdbSecret);
        Alert.alert("Saved", "Settings updated. IGDB credentials verified ✓");
      } catch (e: any) {
        Alert.alert(
          "IGDB credentials invalid",
          `Settings were saved, but the Twitch/IGDB credentials could not be verified: ${String(e?.message ?? e)}`
        );
      } finally {
        setVerifying(false);
      }
    } else {
      Alert.alert("Saved", "Settings updated.");
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bgPrimary }}
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
    >
      <Text style={h.title}>Windows</Text>
      <Field label="Recently Played window (days)">
        <Input value={recentDays} onChangeText={setRecentDays} keyboardType="numeric" />
      </Field>
      <Field label='Current window — "year" or a number of days'>
        <Input value={currentWindow} onChangeText={setCurrentWindow} autoCapitalize="none" />
      </Field>

      <Text style={h.title}>Streaks</Text>
      <Field label="Streak grace period (days of break tolerated: 1–3)">
        <Input value={grace} onChangeText={setGrace} keyboardType="numeric" />
      </Field>

      <Text style={h.title}>Genre Blocker</Text>
      <Field label="Warn when ≥ N games of the genre are already active">
        <Input value={threshold} onChangeText={setThreshold} keyboardType="numeric" />
      </Field>

      <Text style={h.title}>IGDB (metadata)</Text>
      <Text style={{ color: C.textMuted, fontSize: 11, marginBottom: 10 }}>
        Free via a Twitch developer account (dev.twitch.tv). Optional — you can
        always add games by title only.
      </Text>
      <Field label="Client ID">
        <Input value={igdbId} onChangeText={setIgdbId} autoCapitalize="none" />
      </Field>
      <Field label="Client Secret">
        <Input value={igdbSecret} onChangeText={setIgdbSecret} autoCapitalize="none" secureTextEntry />
      </Field>

      <Btn label={verifying ? "Verifying IGDB…" : "Save settings"} onPress={save} style={{ marginBottom: 30 }} />

      <Text style={h.title}>AI recap (“Where was I?”)</Text>
      <Text style={{ color: C.textMuted, fontSize: 11, marginBottom: 10 }}>
        On-demand. On a walkthrough-tracked game, generates a short recap of
        where you left off from the walkthrough text up to your marked position.
        Default is GitHub Models (free, rate-limited): create a fine-grained
        token at github.com/settings/personal-access-tokens with Account
        permission “Models: read-only”. Any OpenAI-compatible endpoint works
        too — just change the base URL and model.
      </Text>
      <Field label="API token">
        <Input value={llmToken} onChangeText={setLlmToken} autoCapitalize="none" secureTextEntry placeholder="github_pat_…" />
      </Field>
      <Field label="Base URL (OpenAI-compatible, no /chat/completions)">
        <Input value={llmBaseUrl} onChangeText={setLlmBaseUrl} autoCapitalize="none" placeholder={LLM_DEFAULTS.baseUrl} />
      </Field>
      <Field label="Model">
        <Input value={llmModel} onChangeText={setLlmModel} autoCapitalize="none" placeholder={LLM_DEFAULTS.model} />
      </Field>
      <Btn label={llmBusy ? "Testing model…" : "Save & test model"} onPress={saveLlm} style={{ marginBottom: 30 }} />

      <Text style={h.title}>Backup & Sync</Text>
      <Text style={{ color: C.textMuted, fontSize: 11, marginBottom: 10 }}>
        Export your full library as JSON (share to iCloud Drive / Google Drive),
        import it on another device. Import replaces all local data.
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Btn
          label="Export JSON"
          kind="secondary"
          onPress={() => shareExport().catch((e) => Alert.alert("Export failed", String(e)))}
        />
        <Btn
          label="Import JSON"
          kind="secondary"
          onPress={async () => {
            try {
              const n = await pickAndImport();
              if (n >= 0) Alert.alert("Imported", `${n} games restored.`);
            } catch (e) {
              Alert.alert("Import failed", String(e));
            }
          }}
        />
      </View>

      <Text style={h.title}>Steam library</Text>
      <Text style={{ color: C.textMuted, fontSize: 11, marginBottom: 10 }}>
        Imports your owned games with playtime. Needs your Web API key
        (steamcommunity.com/dev/apikey) and SteamID64; the profile's "Game
        details" must be Public. Games matching existing entries are merged and
        flagged with a source:steam tag; never-played games get status:unplayed.
        Safe to re-run — already-linked games are skipped unless “Re-sync
        playtime” is checked.
      </Text>
      <Field label="Steam Web API key">
        <Input value={steamKey} onChangeText={setSteamKey} autoCapitalize="none" secureTextEntry />
      </Field>
      <Field label="SteamID64 (17 digits — steamid.io helps)">
        <Input value={steamId} onChangeText={setSteamId} keyboardType="numeric" />
      </Field>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Btn
          label={steamBusy ? "Fetching library…" : "Import Steam library"}
          kind="secondary"
          onPress={async () => {
            setSetting(SETTINGS.steamApiKey, steamKey.trim());
            setSetting(SETTINGS.steamId, steamId.trim());
            setSteamBusy(true);
            try {
              await startSteamImport(steamResync);
              setTimeout(() => navigation.navigate("Import"), 150);
            } catch (e: any) {
              Alert.alert("Steam import failed", String(e?.message ?? e));
            } finally {
              setSteamBusy(false);
            }
          }}
        />
        <Pressable
          onPress={() => setSteamResync((v) => !v)}
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          hitSlop={8}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              borderWidth: 1.5,
              borderColor: steamResync ? C.accent : C.textMuted,
              backgroundColor: steamResync ? C.accent : "transparent",

              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {steamResync && (
              <Text style={{ color: C.bgPrimary, fontSize: 13, fontWeight: "700" }}>✓</Text>
            )}
          </View>
          <Text style={{ color: C.textPrimary, fontSize: 12 }}>Re-sync playtime</Text>
        </Pressable>
      </View>

      <Text style={h.title}>Bulk add from CSV</Text>
      <Text style={{ color: C.textMuted, fontSize: 11, marginBottom: 10 }}>
        Adds games from a CSV with columns: title, original_entry, platform,
        year_started, year_completed, status, hours, notes. Existing titles are
        skipped — safe to run multiple times. Runs in the background: watch
        progress on the temporary 📥 Import tab.
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Btn
          label="Import games CSV"
          kind="secondary"
          onPress={async () => {
            try {
              const started = await pickAndStartCsvImport();
              // give the Import tab a moment to mount, then jump to it
              if (started) setTimeout(() => navigation.navigate("Import"), 150);
            } catch (e) {
              Alert.alert("CSV import failed", String(e));
            }
          }}
        />
      </View>
    </ScrollView>
  );
}

const h = {
  title: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: "700" as const,
    marginBottom: 10,
    marginTop: 10,
  },
};
