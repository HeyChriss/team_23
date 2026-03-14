#!/usr/bin/env node
const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(process.cwd(), "movies.db");
const db = new Database(DB_PATH);

const customer = {
  name: "Jordan Hayes",
  type: "buyer",
  age: 27,
  prefs: "Action, Adventure",
  tier: "Silver",
  freq: "occasional",
  budget: "standard",
  showtime: "evening",
  concessions: 1,
  group: 2,
  notes: "New to the area, exploring the theater",
};

db.prepare(
  `INSERT INTO customers (name, customer_type, age, preferences, loyalty_tier, visit_frequency, budget_preference, preferred_showtime, interested_in_concessions, group_size_preference, notes)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
).run(
  customer.name,
  customer.type,
  customer.age,
  customer.prefs,
  customer.tier,
  customer.freq,
  customer.budget,
  customer.showtime,
  customer.concessions,
  customer.group,
  customer.notes
);

console.log(`Added ${customer.name} to the customer pool.`);
db.close();
