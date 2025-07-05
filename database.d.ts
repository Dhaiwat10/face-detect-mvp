import type { Database as DB } from 'better-sqlite3';
export declare function initializeDatabase(userDataPath: string): DB;
export declare function setupDatabase(db: DB): void;
export default function getDb(): DB;
