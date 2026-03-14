import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";

// ── Test DB Setup ────────────────────────────────────────────────────────────
// Tests the passive customer's deterministic booking logic directly
// without LLM calls.

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      actors TEXT NOT NULL,
      category TEXT NOT NULL,
      length_minutes INTEGER NOT NULL,
      language TEXT NOT NULL DEFAULT 'English',
      director TEXT NOT NULL,
      release_date DATE NOT NULL,
      synopsis TEXT,
      poster_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE theaters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      seat_count INTEGER NOT NULL,
      screen_type TEXT NOT NULL DEFAULT 'Standard',
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE showtimes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movie_id INTEGER NOT NULL,
      theater_id INTEGER NOT NULL,
      show_date DATE NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      ticket_price REAL NOT NULL DEFAULT 12.00,
      seats_available INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      FOREIGN KEY (movie_id) REFERENCES movies(id),
      FOREIGN KEY (theater_id) REFERENCES theaters(id)
    );

    CREATE TABLE promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      discount_type TEXT NOT NULL,
      discount_value REAL NOT NULL,
      applicable_movie_id INTEGER,
      applicable_showtime_id INTEGER,
      applicable_category TEXT,
      min_tickets INTEGER NOT NULL DEFAULT 1,
      max_discount REAL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL DEFAULT 'promoter',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (applicable_movie_id) REFERENCES movies(id),
      FOREIGN KEY (applicable_showtime_id) REFERENCES showtimes(id)
    );

    CREATE TABLE promo_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promotion_id INTEGER NOT NULL,
      code TEXT NOT NULL UNIQUE,
      max_uses INTEGER NOT NULL DEFAULT 100,
      times_used INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (promotion_id) REFERENCES promotions(id)
    );

    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      showtime_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      num_tickets INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      discount_amount REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL,
      promo_code_id INTEGER,
      confirmation_code TEXT NOT NULL UNIQUE,
      booked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (showtime_id) REFERENCES showtimes(id),
      FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id)
    );

    CREATE TABLE simulation_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sim_time TEXT NOT NULL,
      event_type TEXT NOT NULL,
      agent TEXT NOT NULL,
      summary TEXT NOT NULL,
      data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed data
  db.exec(`
    INSERT INTO movies (id, name, actors, category, length_minutes, director, release_date)
    VALUES
      (1, 'Action Hero', 'Actor A', 'Action', 120, 'Dir 1', '2026-03-01'),
      (2, 'Love Story', 'Actor B', 'Romance', 110, 'Dir 2', '2026-03-01'),
      (3, 'Scary Night', 'Actor C', 'Horror', 95, 'Dir 3', '2026-03-01');

    INSERT INTO theaters (id, name, seat_count, screen_type)
    VALUES
      (1, 'Theater 1', 100, 'Standard'),
      (2, 'Theater 2', 150, 'IMAX');

    INSERT INTO showtimes (id, movie_id, theater_id, show_date, start_time, end_time, ticket_price, seats_available, status)
    VALUES
      (1, 1, 1, '2026-03-14', '10:00', '12:00', 12.00, 80, 'selling'),
      (2, 2, 1, '2026-03-14', '14:00', '16:00', 12.00, 60, 'selling'),
      (3, 3, 2, '2026-03-14', '18:00', '20:00', 18.00, 120, 'selling'),
      (4, 1, 2, '2026-03-14', '20:00', '22:00', 18.00, 0, 'sold_out');
  `);

  return db;
}

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  db.close();
});

