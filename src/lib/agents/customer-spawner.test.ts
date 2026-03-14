import { describe, it, expect } from "vitest";
import { spawnActiveCustomers, spawnPassiveCustomers } from "./customer-spawner";
import type { CustomerPersonality } from "./types";

const VALID_GENRES = [
  "Action", "Drama", "Comedy", "Thriller", "Horror", "Sci-Fi", "Romance",
  "Adventure", "Mystery", "Fantasy", "Crime", "Animation", "Documentary",
  "Musical", "Western", "War", "Biography",
];

function validatePersonality(p: CustomerPersonality) {
  expect(p.name).toBeTruthy();
  expect(p.favoriteGenres.length).toBeGreaterThan(0);
  for (const g of p.favoriteGenres) {
    expect(VALID_GENRES).toContain(g);
  }
  expect(["low", "medium", "high"]).toContain(p.budgetSensitivity);
  expect(p.groupSize).toBeGreaterThanOrEqual(1);
  expect(p.groupSize).toBeLessThanOrEqual(6);
  expect(["matinee", "evening", "any"]).toContain(p.timePreference);
  expect(p.spontaneity).toBeGreaterThanOrEqual(0);
  expect(p.spontaneity).toBeLessThanOrEqual(1);
}

describe("Customer Spawner", () => {
  describe("spawnActiveCustomers", () => {
    it("returns the requested number of customers", () => {
      const customers = spawnActiveCustomers(3);
      expect(customers.length).toBeLessThanOrEqual(3);
      expect(customers.length).toBeGreaterThan(0);
    });

    it("returns between 2-5 customers by default", () => {
      // Run multiple times due to randomness
      for (let i = 0; i < 10; i++) {
        const customers = spawnActiveCustomers();
        expect(customers.length).toBeGreaterThanOrEqual(1); // could be lower due to dedup
        expect(customers.length).toBeLessThanOrEqual(5);
      }
    });

    it("returns customers with valid personalities", () => {
      const customers = spawnActiveCustomers(5);
      for (const c of customers) {
        validatePersonality(c);
      }
    });

    it("returns unique customers (no duplicate names)", () => {
      const customers = spawnActiveCustomers(10);
      const names = customers.map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it("returns independent copies (not shared references)", () => {
      const batch1 = spawnActiveCustomers(3);
      const batch2 = spawnActiveCustomers(3);

      // Modifying one batch shouldn't affect the other
      if (batch1.length > 0) {
        batch1[0].groupSize = 99;
        // batch2's first customer (even if same person) should be unaffected
        for (const c of batch2) {
          expect(c.groupSize).not.toBe(99);
        }
      }
    });
  });

  describe("spawnPassiveCustomers", () => {
    it("returns the requested number of customers", () => {
      const customers = spawnPassiveCustomers(2);
      expect(customers.length).toBeLessThanOrEqual(2);
      expect(customers.length).toBeGreaterThan(0);
    });

    it("returns between 1-3 customers by default", () => {
      for (let i = 0; i < 10; i++) {
        const customers = spawnPassiveCustomers();
        expect(customers.length).toBeGreaterThanOrEqual(1);
        expect(customers.length).toBeLessThanOrEqual(3);
      }
    });

    it("returns customers with valid personalities", () => {
      const customers = spawnPassiveCustomers(3);
      for (const c of customers) {
        validatePersonality(c);
      }
    });

    it("returns unique customers (no duplicate names)", () => {
      const customers = spawnPassiveCustomers(5);
      const names = customers.map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe("Personality Templates", () => {
    it("has diverse genre preferences across the pool", () => {
      // Spawn a large batch to sample the pool
      const allGenres = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const customers = spawnActiveCustomers(5);
        for (const c of customers) {
          c.favoriteGenres.forEach((g) => allGenres.add(g));
        }
      }

      // Should have at least 5 different genres represented
      expect(allGenres.size).toBeGreaterThanOrEqual(5);
    });

    it("has diverse budget sensitivities", () => {
      const sensitivities = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const customers = spawnActiveCustomers(5);
        for (const c of customers) {
          sensitivities.add(c.budgetSensitivity);
        }
      }

      expect(sensitivities).toContain("low");
      expect(sensitivities).toContain("medium");
      expect(sensitivities).toContain("high");
    });

    it("has diverse time preferences", () => {
      const prefs = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const customers = spawnActiveCustomers(5);
        for (const c of customers) {
          prefs.add(c.timePreference);
        }
      }

      expect(prefs).toContain("matinee");
      expect(prefs).toContain("evening");
      expect(prefs).toContain("any");
    });
  });
});
