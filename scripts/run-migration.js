#!/usr/bin/env node
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH = path.join(process.cwd(), "movies.db");
const MIGRATION = process.argv[2] || "001_curator_movies";

const sqlPath = path.join(process.cwd(), "migrations", `${MIGRATION}.sql`);
if (!fs.existsSync(sqlPath)) {
  console.error(`Migration not found: ${sqlPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf8");
const db = new Database(DB_PATH);

// Run each statement (skip comments and empty lines)
const statements = sql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith("--"));

for (const stmt of statements) {
  try {
    db.exec(stmt + ";");
    console.log("OK:", stmt.slice(0, 60) + "...");
  } catch (e) {
    if (e.message.includes("duplicate column name")) {
      console.log("SKIP (column exists):", stmt.slice(0, 50) + "...");
    } else {
      throw e;
    }
  }
}

db.close();
console.log("Migration complete.");
