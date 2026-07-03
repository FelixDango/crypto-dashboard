import { openDatabase, runMigrations, getDatabasePath } from './db-utils.mjs';

const db = openDatabase();
runMigrations(db);
db.close();

console.log(`Database migrated at ${getDatabasePath()}`);
