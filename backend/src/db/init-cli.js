import { config } from '../config/index.js';
import { openDatabase, seedDefaultSettings } from './database.js';
import { DEFAULT_SETTINGS } from '../services/settings.js';

const database = openDatabase(config.databasePath);
seedDefaultSettings(database, DEFAULT_SETTINGS);
const plots = database.prepare('SELECT COUNT(*) AS count FROM plots').get().count;
console.log(JSON.stringify({ databasePath: config.databasePath, plots, status: plots === 24 ? 'ok' : 'invalid' }, null, 2));
database.close();
