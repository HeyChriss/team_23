/**
 * Simulation Engine — day-by-day orchestration of all agents.
 *
 * Each "day" is a complete simulation cycle:
 *   1. Strategic Phase: Optimizer → Scheduler → Promoter
 *   2. Customer Waves: Morning → Afternoon → Evening
 *   3. End-of-day: KPI snapshot, advance clock to next day
 *
 * There are no artificial timers — each day runs at the speed of the
 * LLM calls. When all conversations and agent work are exhausted,
 * the day ends and the next one begins immediately.
 */

import { getSimulationClock } from "./simulation-clock";
import { TheaterStateController } from "./theater-state";
import { getDb } from "./db";
import { insertEvent, clearEvents } from "./event-store";
import { spawnActiveCustomers, spawnPassiveCustomers } from "./agents/customer-spawner";
import { runActiveCustomerBatch } from "./agents/customer-active";
import { runPassiveCustomerBatch } from "./agents/customer-passive";
import { runOptimizer } from "./agents/optimizer";
import { runScheduler } from "./agents/scheduler";
import { runPromoter } from "./agents/promoter-agent";
import type { SimulationEvent, ConversationEntry } from "./agents/types";

// ── Wave config ─────────────────────────────────────────────────────────────

interface WaveConfig {
  name: string;
  timeLabel: string;     // e.g. "10:00" — for display purposes
  activeCustomers: number;
  passiveCustomers: number;
}

const DAILY_WAVES: WaveConfig[] = [
  { name: "morning",   timeLabel: "10:00", activeCustomers: 3, passiveCustomers: 1 },
  { name: "afternoon", timeLabel: "14:00", activeCustomers: 5, passiveCustomers: 2 },
  { name: "evening",   timeLabel: "18:00", activeCustomers: 7, passiveCustomers: 3 },
];

// ── SSE event types ─────────────────────────────────────────────────────────

export type SSEEvent =
  | { type: "day_start"; data: { dayNumber: number; date: string; simTime: string } }
  | { type: "day_end"; data: { dayNumber: number; date: string; kpis: Record<string, unknown>; summary: DaySummary } }
  | { type: "wave_start"; data: { wave: string; timeLabel: string; dayNumber: number } }
  | { type: "wave_end"; data: { wave: string; booked: number; left: number } }
  | { type: "event"; data: SimulationEvent }
  | { type: "conversation"; data: ConversationEntry }
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

// ── Engine ──────────────────────────────────────────────────────────────────

class SimulationEngine {
  private _running = false;
  private _dayNumber = 0;
  private _abortController: AbortController | null = null;

  get isRunning() {
    return this._running;
  }

  get dayNumber() {
    return this._dayNumber;
  }

