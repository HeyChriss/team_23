"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface ClockState {
  simTime: string;
  speed: number;
  isPaused: boolean;
  isRunning: boolean;
  startTime: string;
}

const SIMULATION_DURATIONS = [
  { label: "1 Hour", minutes: 60 },
  { label: "3 Hours", minutes: 180 },
  { label: "6 Hours", minutes: 360 },
  { label: "12 Hours", minutes: 720 },
  { label: "1 Day", minutes: 1440 },
  { label: "3 Days", minutes: 4320 },
  { label: "1 Week", minutes: 10080 },
];

// Logarithmic speed slider: maps 0-100 to 0.5 - 100,000
const SPEED_MIN = 0.5;
const SPEED_MAX = 100000;

function sliderToSpeed(val: number): number {
  if (val <= 0) return SPEED_MIN;
  const speed = SPEED_MIN * Math.pow(SPEED_MAX / SPEED_MIN, val / 100);
  return Math.round(speed * 10) / 10;
}

function speedToSlider(speed: number): number {
  if (speed <= SPEED_MIN) return 0;
  return (Math.log(speed / SPEED_MIN) / Math.log(SPEED_MAX / SPEED_MIN)) * 100;
}

function formatSpeed(speed: number): string {
  if (speed >= 10000) return `${(speed / 1000).toFixed(0)}K x`;
  if (speed >= 1000) return `${(speed / 1000).toFixed(1)}K x`;
  if (speed >= 1) return `${speed.toLocaleString()}x`;
  return `${speed}x`;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

export default function TimeControl() {
  const [clock, setClock] = useState<ClockState | null>(null);
  const [loading, setLoading] = useState(true);
  const [simRunning, setSimRunning] = useState(false);
  const [simTarget, setSimTarget] = useState<string | null>(null);
  const [simLabel, setSimLabel] = useState("");
  const [simProgress, setSimProgress] = useState(0);
  const simStartRef = useRef<string | null>(null);
  const simDurationRef = useRef(0);

  const fetchClock = useCallback(async () => {
    const res = await fetch("/api/clock");
    const data = await res.json();
    setClock(data);
    setLoading(false);
    return data as ClockState;
  }, []);

  useEffect(() => {
    fetchClock();
    const interval = setInterval(fetchClock, 500);
    return () => clearInterval(interval);
  }, [fetchClock]);

  // Check if simulation target reached
  useEffect(() => {
    if (!simRunning || !simTarget || !clock) return;
    const current = new Date(clock.simTime).getTime();
    const target = new Date(simTarget).getTime();
    const start = new Date(simStartRef.current!).getTime();
    const totalDuration = target - start;
    const elapsed = current - start;
    setSimProgress(Math.min(100, (elapsed / totalDuration) * 100));

    if (current >= target) {
      // Auto-pause when target reached
      fetch("/api/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause" }),
      }).then(() => {
        setSimRunning(false);
        setSimTarget(null);
        setSimProgress(100);
        fetchClock();
      });
    }
  }, [clock, simRunning, simTarget, fetchClock]);

  const sendAction = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/clock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setClock(data);
    return data as ClockState;
  };

  const runSimulation = async (minutes: number, label: string) => {
    // Get current clock state
    const current = await fetchClock();
    const startTime = new Date(current.simTime);
    const targetTime = new Date(startTime.getTime() + minutes * 60 * 1000);

    simStartRef.current = startTime.toISOString();
    simDurationRef.current = minutes;
    setSimTarget(targetTime.toISOString());
    setSimLabel(label);
    setSimProgress(0);
    setSimRunning(true);

    // Start the clock
    await sendAction({ action: "start" });
  };

  const cancelSimulation = async () => {
    await sendAction({ action: "pause" });
    setSimRunning(false);
    setSimTarget(null);
    setSimProgress(0);
  };

  if (loading || !clock) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="animate-pulse text-lg" style={{ color: "var(--text-muted)" }}>
          Loading clock...
        </span>
      </div>
    );
  }

  const simDate = new Date(clock.simTime);
  const formattedDate = simDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const formattedTime = simDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const sliderValue = speedToSlider(clock.speed);

  // Estimate real time for each simulation duration at current speed
  const estimateRealTime = (simMinutes: number) => {
    const realMs = (simMinutes * 60 * 1000) / clock.speed;
    return formatDuration(realMs);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      {/* Header */}
      <div className="animate-fade-in text-center">
        <h2
          className="text-xl font-semibold"
          style={{ fontFamily: "'Playfair Display', serif", color: "var(--text-primary)" }}
        >
          Simulation Clock
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Control the flow of time in the theater simulation
        </p>
      </div>

      {/* Big clock display */}
      <div className="animate-fade-in-delay-1 surface-card rounded-2xl p-8 text-center">
        <p className="text-sm uppercase tracking-[0.15em]" style={{ color: "var(--gold)" }}>
          Current Simulation Time
        </p>
        <p
          className="mt-3 text-5xl font-bold tabular-nums tracking-tight"
          style={{ fontFamily: "'DM Sans', sans-serif", color: "var(--text-primary)" }}
        >
          {formattedTime}
        </p>
        <p className="mt-2 text-lg" style={{ color: "var(--text-secondary)" }}>
          {formattedDate}
        </p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              clock.isRunning && !clock.isPaused ? "animate-pulse" : ""
            }`}
            style={{
              background: clock.isRunning && !clock.isPaused ? "var(--accent-green)" : "var(--text-muted)",
            }}
          />
          <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            {simRunning
              ? `Simulating ${simLabel}...`
              : !clock.isRunning
                ? "Stopped"
                : clock.isPaused
                  ? "Paused"
                  : `Running at ${formatSpeed(clock.speed)}`}
          </span>
        </div>

        {/* Simulation progress bar */}
        {simRunning && (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ background: "var(--gold)", width: `${simProgress}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {Math.round(simProgress)}% complete
              </span>
              <button
                onClick={cancelSimulation}
                className="text-xs font-medium transition-colors"
                style={{ color: "var(--accent-red)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Speed slider */}
      <div className="animate-fade-in-delay-2 surface-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-xs font-semibold uppercase tracking-[0.15em]"
            style={{ color: "var(--gold)" }}
          >
            Time Speed
          </h3>
          <span className="text-xl font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
            {formatSpeed(clock.speed)}
          </span>
        </div>

        <input
          type="range"
          min="0"
          max="100"
          step="0.5"
          value={sliderValue}
          onChange={(e) => {
            const speed = sliderToSpeed(parseFloat(e.target.value));
            sendAction({ action: "setSpeed", speed });
          }}
          className="w-full accent-[#d4a853] cursor-pointer"
          style={{ height: "6px" }}
        />

        <div className="mt-2 flex justify-between text-[10px]" style={{ color: "var(--text-muted)" }}>
          <span>0.5x</span>
          <span>60x</span>
          <span>3,600x</span>
          <span>100Kx</span>
        </div>

        {/* Manual controls */}
        <div className="mt-4 flex justify-center gap-3">
          {clock.isRunning && !clock.isPaused ? (
            <button
              onClick={() => sendAction({ action: "pause" })}
              className="rounded-xl px-8 py-3 text-sm font-semibold transition-all hover:translate-y-[-1px]"
              style={{ background: "var(--gold)", color: "#0a0a0a" }}
            >
              Pause
            </button>
          ) : (
            <button
              onClick={() => sendAction({ action: "start" })}
              className="rounded-xl px-8 py-3 text-sm font-semibold transition-all hover:translate-y-[-1px]"
              style={{ background: "var(--accent-green)", color: "#0a0a0a" }}
            >
              {clock.isRunning ? "Resume" : "Start"}
            </button>
          )}
          <button
            onClick={() => sendAction({ action: "reset" })}
            className="rounded-xl px-8 py-3 text-sm font-semibold transition-all hover:translate-y-[-1px]"
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--surface-border)",
              color: "var(--text-secondary)",
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Run simulation for duration */}
      <div className="animate-fade-in-delay-3 surface-card rounded-2xl p-6">
        <h3
          className="mb-2 text-xs font-semibold uppercase tracking-[0.15em]"
          style={{ color: "var(--gold)" }}
        >
          Run Simulation
        </h3>
        <p className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
          Simulate a fixed duration at current speed, then auto-pause.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SIMULATION_DURATIONS.map((d) => (
            <button
              key={d.minutes}
              onClick={() => runSimulation(d.minutes, d.label)}
              disabled={simRunning}
              className="rounded-xl py-4 text-center transition-all hover:translate-y-[-1px] disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--surface-border)",
                color: "var(--text-primary)",
              }}
              onMouseEnter={(e) => {
                if (!simRunning) {
                  e.currentTarget.style.borderColor = "var(--gold)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--surface-border)";
              }}
            >
              <span className="block text-sm font-semibold">{d.label}</span>
              <span className="block mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                ~{estimateRealTime(d.minutes)} real
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
