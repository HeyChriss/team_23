/**
 * Simulation Engine — continuous customer flow.
 *
 * Each "day":
 *   1. Strategic agents run once (Optimizer → Scheduler → Promoter)
 *   2. Customers arrive one at a time, continuously, until the day's quota is met
 *   3. End-of-day: KPI snapshot, advance clock to next day
 *
 * No waves. No batching. Each customer arrives, interacts, and resolves
 * before the next one starts.
 */

import { getSimulationClock } from "./simulation-clock";
import { TheaterStateController } from "./theater-state";
import { getDb } from "./db";
import { insertEvent, clearEvents } from "./event-store";
import { spawnActiveCustomers, spawnPassiveCustomers } from "./agents/customer-spawner";
import { runActiveCustomer } from "./agents/customer-active";
import { runPassiveCustomer } from "./agents/customer-passive";
import { runOptimizer } from "./agents/optimizer";
import { runScheduler } from "./agents/scheduler";
import { runPromoter } from "./agents/promoter-agent";
import type { SimulationEvent, ConversationEntry, ConversationUpdate } from "./agents/types";

// ── Config ───────────────────────────────────────────────────────────────────

const CUSTOMERS_PER_DAY = {
  active: 10,   // total active customers per day
  passive: 5,   // total passive customers per day
};

// ── Event types ──────────────────────────────────────────────────────────────

export type SSEEvent =
  | { type: "day_start"; data: { dayNumber: number; date: string; simTime: string } }
  | { type: "day_end"; data: { dayNumber: number; date: string; kpis: Record<string, unknown>; summary: DaySummary } }
  | { type: "event"; data: SimulationEvent }
  | { type: "conversation"; data: ConversationEntry }
  | { type: "conversation_update"; data: ConversationUpdate }
  | { type: "state"; data: { kpis: Record<string, unknown>; theaters: Record<string, unknown>[] } }
  | { type: "kpi"; data: Record<string, unknown> }
  | { type: "error"; data: { message: string } }
  | { type: "stopped"; data: Record<string, never> };

interface DaySummary {
  totalCustomers: number;
  totalBookings: number;
  totalLeft: number;
  promosCreated: number;
  optimizerActions: number;
  schedulerActions: number;
}

// ── Engine ───────────────────────────────────────────────────────────────────

const tick = () => new Promise((r) => setTimeout(r, 0));

class SimulationEngine {
  private _running = false;
  private _dayNumber = 0;
  private _abortController: AbortController | null = null;

  get isRunning() { return this._running; }
  get dayNumber() { return this._dayNumber; }

