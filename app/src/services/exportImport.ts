import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { CURRENT_SCHEMA_VERSION, db, replayMigrations, withTx } from "../db/database";
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

/**
 * Delete export files left in the cache directory by earlier shares. Best effort:
 * a failed cleanup must never block the export itself. Only files this module
 * writes are matched, so a picked import copy (DocumentPicker's own cache copy)
 * is never touched.
 */
async function clearCachedExports() {
  try {
    const dir = FileSystem.cacheDirectory;
    if (!dir) return;
    for (const name of await FileSystem.readDirectoryAsync(dir)) {
      if (!/^backlog-(export|encrypted)-\d+\.json$/.test(name)) continue;
      await FileSystem.deleteAsync(dir + name, { idempotent: true });
    }
  } catch {
    // ignore — stale cache files are not worth failing an export over
  }
}

export async function shareExport(passphrase?: string) {
  await clearCachedExports();
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
  // A newer export can carry columns this build's tables don't have; inserting it
  // would fail mid-restore with a raw SQLite "no such column" error after the wipe.
  if ((data.schema_version ?? 0) > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      "This backup was made by a newer version of the app — update the app first."
    );
  }
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
    // The rows just inserted were written under `data.schema_version`: the tables
    // are current (missing columns took their defaults), but every migration the
    // export predates transformed data that is no longer here. Replay those
    // migrations over the restored rows so they end up in the same shape a
    // live database of that age would have after upgrading.
    //
    // The v4 rating remap (1–10 → 1–5 stars) is safe precisely because it is
    // keyed on the export's version: it runs only for exports older than v4,
    // which are exactly the ones whose ratings are still on the 1–10 scale.
    // Likewise the v6/v7 Steam watermark seeds (which this replaces) and the v9
    // per-appid playtime seed only touch exports that predate them.
    replayMigrations(data.schema_version ?? 0);
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
