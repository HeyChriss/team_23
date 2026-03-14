import { getDb } from "./db";
import type { SimulationEvent, SimEventType } from "./agents/types";

// Ensure simulation_events table exists
function ensureTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS simulation_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sim_time TEXT NOT NULL,
      event_type TEXT NOT NULL,
      agent TEXT NOT NULL,
      summary TEXT NOT NULL,
      data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

let _tableReady = false;

export function insertEvent(event: {
  sim_time: string;
  event_type: SimEventType;
  agent: string;
  summary: string;
  data?: Record<string, unknown>;
}): SimulationEvent {
  if (!_tableReady) {
    ensureTable();
    _tableReady = true;
  }
  const db = getDb();
  const dataStr = event.data ? JSON.stringify(event.data) : null;
  const result = db
    .prepare(
      "INSERT INTO simulation_events (sim_time, event_type, agent, summary, data) VALUES (?, ?, ?, ?, ?)"
    )
    .run(event.sim_time, event.event_type, event.agent, event.summary, dataStr);

  return {
    id: result.lastInsertRowid as number,
    sim_time: event.sim_time,
    event_type: event.event_type,
    agent: event.agent,
    summary: event.summary,
    data: dataStr ?? undefined,
  };
}

export function getRecentEvents(limit = 100): SimulationEvent[] {
  if (!_tableReady) {
    ensureTable();
    _tableReady = true;
  }
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM simulation_events ORDER BY id DESC LIMIT ?"
    )
    .all(limit) as SimulationEvent[];
}

export function clearEvents(): void {
  if (!_tableReady) {
    ensureTable();
    _tableReady = true;
  }
  const db = getDb();
  db.exec("DELETE FROM simulation_events");
}
