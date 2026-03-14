"use client";

interface TheaterCardProps {
  name: string;
  screenType: string;
  seatCount: number;
  fillRate: number;
  totalBooked: number;
  totalCapacity: number;
  currentMovie?: string;
  isActive: boolean;
}

export default function TheaterCard({
  name,
  screenType,
  seatCount,
  fillRate,
  totalBooked,
  totalCapacity,
  currentMovie,
  isActive,
}: TheaterCardProps) {
  const fillColor =
    fillRate > 70
      ? "var(--accent-green)"
      : fillRate > 40
        ? "var(--gold)"
        : "var(--accent-red)";

  const needsOptimization = fillRate < 40 && fillRate > 0;

  return (
    <div
      className={`surface-card relative overflow-hidden rounded-xl p-4 transition-all ${
        needsOptimization ? "animate-pulse-subtle" : ""
      }`}
      style={{
        borderColor: needsOptimization ? "rgba(217, 91, 91, 0.3)" : undefined,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {name}
          </h3>
          <span
            className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
            style={{ background: "var(--surface)", color: "var(--text-muted)" }}
          >
            {screenType}
          </span>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold" style={{ color: fillColor }}>
            {fillRate}%
          </div>
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>fill</div>
        </div>
      </div>

      {/* Current movie */}
      {currentMovie && (
        <div className="mt-2 truncate text-xs" style={{ color: "var(--text-secondary)" }}>
          Now: {currentMovie}
        </div>
      )}

      {/* Fill bar */}
      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface)" }}>
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${Math.min(fillRate, 100)}%`, background: fillColor }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px]" style={{ color: "var(--text-muted)" }}>
          <span>{totalBooked} booked</span>
          <span>{seatCount} seats</span>
        </div>
      </div>

      {/* Inactive overlay */}
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl"
          style={{ background: "rgba(8,8,10,0.8)" }}>
          <span className="text-xs font-medium" style={{ color: "var(--accent-red)" }}>Closed</span>
        </div>
      )}
    </div>
  );
}
