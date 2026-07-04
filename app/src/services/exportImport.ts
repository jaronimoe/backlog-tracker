import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { db } from "../db/database";

const TABLES = [
  "settings",
  "games",
  "game_external_ids",
  "tags",
  "milestones",
  "sessions",
  "notes",
  "mind_events",
];

export function exportJson(): string {
  const version = db.getFirstSync<{ version: number }>(
    "SELECT version FROM schema_version LIMIT 1"
  );
  const data: Record<string, unknown> = {
    app: "backlog-tracker",
    exported_at: new Date().toISOString(),
    schema_version: version?.version ?? 0,
  };
  for (const t of TABLES) data[t] = db.getAllSync(`SELECT * FROM ${t}`);
  return JSON.stringify(data, null, 2);
}

export async function shareExport() {
  const json = exportJson();
  const path = `${FileSystem.cacheDirectory}backlog-export-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(path, json);
  await Sharing.shareAsync(path, { mimeType: "application/json" });
}

/** Full replace import. Returns number of games imported, or -1 on cancel. */
export async function pickAndImport(): Promise<number> {
  const res = await DocumentPicker.getDocumentAsync({
    type: "application/json",
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return -1;
  const raw = await FileSystem.readAsStringAsync(res.assets[0].uri);
  const data = JSON.parse(raw);
  if (data.app !== "backlog-tracker") throw new Error("Not a backlog-tracker export");

  db.withTransactionSync(() => {
    for (const t of [...TABLES].reverse()) db.runSync(`DELETE FROM ${t}`);
    for (const t of TABLES) {
      const rows = (data[t] ?? []) as Record<string, unknown>[];
      for (const row of rows) {
        const keys = Object.keys(row);
        db.runSync(
          `INSERT INTO ${t} (${keys.join(",")}) VALUES (${keys
            .map(() => "?")
            .join(",")})`,
          keys.map((k) => row[k] as any)
        );
      }
    }
  });
  return (data.games ?? []).length;
}
