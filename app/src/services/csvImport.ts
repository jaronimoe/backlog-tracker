import * as FileSystem from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";
import { db } from "../db/database";
import { addGame, addNote, setOnHold } from "../db/repo";

/**
 * Bulk-add games from a CSV with the header:
 *   title,original_entry,platform,year_started,year_completed,status,hours,notes
 *
 * - Column order is taken from the header row (only `title` is required).
 * - Quoted fields (with embedded commas) are supported.
 * - Rows with EXTRA unquoted commas: overflow cells are joined back into the
 *   last column (notes), so slightly malformed rows still import.
 * - status: completed | in_progress | halted | abandoned | backlog | maybe
 * - hours may be fuzzy ("20?", "21.5") — leading number is used.
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

// ---------- import ----------

export interface CsvImportResult {
  added: number;
  skippedDuplicates: number;
  skippedInvalid: number;
  onHold: number;
  completed: number;
}

function parseHours(raw: string): number {
  const m = raw.trim().match(/^(\d+(?:[.,]\d+)?)/);
  if (!m) return 0;
  return Math.round(parseFloat(m[1].replace(",", ".")) * 60);
}

function yearToDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})$/);
  return m ? `${m[1]}-01-01` : null;
}

export function importGamesCsv(text: string): CsvImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV has no data rows");

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iTitle = col("title");
  if (iTitle < 0) throw new Error('CSV header must contain a "title" column');
  const iOrig = col("original_entry");
  const iPlatform = col("platform");
  const iStarted = col("year_started");
  const iCompleted = col("year_completed");
  const iStatus = col("status");
  const iHours = col("hours");
  const iNotes = col("notes");

  const result: CsvImportResult = {
    added: 0,
    skippedDuplicates: 0,
    skippedInvalid: 0,
    onHold: 0,
    completed: 0,
  };

  const existing = new Set(
    db
      .getAllSync<{ t: string }>("SELECT lower(title) t FROM games")
      .map((r) => r.t)
  );

  db.withTransactionSync(() => {
    for (const rawRow of rows.slice(1)) {
      // overflow cells (unquoted commas in the last column) -> join into last column
      let cells = rawRow;
      if (cells.length > header.length) {
        cells = [
          ...cells.slice(0, header.length - 1),
          cells.slice(header.length - 1).join(", "),
        ];
      }
      const get = (i: number) => (i >= 0 && i < cells.length ? cells[i].trim() : "");

      const title = get(iTitle);
      if (!title) {
        result.skippedInvalid++;
        continue;
      }
      if (existing.has(title.toLowerCase())) {
        result.skippedDuplicates++;
        continue;
      }
      existing.add(title.toLowerCase());

      const platform = get(iPlatform);
      const status = get(iStatus).toLowerCase();
      const startDate = yearToDate(get(iStarted));
      const completedDate = yearToDate(get(iCompleted)) ?? startDate;
      const minutes = parseHours(get(iHours));
      const notes = get(iNotes);
      const orig = get(iOrig);

      const tags: string[] = [];
      if (platform)
        tags.push(`platform:${platform.toLowerCase().replace(/\s*\/\s*/g, "-").replace(/\s+/g, "-")}`);
      if (status === "abandoned") tags.push("status:abandoned");
      if (status === "maybe") tags.push("status:maybe");

      const id = addGame({
        title,
        platform_summary: platform || null,
        start_date: startDate,
        start_precision: startDate ? "year" : null,
        imported_minutes: minutes,
        last_played_override:
          status === "completed" ? completedDate : startDate,
        tags,
      });

      if (status === "completed") {
        db.runSync(
          "UPDATE games SET completed_at = ? WHERE id = ?",
          [completedDate ?? "1970-01-01", id]
        );
        db.runSync(
          "UPDATE milestones SET done = 1 WHERE game_id = ? AND name = 'Completed'",
          [id]
        );
        result.completed++;
      } else if (status === "halted" || status === "abandoned") {
        setOnHold(id, true, notes || `${status} (imported)`);
        result.onHold++;
      }

      const noteParts: string[] = [];
      if (notes) noteParts.push(notes);
      if (orig && orig.toLowerCase() !== title.toLowerCase())
        noteParts.push(`(imported as: ${orig})`);
      if (noteParts.length > 0) addNote(id, noteParts.join(" "));

      result.added++;
    }
  });

  return result;
}

/** Pick a CSV file and import it. Returns null on cancel. */
export async function pickAndImportCsv(): Promise<CsvImportResult | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ["text/csv", "text/comma-separated-values", "text/plain", "application/csv"],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const raw = await FileSystem.readAsStringAsync(res.assets[0].uri);
  return importGamesCsv(raw);
}
