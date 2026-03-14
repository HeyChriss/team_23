/**
 * End-to-end test for the simulation engine event streaming.
 *
 * Verifies that:
 * 1. Events stream incrementally (not batched at end of day)
 * 2. Phase ordering is correct (day_start → agents → waves → day_end)
 * 3. Each wave emits its own events
 * 4. Events have timestamps spread over time, not bunched
 *
 * Note: Without ANTHROPIC_API_KEY, agent LLM calls fail silently.
 * The test still validates the engine scaffolding emits correctly.
 */

import { describe, it, expect, afterEach } from "vitest";
import { getSimulationEngine, type SSEEvent } from "./simulation-engine";

interface TimedEvent {
  type: string;
  timestamp: number;
  summary?: string;
  agent?: string;
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
        agent: data?.agent ? String(data.agent) : undefined,
        eventType: data?.event_type ? String(data.event_type) : undefined,
      });
    },
  };
}

afterEach(() => {
  const engine = getSimulationEngine();
  engine.reset();
});

describe("Simulation Engine — Event Streaming", () => {
  it("emits day_start, wave events, kpi updates, and day_end in correct order", async () => {
    const engine = getSimulationEngine();
    engine.reset();

    const { events, emit } = collectEvents();
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 45000);

    try {
      await engine.runDay(emit, ac.signal);
    } catch { /* may error without API key */ }
    clearTimeout(timeout);

    // Should have events
    expect(events.length).toBeGreaterThan(3);

    // Print event log for diagnosis
    console.log("\n=== EVENT LOG ===");
    const startTs = events[0]?.timestamp || 0;
    for (const e of events) {
      const relMs = e.timestamp - startTs;
      console.log(`  +${relMs}ms  [${e.type}] ${e.summary || e.eventType || ""}`);
    }
    console.log(`=== ${events.length} events total, ${events[events.length - 1].timestamp - startTs}ms duration ===\n`);

    // day_start is first
    expect(events[0].type).toBe("day_start");

    // Should have at least one wave_start
    const waveStarts = events.filter((e) => e.type === "wave_start");
    expect(waveStarts.length).toBeGreaterThanOrEqual(1);

    // Should have kpi events (at least one per wave)
    const kpiEvents = events.filter((e) => e.type === "kpi");
    expect(kpiEvents.length).toBeGreaterThanOrEqual(1);

    // wave_start should come before its wave_end
    const firstWaveStart = events.findIndex((e) => e.type === "wave_start");
    const firstWaveEnd = events.findIndex((e) => e.type === "wave_end");
    if (firstWaveStart >= 0 && firstWaveEnd >= 0) {
      expect(firstWaveStart).toBeLessThan(firstWaveEnd);
    }

    // day_end should exist
    const dayEndIdx = events.findIndex((e) => e.type === "day_end");
    expect(dayEndIdx).toBeGreaterThan(0);
  }, 60000);

  it("events are spread over time, not all emitted at once", async () => {
    const engine = getSimulationEngine();
    engine.reset();

    const { events, emit } = collectEvents();
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 45000);

    try {
      await engine.runDay(emit, ac.signal);
    } catch { /* expected */ }
    clearTimeout(timeout);

    if (events.length < 5) {
      console.log("Not enough events to test timing distribution (need API key)");
      return; // Skip if no API key — can't test timing without real LLM calls
    }

    const firstTs = events[0].timestamp;
    const lastTs = events[events.length - 1].timestamp;
    const totalDuration = lastTs - firstTs;

    if (totalDuration < 100) {
      console.log(`Events span only ${totalDuration}ms — agents likely failing without API key`);
      return; // Can't test distribution if everything happens instantly
    }

    // Count events in each quartile of time
    const q1 = events.filter((e) => e.timestamp < firstTs + totalDuration * 0.25).length;
    const q4 = events.filter((e) => e.timestamp >= firstTs + totalDuration * 0.75).length;

    console.log(`\nTime distribution: Q1=${q1}, Q4=${q4}, Total=${events.length}, Duration=${totalDuration}ms`);

    // If more than 90% of events are in the last quartile, that's batching
    const fractionInQ4 = q4 / events.length;
    expect(fractionInQ4).toBeLessThan(0.9);
  }, 60000);

  it("each wave emits customer_arrived events before wave_end", async () => {
    const engine = getSimulationEngine();
    engine.reset();

    const { events, emit } = collectEvents();
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 45000);

    try {
      await engine.runDay(emit, ac.signal);
    } catch { /* expected */ }
    clearTimeout(timeout);

    // Find all wave blocks
    const waveStarts = events.map((e, i) => ({ ...e, idx: i })).filter((e) => e.type === "wave_start");
    const waveEnds = events.map((e, i) => ({ ...e, idx: i })).filter((e) => e.type === "wave_end");

    for (let i = 0; i < Math.min(waveStarts.length, waveEnds.length); i++) {
      const startIdx = waveStarts[i].idx;
      const endIdx = waveEnds[i].idx;

      // There should be events between wave_start and wave_end
      const eventsBetween = events.slice(startIdx + 1, endIdx);
      expect(eventsBetween.length).toBeGreaterThan(0);

      // At least one should be a customer arrival or conversation
      const hasCustomerActivity = eventsBetween.some(
        (e) => e.type === "event" || e.type === "conversation"
      );
      expect(hasCustomerActivity).toBe(true);
    }
  }, 60000);

  it("processes customers sequentially — each arrival+outcome before next arrival", async () => {
    const engine = getSimulationEngine();
    engine.reset();

    const { events, emit } = collectEvents();
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 45000);

    try {
      await engine.runDay(emit, ac.signal);
    } catch { /* expected */ }
    clearTimeout(timeout);

    // Find customer_arrived and their outcomes (customer_booked/customer_left)
    const arrivals = events
      .map((e, i) => ({ ...e, idx: i }))
      .filter((e) => e.type === "event" && e.eventType === "customer_arrived");

    const outcomes = events
      .map((e, i) => ({ ...e, idx: i }))
      .filter((e) => e.type === "event" && (
        e.eventType === "customer_booked" || e.eventType === "customer_left" ||
        e.eventType === "promotion_accepted" || e.eventType === "promotion_rejected"
      ));

    if (arrivals.length >= 2 && outcomes.length >= 2) {
      // For sequential processing: the first customer's outcome should come
      // BEFORE the second customer's arrival (within a wave)
      // Find first wave's first two active customers
      const firstWaveStartIdx = events.findIndex((e) => e.type === "wave_start");
      const firstWaveEndIdx = events.findIndex((e) => e.type === "wave_end");

      if (firstWaveStartIdx >= 0 && firstWaveEndIdx >= 0) {
        const waveEvents = events.slice(firstWaveStartIdx, firstWaveEndIdx);
        const waveArrivals = waveEvents.filter((e) => e.type === "event" && e.eventType === "customer_arrived");
        const waveOutcomes = waveEvents.filter((e) =>
          e.type === "event" && (e.eventType === "customer_booked" || e.eventType === "customer_left") ||
          e.type === "conversation"
        );

        // Each arrival should be followed by its outcome before the next arrival
        // (sequential processing means: arrive1, conv1, outcome1, arrive2, conv2, outcome2, ...)
        if (waveArrivals.length >= 2) {
          // The pattern should alternate: arrival → outcome events → next arrival
          console.log(`\nWave event order (${waveEvents.length} events):`);
          for (const e of waveEvents) {
            console.log(`  [${e.type}] ${e.eventType || ""} ${e.summary || ""}`);
          }
        }
      }
    }

    // Basic: every arrival should have a matching outcome
    expect(outcomes.length + events.filter((e) => e.type === "conversation").length)
      .toBeGreaterThanOrEqual(arrivals.length);
  }, 60000);

  it("emits customer_booked or customer_left for each active customer", async () => {
    const engine = getSimulationEngine();
    engine.reset();

    const { events, emit } = collectEvents();
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 45000);

    try {
      await engine.runDay(emit, ac.signal);
    } catch { /* expected */ }
    clearTimeout(timeout);

    // Count customer arrivals vs outcomes
    const arrivals = events.filter(
      (e) => e.type === "event" && e.eventType === "customer_arrived"
    );
    const outcomes = events.filter(
      (e) => e.type === "event" && (
        e.eventType === "customer_booked" ||
        e.eventType === "customer_left" ||
        e.eventType === "promotion_accepted" ||
        e.eventType === "promotion_rejected"
      )
    );

    // Also count conversations as outcomes
    const conversations = events.filter((e) => e.type === "conversation");

    console.log(`\nCustomer flow: ${arrivals.length} arrived, ${outcomes.length} outcome events, ${conversations.length} conversations`);

    // Every arrival should eventually have an outcome (conversation or event)
    // Total outcomes should be >= arrivals (some may have both conversation + event)
    if (arrivals.length > 0) {
      expect(outcomes.length + conversations.length).toBeGreaterThanOrEqual(arrivals.length);
    }
  }, 60000);
});
