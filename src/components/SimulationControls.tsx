"use client";

interface SimulationControlsProps {
  isRunning: boolean;
  dayNumber: number;
  currentDate: string;
  currentWave: string;
  simTime: string;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}

export default function SimulationControls({
  isRunning,
  dayNumber,
  currentDate,
  currentWave,
  simTime,
  onStart,
  onStop,
  onReset,
}: SimulationControlsProps) {
  const formattedTime = simTime
    ? new Date(simTime).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--";

  const waveLabel = currentWave
    ? currentWave.charAt(0).toUpperCase() + currentWave.slice(1)
    : "Idle";

  return (
    <div className="surface-card flex items-center gap-4 rounded-xl px-5 py-3">
      {/* Play/Stop */}
      <button
        onClick={isRunning ? onStop : onStart}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold transition-all"
        style={{
          background: isRunning ? "var(--accent-red)" : "var(--accent-green)",
          color: "#0a0a0a",
        }}
      >
        {isRunning ? "\u25A0" : "\u25B6"}
      </button>

      {/* Reset */}
      <button
        onClick={onReset}
        disabled={isRunning}
        className="rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--surface-border)" }}
      >
        Reset
      </button>

      {/* Divider */}
      <div className="h-8 w-px" style={{ background: "var(--surface-border)" }} />

      {/* Day indicator */}
      <div className="flex items-center gap-3">
        <div className="text-center">
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Day</div>
          <div className="text-xl font-bold gold-text">{dayNumber || "—"}</div>
        </div>

        {/* Wave indicator */}
        {isRunning && currentWave && (
          <div className="flex items-center gap-2 rounded-lg px-3 py-1.5"
            style={{ background: "var(--gold-glow)", border: "1px solid rgba(212,168,83,0.2)" }}>
            <div className="h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--gold)" }} />
            <span className="text-xs font-medium" style={{ color: "var(--gold)" }}>{waveLabel}</span>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-8 w-px" style={{ background: "var(--surface-border)" }} />

      {/* Clock display */}
      <div className="flex items-center gap-2">
        <div
          className={`h-2 w-2 rounded-full ${isRunning ? "animate-pulse" : ""}`}
          style={{ background: isRunning ? "var(--accent-green)" : "var(--text-muted)" }}
        />
        <span className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>
          {formattedTime}
        </span>
      </div>

      {/* Status */}
      <div className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>
        {isRunning ? (
          <span style={{ color: "var(--accent-green)" }}>Simulating...</span>
        ) : dayNumber > 0 ? (
          `Completed ${dayNumber} day${dayNumber !== 1 ? "s" : ""}`
        ) : (
          "Ready"
        )}
      </div>
    </div>
  );
}
