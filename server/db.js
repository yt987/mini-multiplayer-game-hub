import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db;
export function initDB() {
  const file = process.env.DB_FILE || path.join(__dirname, 'data.sqlite');
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS wins (
    nickname TEXT PRIMARY KEY,
    wins INTEGER NOT NULL DEFAULT 0
  );`);
}
export function recordWin(nickname) {
  const up = db.prepare(`INSERT INTO wins(nickname, wins) VALUES(?, 1)
    ON CONFLICT(nickname) DO UPDATE SET wins = wins + 1;`);
  up.run(nickname);
}
export function topWins(limit=10) {
  const stmt = db.prepare(`SELECT nickname, wins FROM wins ORDER BY wins DESC, nickname ASC LIMIT ?;`);
  return stmt.all(limit);
}