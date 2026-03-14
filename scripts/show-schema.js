const db = require("better-sqlite3")("movies.db");

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
for (const t of tables) {
  console.log("\n=== TABLE:", t.name, "===");
  const cols = db.prepare("PRAGMA table_info(" + t.name + ")").all();
  cols.forEach((c) =>
    console.log("  ", c.name, c.type, c.notnull ? "NOT NULL" : "", c.dflt_value ? "DEFAULT " + c.dflt_value : "")
  );
}
const idx = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").all();
console.log("\n=== INDEXES ===");
idx.forEach((i) => console.log(i.name + ":", i.sql));
