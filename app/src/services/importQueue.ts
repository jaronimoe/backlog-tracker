import { useSyncExternalStore } from "react";
import { withTx } from "../db/database";

/**
 * Generic non-blocking import queue, shared by all importers (CSV, Steam, …).
 *
 * An importer supplies row titles plus a processRow callback; the queue runs
 * it in small chunks on the JS thread, yielding to the UI between chunks, and
 * publishes progress to subscribers (drives the temporary Import tab).
 */

export type QueueItemStatus =
  | "pending"
  | "added"
  | "merged"
  | "duplicate"
  | "invalid";

export interface QueueItem {
  title: string;
  status: QueueItemStatus;
  detail?: string;
}

export interface ImportState {
  active: boolean; // Import tab visible
  running: boolean; // rows still being processed
  label: string | null; // e.g. file name or "Steam library"
  items: QueueItem[];
  processed: number;
  added: number;
  merged: number;
  skippedDuplicates: number;
  skippedInvalid: number;
  error: string | null;
}

const IDLE: ImportState = {
  active: false,
  running: false,
  label: null,
  items: [],
  processed: 0,
  added: 0,
  merged: 0,
  skippedDuplicates: 0,
  skippedInvalid: 0,
  error: null,
};

let state: ImportState = IDLE;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function setState(patch: Partial<ImportState>) {
  state = { ...state, ...patch };
  notify();
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
  notify();
}

const CHUNK_SIZE = 15;
const DISMISS_AFTER_MS = 6000;
const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0));

export interface RowResult {
  status: Exclude<QueueItemStatus, "pending">;
  detail?: string;
}

/**
 * Start a queued import. processRow(i) performs the DB writes for row i
 * (called inside a per-chunk transaction) and returns its outcome.
 * Throws synchronously if an import is already running; runtime errors are
 * published to the store.
 */
export function startImport(
  label: string,
  titles: string[],
  processRow: (index: number) => RowResult
) {
  if (state.running) throw new Error("An import is already running");
  state = {
    ...IDLE,
    active: true,
    running: true,
    label,
    items: titles.map((t) => ({ title: t, status: "pending" as const })),
  };
  notify();
  void run(processRow); // fire and forget; errors land in the store
}

/**
 * Async variant for imports whose per-row work involves network calls
 * (e.g. IGDB metadata sync). Rows run sequentially; the row processor is
 * responsible for its own transactions and rate limiting.
 */
export function startAsyncImport(
  label: string,
  titles: string[],
  processRow: (index: number) => Promise<RowResult>
) {
  if (state.running) throw new Error("An import is already running");
  state = {
    ...IDLE,
    active: true,
    running: true,
    label,
    items: titles.map((t) => ({ title: t, status: "pending" as const })),
  };
  notify();
  void runAsync(processRow); // fire and forget; errors land in the store
}

async function runAsync(processRow: (index: number) => Promise<RowResult>) {
  try {
    await yieldToUI();
    const n = state.items.length;
    for (let i = 0; i < n; i++) {
      const r = await processRow(i);
      const nextItems = [...state.items];
      nextItems[i] = { ...nextItems[i], status: r.status, detail: r.detail };
      setState({
        items: nextItems,
        processed: i + 1,
        added: state.added + (r.status === "added" ? 1 : 0),
        merged: state.merged + (r.status === "merged" ? 1 : 0),
        skippedDuplicates:
          state.skippedDuplicates + (r.status === "duplicate" ? 1 : 0),
        skippedInvalid: state.skippedInvalid + (r.status === "invalid" ? 1 : 0),
      });
    }
    setState({ running: false });
    setTimeout(() => {
      if (!state.running) dismissImport();
    }, DISMISS_AFTER_MS);
  } catch (e) {
    setState({ running: false, error: String(e) });
  }
}

async function run(processRow: (index: number) => RowResult) {
  try {
    await yieldToUI(); // let the Import tab appear before work starts
    const n = state.items.length;

    for (let i = 0; i < n; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, n);
      const nextItems = [...state.items];
      let { added, merged, skippedDuplicates, skippedInvalid } = state;

      withTx(() => {
        for (let j = i; j < end; j++) {
          const r = processRow(j);
          nextItems[j] = { ...nextItems[j], status: r.status, detail: r.detail };
          if (r.status === "added") added++;
          else if (r.status === "merged") merged++;
          else if (r.status === "duplicate") skippedDuplicates++;
          else skippedInvalid++;
        }
      });

      setState({
        items: nextItems,
        processed: end,
        added,
        merged,
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
