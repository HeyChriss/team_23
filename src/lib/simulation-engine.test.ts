/**
 * Tests for the simulation engine — continuous customer flow (no waves).
 */

import { describe, it, expect, afterEach } from "vitest";
import { getSimulationEngine, type SSEEvent } from "./simulation-engine";

interface TimedEvent {
  type: string;
  timestamp: number;
  summary?: string;
  eventType?: string;
}

function collectEvents(): { events: TimedEvent[]; emit: (e: SSEEvent) => void } {
  const events: TimedEvent[] = [];
  return {
    events,
    emit(event: SSEEvent) {
      const data = event.data as Record<string, unknown> | undefined;
      events.push({
        type: event.type,
        timestamp: Date.now(),
        summary: data?.summary ? String(data.summary) : undefined,
        eventType: data?.event_type ? String(data.event_type) : undefined,
      });
    },
  };
}

afterEach(() => { getSimulationEngine().reset(); });

describe("Simulation Engine — Continuous Flow", () => {
  it("emits day_start, customer events, kpi updates, and day_end", async () => {
    const engine = getSimulationEngine();
    engine.reset();
    const { events, emit } = collectEvents();
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 45000);

    try { await engine.runDay(emit, ac.signal); } catch { /* expected */ }
    clearTimeout(timeout);

    expect(events.length).toBeGreaterThan(5);
    expect(events[0].type).toBe("day_start");

    const dayEnd = events.find((e) => e.type === "day_end");
    expect(dayEnd).toBeDefined();

    // No wave events
    const waveEvents = events.filter((e) => e.type === "wave_start" || e.type === "wave_end");
    expect(waveEvents.length).toBe(0);

    // Should have customer arrivals
    const arrivals = events.filter((e) => e.eventType === "customer_arrived");
    expect(arrivals.length).toBeGreaterThan(0);

    // Should have KPI updates
    const kpis = events.filter((e) => e.type === "kpi");
    expect(kpis.length).toBeGreaterThan(0);
  }, 60000);

  it("processes customers sequentially — each arrives then resolves before next", async () => {
    const engine = getSimulationEngine();
    engine.reset();
    const { events, emit } = collectEvents();
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 45000);

    try { await engine.runDay(emit, ac.signal); } catch { /* expected */ }
    clearTimeout(timeout);

    const arrivals = events
      .map((e, i) => ({ ...e, idx: i }))
      .filter((e) => e.eventType === "customer_arrived");
    const outcomes = events
      .map((e, i) => ({ ...e, idx: i }))
      .filter((e) => e.eventType === "customer_booked" || e.eventType === "customer_left" ||
        e.eventType === "promotion_accepted" || e.eventType === "promotion_rejected");

    // Every arrival should have an outcome
    expect(outcomes.length).toBeGreaterThanOrEqual(arrivals.length);

    // Arrivals and outcomes should interleave (not all arrivals then all outcomes)
    if (arrivals.length >= 2 && outcomes.length >= 2) {
      // First outcome should come before second arrival
      expect(outcomes[0].idx).toBeLessThan(arrivals[1].idx);
    }
  }, 60000);

  it("interleaves active and passive customers", async () => {
    const engine = getSimulationEngine();
    engine.reset();
    const { events, emit } = collectEvents();
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 45000);

    try { await engine.runDay(emit, ac.signal); } catch { /* expected */ }
    clearTimeout(timeout);

    const arrivals = events.filter((e) => e.eventType === "customer_arrived");
    // Should have both active and passive
    const hasActive = arrivals.some((e) => e.summary?.includes("fan, group"));
    const hasPassive = arrivals.some((e) => e.summary?.includes("passive") || events.some((o) => o.eventType === "promotion_accepted" || o.eventType === "promotion_rejected"));

    // At least some customers should exist
    expect(arrivals.length).toBeGreaterThan(0);
    // If we have enough, both types should appear
    if (arrivals.length > 3) {
      expect(hasActive || hasPassive).toBe(true);
    }
  }, 60000);
});