describe("Passive Customer Logic (Deterministic)", () => {
  describe("Promo finding", () => {
    it("finds active promotions with valid codes", () => {
      // Create a promotion + code
      db.exec(`
        INSERT INTO promotions (id, name, description, discount_type, discount_value, start_date, end_date, is_active)
        VALUES (1, 'Flash Sale', '25% off', 'percent', 25, '2026-03-14', '2026-03-14', 1);
        INSERT INTO promo_codes (id, promotion_id, code, max_uses, times_used, is_active)
        VALUES (1, 1, 'FLASH25', 50, 0, 1);
      `);

      const promos = db
        .prepare(
          `SELECT p.id, p.name, p.discount_type, p.discount_value, pc.code, pc.id AS promo_code_id
           FROM promotions p
           JOIN promo_codes pc ON p.id = pc.promotion_id
           WHERE p.is_active = 1 AND pc.is_active = 1
             AND pc.times_used < pc.max_uses
             AND p.start_date <= ? AND p.end_date >= ?`
        )
        .all("2026-03-14", "2026-03-14") as Record<string, unknown>[];

      expect(promos).toHaveLength(1);
      expect(promos[0].name).toBe("Flash Sale");
      expect(promos[0].code).toBe("FLASH25");
    });

    it("excludes expired promotions", () => {
      db.exec(`
        INSERT INTO promotions (id, name, description, discount_type, discount_value, start_date, end_date, is_active)
        VALUES (1, 'Expired Sale', 'old deal', 'percent', 20, '2026-03-10', '2026-03-12', 1);
        INSERT INTO promo_codes (id, promotion_id, code, max_uses) VALUES (1, 1, 'OLD20', 50);
      `);

      const promos = db
        .prepare(
          `SELECT p.id FROM promotions p
           JOIN promo_codes pc ON p.id = pc.promotion_id
           WHERE p.is_active = 1 AND pc.is_active = 1
             AND p.start_date <= ? AND p.end_date >= ?`
        )
        .all("2026-03-14", "2026-03-14");

      expect(promos).toHaveLength(0);
    });

    it("excludes fully-used promo codes", () => {
      db.exec(`
        INSERT INTO promotions (id, name, description, discount_type, discount_value, start_date, end_date, is_active)
        VALUES (1, 'Used Up', 'no more', 'percent', 30, '2026-03-14', '2026-03-14', 1);
        INSERT INTO promo_codes (id, promotion_id, code, max_uses, times_used) VALUES (1, 1, 'USED30', 10, 10);
      `);

      const promos = db
        .prepare(
          `SELECT p.id FROM promotions p
           JOIN promo_codes pc ON p.id = pc.promotion_id
           WHERE p.is_active = 1 AND pc.is_active = 1
             AND pc.times_used < pc.max_uses
             AND p.start_date <= ? AND p.end_date >= ?`
        )
        .all("2026-03-14", "2026-03-14");

      expect(promos).toHaveLength(0);
    });
  });

  describe("Booking with promo", () => {
    it("creates a booking and decrements seats correctly", () => {
      const showtimeId = 1;
      const numTickets = 2;
      const unitPrice = 12.0;
      const discount = 6.0; // 25% off 2 tickets at $12 = $6
      const totalPrice = unitPrice * numTickets - discount;

      // Decrement seats
      db.prepare(
        "UPDATE showtimes SET seats_available = seats_available - ?, status = CASE WHEN seats_available - ? <= 0 THEN 'sold_out' ELSE 'selling' END WHERE id = ?"
      ).run(numTickets, numTickets, showtimeId);

      // Create booking
      db.prepare(
        `INSERT INTO bookings (showtime_id, customer_name, num_tickets, unit_price, discount_amount, total_price, confirmation_code)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(showtimeId, "Test Customer", numTickets, unitPrice, discount, totalPrice, "SIM-TEST-001");

      // Verify seats decremented
      const showtime = db.prepare("SELECT seats_available FROM showtimes WHERE id = ?").get(showtimeId) as { seats_available: number };
      expect(showtime.seats_available).toBe(78); // 80 - 2

      // Verify booking created
      const booking = db.prepare("SELECT * FROM bookings WHERE confirmation_code = ?").get("SIM-TEST-001") as Record<string, unknown>;
      expect(booking.num_tickets).toBe(2);
      expect(booking.discount_amount).toBe(6.0);
      expect(booking.total_price).toBe(18.0);
    });

    it("marks showtime as sold_out when seats hit zero", () => {
      const showtimeId = 1;
      const currentSeats = 80;

      db.prepare(
        "UPDATE showtimes SET seats_available = seats_available - ?, status = CASE WHEN seats_available - ? <= 0 THEN 'sold_out' ELSE 'selling' END WHERE id = ?"
      ).run(currentSeats, currentSeats, showtimeId);

      const showtime = db.prepare("SELECT status, seats_available FROM showtimes WHERE id = ?").get(showtimeId) as Record<string, unknown>;
      expect(showtime.status).toBe("sold_out");
      expect(showtime.seats_available).toBe(0);
    });

    it("increments promo code usage on booking", () => {
      db.exec(`
        INSERT INTO promotions (id, name, description, discount_type, discount_value, start_date, end_date)
        VALUES (1, 'Test', 'desc', 'percent', 20, '2026-03-14', '2026-03-14');
        INSERT INTO promo_codes (id, promotion_id, code, max_uses, times_used)
        VALUES (1, 1, 'TEST20', 50, 5);
      `);

      db.prepare("UPDATE promo_codes SET times_used = times_used + 1 WHERE id = ?").run(1);

      const pc = db.prepare("SELECT times_used FROM promo_codes WHERE id = 1").get() as { times_used: number };
      expect(pc.times_used).toBe(6);
    });
  });

  describe("Showtime availability for promo booking", () => {
    it("finds showtimes matching category promotion", () => {
      db.exec(`
        INSERT INTO promotions (id, name, description, discount_type, discount_value, applicable_category, start_date, end_date)
        VALUES (1, 'Action Deal', 'desc', 'percent', 30, 'Action', '2026-03-14', '2026-03-14');
      `);

      const showtimes = db
        .prepare(
          `SELECT s.id, m.name AS movie_name, m.category
           FROM showtimes s
           JOIN movies m ON s.movie_id = m.id
           WHERE s.show_date = ? AND s.status IN ('scheduled', 'selling')
             AND s.seats_available >= ?
             AND LOWER(m.category) = LOWER(?)
           ORDER BY s.start_time LIMIT 1`
        )
        .all("2026-03-14", 2, "Action") as Record<string, unknown>[];

      expect(showtimes).toHaveLength(1);
      expect(showtimes[0].movie_name).toBe("Action Hero");
    });

    it("excludes sold_out showtimes", () => {
      const showtimes = db
        .prepare(
          `SELECT s.id FROM showtimes s
           WHERE s.show_date = ? AND s.status IN ('scheduled', 'selling')
             AND s.seats_available >= 1`
        )
        .all("2026-03-14") as { id: number }[];

      // Showtime 4 is sold_out, so only 3 should appear
      expect(showtimes).toHaveLength(3);
      expect(showtimes.map((s) => s.id)).not.toContain(4);
    });

    it("excludes showtimes without enough seats for group", () => {
      // Showtime 1 has 80 seats, group of 100 shouldn't find it
      const showtimes = db
        .prepare(
          `SELECT s.id FROM showtimes s
           WHERE s.show_date = ? AND s.status IN ('scheduled', 'selling')
             AND s.seats_available >= ?`
        )
        .all("2026-03-14", 100) as { id: number }[];

      // Only showtime 3 has 120 seats available
      expect(showtimes).toHaveLength(1);
      expect(showtimes[0].id).toBe(3);
    });
  });

  describe("Discount calculations", () => {
    it("calculates percent discount correctly", () => {
      const unitPrice = 12.0;
      const numTickets = 3;
      const discountPercent = 25;

      const discount = (discountPercent / 100) * unitPrice * numTickets;
      expect(discount).toBe(9.0);

      const totalPrice = Math.max(0, Math.round((unitPrice * numTickets - discount) * 100) / 100);
      expect(totalPrice).toBe(27.0);
    });

    it("calculates fixed discount correctly", () => {
      const unitPrice = 18.0;
      const numTickets = 2;
      const discountFixed = 5.0;

      const discount = discountFixed * numTickets;
      expect(discount).toBe(10.0);

      const totalPrice = Math.max(0, Math.round((unitPrice * numTickets - discount) * 100) / 100);
      expect(totalPrice).toBe(26.0);
    });

    it("never produces negative total price", () => {
      const unitPrice = 5.0;
      const numTickets = 1;
      const hugeDiscount = 100.0;

      const discount = hugeDiscount * numTickets;
      const totalPrice = Math.max(0, Math.round((unitPrice * numTickets - discount) * 100) / 100);
      expect(totalPrice).toBe(0);
    });
  });
});
