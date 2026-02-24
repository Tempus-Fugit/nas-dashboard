// db/sqlite.mjs – SQLite database initialization and snapshot query helpers.
// Uses better-sqlite3 for synchronous access (safe in a single-process Node app).

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_DIR = path.join(__dirname, '../../logs');
const DB_PATH = path.join(DB_DIR, 'snapshots.db');

// Ensure the logs directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// ── Schema initialization ─────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp    TEXT    NOT NULL,
    filer        TEXT    NOT NULL,
    export       TEXT    NOT NULL,
    mountpoint   TEXT    NOT NULL,
    total_kb     INTEGER NOT NULL,
    used_kb      INTEGER NOT NULL,
    free_kb      INTEGER NOT NULL,
    percent_used REAL    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots_filer_export
    ON snapshots (filer, export);

  CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp
    ON snapshots (timestamp);
`);

// ── Prepared statements ───────────────────────────────────────────────────────
const insertSnapshot = db.prepare(`
  INSERT INTO snapshots (timestamp, filer, export, mountpoint, total_kb, used_kb, free_kb, percent_used)
  VALUES (@timestamp, @filer, @export, @mountpoint, @total_kb, @used_kb, @free_kb, @percent_used)
`);

const deleteOldSnapshots = db.prepare(`
  DELETE FROM snapshots
  WHERE timestamp < datetime('now', '-180 days')
`);

const selectAllTrends = db.prepare(`
  SELECT timestamp, filer, export, mountpoint, total_kb, used_kb, free_kb, percent_used
  FROM snapshots
  WHERE timestamp >= datetime('now', ? )
  ORDER BY timestamp ASC
`);

const selectExportTrends = db.prepare(`
  SELECT timestamp, filer, export, mountpoint, total_kb, used_kb, free_kb, percent_used
  FROM snapshots
  WHERE filer = ? AND export = ?
    AND timestamp >= datetime('now', ? )
  ORDER BY timestamp ASC
`);

// ── Exported functions ────────────────────────────────────────────────────────

/**
 * Insert one snapshot row. Wrapped in a transaction for safety.
 */
const insertSnapshotTx = db.transaction((row) => {
  insertSnapshot.run(row);
});

/**
 * Insert multiple snapshot rows in a single transaction.
 */
const insertManySnapshots = db.transaction((rows) => {
  for (const row of rows) {
    insertSnapshot.run(row);
  }
});

/**
 * Delete snapshots older than 180 days.
 */
function pruneOldSnapshots() {
  const result = deleteOldSnapshots.run();
  return result.changes;
}

/**
 * Get all snapshot data for the last N days.
 * @param {number} days
 * @returns {Array}
 */
function getTrends(days = 180) {
  const interval = `-${days} days`;
  return selectAllTrends.all(interval);
}

/**
 * Get snapshot data for a specific export over the last N days.
 * @param {string} filer
 * @param {string} exportPath
 * @param {number} days
 * @returns {Array}
 */
function getExportTrends(filer, exportPath, days = 180) {
  const interval = `-${days} days`;
  return selectExportTrends.all(filer, exportPath, interval);
}

export {
  db,
  insertSnapshotTx,
  insertManySnapshots,
  pruneOldSnapshots,
  getTrends,
  getExportTrends,
};
