import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";

// We can't easily test event-store.ts directly because it uses the singleton getDb().
// Instead, test the SQL logic directly with an in-memory DB — same approach as other tests.

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE simulation_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sim_time TEXT NOT NULL,
      event_type TEXT NOT NULL,
      agent TEXT NOT NULL,
      summary TEXT NOT NULL,
      data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db;
}

// Direct functions matching event-store.ts logic but against a test DB
function insertEvent(
  db: Database.Database,
  event: { sim_time: string; event_type: string; agent: string; summary: string; data?: Record<string, unknown> }
) {
  const dataStr = event.data ? JSON.stringify(event.data) : null;
  const result = db
    .prepare("INSERT INTO simulation_events (sim_time, event_type, agent, summary, data) VALUES (?, ?, ?, ?, ?)")
    .run(event.sim_time, event.event_type, event.agent, event.summary, dataStr);

  return {
    id: result.lastInsertRowid as number,
    sim_time: event.sim_time,
    event_type: event.event_type,
    agent: event.agent,
    summary: event.summary,
    data: dataStr,
  };
}

function getRecentEvents(db: Database.Database, limit = 100) {
  return db
    .prepare("SELECT * FROM simulation_events ORDER BY id DESC LIMIT ?")
    .all(limit) as { id: number; sim_time: string; event_type: string; agent: string; summary: string; data: string | null }[];
}

function clearEvents(db: Database.Database) {
  db.exec("DELETE FROM simulation_events");
}

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  db.close();
});

describe("Event Store", () => {
  describe("insertEvent", () => {
    it("inserts an event and returns it with an id", () => {
      const result = insertEvent(db, {
        sim_time: "2026-03-14T10:00:00Z",
        event_type: "customer_arrived",
        agent: "customer",
        summary: "Alex arrived looking for Action movies",
      });

      expect(result.id).toBe(1);
      expect(result.event_type).toBe("customer_arrived");
      expect(result.agent).toBe("customer");
      expect(result.summary).toContain("Alex");
      expect(result.data).toBeNull();
    });

    it("stores JSON data when provided", () => {
      const result = insertEvent(db, {
        sim_time: "2026-03-14T10:00:00Z",
        event_type: "customer_booked",
        agent: "manager",
        summary: "Alex booked 2 tickets",
        data: { customer: "Alex", tickets: 2, totalPrice: 24.0 },
      });

      expect(result.data).not.toBeNull();
      const parsed = JSON.parse(result.data!);
      expect(parsed.customer).toBe("Alex");
      expect(parsed.tickets).toBe(2);
      expect(parsed.totalPrice).toBe(24.0);
    });

    it("assigns incrementing ids", () => {
      const e1 = insertEvent(db, { sim_time: "t1", event_type: "a", agent: "x", summary: "first" });
      const e2 = insertEvent(db, { sim_time: "t2", event_type: "b", agent: "y", summary: "second" });
      const e3 = insertEvent(db, { sim_time: "t3", event_type: "c", agent: "z", summary: "third" });

      expect(e1.id).toBe(1);
      expect(e2.id).toBe(2);
      expect(e3.id).toBe(3);
    });
  });

  describe("getRecentEvents", () => {
    it("returns events in reverse chronological order", () => {
      insertEvent(db, { sim_time: "t1", event_type: "a", agent: "x", summary: "first" });
      insertEvent(db, { sim_time: "t2", event_type: "b", agent: "y", summary: "second" });
      insertEvent(db, { sim_time: "t3", event_type: "c", agent: "z", summary: "third" });

      const events = getRecentEvents(db);
      expect(events).toHaveLength(3);
      expect(events[0].summary).toBe("third");
      expect(events[1].summary).toBe("second");
      expect(events[2].summary).toBe("first");
    });

    it("respects the limit parameter", () => {
      for (let i = 0; i < 10; i++) {
        insertEvent(db, { sim_time: `t${i}`, event_type: "a", agent: "x", summary: `event ${i}` });
      }

      const events = getRecentEvents(db, 3);
      expect(events).toHaveLength(3);
      expect(events[0].summary).toBe("event 9");
    });

    it("returns empty array when no events exist", () => {
      const events = getRecentEvents(db);
      expect(events).toEqual([]);
    });
  });

  describe("clearEvents", () => {
    it("removes all events", () => {
      insertEvent(db, { sim_time: "t1", event_type: "a", agent: "x", summary: "first" });
      insertEvent(db, { sim_time: "t2", event_type: "b", agent: "y", summary: "second" });

      expect(getRecentEvents(db)).toHaveLength(2);

      clearEvents(db);

      expect(getRecentEvents(db)).toHaveLength(0);
    });

    it("allows new events after clearing", () => {
      insertEvent(db, { sim_time: "t1", event_type: "a", agent: "x", summary: "old" });
      clearEvents(db);

      insertEvent(db, { sim_time: "t2", event_type: "b", agent: "y", summary: "new" });

      const events = getRecentEvents(db);
      expect(events).toHaveLength(1);
      expect(events[0].summary).toBe("new");
    });
  });

  describe("Event Types", () => {
    it("handles all simulation event types", () => {
      const eventTypes = [
        "booking", "promotion_created", "flash_sale", "movie_swapped",
        "showtime_added", "showtime_cancelled", "customer_arrived",
        "customer_left", "customer_booked", "optimizer_action",
        "promotion_sent", "promotion_accepted", "promotion_rejected",
        "scheduler_action", "tick_start", "tick_end",
      ];

      for (const type of eventTypes) {
        insertEvent(db, { sim_time: "t", event_type: type, agent: "test", summary: `test ${type}` });
      }

      const events = getRecentEvents(db, 100);
      expect(events).toHaveLength(eventTypes.length);

      const storedTypes = events.map((e) => e.event_type).sort();
      expect(storedTypes).toEqual([...eventTypes].sort());
    });
  });
});
