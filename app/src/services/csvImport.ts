import * as FileSystem from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";
import { db } from "../db/database";
import { addGame, addNote, setOnHold } from "../db/repo";
import { normalizeTitle } from "../logic/normalize";
import { findFuzzyMatch } from "../logic/fuzzy";
import { RowResult, startImport } from "./importQueue";

/**
 * Bulk-add games from a CSV with the header:
 *   title,original_entry,platform,year_started,year_completed,status,hours,notes
 *
 * Runs on the shared non-blocking import queue (see importQueue.ts).
 * Duplicates are detected via normalized titles plus the conservative
 * fuzzy tier (logic/fuzzy.ts), so re-runs are safe.
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
  existing: Map<string, number>
): RowResult {
  const get = (i: number) => (i >= 0 && i < cells.length ? cells[i].trim() : "");

  const title = get(cols.title);
  if (!title) return { status: "invalid", detail: "missing title" };
  const norm = normalizeTitle(title);
  if (existing.has(norm))
    return { status: "duplicate", detail: "already in library" };
  const fuzzy = findFuzzyMatch(norm, existing);
  if (fuzzy)
    return { status: "duplicate", detail: `≈ "${fuzzy.norm}" in library` };

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

  existing.set(norm, id);
  return { status: "added", detail };
}

// ---------- entry points ----------

/** Validate + queue a CSV import. Throws synchronously on bad input. */
export function startCsvImport(text: string, fileName: string | null) {
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

  const existing = new Map<string, number>(
    db
      .getAllSync<{ id: number; t: string }>("SELECT id, title t FROM games")
      .map((r) => [normalizeTitle(r.t), r.id])
  );

  startImport(
    fileName ?? "CSV import",
    dataRows.map((r) => r[cols.title]?.trim() || "(missing title)"),
    (i) => importRow(dataRows[i], cols, existing)
  );
}

/** Pick a CSV file and start a non-blocking import. Returns false on cancel. */
export async function pickAndStartCsvImport(): Promise<boolean> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ["text/csv", "text/comma-separated-values", "text/plain", "application/csv"],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return false;
  const raw = await FileSystem.readAsStringAsync(res.assets[0].uri);
  startCsvImport(raw, res.assets[0].name ?? null);
  return true;
}
