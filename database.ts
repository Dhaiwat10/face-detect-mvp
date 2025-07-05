import Database from 'better-sqlite3';

const db = new Database('faces.db');

export function setupDatabase() {
  // Drop old tables in the correct order to respect foreign key constraints
  db.exec('DROP TABLE IF EXISTS detections');
  db.exec('DROP TABLE IF EXISTS persons');
  db.exec('DROP TABLE IF EXISTS images');

  // Create persons table for unique individuals
  db.prepare(`
    CREATE TABLE IF NOT EXISTS persons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descriptor TEXT NOT NULL
    )
  `).run();

  // Create images table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE
    )
  `).run();

  // Create detections table to link persons to their appearances in images
  db.prepare(`
    CREATE TABLE IF NOT EXISTS detections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL,
      image_id INTEGER NOT NULL,
      box_x REAL NOT NULL,
      box_y REAL NOT NULL,
      box_width REAL NOT NULL,
      box_height REAL NOT NULL,
      FOREIGN KEY (person_id) REFERENCES persons (id),
      FOREIGN KEY (image_id) REFERENCES images (id)
    )
  `).run();

  console.log('Database setup with new schema complete.');
}

export default db; 