  /**
   * Run a single simulated day. All phases execute, then the day ends.
   */
  async runDay(emit: (event: SSEEvent) => void, signal: AbortSignal): Promise<void> {
    this._dayNumber++;
    const clock = getSimulationClock();
    const db = getDb();
    const controller = new TheaterStateController(db);

    // Set clock to morning of this day
    const baseDate = new Date("2026-03-14T08:00:00Z");
    baseDate.setUTCDate(baseDate.getUTCDate() + this._dayNumber - 1);
    const todayStr = baseDate.toISOString().split("T")[0];
    const simTimeMorning = `${todayStr}T08:00:00Z`;
    clock.jumpTo(simTimeMorning);

    const summary: DaySummary = {
      totalCustomers: 0,
      totalBookings: 0,
      totalLeft: 0,
      promosCreated: 0,
      optimizerActions: 0,
      schedulerActions: 0,
    };

    emit({ type: "day_start", data: { dayNumber: this._dayNumber, date: todayStr, simTime: simTimeMorning } });
    insertEvent({ sim_time: simTimeMorning, event_type: "tick_start", agent: "engine", summary: `Day ${this._dayNumber} started (${todayStr})` });

    if (signal.aborted) return;

    // ── Phase 1: Strategic Agents (sequential) ──────────────────────────

    // Optimizer
    try {
      const optimizerResult = await runOptimizer(simTimeMorning);
      summary.optimizerActions = optimizerResult.actions.length;
      for (const action of optimizerResult.actions) {
        emit({
          type: "event",
          data: {
            sim_time: simTimeMorning,
            event_type: action.action,
            agent: "optimizer",
            summary: action.summary,
            data: action.data ? JSON.stringify(action.data) : undefined,
          },
        });
      }
    } catch (e) {
      console.error("Optimizer error:", e);
    }

    if (signal.aborted) return;

    // Scheduler
    try {
      const schedulerResult = await runScheduler(simTimeMorning);
      summary.schedulerActions = schedulerResult.actions.length;
      for (const action of schedulerResult.actions) {
        emit({
          type: "event",
          data: {
            sim_time: simTimeMorning,
            event_type: action.action,
            agent: "scheduler",
            summary: action.summary,
            data: action.data ? JSON.stringify(action.data) : undefined,
          },
        });
      }
    } catch (e) {
      console.error("Scheduler error:", e);
    }

    if (signal.aborted) return;

    // Promoter
    try {
      const promoterResult = await runPromoter(simTimeMorning);
      summary.promosCreated = promoterResult.actions.length;
      for (const action of promoterResult.actions) {
        emit({
          type: "event",
          data: {
            sim_time: simTimeMorning,
            event_type: action.action,
            agent: "promoter",
            summary: action.summary,
            data: action.data ? JSON.stringify(action.data) : undefined,
          },
        });
      }
    } catch (e) {
      console.error("Promoter error:", e);
    }

    if (signal.aborted) return;

    // ── Phase 2: Customer Waves ─────────────────────────────────────────

    const usedNames = new Set<string>();

    for (const wave of DAILY_WAVES) {
      if (signal.aborted) return;

      const waveTime = `${todayStr}T${wave.timeLabel}:00Z`;
      clock.jumpTo(waveTime);

      emit({ type: "wave_start", data: { wave: wave.name, timeLabel: wave.timeLabel, dayNumber: this._dayNumber } });

      // Active customers
      const activeCustomers = spawnActiveCustomers(wave.activeCustomers)
        .filter((c) => !usedNames.has(c.name));
      activeCustomers.forEach((c) => usedNames.add(c.name));

      for (const c of activeCustomers) {
        emit({
          type: "event",
          data: {
            sim_time: waveTime,
            event_type: "customer_arrived",
            agent: "customer",
            summary: `${c.name} arrived (${c.favoriteGenres.join("/")} fan, group of ${c.groupSize})`,
            data: JSON.stringify({ customer: c.name, customerType: "active", genres: c.favoriteGenres, groupSize: c.groupSize }),
          },
        });
      }

      summary.totalCustomers += activeCustomers.length;

      const conversations = await runActiveCustomerBatch(activeCustomers, waveTime);
      let waveBooked = 0;
      let waveLeft = 0;
      for (const conv of conversations) {
        emit({ type: "conversation", data: conv });
        if (conv.outcome === "booked") {
          waveBooked++;
          summary.totalBookings++;
        } else {
          waveLeft++;
          summary.totalLeft++;
        }
      }

      // Passive customers (respond to promotions)
      const passiveCustomers = spawnPassiveCustomers(wave.passiveCustomers)
        .filter((c) => !usedNames.has(c.name));
      passiveCustomers.forEach((c) => usedNames.add(c.name));
      summary.totalCustomers += passiveCustomers.length;

      for (const c of passiveCustomers) {
        emit({
          type: "event",
          data: {
            sim_time: waveTime,
            event_type: "customer_arrived",
            agent: "customer",
            summary: `${c.name} arrived (passive, ${c.favoriteGenres.join("/")} fan)`,
            data: JSON.stringify({ customer: c.name, customerType: "passive" }),
          },
        });
      }

      const passiveResults = await runPassiveCustomerBatch(passiveCustomers, waveTime);
      for (const pr of passiveResults) {
        if (pr.accepted) {
          waveBooked++;
          summary.totalBookings++;
          emit({
            type: "event",
            data: {
              sim_time: waveTime,
              event_type: "promotion_accepted",
              agent: "customer",
              summary: `${pr.customerName} accepted promo "${pr.promoName}"`,
              data: JSON.stringify({ customer: pr.customerName, ...(pr.bookingDetails || {}) }),
            },
          });
        } else {
          waveLeft++;
          summary.totalLeft++;
          emit({
            type: "event",
            data: {
              sim_time: waveTime,
              event_type: "promotion_rejected",
              agent: "customer",
              summary: `${pr.customerName} declined${pr.promoName ? ` "${pr.promoName}"` : " — no matching promo"}`,
              data: JSON.stringify({ customer: pr.customerName }),
            },
          });
        }
      }

      // Emit KPIs after each wave
      const waveKpis = controller.getKPIs();
      emit({ type: "kpi", data: waveKpis as unknown as Record<string, unknown> });
      emit({ type: "wave_end", data: { wave: wave.name, booked: waveBooked, left: waveLeft } });
    }

    // ── Phase 3: End of Day ─────────────────────────────────────────────

    const endOfDayTime = `${todayStr}T22:00:00Z`;
    clock.jumpTo(endOfDayTime);

    const finalKpis = controller.getKPIs();
    const finalTheaters = controller.getTheaterSummaries();

    emit({
      type: "state",
      data: {
        kpis: finalKpis as unknown as Record<string, unknown>,
        theaters: finalTheaters as unknown as Record<string, unknown>[],
      },
    });

    emit({
      type: "day_end",
      data: {
        dayNumber: this._dayNumber,
        date: todayStr,
        kpis: finalKpis as unknown as Record<string, unknown>,
        summary,
      },
    });

    insertEvent({
      sim_time: endOfDayTime,
      event_type: "tick_end",
      agent: "engine",
      summary: `Day ${this._dayNumber} ended — ${summary.totalBookings} bookings, ${summary.totalLeft} left, ${summary.totalCustomers} total customers`,
    });
  }

  /**
   * Run simulation loop: one day after another until stopped.
   * No artificial delays — each day runs as fast as the API calls complete.
   */
  async runLoop(emit: (event: SSEEvent) => void, signal: AbortSignal): Promise<void> {
    this._running = true;

    try {
      while (this._running && !signal.aborted) {
        await this.runDay(emit, signal);
      }
    } catch (e) {
      if (!signal.aborted) {
        console.error("Simulation loop error:", e);
        emit({ type: "error", data: { message: String(e) } });
      }
    } finally {
      this._running = false;
      emit({ type: "stopped", data: {} });
    }
  }

  stop(): void {
    this._running = false;
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  reset(): void {
    this.stop();
    this._dayNumber = 0;
    const clock = getSimulationClock();
    clock.reset();
    clearEvents();
  }

  setAbortController(ac: AbortController): void {
    this._abortController = ac;
  }
}

// Singleton
let _engine: SimulationEngine | null = null;

export function getSimulationEngine(): SimulationEngine {
  if (!_engine) {
    _engine = new SimulationEngine();
  }
  return _engine;
}