  async runDay(emit: (event: SSEEvent) => void, signal: AbortSignal): Promise<void> {
    this._dayNumber++;
    const clock = getSimulationClock();
    const db = getDb();
    const controller = new TheaterStateController(db);

    const baseDate = new Date("2026-03-14T08:00:00Z");
    baseDate.setUTCDate(baseDate.getUTCDate() + this._dayNumber - 1);
    const todayStr = baseDate.toISOString().split("T")[0];
    const simTimeMorning = `${todayStr}T08:00:00Z`;
    clock.jumpTo(simTimeMorning);

    const summary: DaySummary = {
      totalCustomers: 0, totalBookings: 0, totalLeft: 0,
      promosCreated: 0, optimizerActions: 0, schedulerActions: 0,
    };

    console.log(`\n[Engine] ═══ DAY ${this._dayNumber} START (${todayStr}) ═══`);
    emit({ type: "day_start", data: { dayNumber: this._dayNumber, date: todayStr, simTime: simTimeMorning } });
    insertEvent({ sim_time: simTimeMorning, event_type: "tick_start", agent: "engine", summary: `Day ${this._dayNumber} started (${todayStr})` });

    if (signal.aborted) return;

    // ── Strategic Agents (run in background — don't block customers) ────
    // These are slow LLM calls (Sonnet). Fire them off and let customers
    // start arriving immediately. Results emit as they complete.

    const runStrategicAgents = async () => {
      // Optimizer
      console.log("[Engine] Running Optimizer (background)...");
      try {
        const result = await runOptimizer(simTimeMorning);
        summary.optimizerActions = result.actions.length;
        console.log(`[Engine] Optimizer done: ${result.actions.length} actions`);
        for (const action of result.actions) {
          emit({ type: "event", data: { sim_time: simTimeMorning, event_type: action.action, agent: "optimizer", summary: action.summary, data: action.data ? JSON.stringify(action.data) : undefined } });
        }
      } catch (e) { console.error("[Engine] Optimizer error:", e); }

      // Scheduler
      console.log("[Engine] Running Scheduler (background)...");
      try {
        const result = await runScheduler(simTimeMorning);
        summary.schedulerActions = result.actions.length;
        console.log(`[Engine] Scheduler done: ${result.actions.length} actions`);
        for (const action of result.actions) {
          emit({ type: "event", data: { sim_time: simTimeMorning, event_type: action.action, agent: "scheduler", summary: action.summary, data: action.data ? JSON.stringify(action.data) : undefined } });
        }
      } catch (e) { console.error("[Engine] Scheduler error:", e); }

      // Promoter
      console.log("[Engine] Running Promoter (background)...");
      try {
        const result = await runPromoter(simTimeMorning);
        summary.promosCreated = result.actions.length;
        console.log(`[Engine] Promoter done: ${result.actions.length} actions`);
        for (const action of result.actions) {
          emit({ type: "event", data: { sim_time: simTimeMorning, event_type: action.action, agent: "promoter", summary: action.summary, data: action.data ? JSON.stringify(action.data) : undefined } });
        }
      } catch (e) { console.error("[Engine] Promoter error:", e); }

      emit({ type: "kpi", data: controller.getKPIs() as unknown as Record<string, unknown> });
      console.log("[Engine] All strategic agents complete");
    };

    // Fire and forget — don't await. Customers start immediately.
    const strategicPromise = runStrategicAgents();

    if (signal.aborted) return;

    // ── Continuous Customer Flow ─────────────────────────────────────────
    // Customers arrive one at a time throughout the day.
    // We interleave active and passive customers naturally.

    console.log(`[Engine] Starting customer flow: ${CUSTOMERS_PER_DAY.active} active + ${CUSTOMERS_PER_DAY.passive} passive`);

    const usedNames = new Set<string>();
    const allActive = spawnActiveCustomers(CUSTOMERS_PER_DAY.active).filter((c) => { if (usedNames.has(c.name)) return false; usedNames.add(c.name); return true; });
    const allPassive = spawnPassiveCustomers(CUSTOMERS_PER_DAY.passive).filter((c) => { if (usedNames.has(c.name)) return false; usedNames.add(c.name); return true; });

    // Interleave: roughly 2 active then 1 passive
    const customerQueue: { type: "active" | "passive"; customer: typeof allActive[0] }[] = [];
    let ai = 0, pi = 0;
    while (ai < allActive.length || pi < allPassive.length) {
      if (ai < allActive.length) customerQueue.push({ type: "active", customer: allActive[ai++] });
      if (ai < allActive.length) customerQueue.push({ type: "active", customer: allActive[ai++] });
      if (pi < allPassive.length) customerQueue.push({ type: "passive", customer: allPassive[pi++] });
    }

    summary.totalCustomers = customerQueue.length;
    let totalBooked = 0;
    let totalLeft = 0;

    // Advance clock through the day as customers arrive
    const hoursInDay = 14; // 8AM to 10PM
    const timePerCustomer = hoursInDay / Math.max(customerQueue.length, 1);

    for (let i = 0; i < customerQueue.length; i++) {
      if (signal.aborted) return;

      const { type, customer: c } = customerQueue[i];
      const customerHour = 8 + i * timePerCustomer;
      const h = Math.floor(customerHour);
      const m = Math.floor((customerHour - h) * 60);
      const simTime = `${todayStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
      clock.jumpTo(simTime);

      // Announce arrival
      console.log(`[Engine] 👤 ${type === "active" ? "Active" : "Passive"} customer #${i + 1}: ${c.name} (${c.favoriteGenres.join("/")})`);
      emit({
        type: "event",
        data: {
          sim_time: simTime,
          event_type: "customer_arrived",
          agent: "customer",
          summary: `${c.name} arrived (${c.favoriteGenres.join("/")} fan, group of ${c.groupSize})`,
          data: JSON.stringify({ customer: c.name, customerType: type, genres: c.favoriteGenres, groupSize: c.groupSize }),
        },
      });
      await tick();

      if (type === "active") {
        // Active customer — talks to manager
        try {
          const conv = await runActiveCustomer(c, simTime, (update) => {
            emit({ type: "conversation_update", data: update });
          });
          console.log(`[Engine]   → ${c.name}: ${conv.outcome}`);
          emit({ type: "conversation", data: conv });

          if (conv.outcome === "booked") {
            totalBooked++;
            emit({ type: "event", data: { sim_time: simTime, event_type: "customer_booked", agent: "customer", summary: `${c.name} booked tickets!`, data: JSON.stringify({ customer: c.name, ...(conv.bookingDetails || {}) }) } });
          } else {
            totalLeft++;
            emit({ type: "event", data: { sim_time: simTime, event_type: "customer_left", agent: "customer", summary: `${c.name} left without buying`, data: JSON.stringify({ customer: c.name }) } });
          }
        } catch (e) {
          console.error(`[Engine] Error with ${c.name}:`, e);
          totalLeft++;
        }
      } else {
        // Passive customer — responds to promotions
        const pr = await runPassiveCustomer(c, simTime);
        console.log(`[Engine]   → ${c.name}: ${pr.accepted ? "accepted" : "declined"}`);

        if (pr.accepted) {
          totalBooked++;
          emit({ type: "event", data: { sim_time: simTime, event_type: "promotion_accepted", agent: "customer", summary: `${pr.customerName} accepted promo "${pr.promoName}"`, data: JSON.stringify({ customer: pr.customerName, ...(pr.bookingDetails || {}) }) } });
        } else {
          totalLeft++;
          emit({ type: "event", data: { sim_time: simTime, event_type: "promotion_rejected", agent: "customer", summary: `${pr.customerName} declined${pr.promoName ? ` "${pr.promoName}"` : " — no matching promo"}`, data: JSON.stringify({ customer: pr.customerName }) } });
        }
      }

      await tick();

      // Emit KPIs every 3 customers so the UI stays updated
      if ((i + 1) % 3 === 0) {
        emit({ type: "kpi", data: controller.getKPIs() as unknown as Record<string, unknown> });
      }
    }

    summary.totalBookings = totalBooked;
    summary.totalLeft = totalLeft;

    // Wait for strategic agents to finish before ending the day
    await strategicPromise;

    // ── End of Day ───────────────────────────────────────────────────────

    console.log(`[Engine] ═══ DAY ${this._dayNumber} END — ${totalBooked} bookings, ${totalLeft} left ═══\n`);

    const endOfDayTime = `${todayStr}T22:00:00Z`;
    clock.jumpTo(endOfDayTime);

    const finalKpis = controller.getKPIs();
    const finalTheaters = controller.getTheaterSummaries();

    emit({ type: "state", data: { kpis: finalKpis as unknown as Record<string, unknown>, theaters: finalTheaters as unknown as Record<string, unknown>[] } });
    emit({ type: "kpi", data: finalKpis as unknown as Record<string, unknown> });
    emit({ type: "day_end", data: { dayNumber: this._dayNumber, date: todayStr, kpis: finalKpis as unknown as Record<string, unknown>, summary } });

    insertEvent({ sim_time: endOfDayTime, event_type: "tick_end", agent: "engine", summary: `Day ${this._dayNumber} ended — ${totalBooked} bookings, ${totalLeft} left, ${summary.totalCustomers} total customers` });
  }

  async runLoop(emit: (event: SSEEvent) => void, signal: AbortSignal): Promise<void> {
    this._running = true;
    try {
      while (this._running && !signal.aborted) {
        await this.runDay(emit, signal);
      }
    } catch (e) {
      if (!signal.aborted) {
        console.error("[Engine] Simulation loop error:", e);
        emit({ type: "error", data: { message: String(e) } });
      }
    } finally {
      this._running = false;
      emit({ type: "stopped", data: {} });
    }
  }

  stop(): void {
    this._running = false;
    if (this._abortController) { this._abortController.abort(); this._abortController = null; }
  }

  reset(): void {
    this.stop();
    this._dayNumber = 0;
    getSimulationClock().reset();
    clearEvents();
  }

  setAbortController(ac: AbortController): void {
    this._abortController = ac;
  }
}

let _engine: SimulationEngine | null = null;
export function getSimulationEngine(): SimulationEngine {
  if (!_engine) { _engine = new SimulationEngine(); }
  return _engine;
}
