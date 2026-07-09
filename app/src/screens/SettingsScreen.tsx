import React, { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import {
  C,
  TAG_TYPE_COLORS,
  THEMES,
  THEME_COLOR_KEYS,
  TAG_COLOR_KEYS,
  clearOverrides,
  hasOverrides,
  initTheme,
  setColorOverride,
  setTheme,
  themedStyles,
  useTheme,
} from "../theme";
import { Btn, Field, Input } from "../components/ui";
import { getSetting, setSetting, SETTINGS, LLM_DEFAULTS } from "../db/database";
import { saveIgdbCreds, verifyIgdbCreds } from "../services/igdb";
import { startIgdbMetadataSync } from "../services/igdbSync";
import { saveLlmConfig, verifyLlm } from "../services/llm";
import {
  pickExportFile,
  shareExport,
  importFromJson,
  importEncrypted,
} from "../services/exportImport";
import { useNavigation } from "@react-navigation/native";
import { pickAndStartCsvImport } from "../services/csvImport";
import { startSteamImport } from "../services/steam";

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const [recentDays, setRecentDays] = useState(getSetting(SETTINGS.recentDays, "14"));
  const [currentWindow, setCurrentWindow] = useState(getSetting(SETTINGS.currentWindow, "year"));
  const [grace, setGrace] = useState(getSetting(SETTINGS.streakGrace, "1"));
  const [playedMin, setPlayedMin] = useState(getSetting(SETTINGS.playedThreshold, "29"));
  const [threshold, setThreshold] = useState(getSetting(SETTINGS.genreBlockThreshold, "1"));
  const [igdbId, setIgdbId] = useState(getSetting(SETTINGS.igdbClientId, ""));
  const [igdbSecret, setIgdbSecret] = useState(getSetting(SETTINGS.igdbClientSecret, ""));
  const [steamKey, setSteamKey] = useState(getSetting(SETTINGS.steamApiKey, ""));
  const [steamId, setSteamId] = useState(getSetting(SETTINGS.steamId, ""));
  const [steamBusy, setSteamBusy] = useState(false);
  const [steamResync, setSteamResync] = useState(false);
  const [igdbSyncBusy, setIgdbSyncBusy] = useState(false);

  const [verifying, setVerifying] = useState(false);

  const [llmToken, setLlmToken] = useState(getSetting(SETTINGS.llmToken, ""));
  const [llmBaseUrl, setLlmBaseUrl] = useState(getSetting(SETTINGS.llmBaseUrl, LLM_DEFAULTS.baseUrl));
  const [llmModel, setLlmModel] = useState(getSetting(SETTINGS.llmModel, LLM_DEFAULTS.model));
  const [llmBusy, setLlmBusy] = useState(false);

  /**
   * Re-read every settings field from SQLite into component state.
   * Needed after an import: the DB is replaced underneath this mounted
   * screen, but useState initializers only ran at mount — without this the
   * inputs keep showing stale (e.g. empty) values, and a subsequent "Save"
   * would overwrite the freshly imported keys with those stale values.
   */
  const reloadFromDb = () => {
    setRecentDays(getSetting(SETTINGS.recentDays, "14"));
    setCurrentWindow(getSetting(SETTINGS.currentWindow, "year"));
    setGrace(getSetting(SETTINGS.streakGrace, "1"));
    setPlayedMin(getSetting(SETTINGS.playedThreshold, "29"));
    setThreshold(getSetting(SETTINGS.genreBlockThreshold, "1"));
    setIgdbId(getSetting(SETTINGS.igdbClientId, ""));
    setIgdbSecret(getSetting(SETTINGS.igdbClientSecret, ""));
    setSteamKey(getSetting(SETTINGS.steamApiKey, ""));
    setSteamId(getSetting(SETTINGS.steamId, ""));
    setLlmToken(getSetting(SETTINGS.llmToken, ""));
    setLlmBaseUrl(getSetting(SETTINGS.llmBaseUrl, LLM_DEFAULTS.baseUrl));
    setLlmModel(getSetting(SETTINGS.llmModel, LLM_DEFAULTS.model));
    // imported theme + color overrides take effect without an app restart
    initTheme();
  };

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
    setSetting(SETTINGS.playedThreshold, playedMin || "29");
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
      <Text style={h.title}>Appearance</Text>
      <AppearanceSection />

      <Text style={h.title}>Windows</Text>
      <Field label="Recently Played window (days)">
        <Input value={recentDays} onChangeText={setRecentDays} keyboardType="numeric" />
      </Field>
      <Field label='Current window — "year" or a number of days'>
        <Input value={currentWindow} onChangeText={setCurrentWindow} autoCapitalize="none" />
      </Field>
      <Field label="Counts as played above (minutes) — at or below stays “not yet played”">
        <Input value={playedMin} onChangeText={setPlayedMin} keyboardType="numeric" />
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
      <Text style={{ color: C.textMuted, fontSize: 11, marginBottom: 10 }}>
        Bulk-added games (CSV, Steam, title-only) are missing cover art, tags
        and release year. Sync fills in whatever is missing from IGDB — games
        that already have their metadata are skipped, so it's safe to re-run.
      </Text>
      <Btn
        label={igdbSyncBusy ? "Starting sync…" : "Sync art & tags from IGDB"}
        kind="secondary"
        onPress={() => {
          setIgdbSyncBusy(true);
          try {
            const n = startIgdbMetadataSync();
            if (n === 0) {
              Alert.alert(
                "Nothing to sync",
                "All games already have their IGDB metadata."
              );
            } else {
              setTimeout(() => navigation.navigate("Import"), 150);
            }
          } catch (e: any) {
            Alert.alert("IGDB sync failed", String(e?.message ?? e));
          } finally {
            setIgdbSyncBusy(false);
          }
        }}
        style={{ marginBottom: 14 }}
      />

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
        import it on another device. Import replaces all local data.{"\n\n"}
        🔒 Encrypted export protects your API keys with a passphrase
        (AES-256-GCM). Plain export works too — import auto-detects both.
      </Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Btn
          label="🔒 Export encrypted"
          kind="secondary"
          onPress={() =>
            Alert.prompt(
              "Set export passphrase",
              "Choose a passphrase to encrypt the backup. You'll need it to import on another device.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Export",
                  onPress: (pw?: string) => {
                    if (!pw?.trim()) {
                      Alert.alert("No passphrase", "Passphrase is required for encrypted export.");
                      return;
                    }
                    shareExport(pw.trim()).catch((e) =>
                      Alert.alert("Export failed", String(e))
                    );
                  },
                },
              ],
              "secure-text"
            )
          }
        />
        <Btn
          label="Export plain"
          kind="secondary"
          onPress={() => shareExport().catch((e) => Alert.alert("Export failed", String(e)))}
        />
        <Btn
          label="Import"
          kind="secondary"
          onPress={async () => {
            try {
              const picked = await pickExportFile();
              if (!picked) return;

              if (picked.encrypted) {
                Alert.prompt(
                  "Encrypted backup",
                  "Enter the passphrase used when exporting.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Decrypt & import",
                      onPress: async (pw?: string) => {
                        if (!pw?.trim()) return;
                        try {
                          const n = await importEncrypted(picked.raw, pw.trim());
                          reloadFromDb();
                          Alert.alert("Imported", `${n} games restored.`);
                        } catch (e: any) {
                          Alert.alert("Import failed", String(e?.message ?? e));
                        }
                      },
                    },
                  ],
                  "secure-text"
                );
              } else {
                const n = importFromJson(picked.raw);
                reloadFromDb();
                Alert.alert("Imported", `${n} games restored.`);
              }
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

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function ColorRow({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (hex: string) => void;
}) {
  const [text, setText] = useState(value);
  const trimmed = text.trim();
  const valid = HEX_RE.test(trimmed);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: C.border,
          backgroundColor: valid ? trimmed : value,
        }}
      />
      <Text style={{ color: C.textSecondary, fontSize: 12, flex: 1 }}>{label}</Text>
      <Input
        value={text}
        onChangeText={(t: string) => {
          setText(t);
          const v = t.trim();
          if (HEX_RE.test(v)) onCommit(v);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        style={{ width: 110, paddingVertical: 6, borderColor: valid ? C.border : C.accent }}
      />
    </View>
  );
}

