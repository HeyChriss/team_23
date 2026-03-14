import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { TheaterStateController } from "./theater-state";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, actors TEXT NOT NULL, category TEXT NOT NULL,
      length_minutes INTEGER NOT NULL, language TEXT NOT NULL,
      director TEXT NOT NULL, release_date DATE NOT NULL
    );
    CREATE TABLE theaters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE, seat_count INTEGER NOT NULL,
      screen_type TEXT NOT NULL DEFAULT 'Standard', is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE showtimes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movie_id INTEGER NOT NULL, theater_id INTEGER NOT NULL,
      show_date DATE NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
      ticket_price REAL NOT NULL DEFAULT 12.00,
      seats_available INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled',
      FOREIGN KEY (movie_id) REFERENCES movies(id),
      FOREIGN KEY (theater_id) REFERENCES theaters(id)
    );
    CREATE TABLE promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, description TEXT NOT NULL,
      discount_type TEXT NOT NULL, discount_value REAL NOT NULL,
      applicable_movie_id INTEGER, applicable_showtime_id INTEGER,
      applicable_category TEXT, min_tickets INTEGER NOT NULL DEFAULT 1,
      max_discount REAL, start_date DATE NOT NULL, end_date DATE NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL DEFAULT 'system',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE promo_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promotion_id INTEGER NOT NULL, code TEXT NOT NULL UNIQUE,
      max_uses INTEGER NOT NULL DEFAULT 100, times_used INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (promotion_id) REFERENCES promotions(id)
    );
    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      showtime_id INTEGER NOT NULL, customer_name TEXT NOT NULL,
      num_tickets INTEGER NOT NULL, unit_price REAL NOT NULL,
      discount_amount REAL NOT NULL DEFAULT 0, total_price REAL NOT NULL,
      promo_code_id INTEGER, confirmation_code TEXT NOT NULL UNIQUE,
      booked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (showtime_id) REFERENCES showtimes(id),
      FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id)
    );
  `);

  // Seed data
  db.exec(`
    INSERT INTO movies (name, actors, category, length_minutes, language, director, release_date) VALUES
      ('Thunder Valley', 'A, B', 'Action', 120, 'English', 'Dir A', '2026-01-01'),
      ('Love in Paris', 'C, D', 'Romance', 110, 'English', 'Dir B', '2026-02-14'),
      ('Night Terrors', 'E, F', 'Horror', 95, 'English', 'Dir C', '2026-03-01'),
      ('Family Fun', 'G, H', 'Animation', 90, 'English', 'Dir D', '2026-03-10');

    INSERT INTO theaters (name, seat_count, screen_type) VALUES
      ('Theater 1', 300, 'IMAX'),
      ('Theater 2', 200, 'Standard'),
      ('Theater 3', 150, 'Dolby'),
      ('Theater 4', 100, 'Standard');

    INSERT INTO showtimes (movie_id, theater_id, show_date, start_time, end_time, ticket_price, seats_available, status) VALUES
      (1, 1, '2026-03-14', '09:00', '11:20', 18.00, 100, 'selling'),
      (1, 2, '2026-03-14', '12:00', '14:20', 12.00, 180, 'selling'),
      (2, 3, '2026-03-14', '14:00', '16:10', 16.00, 150, 'scheduled'),
      (3, 4, '2026-03-14', '20:00', '21:45', 12.00, 0, 'sold_out'),
      (4, 1, '2026-03-15', '10:00', '11:30', 18.00, 250, 'scheduled'),
      (1, 2, '2026-03-15', '13:00', '15:20', 12.00, 50, 'selling'),
      (2, 3, '2026-03-15', '18:00', '20:10', 16.00, 10, 'selling');

    INSERT INTO promotions (name, description, discount_type, discount_value, applicable_category, min_tickets, start_date, end_date, is_active) VALUES
      ('Student Night', '$5 off', 'fixed', 5, NULL, 1, '2026-03-14', '2026-03-20', 1),
      ('Horror Weekend', '20% off Horror', 'percent', 20, 'Horror', 1, '2026-03-14', '2026-03-16', 1),
      ('Expired Deal', 'Gone', 'percent', 10, NULL, 1, '2026-03-01', '2026-03-10', 0);

    INSERT INTO promo_codes (promotion_id, code, max_uses, times_used) VALUES
      (1, 'STUDENT5', 100, 5),
      (2, 'HORROR20', 50, 3);

    INSERT INTO bookings (showtime_id, customer_name, num_tickets, unit_price, discount_amount, total_price, promo_code_id, confirmation_code, booked_at) VALUES
      (1, 'Alice', 2, 18.00, 0, 36.00, NULL, 'SLC-001', '2026-03-14 09:00:00'),
      (1, 'Bob', 3, 18.00, 15.00, 39.00, 1, 'SLC-002', '2026-03-14 10:00:00'),
      (2, 'Charlie', 1, 12.00, 0, 12.00, NULL, 'SLC-003', '2026-03-14 11:00:00'),
      (4, 'Diana', 4, 12.00, 9.60, 38.40, 2, 'SLC-004', '2026-03-14 19:00:00'),
      (6, 'Eve', 5, 12.00, 0, 60.00, NULL, 'SLC-005', '2026-03-15 12:00:00'),
      (7, 'Frank', 2, 16.00, 0, 32.00, NULL, 'SLC-006', '2026-03-15 17:00:00');
  `);

  return db;
}

let db: Database.Database;
let state: TheaterStateController;

beforeEach(() => {
  db = createTestDb();
  state = new TheaterStateController(db);
});

afterEach(() => {
  db.close();
});

// ═════════════════════════════════════════════════════════════════════════════
// KPIs
// ═════════════════════════════════════════════════════════════════════════════
describe("KPIs", () => {
  it("returns correct total revenue", () => {
    const kpis = state.getKPIs();
    // 36 + 39 + 12 + 38.40 + 60 + 32 = 217.40
    expect(kpis.total_revenue).toBeCloseTo(217.4, 1);
  });

  it("returns correct total tickets sold", () => {
    const kpis = state.getKPIs();
    // 2 + 3 + 1 + 4 + 5 + 2 = 17
    expect(kpis.total_tickets_sold).toBe(17);
  });

  it("returns correct total bookings", () => {
    const kpis = state.getKPIs();
    expect(kpis.total_bookings).toBe(6);
  });

  it("returns correct promo stats", () => {
    const kpis = state.getKPIs();
    expect(kpis.total_promos_active).toBe(2); // expired one is inactive
    expect(kpis.total_promo_redemptions).toBe(2); // Bob + Diana
    expect(kpis.total_discount_given).toBeCloseTo(24.6, 1); // 15 + 9.60
  });

  it("returns sold out count", () => {
    const kpis = state.getKPIs();
    expect(kpis.sold_out_count).toBe(1);
  });

  it("returns revenue per screen", () => {
    const kpis = state.getKPIs();
    // 217.40 / 4 theaters = 54.35
    expect(kpis.revenue_per_screen).toBeCloseTo(54.35, 1);
  });

  it("returns tickets per showtime", () => {
    const kpis = state.getKPIs();
    // 17 tickets / 7 showtimes = 2.43
    expect(kpis.tickets_per_showtime).toBeCloseTo(2.43, 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Theater Summaries
// ═════════════════════════════════════════════════════════════════════════════
describe("Theater Summaries", () => {
  it("returns all theaters with fill rates", () => {
    const theaters = state.getTheaterSummaries();
    expect(theaters).toHaveLength(4);
    expect(theaters[0].name).toBe("Theater 1");
    expect(theaters[0].screen_type).toBe("IMAX");
  });

  it("calculates fill rates correctly", () => {
    const theaters = state.getTheaterSummaries();
    // Theater 1: 2 showtimes, 300 seats each = 600 capacity
    // Showtime 1: 300-100=200 booked, Showtime 5: 300-250=50 booked = 250 total
    // Fill rate: 250/600 = 41.7%
    const t1 = theaters.find((t) => t.name === "Theater 1")!;
    expect(t1.total_showtimes).toBe(2);
    expect(t1.fill_rate).toBeCloseTo(41.7, 0);
  });

  it("shows Theater 4 has sold out showtime", () => {
    const theaters = state.getTheaterSummaries();
    const t4 = theaters.find((t) => t.name === "Theater 4")!;
    // 100 seats, 0 available = 100% fill
    expect(t4.fill_rate).toBe(100);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Movie Performance
// ═════════════════════════════════════════════════════════════════════════════
describe("Movie Performance", () => {
  it("returns movies sorted by revenue", () => {
    const movies = state.getMoviePerformance();
    expect(movies.length).toBeGreaterThan(0);
    // First movie should have highest revenue
    for (let i = 1; i < movies.length; i++) {
      expect(movies[i - 1].total_revenue).toBeGreaterThanOrEqual(movies[i].total_revenue);
    }
  });

  it("tracks booking counts per movie", () => {
    const movies = state.getMoviePerformance();
    const thunder = movies.find((m) => m.name === "Thunder Valley")!;
    // Thunder Valley has 3 showtimes and bookings SLC-001, SLC-002, SLC-003, SLC-005
    expect(thunder.total_bookings).toBeGreaterThanOrEqual(3);
  });

  it("identifies underperforming movies", () => {
    const underperformers = state.getUnderperformingMovies(10);
    // Movies with < 10% fill rate
    underperformers.forEach((m) => {
      expect(m.avg_fill_rate).toBeLessThan(10);
    });
  });

  it("returns top movies limited by count", () => {
    const top = state.getTopMovies(2);
    expect(top).toHaveLength(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Showtime Statuses
// ═════════════════════════════════════════════════════════════════════════════
describe("Showtime Statuses", () => {
  it("returns all showtimes with fill rates", () => {
    const showtimes = state.getShowtimeStatuses();
    expect(showtimes).toHaveLength(7);
    showtimes.forEach((s) => {
      expect(s.fill_rate).toBeDefined();
      expect(s.seats_booked).toBe(s.seat_count - s.seats_available);
    });
  });

  it("filters by date", () => {
    const showtimes = state.getShowtimeStatuses({ date: "2026-03-14" });
    expect(showtimes).toHaveLength(4);
    showtimes.forEach((s) => expect(s.show_date).toBe("2026-03-14"));
  });

  it("filters by theater", () => {
    const showtimes = state.getShowtimeStatuses({ theaterId: 1 });
    expect(showtimes).toHaveLength(2);
    showtimes.forEach((s) => expect(s.theater_name).toBe("Theater 1"));
  });

  it("filters by movie", () => {
    const showtimes = state.getShowtimeStatuses({ movieId: 1 });
    // Thunder Valley has 3 showtimes
    expect(showtimes).toHaveLength(3);
  });

  it("filters by status", () => {
    const soldOut = state.getShowtimeStatuses({ status: "sold_out" });
    expect(soldOut).toHaveLength(1);
    expect(soldOut[0].movie_name).toBe("Night Terrors");
  });

  it("filters by max fill rate", () => {
    const lowFill = state.getShowtimeStatuses({ maxFillRate: 10 });
    lowFill.forEach((s) => expect(s.fill_rate).toBeLessThanOrEqual(10));
  });

  it("filters by min fill rate", () => {
    const highFill = state.getShowtimeStatuses({ minFillRate: 50 });
    highFill.forEach((s) => expect(s.fill_rate).toBeGreaterThanOrEqual(50));
  });

  it("calculates revenue per showtime", () => {
    const showtimes = state.getShowtimeStatuses();
    const s1 = showtimes.find((s) => s.id === 1)!;
    // Bookings SLC-001 ($36) + SLC-002 ($39) = $75
    expect(s1.revenue).toBeCloseTo(75, 0);
  });

  it("getSoldOutShowtimes returns only sold out", () => {
    const soldOut = state.getSoldOutShowtimes();
    expect(soldOut).toHaveLength(1);
    expect(soldOut[0].status).toBe("sold_out");
  });

  it("getLowFillShowtimes excludes sold out and cancelled", () => {
    const lowFill = state.getLowFillShowtimes(25);
    lowFill.forEach((s) => {
      expect(s.status).not.toBe("sold_out");
      expect(s.status).not.toBe("cancelled");
      expect(s.fill_rate).toBeLessThanOrEqual(25);
    });
  });

  it("getHighDemandShowtimes returns nearly full shows", () => {
    const highDemand = state.getHighDemandShowtimes(90);
    highDemand.forEach((s) => {
      expect(s.fill_rate).toBeGreaterThanOrEqual(90);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Genre Trends
// ═════════════════════════════════════════════════════════════════════════════
describe("Genre Trends", () => {
  it("returns all genres with showtimes", () => {
    const genres = state.getGenreTrends();
    expect(genres.length).toBeGreaterThanOrEqual(3);
    genres.forEach((g) => {
      expect(g.category).toBeDefined();
      expect(g.total_showtimes).toBeGreaterThan(0);
    });
  });

  it("sorts by revenue descending", () => {
    const genres = state.getGenreTrends();
    for (let i = 1; i < genres.length; i++) {
      expect(genres[i - 1].total_revenue).toBeGreaterThanOrEqual(genres[i].total_revenue);
    }
  });

  it("tracks tickets per genre", () => {
    const genres = state.getGenreTrends();
    const action = genres.find((g) => g.category === "Action")!;
    expect(action.total_tickets).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Screen Type Stats
// ═════════════════════════════════════════════════════════════════════════════
describe("Screen Type Stats", () => {
  it("returns stats for each screen type", () => {
    const screens = state.getScreenTypeStats();
    expect(screens.length).toBeGreaterThanOrEqual(2);
    const types = screens.map((s) => s.screen_type);
    expect(types).toContain("IMAX");
    expect(types).toContain("Standard");
  });

  it("calculates revenue by screen type", () => {
    const screens = state.getScreenTypeStats();
    screens.forEach((s) => {
      expect(s.total_revenue).toBeGreaterThanOrEqual(0);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Daily Snapshots
// ═════════════════════════════════════════════════════════════════════════════
describe("Daily Snapshots", () => {
  it("returns snapshots for each scheduled day", () => {
    const daily = state.getDailySnapshots();
    expect(daily).toHaveLength(2); // March 14 and 15
    expect(daily[0].date).toBe("2026-03-14");
    expect(daily[1].date).toBe("2026-03-15");
  });

  it("calculates daily fill rates", () => {
    const daily = state.getDailySnapshots();
    daily.forEach((d) => {
      expect(d.fill_rate).toBeGreaterThanOrEqual(0);
      expect(d.fill_rate).toBeLessThanOrEqual(100);
    });
  });

  it("tracks daily revenue", () => {
    const daily = state.getDailySnapshots();
    const mar14 = daily.find((d) => d.date === "2026-03-14")!;
    // Bookings on Mar 14: $36 + $39 + $12 + $38.40 = $125.40
    expect(mar14.revenue).toBeCloseTo(125.4, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Alerts
// ═════════════════════════════════════════════════════════════════════════════
describe("Alerts", () => {
  it("generates sold out alerts", () => {
    const alerts = state.generateAlerts();
    const soldOutAlerts = alerts.filter((a) => a.type === "sold_out");
    expect(soldOutAlerts).toHaveLength(1);
    expect(soldOutAlerts[0].message).toContain("Night Terrors");
    expect(soldOutAlerts[0].severity).toBe("info");
  });

  it("generates low fill alerts", () => {
    const alerts = state.generateAlerts();
    const lowFillAlerts = alerts.filter((a) => a.type === "low_fill");
    // Showtimes with < 15% fill
    lowFillAlerts.forEach((a) => {
      expect(a.severity).toBe("warning");
      expect(a.data.fillRate).toBeDefined();
    });
  });

  it("generates high demand alerts", () => {
    const alerts = state.generateAlerts();
    const highDemand = alerts.filter((a) => a.type === "high_demand");
    highDemand.forEach((a) => {
      expect(a.severity).toBe("info");
      expect((a.data.fillRate as number)).toBeGreaterThanOrEqual(90);
    });
  });

  it("alert data includes relevant IDs for agent action", () => {
    const alerts = state.generateAlerts();
    const soldOut = alerts.find((a) => a.type === "sold_out")!;
    expect(soldOut.data.showtimeId).toBeDefined();
    expect(soldOut.data.movieId).toBeDefined();
    expect(soldOut.data.theaterId).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Theater Availability
// ═════════════════════════════════════════════════════════════════════════════
describe("Theater Availability", () => {
  it("returns availability for all active theaters", () => {
    const avail = state.getTheaterAvailability("2026-03-14");
    expect(avail).toHaveLength(4);
  });

  it("shows occupied and available hours", () => {
    const avail = state.getTheaterAvailability("2026-03-14");
    avail.forEach((a) => {
      expect(a.occupied_hours).toBeGreaterThanOrEqual(0);
      expect(a.available_hours).toBeDefined();
    });
  });

  it("empty day shows full availability", () => {
    const avail = state.getTheaterAvailability("2026-03-20");
    avail.forEach((a) => {
      expect(a.showtimes_count).toBe(0);
      expect(a.occupied_hours).toBe(0);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Promotion Summary
// ═════════════════════════════════════════════════════════════════════════════
describe("Promotion Summary", () => {
  it("returns all promotions with usage stats", () => {
    const promos = state.getPromotionSummary();
    expect(promos).toHaveLength(3); // includes inactive
  });

  it("tracks usage correctly", () => {
    const promos = state.getPromotionSummary();
    const student = promos.find((p) => p.name === "Student Night")!;
    expect(student.total_uses).toBe(1); // Bob's booking
    expect(student.total_discounted).toBe(15);
  });

  it("shows inactive promotions", () => {
    const promos = state.getPromotionSummary();
    const expired = promos.find((p) => p.name === "Expired Deal")!;
    expect(expired.is_active).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Full State
// ═════════════════════════════════════════════════════════════════════════════
describe("Full State", () => {
  it("returns complete theater state", () => {
    const full = state.getFullState("2026-03-14T12:00:00Z");
    expect(full.kpis).toBeDefined();
    expect(full.theaters).toBeDefined();
    expect(full.dailySnapshots).toBeDefined();
    expect(full.genreTrends).toBeDefined();
    expect(full.screenTypeStats).toBeDefined();
    expect(full.alerts).toBeDefined();
    expect(full.simTime).toBe("2026-03-14T12:00:00Z");
  });

  it("all sections contain data", () => {
    const full = state.getFullState("2026-03-14T12:00:00Z");
    expect(full.theaters.length).toBeGreaterThan(0);
    expect(full.dailySnapshots.length).toBeGreaterThan(0);
    expect(full.genreTrends.length).toBeGreaterThan(0);
    expect(full.kpis.total_bookings).toBeGreaterThan(0);
  });
});
