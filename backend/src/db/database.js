import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations.js';
import { seedPlots } from './seed-plots.js';

export function openDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  runMigrations(database);
  seedPlots(database);
  return database;
}

export function seedDefaultSettings(database, defaults) {
  const time = new Date().toISOString();
  const insert = database.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING');
  database.transaction(() => {
    for (const [key, value] of Object.entries(defaults)) insert.run(key, JSON.stringify(value), time);
  })();
}
