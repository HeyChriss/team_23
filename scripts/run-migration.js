#!/usr/bin/env node
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH = path.join(process.cwd(), "movies.db");
const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");

const target = process.argv[2];

function runMigration(db, sqlPath) {
  const sql = fs.readFileSync(sqlPath, "utf8");
  // Split on semicolon followed by newline (end of statement), keep statements intact
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--"));

  for (const stmt of statements) {
    if (!stmt.trim()) continue;
    try {
      db.exec(stmt + ";");
      console.log("OK:", stmt.slice(0, 70).replace(/\s+/g, " ") + (stmt.length > 70 ? "..." : ""));
    } catch (e) {
      if (e.message.includes("duplicate column name") || e.message.includes("already exists")) {
        console.log("SKIP (already exists):", stmt.slice(0, 50).replace(/\s+/g, " ") + "...");
      } else {
        console.error("FAILED:", stmt.slice(0, 100));
        throw e;
      }
    }
  }
}

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const applied = new Set(db.prepare("SELECT name FROM _migrations").all().map((r) => r.name));

const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

for (const file of files) {
  const name = file.replace(".sql", "");
  if (target && name !== target) continue;
  if (applied.has(name)) {
    console.log("SKIP (already applied):", name);
    continue;
  }

  const sqlPath = path.join(MIGRATIONS_DIR, file);
  console.log("\n--- Running:", name, "---");
  runMigration(db, sqlPath);
  db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(name);
}

db.close();
console.log("\nMigrations complete.");
