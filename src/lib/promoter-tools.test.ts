import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  createPromotion,
  createPromoCode,
  createFlashSale,
  deactivatePromotion,
  detectLowFillShowtimes,
  bookTickets,
  getPromotionPerformance,
  getRevenueStats,
} from "./promoter-tools";

// ── Test DB Setup ────────────────────────────────────────────────────────────
// Each test gets a fresh in-memory SQLite database with seed data.

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
      language TEXT NOT NULL,
      director TEXT NOT NULL,
      release_date DATE NOT NULL
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
  `);

  // Seed movies
  db.exec(`
    INSERT INTO movies (name, actors, category, length_minutes, language, director, release_date) VALUES
      ('Thunder Valley', 'Actor A, Actor B', 'Action', 120, 'English', 'Dir A', '2026-01-01'),
      ('Love in Paris', 'Actor C, Actor D', 'Romance', 110, 'English', 'Dir B', '2026-02-14'),
      ('Night Terrors', 'Actor E, Actor F', 'Horror', 95, 'English', 'Dir C', '2026-03-01'),
      ('Family Fun', 'Actor G, Actor H', 'Animation', 90, 'English', 'Dir D', '2026-03-10'),
      ('The Code', 'Actor I, Actor J', 'Thriller', 130, 'English', 'Dir E', '2026-01-15');
  `);

  // Seed theaters
  db.exec(`
    INSERT INTO theaters (name, seat_count, screen_type) VALUES
      ('Theater 1', 300, 'IMAX'),
      ('Theater 2', 200, 'Standard'),
      ('Theater 3', 150, 'Dolby'),
      ('Theater 4', 100, 'Standard'),
      ('Theater 5', 80, '3D');
  `);

  // Seed showtimes — mix of fill levels
  const today = new Date().toISOString().split("T")[0];
  db.exec(`
    INSERT INTO showtimes (movie_id, theater_id, show_date, start_time, end_time, ticket_price, seats_available, status) VALUES
      (1, 1, '${today}', '09:00', '11:20', 18.00, 300, 'scheduled'),
      (1, 2, '${today}', '12:00', '14:20', 12.00, 180, 'selling'),
      (2, 3, '${today}', '14:00', '16:10', 16.00, 150, 'scheduled'),
      (3, 4, '${today}', '20:00', '21:45', 12.00, 10, 'selling'),
      (4, 5, '${today}', '10:00', '11:30', 15.00, 80, 'scheduled'),
      (5, 1, '${today}', '18:00', '20:30', 18.00, 50, 'selling'),
      (3, 2, '${today}', '21:00', '22:45', 12.00, 200, 'scheduled'),
      (2, 4, '${today}', '16:00', '18:10', 12.00, 95, 'scheduled');
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

