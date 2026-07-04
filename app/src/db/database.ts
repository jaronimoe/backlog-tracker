import * as SQLite from "expo-sqlite";

export const db = SQLite.openDatabaseSync("backlog.db");

/**
 * Versioned migrations. NEVER edit an existing migration — always append.
 * This guarantees forward compatibility: user data survives every app update.
 */
const MIGRATIONS: string[][] = [
  // v1 — initial schema
  [
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      cover_url TEXT,
      release_year INTEGER,
      platform_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      start_date TEXT,
      start_precision TEXT,
      imported_minutes INTEGER NOT NULL DEFAULT 0,
      last_played_override TEXT,
      on_hold INTEGER NOT NULL DEFAULT 0,
      on_hold_note TEXT,
      on_mind INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      rating INTEGER,
      final_note TEXT,
      progress_method TEXT NOT NULL DEFAULT 'checkbox',
      manual_percent REAL NOT NULL DEFAULT 0,
      walkthrough_url TEXT,
      walkthrough_text TEXT,
      walkthrough_position INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      UNIQUE(game_id, tag)
    )`,
    `CREATE TABLE IF NOT EXISTS milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      is_stretch INTEGER NOT NULL DEFAULT 0,
      done INTEGER NOT NULL DEFAULT 0,
      sort INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      minutes INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      UNIQUE(game_id, date)
    )`,
    `CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      at TEXT NOT NULL DEFAULT (datetime('now')),
      text TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS mind_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      added INTEGER NOT NULL,
      at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_game ON sessions(game_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date)`,
    `CREATE INDEX IF NOT EXISTS idx_tags_game ON tags(game_id)`,
  ],
  // v2 — external ids for storefront imports (steam appid, gog id, …)
  [
    `CREATE TABLE IF NOT EXISTS game_external_ids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      UNIQUE(source, external_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_external_game ON game_external_ids(game_id)`,
  ],
];

export function migrate() {
  db.execSync("PRAGMA foreign_keys = ON");
  db.execSync(
    "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)"
  );
  const row = db.getFirstSync<{ version: number }>(
    "SELECT version FROM schema_version LIMIT 1"
  );
  let version = row?.version ?? 0;
  if (row == null) db.runSync("INSERT INTO schema_version (version) VALUES (0)");

  for (let v = version; v < MIGRATIONS.length; v++) {
    db.withTransactionSync(() => {
      for (const stmt of MIGRATIONS[v]) db.execSync(stmt);
      db.runSync("UPDATE schema_version SET version = ?", [v + 1]);
    });
  }
}

// ---- settings helpers ----
export function getSetting(key: string, fallback: string): string {
  const row = db.getFirstSync<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    [key]
  );
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  db.runSync(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}

export const SETTINGS = {
  recentDays: "recent_days", // Recently Played window (default 14)
  currentWindow: "current_window", // 'year' | number of days (default 'year')
  streakGrace: "streak_grace", // 1|2|3 (default 1)
  genreBlockThreshold: "genre_block_threshold", // default 1
  igdbClientId: "igdb_client_id",
  igdbClientSecret: "igdb_client_secret",
  steamApiKey: "steam_api_key",
  steamId: "steam_id", // SteamID64
};
