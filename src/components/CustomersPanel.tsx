"use client";

import { useEffect, useState, useRef } from "react";

interface Customer {
  id: number;
  name: string;
  customer_type: string;
  age: number;
  preferences: string;
  loyalty_tier: string;
  visit_frequency: string;
  budget_preference: string;
  preferred_showtime: string;
  interested_in_concessions: number;
  group_size_preference: number;
  notes: string;
}

function formatLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const POLL_INTERVAL_MS = 3000;

export default function CustomersPanel() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "buyer" | "persuadable">("all");
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const prevIdsRef = useRef<Set<number>>(new Set());
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<number>>(new Set());

  const fetchCustomers = () => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d: { customers: Customer[] }) => {
        const currentIds = new Set(d.customers.map((c) => c.id));
        const hadPrevious = prevIdsRef.current.size > 0;
        const added = hadPrevious
          ? d.customers.filter((c) => !prevIdsRef.current.has(c.id)).map((c) => c.id)
          : [];
        prevIdsRef.current = currentIds;
        setNewlyAddedIds(new Set(added));
        setCustomers(d.customers);
        setLoading(false);
        if (added.length > 0) {
          setTimeout(() => setNewlyAddedIds(new Set()), 500);
        }
      });
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    const interval = setInterval(fetchCustomers, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const filtered = customers.filter(
    (c) => filter === "all" || c.customer_type === filter
  );

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <span className="animate-pulse text-zinc-400">Loading customers...</span>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-120px)] overflow-hidden px-6 py-8">
      {/* Pool background */}
      <div
        className="absolute inset-0 -z-10 opacity-30"
        style={{
          background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(91,143,217,0.08) 0%, transparent 70%)",
        }}
      />

      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Customer Pool
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Hover for details · Updates every 3s · Booked customers disappear
          </p>
        </div>
        <div className="flex gap-1 rounded-lg p-1" style={{ background: "var(--surface)" }}>
          {(["all", "buyer", "persuadable"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {f === "all" ? "All" : f === "buyer" ? "Ready to Buy" : "Needs Persuasion"}
            </button>
          ))}
        </div>
      </div>

      {/* Bubble pool */}
      <div
        className="relative mx-auto min-h-[500px]"
        style={{
          perspective: "1200px",
          transformStyle: "preserve-3d",
        }}
      >
        <div className="bubble-pool flex flex-wrap justify-center gap-8 py-4">
          {filtered.map((c, i) => {
            const isBuyer = c.customer_type === "buyer";
            const isHovered = hoveredId === c.id;
            const delay = (i % 7) * 0.4;
            const duration = 4 + (i % 3) * 1.5;
            const isNew = newlyAddedIds.has(c.id);

            return (
              <div
                key={c.id}
                className={`bubble-wrapper relative flex items-center justify-center ${isNew ? "bubble-enter" : ""}`}
                style={{
                  animationDelay: isNew ? undefined : `${delay}s`,
                  animationDuration: isNew ? undefined : `${duration}s`,
                }}
              >
                <div
                  className="bubble-orb group relative flex h-20 w-20 cursor-pointer items-center justify-center transition-transform duration-300 hover:scale-110"
                  onMouseEnter={() => setHoveredId(c.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    animationDelay: `${delay + 0.2}s`,
                    animationDuration: `${duration + 0.5}s`,
                  }}
                >
                  {/* 3D bubble surface */}
                  <div
                    className="absolute inset-0 rounded-full transition-all duration-300"
                    style={{
                      background: isBuyer
                        ? "radial-gradient(circle at 30% 30%, rgba(167,243,208,0.6), rgba(110,231,183,0.45), rgba(52,211,153,0.3))"
                        : "radial-gradient(circle at 30% 30%, rgba(254,240,138,0.6), rgba(253,224,71,0.45), rgba(250,204,21,0.3))",
                      boxShadow: isBuyer
                        ? "inset -3px -3px 8px rgba(0,0,0,0.15), inset 3px 3px 8px rgba(255,255,255,0.2), 0 6px 16px rgba(110,231,183,0.15)"
                        : "inset -3px -3px 8px rgba(0,0,0,0.15), inset 3px 3px 8px rgba(255,255,255,0.2), 0 6px 16px rgba(253,224,71,0.15)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      transform: "translateZ(0)",
                    }}
                  />
                  {/* Name */}
                  <span
                    className="relative z-10 max-w-full truncate px-2 text-center text-xs font-medium"
                    style={{
                      color: "rgba(0,0,0,0.85)",
                      textShadow: "0 1px 2px rgba(255,255,255,0.5)",
                    }}
                  >
                    {c.name.split(" ")[0]}
                  </span>
                </div>

                {/* Hover card */}
                {isHovered && (
                  <div
                    className="bubble-tooltip absolute left-1/2 top-full z-50 mt-3 min-w-[240px] -translate-x-1/2 rounded-xl p-4 shadow-2xl"
                    style={{
                      background: "var(--surface-raised)",
                      border: "1px solid var(--surface-border)",
                      animation: "bubbleTooltipIn 0.2s ease-out",
                    }}
                    onMouseEnter={() => setHoveredId(c.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <div className="space-y-2 text-sm">
                      <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                        {c.name}
                      </p>
                      <p>
                        <span style={{ color: "var(--text-muted)" }}>Type: </span>
                        <span className={isBuyer ? "text-emerald-400" : "text-amber-400"}>
                          {isBuyer ? "Ready to Buy" : "Needs Persuasion"}
                        </span>
                      </p>
                      <p>
                        <span style={{ color: "var(--text-muted)" }}>Age: </span>
                        <span style={{ color: "var(--text-primary)" }}>{c.age}</span>
                      </p>
                      <p>
                        <span style={{ color: "var(--text-muted)" }}>Prefers: </span>
                        <span style={{ color: "var(--text-primary)" }}>{c.preferences}</span>
                      </p>
                      <p>
                        <span style={{ color: "var(--text-muted)" }}>Tier: </span>
                        <span style={{ color: "var(--text-primary)" }}>{c.loyalty_tier}</span>
                      </p>
                      <p>
                        <span style={{ color: "var(--text-muted)" }}>Visits: </span>
                        <span style={{ color: "var(--text-primary)" }}>{formatLabel(c.visit_frequency)}</span>
                      </p>
                      <p>
                        <span style={{ color: "var(--text-muted)" }}>Budget: </span>
                        <span style={{ color: "var(--text-primary)" }}>{formatLabel(c.budget_preference)}</span>
                      </p>
                      <p>
                        <span style={{ color: "var(--text-muted)" }}>Showtime: </span>
                        <span style={{ color: "var(--text-primary)" }}>{formatLabel(c.preferred_showtime)}</span>
                      </p>
                      <p>
                        <span style={{ color: "var(--text-muted)" }}>Group: </span>
                        <span style={{ color: "var(--text-primary)" }}>
                          {c.group_size_preference === 1 ? "Solo" : c.group_size_preference === 2 ? "Date" : `${c.group_size_preference}+`}
                        </span>
                      </p>
                      {c.notes && (
                        <p className="pt-1 border-t border-zinc-700/50">
                          <span style={{ color: "var(--text-muted)" }}>Notes: </span>
                          <span style={{ color: "var(--text-secondary)" }}>{c.notes}</span>
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
        {filtered.length} customers in pool
      </p>
    </div>
  );
}
