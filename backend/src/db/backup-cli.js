import { config } from '../config/index.js';
import { openDatabase } from './database.js';
import { createBackup } from '../services/backup.js';

const database = openDatabase(config.databasePath);
try {
  console.log(JSON.stringify(await createBackup(database, config.backupDir), null, 2));
} finally {
  database.close();
}
