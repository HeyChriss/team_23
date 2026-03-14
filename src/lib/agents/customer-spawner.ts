/**
 * Customer Spawner — pulls customers from the DB pool.
 * Falls back to hard-coded personalities if DB is empty.
 */

import { getDb } from "@/lib/db";
import type { CustomerPersonality } from "./types";

// ── DB → CustomerPersonality mapping ────────────────────────────────────────

interface DbCustomer {
  id: number;
  name: string;
  customer_type: string;
  preferences: string;
  budget_preference: string;
  group_size_preference: number;
  preferred_showtime: string;
}

function mapDbToPersonality(c: DbCustomer): CustomerPersonality {
  const genres = c.preferences
    ? c.preferences.split(",").map((s) => s.trim()).filter(Boolean)
    : ["Drama"];

  let budgetSensitivity: "low" | "medium" | "high" = "medium";
  const bp = (c.budget_preference || "").toLowerCase();
  if (bp.includes("budget") || bp.includes("discount") || bp.includes("bargain")) {
    budgetSensitivity = "high";
  } else if (bp.includes("premium") || bp.includes("luxury") || bp.includes("vip")) {
    budgetSensitivity = "low";
  }

  let timePreference: "matinee" | "evening" | "any" = "any";
  const ps = (c.preferred_showtime || "").toLowerCase();
  if (ps.includes("matinee") || ps.includes("morning") || ps.includes("early")) {
    timePreference = "matinee";
  } else if (ps.includes("evening") || ps.includes("night") || ps.includes("prime") || ps.includes("late")) {
    timePreference = "evening";
  }

  const spontaneity =
    c.customer_type === "buyer"
      ? 0.6 + Math.random() * 0.3
      : 0.2 + Math.random() * 0.3;

  return {
    name: c.name,
    favoriteGenres: genres,
    budgetSensitivity,
    groupSize: c.group_size_preference || 2,
    timePreference,
    spontaneity,
  };
}

function getUnbookedCustomers(type: string): DbCustomer[] {
  try {
    const db = getDb();
    return db
      .prepare(
        `SELECT c.id, c.name, c.customer_type, c.preferences, c.budget_preference,
                c.group_size_preference, c.preferred_showtime
         FROM customers c
         WHERE c.customer_type = ?
           AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.customer_name = c.name)
         ORDER BY RANDOM()`
      )
      .all(type) as DbCustomer[];
  } catch {
    return [];
  }
}

// ── Hard-coded fallback pool ────────────────────────────────────────────────