function AppearanceSection() {
  const { name } = useTheme();
  const [customize, setCustomize] = useState(false);

  return (
    <View style={{ marginBottom: 20 }}>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        {Object.entries(THEMES).map(([key, t]) => {
          const active = key === name;
          return (
            <Pressable
              key={key}
              onPress={() => setTheme(key)}
              style={{
                flex: 1,
                backgroundColor: t.colors.bgSecondary,
                borderWidth: 2,
                borderColor: active ? C.accent : C.border,
                borderRadius: 8,
                padding: 10,
                alignItems: "center",
                gap: 6,
              }}
            >
              <View style={{ flexDirection: "row", gap: 4 }}>
                {[t.colors.bgPrimary, t.colors.bgCard, t.colors.accent, t.colors.progressFill].map(
                  (c, i) => (
                    <View
                      key={i}
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: c,
                        borderWidth: 1,
                        borderColor: "rgba(128,128,128,0.4)",
                      }}
                    />
                  )
                )}
              </View>
              <Text
                style={{
                  color: t.colors.textPrimary,
                  fontSize: 12,
                  fontWeight: active ? "700" : "400",
                }}
              >
                {t.label}
                {active && hasOverrides() ? " *" : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={() => setCustomize((v) => !v)} hitSlop={8}>
        <Text style={{ color: C.accent, fontSize: 12, marginBottom: 8 }}>
          {customize ? "▼" : "▶"} Customize colors
          {hasOverrides() ? " (modified)" : ""}
        </Text>
      </Pressable>

      {customize && (
        <View key={name}>
          <Text style={{ color: C.textMuted, fontSize: 11, marginBottom: 10 }}>
            Overrides the “{THEMES[name]?.label ?? name}” theme. Enter hex colors
            (#rgb or #rrggbb); changes apply live and are saved per theme.
          </Text>
          {THEME_COLOR_KEYS.map((k) => (
            <ColorRow
              key={`${name}.${k}`}
              label={k}
              value={C[k]}
              onCommit={(hex) => setColorOverride(k, hex)}
            />
          ))}
          <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 6, marginBottom: 8 }}>
            Tag colors
          </Text>
          {TAG_COLOR_KEYS.map((k) => (
            <ColorRow
              key={`${name}.tag.${k}`}
              label={`tag: ${k}`}
              value={TAG_TYPE_COLORS[k]}
              onCommit={(hex) => setColorOverride(k, hex, true)}
            />
          ))}
          {hasOverrides() && (
            <Btn
              label="Reset to theme defaults"
              kind="secondary"
              onPress={() =>
                Alert.alert("Reset colors?", `Remove all custom colors for “${THEMES[name]?.label}”.`, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Reset", style: "destructive", onPress: () => clearOverrides() },
                ])
              }
              style={{ marginTop: 6 }}
            />
          )}
        </View>
      )}
    </View>
  );
}

const h = themedStyles(() => ({
  title: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: "700" as const,
    marginBottom: 10,
    marginTop: 10,
  },
}));
