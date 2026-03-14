#!/usr/bin/env node
const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(process.cwd(), "movies.db");
const db = new Database(DB_PATH);

const CUSTOMERS = [
  { name: "Emma Rodriguez", type: "buyer", age: 28, prefs: "Romance, Comedy", tier: "Gold", freq: "regular", budget: "standard", showtime: "evening", concessions: 1, group: 2, notes: "Date night regular" },
  { name: "Marcus Chen", type: "buyer", age: 34, prefs: "Action, Sci-Fi", tier: "Platinum", freq: "frequent", budget: "premium", showtime: "evening", concessions: 1, group: 1, notes: "IMAX enthusiast" },
  { name: "Sarah Mitchell", type: "persuadable", age: 22, prefs: "Comedy, Drama", tier: "None", freq: "rare", budget: "budget", showtime: "matinee", concessions: 0, group: 3, notes: "Price-sensitive, needs deals" },
  { name: "James Wilson", type: "buyer", age: 45, prefs: "Documentary, Drama", tier: "Silver", freq: "occasional", budget: "standard", showtime: "matinee", concessions: 1, group: 1, notes: "Prefers weekday matinees" },
  { name: "Olivia Kim", type: "persuadable", age: 19, prefs: "Horror, Thriller", tier: "None", freq: "rare", budget: "budget", showtime: "late_night", concessions: 1, group: 4, notes: "Student, responds to flash sales" },
  { name: "David Thompson", type: "buyer", age: 52, prefs: "Western, War", tier: "Gold", freq: "regular", budget: "premium", showtime: "evening", concessions: 1, group: 2, notes: "Classic film fan" },
  { name: "Ava Martinez", type: "persuadable", age: 26, prefs: "Romance, Musical", tier: "None", freq: "occasional", budget: "standard", showtime: "evening", concessions: 1, group: 2, notes: "Needs combo deals to convert" },
  { name: "Ethan Brooks", type: "buyer", age: 31, prefs: "Action, Adventure", tier: "Silver", freq: "frequent", budget: "standard", showtime: "evening", concessions: 1, group: 1, notes: "Opening weekend buyer" },
  { name: "Sophie Nguyen", type: "persuadable", age: 24, prefs: "Animation, Family", tier: "None", freq: "rare", budget: "budget", showtime: "matinee", concessions: 1, group: 4, notes: "Family outings, needs family pack promo" },
  { name: "Ryan Foster", type: "buyer", age: 38, prefs: "Sci-Fi, Mystery", tier: "Platinum", freq: "frequent", budget: "premium", showtime: "late_night", concessions: 1, group: 1, notes: "Midnight screening fan" },
  { name: "Isabella Garcia", type: "persuadable", age: 21, prefs: "Comedy, Romance", tier: "None", freq: "occasional", budget: "budget", showtime: "matinee", concessions: 0, group: 2, notes: "Student discount works" },
  { name: "Noah Anderson", type: "buyer", age: 29, prefs: "Thriller, Crime", tier: "Gold", freq: "regular", budget: "standard", showtime: "evening", concessions: 1, group: 2, notes: "Likes Dolby Atmos" },
  { name: "Mia Johnson", type: "persuadable", age: 35, prefs: "Drama, Biography", tier: "Silver", freq: "rare", budget: "standard", showtime: "matinee", concessions: 1, group: 1, notes: "Busy parent, needs convenience" },
  { name: "Liam O'Brien", type: "buyer", age: 42, prefs: "Action, War", tier: "Gold", freq: "regular", budget: "premium", showtime: "evening", concessions: 1, group: 3, notes: "Guys night out" },
  { name: "Chloe Williams", type: "persuadable", age: 18, prefs: "Horror, Comedy", tier: "None", freq: "rare", budget: "budget", showtime: "late_night", concessions: 1, group: 4, notes: "Teen group, promo codes effective" },
  { name: "Alexander Park", type: "buyer", age: 47, prefs: "Documentary, Crime", tier: "Platinum", freq: "frequent", budget: "premium", showtime: "matinee", concessions: 1, group: 1, notes: "Weekend matinee regular" },
  { name: "Harper Lee", type: "persuadable", age: 30, prefs: "Romance, Drama", tier: "None", freq: "occasional", budget: "standard", showtime: "evening", concessions: 1, group: 2, notes: "Date night, needs 2-for-1" },
  { name: "Benjamin Clark", type: "buyer", age: 55, prefs: "Western, Drama", tier: "Gold", freq: "regular", budget: "standard", showtime: "matinee", concessions: 1, group: 2, notes: "Senior matinee regular" },
  { name: "Lily Zhang", type: "persuadable", age: 23, prefs: "Animation, Fantasy", tier: "None", freq: "rare", budget: "budget", showtime: "evening", concessions: 1, group: 3, notes: "Anime fan, event-driven" },
  { name: "Daniel Brown", type: "buyer", age: 33, prefs: "Sci-Fi, Action", tier: "Silver", freq: "frequent", budget: "premium", showtime: "evening", concessions: 1, group: 1, notes: "3D/IMAX preferred" },
];

const stmt = db.prepare(`
  INSERT INTO customers (name, customer_type, age, preferences, loyalty_tier, visit_frequency, budget_preference, preferred_showtime, interested_in_concessions, group_size_preference, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Clear existing stub data and re-seed
db.prepare("DELETE FROM customers").run();

for (const c of CUSTOMERS) {
  stmt.run(c.name, c.type, c.age, c.prefs, c.tier, c.freq, c.budget, c.showtime, c.concessions, c.group, c.notes);
}

console.log(`Seeded ${CUSTOMERS.length} customers.`);
db.close();
