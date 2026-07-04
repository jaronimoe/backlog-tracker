import React, { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { C } from "../theme";
import { Btn, Field, Input } from "../components/ui";
import { getSetting, setSetting, SETTINGS } from "../db/database";
import { saveIgdbCreds, verifyIgdbCreds } from "../services/igdb";
import { pickAndImport, shareExport } from "../services/exportImport";
import { pickAndImportCsv } from "../services/csvImport";

export default function SettingsScreen() {
  const [recentDays, setRecentDays] = useState(getSetting(SETTINGS.recentDays, "14"));
  const [currentWindow, setCurrentWindow] = useState(getSetting(SETTINGS.currentWindow, "year"));
  const [grace, setGrace] = useState(getSetting(SETTINGS.streakGrace, "1"));
  const [threshold, setThreshold] = useState(getSetting(SETTINGS.genreBlockThreshold, "1"));
  const [igdbId, setIgdbId] = useState(getSetting(SETTINGS.igdbClientId, ""));
  const [igdbSecret, setIgdbSecret] = useState(getSetting(SETTINGS.igdbClientSecret, ""));

  const [verifying, setVerifying] = useState(false);

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

      <Text style={h.title}>Bulk add from CSV</Text>
      <Text style={{ color: C.textMuted, fontSize: 11, marginBottom: 10 }}>
        Adds games from a CSV with columns: title, original_entry, platform,
        year_started, year_completed, status, hours, notes. Existing titles are
        skipped — safe to run multiple times.
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Btn
          label="Import games CSV"
          kind="secondary"
          onPress={async () => {
            try {
              const r = await pickAndImportCsv();
              if (r == null) return;
              Alert.alert(
                "CSV import done",
                `${r.added} games added (${r.completed} completed, ${r.onHold} on hold).\n` +
                  `${r.skippedDuplicates} skipped as duplicates, ${r.skippedInvalid} invalid rows.`
              );
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
