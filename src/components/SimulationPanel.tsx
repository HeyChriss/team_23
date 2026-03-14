"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import SimulationControls from "./SimulationControls";
import KPIBar from "./KPIBar";
import TheaterGrid from "./TheaterGrid";
import ActivityFeed from "./ActivityFeed";
import ConversationView from "./ConversationView";
import CustomerPoolLive from "./CustomerPoolLive";
import type { SimulationEvent, ConversationEntry } from "@/lib/agents/types";

// ── Types ────────────────────────────────────────────────────────────────────

interface KPIs {
  total_revenue: number;
  total_tickets_sold: number;
  total_bookings: number;
  avg_booking_value: number;
  avg_fill_rate: number;
  total_showtimes: number;
  sold_out_count: number;
  total_promos_active: number;
  total_promo_redemptions: number;
  total_discount_given: number;
  revenue_per_screen: number;
  tickets_per_showtime: number;
}

interface TheaterSummary {
  id: number;
  name: string;
  seat_count: number;
  screen_type: string;
  is_active: number;
  total_showtimes: number;
  total_capacity: number;
  total_booked: number;
  fill_rate: number;
}

interface ClockState {
  simTime: string;
  speed: number;
  isPaused: boolean;
  isRunning: boolean;
}

// Speed slider helpers
const SPEED_MIN = 0.5;
const SPEED_MAX = 100000;
function sliderToSpeed(val: number): number {
  if (val <= 0) return SPEED_MIN;
  return Math.round(SPEED_MIN * Math.pow(SPEED_MAX / SPEED_MIN, val / 100) * 10) / 10;
}
function speedToSlider(speed: number): number {
  if (speed <= SPEED_MIN) return 0;
  return (Math.log(speed / SPEED_MIN) / Math.log(SPEED_MAX / SPEED_MIN)) * 100;
}
function formatSpeed(speed: number): string {
  if (speed >= 10000) return `${(speed / 1000).toFixed(0)}Kx`;
  if (speed >= 1000) return `${(speed / 1000).toFixed(1)}Kx`;
  if (speed >= 1) return `${speed.toLocaleString()}x`;
  return `${speed}x`;
}

type SubTab = "controls" | "activity" | "conversations";

