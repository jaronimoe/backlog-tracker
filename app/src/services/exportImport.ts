import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { db, withTx } from "../db/database";
import { encryptExport, decryptExport, isEncryptedEnvelope } from "./crypto";

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

export async function shareExport(passphrase?: string) {
  const json = exportJson();
  const content = passphrase
    ? await encryptExport(json, passphrase)
    : json;
  const suffix = passphrase ? "encrypted" : "export";
  const path = `${FileSystem.cacheDirectory}backlog-${suffix}-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(path, content);
  await Sharing.shareAsync(path, { mimeType: "application/json" });
}

/**
 * Pick a file and detect whether it's encrypted.
 * Returns { raw, encrypted } or null on cancel.
 */
export async function pickExportFile(): Promise<{
  raw: string;
  encrypted: boolean;
} | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: "application/json",
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const raw = await FileSystem.readAsStringAsync(res.assets[0].uri);
  const parsed = JSON.parse(raw);
  return { raw, encrypted: isEncryptedEnvelope(parsed) };
}

/**
 * Import from raw JSON (plain or already-decrypted).
 * Returns number of games imported.
 */
export function importFromJson(raw: string): number {
  const data = JSON.parse(raw);
  if (data.app !== "backlog-tracker") throw new Error("Not a backlog-tracker export");
  return restoreData(data);
}

/**
 * Decrypt then import. Returns number of games imported.
 * Throws on wrong passphrase.
 */
export async function importEncrypted(
  raw: string,
  passphrase: string
): Promise<number> {
  const plain = await decryptExport(raw, passphrase);
  return importFromJson(plain);
}

/** Core restore: wipes all tables and inserts from parsed export data. */
function restoreData(data: Record<string, any>): number {
  withTx(() => {
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
    // Back-compat: pre-v6 exports lack the Steam watermark. Seed it from the
    // import lump so a first re-sync counts only genuinely new playtime instead
    // of dumping the whole total onto one day. Games with tracked time but no
    // lump (merge policy skipped their playtime) get the -1 "unknown baseline"
    // sentinel — mirrors migrations v6+v7. Post-v6 exports carry the real
    // watermarks (including legitimate zeros), so only patch older exports.
    if ((data.schema_version ?? 0) < 6) {
      db.runSync(
        `UPDATE games SET steam_synced_minutes = imported_minutes
           WHERE steam_synced_minutes = 0 AND imported_minutes > 0
             AND id IN (SELECT game_id FROM game_external_ids WHERE source = 'steam')`
      );
      db.runSync(
        `UPDATE games SET steam_synced_minutes = -1
           WHERE steam_synced_minutes = 0 AND imported_minutes = 0
             AND id IN (SELECT game_id FROM game_external_ids WHERE source = 'steam')
             AND id IN (SELECT game_id FROM sessions GROUP BY game_id HAVING SUM(minutes) > 0)`
      );
    }
  });
  return (data.games ?? []).length;
}

/** Full replace import (legacy convenience). Returns games imported or -1 on cancel. */
export async function pickAndImport(): Promise<number> {
  const picked = await pickExportFile();
  if (!picked) return -1;
  if (picked.encrypted) throw new Error("File is encrypted — use the passphrase import flow");
  return importFromJson(picked.raw);
}
