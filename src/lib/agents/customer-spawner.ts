import type { CustomerPersonality } from "./types";

const PERSONALITIES: CustomerPersonality[] = [
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

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Spawn a batch of active customers for this tick.
 */
export function spawnActiveCustomers(count?: number): CustomerPersonality[] {
  const n = count ?? randBetween(2, 5);
  const result: CustomerPersonality[] = [];
  const used = new Set<string>();

  for (let i = 0; i < n; i++) {
    const candidate = pick(PERSONALITIES);
    if (used.has(candidate.name)) continue;
    used.add(candidate.name);
    result.push({ ...candidate });
  }

  return result;
}

/**
 * Spawn passive customers who might respond to promotions.
 */
export function spawnPassiveCustomers(count?: number): CustomerPersonality[] {
  const n = count ?? randBetween(1, 3);
  const result: CustomerPersonality[] = [];
  const used = new Set<string>();

  for (let i = 0; i < n; i++) {
    const candidate = pick(PERSONALITIES);
    if (used.has(candidate.name)) continue;
    used.add(candidate.name);
    result.push({ ...candidate });
  }

  return result;
}
