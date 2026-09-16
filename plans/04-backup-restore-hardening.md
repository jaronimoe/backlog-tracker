# 04 — Backup/restore hardening

| Severity | Effort | Wave | Files |
|----------|--------|------|-------|
| medium (wrong data after restoring older backups; unflagged secrets in plain export) | M | 3, after 01 | `app/src/services/exportImport.ts`, `app/src/db/database.ts`, `app/src/screens/SettingsScreen.tsx` (help text only) |

## Problems

1. **Restore skips data migrations.** `restoreData` (`services/exportImport.ts:83-119`) wipes the
   tables and inserts the export's rows straight into the *current* schema. Missing columns take
   their defaults, but the `UPDATE` migrations that transform data are never re-run. Only the v6
   watermark seed is hand-patched (lines 104-116). Consequences: a `schema_version < 4` export
   restores ratings on the old 1–10 scale into the 5-star UI; a `< 9` export (after plan 01) restores
   Steam links without per-appid watermarks; every future data migration needs another hand patch
   that will be forgotten.
2. **Plain export contains secrets.** `TABLES` (line 7) exports the whole `settings` table, so an
   unencrypted backup holds `steam_api_key`, `igdb_client_secret` and `llm_token` in cleartext. The
   Settings copy implies this but doesn't say it.
3. **Cache litter.** Each export writes `backlog-<kind>-<timestamp>.json` to the cache directory
   (line 37) and nothing deletes them.
4. **Newer-version exports fail opaquely** with an SQLite "table games has no column named …" error.

## Fix

### 1. Migration replay (`db/database.ts` + `restoreData`)

Add to `database.ts`:

```ts
export const CURRENT_SCHEMA_VERSION = MIGRATIONS.length;

/**
 * Re-run migrations [fromVersion, current) against already-current tables. Used after a backup
 * restore so data-transforming UPDATEs (v4 rating remap, v6/v7/v9 watermark seeds, …) apply to the
 * restored rows. Schema statements are idempotent (IF NOT EXISTS) or, for ADD COLUMN, fail with
 * "duplicate column name", which is the only error swallowed here. Does not touch schema_version.
 */
export function replayMigrations(fromVersion: number): void
```

Implementation: for each `v` from `fromVersion` to `MIGRATIONS.length - 1`, for each statement,
`try { db.execSync(stmt) } catch (e) { if (!/duplicate column name/i.test(String(e))) throw e; }`.
Callers wrap it in their own `withTx`.

In `restoreData`: after the inserts, still inside the `withTx`, call
`replayMigrations(data.schema_version ?? 0)` and delete the hand-written v6/v7 block. Add a comment
on why the v4 rating remap is safe here: it only runs when the export predates v4, which is exactly
when its ratings are still 1–10.

In `importFromJson`: if `(data.schema_version ?? 0) > CURRENT_SCHEMA_VERSION`, throw
`"This backup was made by a newer version of the app — update the app first."` before touching the DB.

### 2. Plain-export warning (`SettingsScreen.tsx` only)

Decision (user, 2026-09-16): plain exports keep the secrets; the user is warned and decides.
No filtering in `exportJson`, no special handling in `restoreData`.

- On "Export plain": if at least one of `steam_api_key`, `igdb_client_secret`, `llm_token` is
  non-empty, show
  `Alert.alert("Plain export includes your API keys", "The file will contain your Steam API key, IGDB client secret and AI token in cleartext. Anyone who gets the file can use them. Choose Export encrypted to protect them.", [Cancel, { text: "Export anyway", style: "destructive", onPress: () => shareExport()… }])`.
  With no keys stored, export directly (no nag).
- Settings "Backup & Sync" text: replace the encryption sentence with "Plain export includes your
  API keys and tokens in cleartext (you will be warned); encrypted export protects them with a
  passphrase (AES-256-GCM)."

### 3. Cache cleanup (`shareExport`)

Before writing the new file: `readDirectoryAsync(FileSystem.cacheDirectory)`, delete every entry
matching `/^backlog-(export|encrypted)-\d+\.json$/` with `deleteAsync(uri, { idempotent: true })`.
Ignore errors from this step (best effort). Still uses `expo-file-system/legacy`, as the file
already does.

## Acceptance criteria

- `npx tsc --noEmit` passes.
- Reason through and note in the commit message: restoring a `schema_version: 3` export halves
  ratings once; a `schema_version: 8` export gets `game_external_ids.synced_minutes` seeded from
  `games.steam_synced_minutes` by the v9 replay; a `schema_version: 9` export replays only idempotent
  statements and changes nothing.
- "Export plain" with keys stored shows the warning first; Cancel exports nothing; "Export anyway"
  produces the same file as before. With no keys stored there is no dialog.
- Two consecutive exports leave one `backlog-*.json` in the cache directory.

## Manual test

With a Steam key saved: Export plain → warning → Export anyway → file contains the key. Import it →
Settings still shows the key. Export encrypted → import with the passphrase → games and keys restored.

## Conflicts

`database.ts`: plan 01 appends migration v9; merge 01 first so the replay covers it. Plan 07 adds a
separate helper to the same file. `SettingsScreen.tsx`: this plan changes help text only; plans
02/03/07 edit other regions.