const FALLBACK_PERSONALITIES: CustomerPersonality[] = [
  { name: "Alex Rivera", favoriteGenres: ["Action", "Sci-Fi"], budgetSensitivity: "low", groupSize: 2, timePreference: "evening", spontaneity: 0.7 },
  { name: "Sarah Chen", favoriteGenres: ["Drama", "Romance"], budgetSensitivity: "medium", groupSize: 2, timePreference: "evening", spontaneity: 0.4 },
  { name: "Marcus Johnson", favoriteGenres: ["Horror", "Thriller"], budgetSensitivity: "low", groupSize: 3, timePreference: "evening", spontaneity: 0.8 },
  { name: "Emily Park", favoriteGenres: ["Comedy", "Animation"], budgetSensitivity: "high", groupSize: 4, timePreference: "matinee", spontaneity: 0.3 },
  { name: "David Thompson", favoriteGenres: ["Action", "Adventure"], budgetSensitivity: "medium", groupSize: 1, timePreference: "any", spontaneity: 0.6 },
  { name: "Lisa Wang", favoriteGenres: ["Drama", "Mystery"], budgetSensitivity: "low", groupSize: 2, timePreference: "evening", spontaneity: 0.5 },
  { name: "Jake Morrison", favoriteGenres: ["Comedy", "Action"], budgetSensitivity: "high", groupSize: 5, timePreference: "matinee", spontaneity: 0.9 },
  { name: "Priya Patel", favoriteGenres: ["Drama", "Biography"], budgetSensitivity: "medium", groupSize: 2, timePreference: "evening", spontaneity: 0.4 },
  { name: "Carlos Ramirez", favoriteGenres: ["Action", "Crime"], budgetSensitivity: "medium", groupSize: 3, timePreference: "evening", spontaneity: 0.7 },
  { name: "Nina Volkov", favoriteGenres: ["Thriller", "Mystery"], budgetSensitivity: "low", groupSize: 1, timePreference: "any", spontaneity: 0.6 },
  { name: "Tyler Brooks", favoriteGenres: ["Sci-Fi", "Fantasy"], budgetSensitivity: "high", groupSize: 2, timePreference: "matinee", spontaneity: 0.5 },
  { name: "Mia Santos", favoriteGenres: ["Romance", "Comedy"], budgetSensitivity: "medium", groupSize: 2, timePreference: "evening", spontaneity: 0.3 },
  { name: "Ryan O'Brien", favoriteGenres: ["War", "Drama"], budgetSensitivity: "low", groupSize: 1, timePreference: "any", spontaneity: 0.4 },
  { name: "Zara Ahmed", favoriteGenres: ["Fantasy", "Adventure"], budgetSensitivity: "medium", groupSize: 4, timePreference: "matinee", spontaneity: 0.8 },
  { name: "Chris Nakamura", favoriteGenres: ["Horror", "Comedy"], budgetSensitivity: "high", groupSize: 3, timePreference: "evening", spontaneity: 0.9 },
  { name: "Olivia Turner", favoriteGenres: ["Musical", "Drama"], budgetSensitivity: "low", groupSize: 2, timePreference: "evening", spontaneity: 0.2 },
  { name: "Derek Kim", favoriteGenres: ["Action", "Thriller"], budgetSensitivity: "medium", groupSize: 1, timePreference: "any", spontaneity: 0.7 },
  { name: "Hannah Green", favoriteGenres: ["Comedy", "Romance"], budgetSensitivity: "high", groupSize: 2, timePreference: "matinee", spontaneity: 0.5 },
  { name: "Victor Mendez", favoriteGenres: ["Crime", "Mystery"], budgetSensitivity: "low", groupSize: 2, timePreference: "evening", spontaneity: 0.6 },
  { name: "Sophie Laurent", favoriteGenres: ["Drama", "Documentary"], budgetSensitivity: "medium", groupSize: 1, timePreference: "matinee", spontaneity: 0.3 },
  { name: "Brandon Lee", favoriteGenres: ["Sci-Fi", "Action"], budgetSensitivity: "high", groupSize: 4, timePreference: "evening", spontaneity: 0.8 },
  { name: "Rachel Foster", favoriteGenres: ["Animation", "Fantasy"], budgetSensitivity: "medium", groupSize: 5, timePreference: "matinee", spontaneity: 0.4 },
  { name: "Omar Hassan", favoriteGenres: ["Drama", "War"], budgetSensitivity: "low", groupSize: 2, timePreference: "evening", spontaneity: 0.5 },
  { name: "Jasmine Wu", favoriteGenres: ["Horror", "Sci-Fi"], budgetSensitivity: "medium", groupSize: 1, timePreference: "evening", spontaneity: 0.7 },
  { name: "Luke Anderson", favoriteGenres: ["Western", "Adventure"], budgetSensitivity: "high", groupSize: 3, timePreference: "any", spontaneity: 0.6 },
];

// ── Spawn functions ─────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Spawn active customers from DB (buyer type) or fallback pool.
 */
export function spawnActiveCustomers(count?: number): CustomerPersonality[] {
  const n = count ?? randBetween(2, 5);

  // Try DB first — "buyer" customers who haven't booked yet
  const dbCustomers = getUnbookedCustomers("buyer");
  if (dbCustomers.length > 0) {
    return dbCustomers.slice(0, n).map(mapDbToPersonality);
  }

  // Fallback to hard-coded
  const result: CustomerPersonality[] = [];
  const used = new Set<string>();
  for (let i = 0; i < n; i++) {
    const candidate = pick(FALLBACK_PERSONALITIES);
    if (used.has(candidate.name)) continue;
    used.add(candidate.name);
    result.push({ ...candidate });
  }
  return result;
}

/**
 * Spawn passive customers from DB (persuadable type) or fallback pool.
 */
export function spawnPassiveCustomers(count?: number): CustomerPersonality[] {
  const n = count ?? randBetween(1, 3);

  // Try DB first — "persuadable" customers who haven't booked yet
  const dbCustomers = getUnbookedCustomers("persuadable");
  if (dbCustomers.length > 0) {
    return dbCustomers.slice(0, n).map(mapDbToPersonality);
  }

  // Fallback to hard-coded
  const result: CustomerPersonality[] = [];
  const used = new Set<string>();
  for (let i = 0; i < n; i++) {
    const candidate = pick(FALLBACK_PERSONALITIES);
    if (used.has(candidate.name)) continue;
    used.add(candidate.name);
    result.push({ ...candidate });
  }
  return result;
}