export default function SimulationPanel() {
  const [subTab, setSubTab] = useState<SubTab>("controls");

  // Clock state
  const [clock, setClock] = useState<ClockState | null>(null);

  // Simulation engine state
  const [simRunning, setSimRunning] = useState(false);
  const [dayNumber, setDayNumber] = useState(0);
  const [currentDate, setCurrentDate] = useState("");
  const [currentWave, setCurrentWave] = useState("");
  const [simTime, setSimTime] = useState("");
  const [simEvents, setSimEvents] = useState<SimulationEvent[]>([]);
  const [simConversations, setSimConversations] = useState<ConversationEntry[]>([]);
  const [simKpis, setSimKpis] = useState<KPIs | null>(null);
  const [simTheaters, setSimTheaters] = useState<TheaterSummary[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  // ── Clock polling ──────────────────────────────────────────────────────

  const fetchClock = useCallback(async () => {
    try {
      const res = await fetch("/api/clock");
      const data = await res.json();
      setClock(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchClock();
    const interval = setInterval(fetchClock, 1000);
    return () => clearInterval(interval);
  }, [fetchClock]);

  const sendClockAction = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/clock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setClock(data);
  };

  // ── Fetch initial KPIs/theaters ────────────────────────────────────────

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/theater-state?view=full");
      const data = await res.json();
      if (!simKpis) setSimKpis(data.kpis);
      if (simTheaters.length === 0) setSimTheaters(data.theaters);
    } catch { /* ignore */ }
  }, [simKpis, simTheaters.length]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // ── Simulation SSE ─────────────────────────────────────────────────────

  const startSimulation = useCallback(() => {
    if (eventSourceRef.current) eventSourceRef.current.close();

    setSimRunning(true);
    setSimEvents([]);
    setSimConversations([]);

    const es = new EventSource("/api/simulation/stream");
    eventSourceRef.current = es;

    es.addEventListener("day_start", (e) => {
      const data = JSON.parse(e.data);
      setDayNumber(data.dayNumber);
      setCurrentDate(data.date);
      setSimTime(data.simTime);
      setCurrentWave("");
      setSimEvents((prev) => [...prev.slice(-80), {
        sim_time: data.simTime, event_type: "tick_start", agent: "engine",
        summary: `Day ${data.dayNumber} started (${data.date})`,
      }]);
    });

    es.addEventListener("day_end", (e) => {
      const data = JSON.parse(e.data);
      setCurrentWave("");
      if (data.kpis) setSimKpis(data.kpis as KPIs);
      setSimEvents((prev) => [...prev.slice(-80), {
        sim_time: data.date, event_type: "tick_end", agent: "engine",
        summary: `Day ${data.dayNumber} ended — ${data.summary.totalBookings} bookings, ${data.summary.totalLeft} left`,
      }]);
      fetchState();
    });

    es.addEventListener("wave_start", (e) => {
      const data = JSON.parse(e.data);
      setCurrentWave(data.wave);
      setSimEvents((prev) => [...prev.slice(-80), {
        sim_time: data.timeLabel, event_type: "tick_start", agent: "engine",
        summary: `${data.wave.charAt(0).toUpperCase() + data.wave.slice(1)} wave started`,
      }]);
    });

    es.addEventListener("wave_end", (e) => {
      const data = JSON.parse(e.data);
      setSimEvents((prev) => [...prev.slice(-80), {
        sim_time: "", event_type: "tick_end", agent: "engine",
        summary: `${data.wave.charAt(0).toUpperCase() + data.wave.slice(1)} wave: ${data.booked} booked, ${data.left} left`,
      }]);
    });

    es.addEventListener("event", (e) => {
      const evData = JSON.parse(e.data);
      setSimEvents((prev) => [...prev.slice(-80), evData]);

      // Broadcast customer status to other components
      if (evData.event_type === "customer_arrived") {
        try {
          const parsed = evData.data ? JSON.parse(evData.data) : {};
          if (parsed.customer) {
            window.dispatchEvent(new CustomEvent("sim:customer-status", {
              detail: {
                customerName: parsed.customer,
                status: "active",
                agentType: parsed.customerType === "passive" ? "promoter" : "manager",
              },
            }));
          }
        } catch { /* ignore parse errors */ }
      } else if (evData.event_type === "promotion_accepted" || evData.event_type === "customer_booked") {
        try {
          const parsed = evData.data ? JSON.parse(evData.data) : {};
          if (parsed.customer) {
            window.dispatchEvent(new CustomEvent("sim:customer-status", {
              detail: { customerName: parsed.customer, status: "booked" },
            }));
          }
        } catch { /* ignore */ }
      } else if (evData.event_type === "promotion_rejected" || evData.event_type === "customer_left") {
        try {
          const parsed = evData.data ? JSON.parse(evData.data) : {};
          if (parsed.customer) {
            window.dispatchEvent(new CustomEvent("sim:customer-status", {
              detail: { customerName: parsed.customer, status: "left" },
            }));
          }
        } catch { /* ignore */ }
      }
    });

    es.addEventListener("conversation", (e) => {
      const conv = JSON.parse(e.data);
      setSimConversations((prev) => [...prev.slice(-50), conv]);

      // Broadcast conversation outcome
      if (conv.customerName) {
        window.dispatchEvent(new CustomEvent("sim:customer-status", {
          detail: {
            customerName: conv.customerName,
            status: conv.outcome === "booked" ? "booked" : "left",
          },
        }));
      }
    });

    es.addEventListener("kpi", (e) => {
      setSimKpis(JSON.parse(e.data) as KPIs);
    });

    es.addEventListener("state", (e) => {
      const data = JSON.parse(e.data);
      if (data.kpis) setSimKpis(data.kpis as KPIs);
      if (data.theaters) setSimTheaters(data.theaters as TheaterSummary[]);
    });

    es.addEventListener("stopped", () => {
      setSimRunning(false);
      setCurrentWave("");
      fetchState();
    });

    es.addEventListener("error", () => { setSimRunning(false); setCurrentWave(""); });
    es.onerror = () => { setSimRunning(false); setCurrentWave(""); es.close(); eventSourceRef.current = null; };
  }, [fetchState]);

  const stopSimulation = useCallback(async () => {
    if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
    await fetch("/api/simulation/control", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
    setSimRunning(false);
    setCurrentWave("");
    fetchState();
  }, [fetchState]);

  const resetSimulation = useCallback(async () => {
    if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
    await fetch("/api/simulation/control", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    setSimRunning(false);
    setDayNumber(0);
    setCurrentDate("");
    setCurrentWave("");
    setSimTime("");
    setSimEvents([]);
    setSimConversations([]);
    setSimKpis(null);
    setSimTheaters([]);
    fetchState();
  }, [fetchState]);

  useEffect(() => {
    return () => { if (eventSourceRef.current) eventSourceRef.current.close(); };
  }, []);

  // ── Broadcast running state & listen for external start/stop ──────────

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("sim:state", { detail: { running: simRunning, dayNumber } }));
  }, [simRunning, dayNumber]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { action } = (e as CustomEvent).detail as { action: string };
      if (action === "start" && !simRunning) startSimulation();
      else if (action === "stop" && simRunning) stopSimulation();
    };
    window.addEventListener("sim:control", handler);
    return () => window.removeEventListener("sim:control", handler);
  }, [simRunning, startSimulation, stopSimulation]);

  // ── Derived values ─────────────────────────────────────────────────────

  const clockTime = clock
    ? new Date(clock.simTime).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      })
    : "--";

  const sliderValue = clock ? speedToSlider(clock.speed) : 0;

  const defaultKpis: KPIs = {
    total_revenue: 0, total_tickets_sold: 0, total_bookings: 0,
    avg_booking_value: 0, avg_fill_rate: 0, total_showtimes: 0,
    sold_out_count: 0, total_promos_active: 0, total_promo_redemptions: 0,
    total_discount_given: 0, revenue_per_screen: 0, tickets_per_showtime: 0,
  };
  const displayKpis = simKpis || defaultKpis;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      {/* Sub-tabs */}
      <div className="mb-5 flex gap-1 rounded-lg p-1 animate-fade-in" style={{ background: "var(--surface)" }}>
        {([
          ["controls", "Controls"],
          ["activity", "Activity"],
          ["conversations", `Conversations (${simConversations.length})`],
        ] as [SubTab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`tab-pill flex-1 ${subTab === key ? "active" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      {subTab === "controls" && (
        <div className="space-y-5 animate-fade-in">
          {/* Clock display + speed */}
          <div className="surface-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.15em]" style={{ color: "var(--gold)" }}>
                  Simulation Time
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {clockTime}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.15em]" style={{ color: "var(--text-muted)" }}>
                  Speed
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {clock ? formatSpeed(clock.speed) : "--"}
                </p>
              </div>
            </div>

            {/* Speed slider */}
            <input
              type="range"
              min="0"
              max="100"
              step="0.5"
              value={sliderValue}
              onChange={(e) => sendClockAction({ action: "setSpeed", speed: sliderToSpeed(parseFloat(e.target.value)) })}
              className="w-full accent-[#d4a853] cursor-pointer"
              style={{ height: "6px" }}
            />
            <div className="mt-1 flex justify-between text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>0.5x</span>
              <span>60x</span>
              <span>3,600x</span>
              <span>100Kx</span>
            </div>

            {/* Clock controls */}
            <div className="mt-4 flex gap-3">
              {clock && clock.isRunning && !clock.isPaused ? (
                <button onClick={() => sendClockAction({ action: "pause" })}
                  className="rounded-xl px-6 py-2.5 text-sm font-semibold transition-all hover:translate-y-[-1px]"
                  style={{ background: "var(--gold)", color: "#0a0a0a" }}>
                  Pause Clock
                </button>
              ) : (
                <button onClick={() => sendClockAction({ action: "start" })}
                  className="rounded-xl px-6 py-2.5 text-sm font-semibold transition-all hover:translate-y-[-1px]"
                  style={{ background: "var(--accent-green)", color: "#0a0a0a" }}>
                  {clock?.isRunning ? "Resume Clock" : "Start Clock"}
                </button>
              )}
              <button onClick={() => sendClockAction({ action: "reset" })}
                className="rounded-xl px-6 py-2.5 text-sm font-semibold transition-all hover:translate-y-[-1px]"
                style={{ background: "var(--surface-raised)", border: "1px solid var(--surface-border)", color: "var(--text-secondary)" }}>
                Reset Clock
              </button>

              {/* Quick advance */}
              <div className="ml-auto flex gap-2">
                {[
                  { label: "+1h", minutes: 60 },
                  { label: "+6h", minutes: 360 },
                  { label: "+1d", minutes: 1440 },
                  { label: "+1w", minutes: 10080 },
                ].map((p) => (
                  <button key={p.minutes}
                    onClick={() => sendClockAction({ action: "advance", minutes: p.minutes })}
                    className="rounded-lg px-3 py-2 text-xs font-medium transition-all hover:translate-y-[-1px]"
                    style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", color: "var(--text-secondary)" }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Simulation engine controls */}
          <SimulationControls
            isRunning={simRunning}
            dayNumber={dayNumber}
            currentDate={currentDate}
            currentWave={currentWave}
            simTime={simTime}
            onStart={startSimulation}
            onStop={stopSimulation}
            onReset={resetSimulation}
          />

          {/* KPI bar */}
          <KPIBar
            revenue={displayKpis.total_revenue}
            ticketsSold={displayKpis.total_tickets_sold}
            activePromos={displayKpis.total_promos_active}
            avgFillRate={displayKpis.avg_fill_rate}
            totalBookings={displayKpis.total_bookings}
            dayNumber={dayNumber}
          />

          {/* Live customer pool */}
          <CustomerPoolLive />

          {/* Theater grid */}
          {simTheaters.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] gold-text">
                Theater Status
              </h3>
              <TheaterGrid theaters={simTheaters} />
            </div>
          )}

          {/* Recent activity preview */}
          {simEvents.length > 0 && (
            <div className="surface-card rounded-xl p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.15em] gold-text">
                  Recent Activity
                </h3>
                <button onClick={() => setSubTab("activity")}
                  className="text-xs" style={{ color: "var(--gold)" }}>
                  View All
                </button>
              </div>
              <ActivityFeed events={simEvents.slice(-8)} />
            </div>
          )}
        </div>
      )}

      {/* ── Activity Feed ─────────────────────────────────────────────────── */}
      {subTab === "activity" && (
        <div className="animate-fade-in">
          <div className="surface-card rounded-xl p-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] gold-text">
              Simulation Activity Log
            </h3>
            <ActivityFeed events={simEvents} />
          </div>
        </div>
      )}

      {/* ── Conversations ─────────────────────────────────────────────────── */}
      {subTab === "conversations" && (
        <div className="animate-fade-in">
          <ConversationView conversations={simConversations} />
        </div>
      )}
    </div>
  );
}
