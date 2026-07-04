import { useSyncExternalStore } from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";
import { db } from "../db/database";
import { addGame, addNote, setOnHold } from "../db/repo";

/**
 * Bulk-add games from a CSV with the header:
 *   title,original_entry,platform,year_started,year_completed,status,hours,notes
 *
 * The import runs non-blocking: rows are processed in small chunks on the JS
 * thread with a yield between chunks, so the UI stays responsive. Progress is
 * published through a tiny observable store (useImportState) that also drives
 * a temporary "Import" tab while an import is active.
 */

// ---------- tiny quote-aware CSV parser ----------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += c;
    }
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

// ---------- import queue store ----------

export type QueueItemStatus = "pending" | "added" | "duplicate" | "invalid";

export interface QueueItem {
  title: string;
  status: QueueItemStatus;
  detail?: string; // e.g. "completed 2019", "on hold"
}

export interface ImportState {
  active: boolean; // Import tab visible
  running: boolean; // rows still being processed
  fileName: string | null;
  items: QueueItem[];
  processed: number;
  added: number;
  skippedDuplicates: number;
  skippedInvalid: number;
  error: string | null;
}

const IDLE: ImportState = {
  active: false,
  running: false,
  fileName: null,
  items: [],
  processed: 0,
  added: 0,
  skippedDuplicates: 0,
  skippedInvalid: 0,
  error: null,
};

let state: ImportState = IDLE;
const listeners = new Set<() => void>();

function setState(patch: Partial<ImportState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useImportState(): ImportState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
}

export function dismissImport() {
  if (!state.running) state = IDLE;
  listeners.forEach((l) => l());
}

// ---------- row mapping ----------

function parseHours(raw: string): number {
  const m = raw.trim().match(/^(\d+(?:[.,]\d+)?)/);
  if (!m) return 0;
  return Math.round(parseFloat(m[1].replace(",", ".")) * 60);
}

function yearToDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})$/);
  return m ? `${m[1]}-01-01` : null;
}

interface Cols {
  title: number;
  orig: number;
  platform: number;
  started: number;
  completed: number;
  status: number;
  hours: number;
  notes: number;
}

/** Import one row (inside a transaction). Returns the resulting item status. */
function importRow(
  cells: string[],
  cols: Cols,
  existing: Set<string>
): { status: QueueItemStatus; detail?: string } {
  const get = (i: number) => (i >= 0 && i < cells.length ? cells[i].trim() : "");

  const title = get(cols.title);
  if (!title) return { status: "invalid", detail: "missing title" };
  if (existing.has(title.toLowerCase()))
    return { status: "duplicate", detail: "already in library" };
  existing.add(title.toLowerCase());

  const platform = get(cols.platform);
  const status = get(cols.status).toLowerCase();
  const startDate = yearToDate(get(cols.started));
  const completedDate = yearToDate(get(cols.completed)) ?? startDate;
  const minutes = parseHours(get(cols.hours));
  const notes = get(cols.notes);
  const orig = get(cols.orig);

  const tags: string[] = [];
  if (platform)
    tags.push(
      `platform:${platform.toLowerCase().replace(/\s*\/\s*/g, "-").replace(/\s+/g, "-")}`
    );
  if (status === "abandoned") tags.push("status:abandoned");
  if (status === "maybe") tags.push("status:maybe");

  const id = addGame({
    title,
    platform_summary: platform || null,
    start_date: startDate,
    start_precision: startDate ? "year" : null,
    imported_minutes: minutes,
    last_played_override: status === "completed" ? completedDate : startDate,
    tags,
  });

  let detail: string | undefined;
  if (status === "completed") {
    db.runSync("UPDATE games SET completed_at = ? WHERE id = ?", [
      completedDate ?? "1970-01-01",
      id,
    ]);
    db.runSync(
      "UPDATE milestones SET done = 1 WHERE game_id = ? AND name = 'Completed'",
      [id]
    );
    detail = `completed ${completedDate?.slice(0, 4) ?? ""}`.trim();
  } else if (status === "halted" || status === "abandoned") {
    setOnHold(id, true, notes || `${status} (imported)`);
    detail = "on hold";
  } else if (status) {
    detail = status.replace("_", " ");
  }

  const noteParts: string[] = [];
  if (notes) noteParts.push(notes);
  if (orig && orig.toLowerCase() !== title.toLowerCase())
    noteParts.push(`(imported as: ${orig})`);
  if (noteParts.length > 0) addNote(id, noteParts.join(" "));

  return { status: "added", detail };
}

// ---------- non-blocking runner ----------

const CHUNK_SIZE = 15;
const DISMISS_AFTER_MS = 6000;

const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Parse the CSV, publish the queue, then process rows chunk-by-chunk,
 * yielding to the UI between chunks. Each chunk commits its own transaction;
 * duplicates are skipped, so a crashed/killed import can simply be re-run.
 *
 * Validation errors (bad header, empty file) throw synchronously; errors
 * during the background run are published to the store instead.
 */
export function startCsvImport(text: string, fileName: string | null) {
  if (state.running) throw new Error("An import is already running");

  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV has no data rows");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col("title") < 0) throw new Error('CSV header must contain a "title" column');
  const cols: Cols = {
    title: col("title"),
    orig: col("original_entry"),
    platform: col("platform"),
    started: col("year_started"),
    completed: col("year_completed"),
    status: col("status"),
    hours: col("hours"),
    notes: col("notes"),
  };

  // normalize overflow cells (unquoted commas in the last column)
  const dataRows = rows.slice(1).map((r) =>
    r.length > header.length
      ? [...r.slice(0, header.length - 1), r.slice(header.length - 1).join(", ")]
      : r
  );

  const items: QueueItem[] = dataRows.map((r) => ({
    title: r[cols.title]?.trim() || "(missing title)",
    status: "pending",
  }));

  state = {
    ...IDLE,
    active: true,
    running: true,
    fileName,
    items,
  };
  listeners.forEach((l) => l());

  void run(dataRows, cols); // fire and forget; errors land in the store
}

async function run(dataRows: string[][], cols: Cols) {
  try {
    await yieldToUI(); // let the Import tab appear before work starts

    const existing = new Set(
      db.getAllSync<{ t: string }>("SELECT lower(title) t FROM games").map((r) => r.t)
    );

    for (let i = 0; i < dataRows.length; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, dataRows.length);
      const nextItems = [...state.items];
      let { added, skippedDuplicates, skippedInvalid } = state;

      db.withTransactionSync(() => {
        for (let j = i; j < end; j++) {
          const r = importRow(dataRows[j], cols, existing);
          nextItems[j] = { ...nextItems[j], status: r.status, detail: r.detail };
          if (r.status === "added") added++;
          else if (r.status === "duplicate") skippedDuplicates++;
          else skippedInvalid++;
        }
      });

      setState({
        items: nextItems,
        processed: end,
        added,
        skippedDuplicates,
        skippedInvalid,
      });
      await yieldToUI();
    }

    setState({ running: false });

    // tab vanishes a few seconds after completion
    setTimeout(() => {
      if (!state.running) dismissImport();
    }, DISMISS_AFTER_MS);
  } catch (e) {
    setState({ running: false, error: String(e) });
  }
}

/** Pick a CSV file and start a non-blocking import. Returns false on cancel. */
export async function pickAndStartCsvImport(): Promise<boolean> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ["text/csv", "text/comma-separated-values", "text/plain", "application/csv"],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return false;
  const raw = await FileSystem.readAsStringAsync(res.assets[0].uri);
  // fire and forget — progress is visible on the Import tab
  void startCsvImport(raw, res.assets[0].name ?? null);
  return true;
}