// ═════════════════════════════════════════════════════════════════════════════
// 1. TARGETED DISCOUNTS
// ═════════════════════════════════════════════════════════════════════════════
describe("Targeted Discounts", () => {
  it("creates a 'Matinee Monday' percent discount for all movies", () => {
    const result = createPromotion(db, {
      name: "Matinee Monday",
      description: "30% off all showings before noon on Mondays",
      discountType: "percent",
      discountValue: 30,
      minTickets: 1,
      maxDiscount: 10,
      startDate: "2026-03-14",
      endDate: "2026-03-20",
    });

    expect(result.success).toBe(true);
    expect(result.promotionId).toBeDefined();
    expect(result.discountType).toBe("percent");
    expect(result.discountValue).toBe(30);

    // Verify it's in the DB
    const promo = db.prepare("SELECT * FROM promotions WHERE id = ?").get(result.promotionId) as Record<string, unknown>;
    expect(promo.name).toBe("Matinee Monday");
    expect(promo.applicable_category).toBeNull(); // applies to all
    expect(promo.applicable_movie_id).toBeNull();
    expect(promo.max_discount).toBe(10);
  });

  it("creates a 'Student Night' fixed discount", () => {
    const result = createPromotion(db, {
      name: "Student Night",
      description: "$5 off any evening showing",
      discountType: "fixed",
      discountValue: 5,
      minTickets: 1,
      startDate: "2026-03-14",
      endDate: "2026-03-20",
    });

    expect(result.success).toBe(true);
    expect(result.discountType).toBe("fixed");
    expect(result.discountValue).toBe(5);
  });

  it("creates a 'Family 4-Pack' with min ticket requirement", () => {
    const result = createPromotion(db, {
      name: "Family 4-Pack",
      description: "25% off when you buy 4+ tickets",
      discountType: "percent",
      discountValue: 25,
      minTickets: 4,
      maxDiscount: 30,
      startDate: "2026-03-14",
      endDate: "2026-03-20",
    });

    expect(result.success).toBe(true);

    const promo = db.prepare("SELECT * FROM promotions WHERE id = ?").get(result.promotionId) as Record<string, unknown>;
    expect(promo.min_tickets).toBe(4);
    expect(promo.max_discount).toBe(30);
  });

  it("creates a category-targeted discount (Horror only)", () => {
    const result = createPromotion(db, {
      name: "Horror Weekend",
      description: "20% off all Horror movies",
      discountType: "percent",
      discountValue: 20,
      applicableCategory: "Horror",
      minTickets: 1,
      startDate: "2026-03-14",
      endDate: "2026-03-20",
    });

    expect(result.success).toBe(true);

    const promo = db.prepare("SELECT * FROM promotions WHERE id = ?").get(result.promotionId) as Record<string, unknown>;
    expect(promo.applicable_category).toBe("Horror");
  });

  it("creates a movie-specific discount", () => {
    const result = createPromotion(db, {
      name: "Thunder Valley Special",
      description: "$3 off Thunder Valley",
      discountType: "fixed",
      discountValue: 3,
      applicableMovieId: 1,
      minTickets: 1,
      startDate: "2026-03-14",
      endDate: "2026-03-20",
    });

    expect(result.success).toBe(true);

    const promo = db.prepare("SELECT * FROM promotions WHERE id = ?").get(result.promotionId) as Record<string, unknown>;
    expect(promo.applicable_movie_id).toBe(1);
  });

  it("applies percent discount correctly at booking", () => {
    const today = new Date().toISOString().split("T")[0];

    // Create 30% off promo
    const promo = createPromotion(db, {
      name: "Matinee Monday",
      description: "30% off",
      discountType: "percent",
      discountValue: 30,
      minTickets: 1,
      maxDiscount: 10,
      startDate: today,
      endDate: today,
    });
    createPromoCode(db, {
      promotionId: promo.promotionId as number,
      code: "MATINEE30",
      maxUses: 100,
    });

    // Book 2 tickets at $12 each with 30% off (capped at $10)
    const booking = bookTickets(db, {
      showtimeId: 2, // $12 ticket, Standard theater
      numTickets: 2,
      customerName: "Alice",
      promoCode: "MATINEE30",
    });

    expect(booking.success).toBe(true);
    // 30% of $24 = $7.20, under $10 cap
    expect(booking.discountAmount).toBe(7.2);
    expect(booking.totalPrice).toBe(16.8);
    expect(booking.promoApplied).toBe("Matinee Monday");
  });

  it("applies fixed discount correctly at booking", () => {
    const today = new Date().toISOString().split("T")[0];

    const promo = createPromotion(db, {
      name: "Student Night",
      description: "$5 off",
      discountType: "fixed",
      discountValue: 5,
      minTickets: 1,
      startDate: today,
      endDate: today,
    });
    createPromoCode(db, {
      promotionId: promo.promotionId as number,
      code: "STUDENT5",
      maxUses: 100,
    });

    const booking = bookTickets(db, {
      showtimeId: 2,
      numTickets: 1,
      customerName: "Bob",
      promoCode: "STUDENT5",
    });

    expect(booking.success).toBe(true);
    expect(booking.discountAmount).toBe(5);
    expect(booking.totalPrice).toBe(7); // $12 - $5
  });

  it("enforces min ticket requirement", () => {
    const today = new Date().toISOString().split("T")[0];

    const promo = createPromotion(db, {
      name: "Family 4-Pack",
      description: "25% off 4+",
      discountType: "percent",
      discountValue: 25,
      minTickets: 4,
      startDate: today,
      endDate: today,
    });
    createPromoCode(db, {
      promotionId: promo.promotionId as number,
      code: "FAMILY4",
      maxUses: 100,
    });

    // Try with only 2 tickets — should fail
    const result = bookTickets(db, {
      showtimeId: 2,
      numTickets: 2,
      customerName: "Charlie",
      promoCode: "FAMILY4",
    });

    expect(result.error).toContain("at least 4 tickets");
  });

  it("respects max discount cap", () => {
    const today = new Date().toISOString().split("T")[0];

    // 50% off IMAX ($18 ticket) but capped at $5
    const promo = createPromotion(db, {
      name: "Big Discount Capped",
      description: "50% off capped at $5",
      discountType: "percent",
      discountValue: 50,
      minTickets: 1,
      maxDiscount: 5,
      startDate: today,
      endDate: today,
    });
    createPromoCode(db, {
      promotionId: promo.promotionId as number,
      code: "BIGCAP",
      maxUses: 100,
    });

    const booking = bookTickets(db, {
      showtimeId: 1, // IMAX $18
      numTickets: 1,
      customerName: "Diana",
      promoCode: "BIGCAP",
    });

    expect(booking.success).toBe(true);
    // 50% of $18 = $9, but capped at $5
    expect(booking.discountAmount).toBe(5);
    expect(booking.totalPrice).toBe(13);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. PROMO CODES
// ═════════════════════════════════════════════════════════════════════════════
describe("Promo Code Generation", () => {
  it("generates a unique promo code tied to a promotion", () => {
    const promo = createPromotion(db, {
      name: "Test Promo",
      description: "Test",
      discountType: "percent",
      discountValue: 10,
      minTickets: 1,
      startDate: "2026-03-14",
      endDate: "2026-03-20",
    });

    const code = createPromoCode(db, {
      promotionId: promo.promotionId as number,
      code: "SAVE10",
      maxUses: 50,
    });

    expect(code.success).toBe(true);
    expect(code.code).toBe("SAVE10");
    expect(code.maxUses).toBe(50);

    // Verify in DB
    const dbCode = db.prepare("SELECT * FROM promo_codes WHERE code = 'SAVE10'").get() as Record<string, unknown>;
    expect(dbCode.promotion_id).toBe(promo.promotionId);
    expect(dbCode.times_used).toBe(0);
  });

  it("prevents duplicate promo codes", () => {
    const promo = createPromotion(db, {
      name: "Test",
      description: "Test",
      discountType: "percent",
      discountValue: 10,
      minTickets: 1,
      startDate: "2026-03-14",
      endDate: "2026-03-20",
    });

    createPromoCode(db, { promotionId: promo.promotionId as number, code: "DUPE", maxUses: 100 });
    const result = createPromoCode(db, { promotionId: promo.promotionId as number, code: "DUPE", maxUses: 100 });

    expect(result.error).toContain("already exists");
  });

  it("prevents duplicate codes case-insensitively", () => {
    const promo = createPromotion(db, {
      name: "Test",
      description: "Test",
      discountType: "percent",
      discountValue: 10,
      minTickets: 1,
      startDate: "2026-03-14",
      endDate: "2026-03-20",
    });

    createPromoCode(db, { promotionId: promo.promotionId as number, code: "hello", maxUses: 100 });
    const result = createPromoCode(db, { promotionId: promo.promotionId as number, code: "HELLO", maxUses: 100 });

    expect(result.error).toContain("already exists");
  });

  it("rejects promo code for non-existent promotion", () => {
    const result = createPromoCode(db, { promotionId: 9999, code: "GHOST", maxUses: 100 });
    expect(result.error).toBe("Promotion not found");
  });

  it("tracks promo code usage and enforces max uses", () => {
    const today = new Date().toISOString().split("T")[0];

    const promo = createPromotion(db, {
      name: "Limited",
      description: "Limited use",
      discountType: "fixed",
      discountValue: 2,
      minTickets: 1,
      startDate: today,
      endDate: today,
    });
    createPromoCode(db, { promotionId: promo.promotionId as number, code: "LIMITED", maxUses: 2 });

    // First use
    const b1 = bookTickets(db, { showtimeId: 7, numTickets: 1, customerName: "User1", promoCode: "LIMITED" });
    expect(b1.success).toBe(true);

    // Second use
    const b2 = bookTickets(db, { showtimeId: 7, numTickets: 1, customerName: "User2", promoCode: "LIMITED" });
    expect(b2.success).toBe(true);

    // Third use — should fail
    const b3 = bookTickets(db, { showtimeId: 7, numTickets: 1, customerName: "User3", promoCode: "LIMITED" });
    expect(b3.error).toContain("usage limit");
  });

  it("rejects invalid promo codes", () => {
    const result = bookTickets(db, {
      showtimeId: 2,
      numTickets: 1,
      customerName: "Eve",
      promoCode: "FAKECODE",
    });

    expect(result.error).toBe("Invalid promo code.");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. FLASH SALES
// ═════════════════════════════════════════════════════════════════════════════
describe("Flash Sales", () => {
  it("detects low-fill showtimes", () => {
    // Showtime 1: 300 seats, 300 available = 0% fill
    // Showtime 5: 80 seats, 80 available = 0% fill
    const result = detectLowFillShowtimes(db, 30);

    expect(result.count).toBeGreaterThan(0);
    const fills = result.showtimes.map((s: Record<string, unknown>) => s.fill_percent as number);
    fills.forEach((f: number) => expect(f).toBeLessThan(30));
  });

  it("filters low-fill showtimes by date", () => {
    const today = new Date().toISOString().split("T")[0];
    const result = detectLowFillShowtimes(db, 50, today);

    expect(result.count).toBeGreaterThan(0);
    result.showtimes.forEach((s: Record<string, unknown>) => {
      expect(s.show_date).toBe(today);
    });
  });

  it("returns empty when all showtimes are above threshold", () => {
    // Set all showtimes to nearly full
    db.exec("UPDATE showtimes SET seats_available = 1");
    const result = detectLowFillShowtimes(db, 5);
    expect(result.count).toBe(0);
  });

  it("creates a flash sale with auto-generated promo code", () => {
    const result = createFlashSale(db, {
      showtimeId: 1, // Thunder Valley, IMAX, $18, 0% fill
      discountPercent: 25,
      maxUses: 50,
    });

    expect(result.success).toBe(true);
    expect(result.promotionId).toBeDefined();
    expect(result.code).toMatch(/^FLASH25-/);
    expect(result.movie).toBe("Thunder Valley");
    expect(result.theater).toBe("Theater 1");
    expect(result.discount).toBe("25% off");
    expect(result.originalPrice).toBe(18);
    expect(result.salePrice).toBe(13.5);
    expect(result.maxUses).toBe(50);

    // Verify promotion exists in DB targeting this showtime
    const promo = db.prepare("SELECT * FROM promotions WHERE id = ?").get(result.promotionId) as Record<string, unknown>;
    expect(promo.applicable_showtime_id).toBe(1);
    expect(promo.discount_type).toBe("percent");
    expect(promo.discount_value).toBe(25);

    // Verify promo code exists
    const code = db.prepare("SELECT * FROM promo_codes WHERE code = ?").get(result.code) as Record<string, unknown>;
    expect(code.max_uses).toBe(50);
    expect(code.times_used).toBe(0);
  });

  it("flash sale code works for booking the targeted showtime", () => {
    const sale = createFlashSale(db, {
      showtimeId: 1,
      discountPercent: 30,
      maxUses: 50,
    });

    const booking = bookTickets(db, {
      showtimeId: 1,
      numTickets: 2,
      customerName: "Flash Buyer",
      promoCode: (sale as { code: string }).code,
    });

    expect(booking.success).toBe(true);
    // $18 * 2 = $36, 30% off = $10.80 discount
    expect(booking.discountAmount).toBe(10.8);
    expect(booking.totalPrice).toBe(25.2);
  });

  it("flash sale code is rejected for a different showtime", () => {
    const sale = createFlashSale(db, {
      showtimeId: 1,
      discountPercent: 20,
      maxUses: 50,
    });

    const booking = bookTickets(db, {
      showtimeId: 2, // different showtime
      numTickets: 1,
      customerName: "Wrong Show",
      promoCode: (sale as { code: string }).code,
    });

    expect(booking.error).toContain("doesn't apply to this showtime");
  });

  it("returns error for non-existent showtime", () => {
    const result = createFlashSale(db, {
      showtimeId: 9999,
      discountPercent: 20,
      maxUses: 50,
    });

    expect(result.error).toBe("Showtime not found");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. BUNDLES (combo deals)
// ═════════════════════════════════════════════════════════════════════════════
describe("Bundle Deals", () => {
  it("creates a 'Date Night' bundle requiring 2+ tickets for Romance", () => {
    const result = createPromotion(db, {
      name: "Date Night Combo",
      description: "Buy 2+ tickets to a Romance movie and get 15% off",
      discountType: "percent",
      discountValue: 15,
      applicableCategory: "Romance",
      minTickets: 2,
      maxDiscount: 10,
      startDate: "2026-03-14",
      endDate: "2026-03-20",
    });

    expect(result.success).toBe(true);

    const promo = db.prepare("SELECT * FROM promotions WHERE id = ?").get(result.promotionId) as Record<string, unknown>;
    expect(promo.applicable_category).toBe("Romance");
    expect(promo.min_tickets).toBe(2);
  });

  it("date night bundle works on Romance movie", () => {
    const today = new Date().toISOString().split("T")[0];

    const promo = createPromotion(db, {
      name: "Date Night Combo",
      description: "15% off Romance",
      discountType: "percent",
      discountValue: 15,
      applicableCategory: "Romance",
      minTickets: 2,
      startDate: today,
      endDate: today,
    });
    createPromoCode(db, { promotionId: promo.promotionId as number, code: "DATENIGHT", maxUses: 100 });

    // Showtime 3 = "Love in Paris" (Romance), Dolby, $16
    const booking = bookTickets(db, {
      showtimeId: 3,
      numTickets: 2,
      customerName: "Couple",
      promoCode: "DATENIGHT",
    });

    expect(booking.success).toBe(true);
    // 15% of $32 = $4.80
    expect(booking.discountAmount).toBe(4.8);
    expect(booking.totalPrice).toBe(27.2);
  });

  it("date night bundle rejected on non-Romance movie", () => {
    const today = new Date().toISOString().split("T")[0];

    const promo = createPromotion(db, {
      name: "Date Night Combo",
      description: "15% off Romance",
      discountType: "percent",
      discountValue: 15,
      applicableCategory: "Romance",
      minTickets: 2,
      startDate: today,
      endDate: today,
    });
    createPromoCode(db, { promotionId: promo.promotionId as number, code: "DATENIGHT2", maxUses: 100 });

    // Showtime 1 = "Thunder Valley" (Action) — not Romance
    const booking = bookTickets(db, {
      showtimeId: 1,
      numTickets: 2,
      customerName: "Wrong Genre",
      promoCode: "DATENIGHT2",
    });

    expect(booking.error).toContain("only for Romance");
  });

  it("creates a 'Group Outing' bundle with large min tickets", () => {
    const today = new Date().toISOString().split("T")[0];

    const promo = createPromotion(db, {
      name: "Group Outing",
      description: "Buy 6+ tickets and get $3 off per ticket",
      discountType: "fixed",
      discountValue: 3,
      minTickets: 6,
      startDate: today,
      endDate: today,
    });
    createPromoCode(db, { promotionId: promo.promotionId as number, code: "GROUP6", maxUses: 50 });

    // Book 6 tickets at $12 each
    const booking = bookTickets(db, {
      showtimeId: 2,
      numTickets: 6,
      customerName: "Big Group",
      promoCode: "GROUP6",
    });

    expect(booking.success).toBe(true);
    // $3 * 6 = $18 discount
    expect(booking.discountAmount).toBe(18);
    // $72 - $18 = $54
    expect(booking.totalPrice).toBe(54);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. SEASONAL CAMPAIGNS
// ═════════════════════════════════════════════════════════════════════════════
describe("Seasonal Campaigns", () => {
  it("creates a Horror marathon campaign for all Horror movies", () => {
    const result = createPromotion(db, {
      name: "Halloween Horror Marathon",
      description: "20% off all Horror movies for October",
      discountType: "percent",
      discountValue: 20,
      applicableCategory: "Horror",
      minTickets: 1,
      maxDiscount: 8,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    });

    expect(result.success).toBe(true);

    const promo = db.prepare("SELECT * FROM promotions WHERE id = ?").get(result.promotionId) as Record<string, unknown>;
    expect(promo.applicable_category).toBe("Horror");
    expect(promo.start_date).toBe("2026-10-01");
    expect(promo.end_date).toBe("2026-10-31");
  });

  it("creates a Valentine's Romance campaign", () => {
    const result = createPromotion(db, {
      name: "Valentine's Romance Week",
      description: "25% off all Romance movies for Valentine's week",
      discountType: "percent",
      discountValue: 25,
      applicableCategory: "Romance",
      minTickets: 2,
      maxDiscount: 15,
      startDate: "2026-02-10",
      endDate: "2026-02-16",
    });

    expect(result.success).toBe(true);

    const promo = db.prepare("SELECT * FROM promotions WHERE id = ?").get(result.promotionId) as Record<string, unknown>;
    expect(promo.applicable_category).toBe("Romance");
    expect(promo.min_tickets).toBe(2); // couples!
  });

  it("creates a Summer Blockbuster Action campaign", () => {
    const result = createPromotion(db, {
      name: "Summer Blockbuster Bash",
      description: "$4 off all Action movies this summer",
      discountType: "fixed",
      discountValue: 4,
      applicableCategory: "Action",
      minTickets: 1,
      startDate: "2026-06-01",
      endDate: "2026-08-31",
    });

    expect(result.success).toBe(true);

    const promo = db.prepare("SELECT * FROM promotions WHERE id = ?").get(result.promotionId) as Record<string, unknown>;
    expect(promo.applicable_category).toBe("Action");
    expect(promo.start_date).toBe("2026-06-01");
    expect(promo.end_date).toBe("2026-08-31");
  });

  it("multiple promo codes can be generated for one seasonal campaign", () => {
    const promo = createPromotion(db, {
      name: "Holiday Season",
      description: "10% off everything",
      discountType: "percent",
      discountValue: 10,
      minTickets: 1,
      startDate: "2026-12-20",
      endDate: "2026-12-31",
    });

    const code1 = createPromoCode(db, { promotionId: promo.promotionId as number, code: "HOLIDAY10A", maxUses: 200 });
    const code2 = createPromoCode(db, { promotionId: promo.promotionId as number, code: "HOLIDAY10B", maxUses: 200 });
    const code3 = createPromoCode(db, { promotionId: promo.promotionId as number, code: "HOLIDAY10C", maxUses: 100 });

    expect(code1.success).toBe(true);
    expect(code2.success).toBe(true);
    expect(code3.success).toBe(true);

    const codes = db.prepare("SELECT COUNT(*) as count FROM promo_codes WHERE promotion_id = ?").get(promo.promotionId) as Record<string, unknown>;
    expect(codes.count).toBe(3);
  });

  it("deactivating a campaign kills all its codes", () => {
    const promo = createPromotion(db, {
      name: "Expired Campaign",
      description: "Should be killed",
      discountType: "percent",
      discountValue: 10,
      minTickets: 1,
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });

    createPromoCode(db, { promotionId: promo.promotionId as number, code: "DEAD1", maxUses: 100 });
    createPromoCode(db, { promotionId: promo.promotionId as number, code: "DEAD2", maxUses: 100 });

    const result = deactivatePromotion(db, promo.promotionId as number);
    expect(result.success).toBe(true);

    const promoRow = db.prepare("SELECT is_active FROM promotions WHERE id = ?").get(promo.promotionId) as Record<string, unknown>;
    expect(promoRow.is_active).toBe(0);

    const activeCodes = db.prepare("SELECT COUNT(*) as count FROM promo_codes WHERE promotion_id = ? AND is_active = 1").get(promo.promotionId) as Record<string, unknown>;
    expect(activeCodes.count).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. PERFORMANCE & REVENUE TRACKING
// ═════════════════════════════════════════════════════════════════════════════
describe("Performance & Revenue Tracking", () => {
  it("returns promotion performance metrics", () => {
    const today = new Date().toISOString().split("T")[0];

    // Create promo, code, and booking
    const promo = createPromotion(db, {
      name: "Tracked Promo",
      description: "Tracking test",
      discountType: "fixed",
      discountValue: 3,
      minTickets: 1,
      startDate: today,
      endDate: today,
    });
    createPromoCode(db, { promotionId: promo.promotionId as number, code: "TRACK1", maxUses: 100 });
    bookTickets(db, { showtimeId: 2, numTickets: 2, customerName: "Tracked", promoCode: "TRACK1" });

    const perf = getPromotionPerformance(db);
    expect(perf.promotions.length).toBeGreaterThan(0);

    const tracked = (perf.promotions as Record<string, unknown>[]).find(
      (p) => p.name === "Tracked Promo"
    );
    expect(tracked).toBeDefined();
    expect(tracked!.total_bookings).toBe(1);
    expect(tracked!.total_tickets).toBe(2);
    expect(tracked!.total_discounted).toBe(6); // $3 * 2

    expect((perf.summary as Record<string, unknown>).total_promo_bookings).toBeGreaterThanOrEqual(1);
  });

  it("returns revenue stats with overall totals", () => {
    // Book without promo
    bookTickets(db, { showtimeId: 2, numTickets: 3, customerName: "Revenue Test" });

    const stats = getRevenueStats(db);
    expect((stats.overall as Record<string, unknown>).total_bookings).toBeGreaterThanOrEqual(1);
    expect((stats.overall as Record<string, unknown>).total_revenue).toBeGreaterThan(0);
  });

  it("returns revenue breakdown by movie", () => {
    bookTickets(db, { showtimeId: 1, numTickets: 2, customerName: "IMAX Fan" });
    bookTickets(db, { showtimeId: 2, numTickets: 1, customerName: "Standard" });

    const stats = getRevenueStats(db, "movie");
    expect(stats.breakdown).not.toBeNull();
    expect((stats.breakdown as unknown[]).length).toBeGreaterThan(0);
  });

  it("booking without promo still records correctly", () => {
    const booking = bookTickets(db, {
      showtimeId: 2,
      numTickets: 2,
      customerName: "No Promo",
    });

    expect(booking.success).toBe(true);
    expect(booking.discountAmount).toBe(0);
    expect(booking.totalPrice).toBe(24); // $12 * 2
    expect(booking.promoApplied).toBeNull();

    // Verify in DB
    const dbBooking = db.prepare("SELECT * FROM bookings WHERE confirmation_code = ?").get(booking.confirmationCode) as Record<string, unknown>;
    expect(dbBooking.promo_code_id).toBeNull();
    expect(dbBooking.discount_amount).toBe(0);
  });

  it("booking decrements seat availability", () => {
    const before = db.prepare("SELECT seats_available FROM showtimes WHERE id = 1").get() as Record<string, unknown>;
    bookTickets(db, { showtimeId: 1, numTickets: 5, customerName: "Seat Check" });
    const after = db.prepare("SELECT seats_available FROM showtimes WHERE id = 1").get() as Record<string, unknown>;

    expect((after.seats_available as number)).toBe((before.seats_available as number) - 5);
  });

  it("rejects booking when not enough seats", () => {
    // Showtime 4: only 10 seats available
    const result = bookTickets(db, {
      showtimeId: 4,
      numTickets: 11,
      customerName: "Too Many",
    });

    expect(result.error).toContain("Only 10 seats remaining");
  });
});
