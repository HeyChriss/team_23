"use client";

import { useEffect, useState, useRef, useCallback } from "react";

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
  buy_likelihood: number;
}

interface PoolBubble {
  customer: Customer;
  state: "spawning" | "floating" | "exiting-buy" | "exiting-leave";
  x: number; // percentage position in pool
  y: number;
  vx: number; // velocity
  vy: number;
}

function formatLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const POLL_INTERVAL_MS = 1500;

export default function CustomersPanel() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "buyer" | "persuadable">("all");
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [bubbles, setBubbles] = useState<PoolBubble[]>([]);
  const prevIdsRef = useRef<Set<number>>(new Set());
  const bubblesRef = useRef<PoolBubble[]>([]);
  const [minPool, setMinPool] = useState(15);
  const [spawning, setSpawning] = useState(false);
  const spawningRef = useRef(false);
  const [processing, setProcessing] = useState(false);
  const [lastResults, setLastResults] = useState<{ customerName: string; outcome: string; details: Record<string, unknown> }[]>([]);
  const [activeConversations, setActiveConversations] = useState<Map<string, "manager" | "promoter">>(new Map());

  // Live conversation feed
  interface LiveStep { step: string; message: string; ts: number }
  interface LiveConv { agentType: "manager" | "promoter"; steps: LiveStep[]; outcome?: "booked" | "left" }
  const [liveConversations, setLiveConversations] = useState<Map<string, LiveConv>>(new Map());
  const feedRef = useRef<HTMLDivElement>(null);

  // Keep ref in sync
  useEffect(() => {
    bubblesRef.current = bubbles;
  }, [bubbles]);

  // ── Physics simulation ─────────────────────────────────────────────────
  const animRef = useRef<number>(0);
  const BUBBLE_R = 7; // radius in percentage units
  const CENTER_X = 50;
  const CENTER_Y = 50;
  const DAMPING = 0.92;
  const CENTER_PULL = 0.02;
  const REPEL_FORCE = 2.5;
  const WALL_PUSH = 1.5;
  const MIN_DIST = BUBBLE_R * 2.2; // minimum distance between bubble centers

  useEffect(() => {
    const tick = () => {
      setBubbles((prev) => {
        const floating = prev.filter((b) => b.state === "floating");
        if (floating.length === 0) return prev;

        const updated = prev.map((b) => {
          if (b.state !== "floating") return b;

          let { x, y, vx, vy } = b;

          // Attract toward center
          vx += (CENTER_X - x) * CENTER_PULL;
          vy += (CENTER_Y - y) * CENTER_PULL;

          // Repel from other floating bubbles
          for (const other of floating) {
            if (other.customer.id === b.customer.id) continue;
            const dx = x - other.x;
            const dy = y - other.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
            if (dist < MIN_DIST) {
              const force = REPEL_FORCE * (MIN_DIST - dist) / MIN_DIST;
              vx += (dx / dist) * force;
              vy += (dy / dist) * force;
            }
          }

          // Wall boundaries (keep within 5%-95% x, 5%-90% y)
          if (x < 8) vx += WALL_PUSH;
          if (x > 92) vx -= WALL_PUSH;
          if (y < 8) vy += WALL_PUSH;
          if (y > 88) vy -= WALL_PUSH;

          // Apply damping
          vx *= DAMPING;
          vy *= DAMPING;

          // Update position
          x = Math.max(5, Math.min(95, x + vx));
          y = Math.max(5, Math.min(90, y + vy));

          return { ...b, x, y, vx, vy };
        });

        return updated;
      });

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const spawnBubble = useCallback((c: Customer) => {
    const bubble: PoolBubble = {
      customer: c,
      state: "spawning",
      x: 40 + Math.random() * 20,
      y: 3,
      vx: (Math.random() - 0.5) * 2,
      vy: 1 + Math.random(),
    };
    setBubbles((prev) => [...prev, bubble]);
    setTimeout(() => {
      setBubbles((prev) =>
        prev.map((b) =>
          b.customer.id === c.id && b.state === "spawning"
            ? { ...b, state: "floating" }
            : b
        )
      );
    }, 600);
  }, []);

  const exitBubble = useCallback((id: number, bought: boolean) => {
    setBubbles((prev) =>
      prev.map((b) =>
        b.customer.id === id
          ? { ...b, state: bought ? "exiting-buy" : "exiting-leave", vx: 0, vy: 0 }
          : b
      )
    );
    setTimeout(() => {
      setBubbles((prev) => prev.filter((b) => b.customer.id !== id));
    }, 800);
  }, []);

  const fetchCustomers = useCallback(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d: { customers: Customer[] }) => {
        const currentIds = new Set(d.customers.map((c) => c.id));
        const hadPrevious = prevIdsRef.current.size > 0;

        if (hadPrevious) {
          // New customers → spawn them
          const added = d.customers.filter((c) => !prevIdsRef.current.has(c.id));
          added.forEach((c) => spawnBubble(c));

          // Removed customers → they were booked (the API filters out customers with bookings)
          const removed = [...prevIdsRef.current].filter((id) => !currentIds.has(id));
          removed.forEach((id) => exitBubble(id, true));
        } else {
          // Initial load — add all as floating
          d.customers.forEach((c, i) => {
            setTimeout(() => spawnBubble(c), i * 80);
          });
        }

        prevIdsRef.current = currentIds;
        setCustomers(d.customers);
        setLoading(false);
      });
  }, [spawnBubble, exitBubble]);

  const spawnCustomers = useCallback(async (count: number) => {
    if (spawningRef.current) return;
    spawningRef.current = true;
    setSpawning(true);
    try {
      await fetch("/api/agents/customer-spawner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
    } finally {
      spawningRef.current = false;
      setSpawning(false);
      // Always refresh after spawning so count updates
      fetchCustomers();
    }
  }, [fetchCustomers]);

  const processCustomers = useCallback(async (count: number) => {
    if (processing) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/agents/customer-decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      const data = await res.json();
      setLastResults(data.results || []);

      // Trigger exits for customers who bought
      for (const r of data.results || []) {
        if (r.outcome === "bought") {
          exitBubble(r.customerId, true);
        } else {
          exitBubble(r.customerId, false);
        }
      }

      // Refresh after a delay to let animations play
      setTimeout(fetchCustomers, 1500);
    } finally {
      setProcessing(false);
    }
  }, [processing, exitBubble, fetchCustomers]);

  // Display count = floating bubbles (real-time), DB count for auto-spawn
  const floatingCount = bubbles.filter((b) => b.state === "floating").length;
  const poolCount = customers.length;
  useEffect(() => {
    if (loading || spawningRef.current) return;
    if (poolCount < minPool) {
      const deficit = minPool - poolCount;
      spawnCustomers(Math.min(deficit, 10));
    }
  }, [poolCount, minPool, loading, spawnCustomers]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    const interval = setInterval(fetchCustomers, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchCustomers]);

  // ── Refresh when simulation waves complete ───────────────────────────────
  useEffect(() => {
    const handler = () => fetchCustomers();
    window.addEventListener("sim:customer-refresh", handler);
    return () => window.removeEventListener("sim:customer-refresh", handler);
  }, [fetchCustomers]);

  // ── Listen for simulation engine customer events ─────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { customerName, status, agentType } = (e as CustomEvent).detail as {
        customerName: string;
        status: "active" | "booked" | "left";
        agentType?: "manager" | "promoter";
      };
      if (!customerName) return;

      if (status === "active") {
        // Customer started talking to an agent — track the connection
        const agent = agentType || "manager";
        setActiveConversations((prev) => new Map(prev).set(customerName, agent));
        // Create live conversation entry
        setLiveConversations((prev) => {
          const next = new Map(prev);
          next.set(customerName, { agentType: agent, steps: [], outcome: undefined });
          return next;
        });
      } else if (status === "booked" || status === "left") {
        // Conversation ended — remove tracking and exit bubble
        setActiveConversations((prev) => {
          const next = new Map(prev);
          next.delete(customerName);
          return next;
        });
        // Update live conversation outcome
        setLiveConversations((prev) => {
          const next = new Map(prev);
          const conv = next.get(customerName);
          if (conv) next.set(customerName, { ...conv, outcome: status });
          return next;
        });
        const bubble = bubblesRef.current.find(
          (b) => b.customer.name === customerName && (b.state === "floating" || b.state === "spawning")
        );
        if (bubble) exitBubble(bubble.customer.id, status === "booked");
      }
    };
    window.addEventListener("sim:customer-status", handler);
    return () => window.removeEventListener("sim:customer-status", handler);
  }, [exitBubble]);

  // ── Listen for live conversation step updates ─────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { customerName, step, message, data } = (e as CustomEvent).detail as {
        customerName: string;
        step: string;
        message: string;
        data?: Record<string, unknown>;
      };
      if (!customerName) return;

      setLiveConversations((prev) => {
        const next = new Map(prev);
        const conv = next.get(customerName);
        if (conv) {
          next.set(customerName, {
            ...conv,
            steps: [...conv.steps, { step, message, ts: Date.now() }],
          });
        }
        return next;
      });

      // Auto-scroll feed
      setTimeout(() => feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" }), 50);
    };
    window.addEventListener("sim:conversation-update", handler);
    return () => window.removeEventListener("sim:conversation-update", handler);
  }, []);

  const filteredBubbles = bubbles.filter(
    (b) => filter === "all" || b.customer.customer_type === filter
  );

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <span className="animate-pulse" style={{ color: "var(--text-muted)" }}>Loading customers...</span>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-120px)] overflow-hidden px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
            Customer Pool &amp; Promotions
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Customers spawn at top, float in pool, exit at bottom based on decisions
          </p>
        </div>
        <div className="flex gap-1 rounded-lg p-1" style={{ background: "var(--surface)" }}>
          {(["all", "buyer", "persuadable"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`tab-pill ${filter === f ? "active" : ""}`}
            >
              {f === "all" ? "All" : f === "buyer" ? "Ready to Buy" : "Needs Persuasion"}
            </button>
          ))}
        </div>
      </div>

      {/* Pool controls */}
      <div className="mb-6 surface-card rounded-xl px-5 py-3 flex items-center gap-6">
        <div className="flex items-center gap-3 flex-1">
          <span className="text-xs font-medium whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
            Min Pool Size
          </span>
          <input
            type="range"
            min="5"
            max="50"
            value={minPool}
            onChange={(e) => setMinPool(parseInt(e.target.value))}
            className="flex-1 accent-[#d4a853] cursor-pointer"
          />
          <span className="text-sm font-bold tabular-nums w-8 text-center" style={{ color: "var(--gold)" }}>
            {minPool}
          </span>
        </div>

        <div className="h-6 w-px" style={{ background: "var(--surface-border)" }} />

        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
            {floatingCount} in pool
          </span>
          {spawning && (
            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--accent-green)" }}>
              <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--accent-green)" }} />
              Spawning...
            </span>
          )}
        </div>

        <button
          onClick={() => spawnCustomers(5)}
          disabled={spawning}
          className="rounded-lg px-4 py-2 text-xs font-semibold transition-all hover:translate-y-[-1px] disabled:opacity-40"
          style={{ background: "var(--gold-glow)", border: "1px solid rgba(212,168,83,0.3)", color: "var(--gold)" }}
        >
          + Spawn 5
        </button>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6" style={{ minHeight: "calc(100vh - 220px)" }}>
        <div className="w-1/2 relative">
          <div className="surface-card rounded-2xl p-5 h-full flex flex-col overflow-hidden">
            {/* Spawn zone (top) */}
            <div className="relative flex items-center justify-center py-3 mb-2">
              <div
                className="flex items-center gap-2 rounded-full px-4 py-1.5"
                style={{ background: "rgba(91,217,123,0.1)", border: "1px solid rgba(91,217,123,0.2)" }}
              >
                <div className="h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--accent-green)" }} />
                <span className="text-xs font-medium" style={{ color: "var(--accent-green)" }}>
                  Customers Arriving
                </span>
              </div>
              {/* Spawn glow */}
              <div
                className="absolute inset-x-0 top-0 h-16 -z-10"
                style={{ background: "radial-gradient(ellipse 60% 100% at 50% 0%, rgba(91,217,123,0.08) 0%, transparent 100%)" }}
              />
            </div>

            {/* Pool area */}
            <div className="relative flex-1 min-h-[400px]">
              {/* Agent nodes — always visible */}
              <>
                {/* Manager Agent node */}
                <div
                  className="absolute z-30 flex flex-col items-center gap-1"
                  style={{ left: "8%", top: "10%", transform: "translate(-50%, -50%)" }}
                >
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-xl transition-all duration-300"
                    style={{
                      background: activeConversations.size > 0 ? "rgba(91,217,123,0.15)" : "rgba(91,217,123,0.06)",
                      border: `2px solid ${activeConversations.size > 0 ? "var(--accent-green)" : "rgba(91,217,123,0.2)"}`,
                      boxShadow: activeConversations.size > 0 ? "0 0 20px rgba(91,217,123,0.3)" : "none",
                    }}
                  >
                    <span className="text-xl">&#128188;</span>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: activeConversations.size > 0 ? "var(--accent-green)" : "var(--text-muted)" }}>
                    Manager
                  </span>
                </div>

                {/* Promoter Agent node */}
                <div
                  className="absolute z-30 flex flex-col items-center gap-1"
                  style={{ left: "92%", top: "10%", transform: "translate(-50%, -50%)" }}
                >
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-xl transition-all duration-300"
                    style={{
                      background: activeConversations.size > 0 ? "rgba(212,168,83,0.15)" : "rgba(212,168,83,0.06)",
                      border: `2px solid ${activeConversations.size > 0 ? "var(--gold)" : "rgba(212,168,83,0.2)"}`,
                      boxShadow: activeConversations.size > 0 ? "0 0 20px rgba(212,168,83,0.3)" : "none",
                    }}
                  >
                    <span className="text-xl">&#128227;</span>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: activeConversations.size > 0 ? "var(--gold)" : "var(--text-muted)" }}>
                    Promoter
                  </span>
                </div>

                  {/* SVG connection lines */}
                  <svg
                    className="absolute inset-0 z-20 pointer-events-none"
                    style={{ width: "100%", height: "100%" }}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="line-manager" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="rgba(91,217,123,0.6)" />
                        <stop offset="100%" stopColor="rgba(91,217,123,0.1)" />
                      </linearGradient>
                      <linearGradient id="line-promoter" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="rgba(212,168,83,0.6)" />
                        <stop offset="100%" stopColor="rgba(212,168,83,0.1)" />
                      </linearGradient>
                    </defs>
                    {filteredBubbles
                      .filter((b) => b.state === "floating" && activeConversations.has(b.customer.name))
                      .map((b) => {
                        const agent = activeConversations.get(b.customer.name)!;
                        const agentX = agent === "manager" ? 12 : 88;
                        const agentY = 12;
                        return (
                          <line
                            key={`line-${b.customer.id}`}
                            x1={agentX}
                            y1={agentY}
                            x2={b.x}
                            y2={b.y}
                            stroke={`url(#line-${agent})`}
                            strokeWidth="0.4"
                            strokeDasharray="1.5 1"
                            style={{ animation: "dashScroll 1s linear infinite" }}
                          />
                        );
                      })}
                  </svg>
                </>

              {filteredBubbles.map((b) => {
                const c = b.customer;
                const likelihood = c.buy_likelihood ?? 50;
                // Green (high likelihood) to Red (low likelihood)
                const r = Math.round(255 * (1 - likelihood / 100));
                const g = Math.round(200 * (likelihood / 100));
                const bubbleColor = `${r},${g},80`;
                const isHovered = hoveredId === c.id;
                const isActive = activeConversations.has(c.name);
                const agentType = activeConversations.get(c.name);

                const isExiting = b.state === "exiting-buy" || b.state === "exiting-leave";
                const exitTarget = b.state === "exiting-buy" ? { x: 25, y: 100 } : { x: 75, y: 100 };

                return (
                  <div
                    key={c.id}
                    className="absolute"
                    style={{
                      left: `${isExiting ? exitTarget.x : b.x}%`,
                      top: `${isExiting ? exitTarget.y : b.y}%`,
                      transform: `translate(-50%, -50%) scale(${b.state === "spawning" ? 0 : isExiting ? 0 : 1})`,
                      transition: b.state === "spawning"
                        ? "transform 0.5s ease-out"
                        : isExiting
                          ? "all 0.8s ease-in"
                          : "none",
                      opacity: isExiting ? 0 : 1,
                      zIndex: isActive ? 35 : isHovered ? 40 : 1,
                    }}
                  >
                    <div
                      className="group relative flex h-16 w-16 cursor-pointer items-center justify-center transition-transform duration-200 hover:scale-110"
                      onMouseEnter={() => setHoveredId(c.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      <div
                        className="absolute inset-0 rounded-full transition-all duration-300"
                        style={{
                          background: isActive
                            ? agentType === "promoter"
                              ? "radial-gradient(circle at 30% 30%, rgba(212,168,83,0.7), rgba(212,168,83,0.5), rgba(212,168,83,0.3))"
                              : "radial-gradient(circle at 30% 30%, rgba(91,217,123,0.7), rgba(91,217,123,0.5), rgba(91,217,123,0.3))"
                            : `radial-gradient(circle at 30% 30%, rgba(${bubbleColor},0.85), rgba(${bubbleColor},0.65), rgba(${bubbleColor},0.45))`,
                          boxShadow: isActive
                            ? agentType === "promoter"
                              ? "inset -3px -3px 8px rgba(0,0,0,0.15), inset 3px 3px 8px rgba(255,255,255,0.2), 0 0 24px rgba(212,168,83,0.5)"
                              : "inset -3px -3px 8px rgba(0,0,0,0.15), inset 3px 3px 8px rgba(255,255,255,0.2), 0 0 24px rgba(91,217,123,0.5)"
                            : `inset -3px -3px 8px rgba(0,0,0,0.15), inset 3px 3px 8px rgba(255,255,255,0.2), 0 6px 16px rgba(${bubbleColor},0.2)`,
                          border: isActive
                            ? agentType === "promoter"
                              ? "2px solid var(--gold)"
                              : "2px solid var(--accent-green)"
                            : `1px solid rgba(${bubbleColor},0.4)`,
                          animation: isActive ? "pulse 1.5s ease-in-out infinite" : undefined,
                        }}
                      />
                      <span
                        className="relative z-10 max-w-full truncate px-1 text-center text-[10px] font-bold"
                        style={{ color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.7), 0 0 6px rgba(0,0,0,0.4)" }}
                      >
                        {c.name.split(" ")[0]}
                      </span>

                      {/* Active conversation badge */}
                      {isActive && (
                        <div
                          className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[8px] font-bold uppercase"
                          style={{
                            background: agentType === "promoter" ? "rgba(212,168,83,0.2)" : "rgba(91,217,123,0.2)",
                            border: `1px solid ${agentType === "promoter" ? "rgba(212,168,83,0.4)" : "rgba(91,217,123,0.4)"}`,
                            color: agentType === "promoter" ? "var(--gold)" : "var(--accent-green)",
                          }}
                        >
                          {agentType === "promoter" ? "Promo" : "Chatting"}
                        </div>
                      )}
                    </div>

                    {/* Hover card */}
                    {isHovered && b.state === "floating" && (
                      <div
                        className="absolute left-1/2 top-full z-50 mt-3 min-w-[200px] -translate-x-1/2 rounded-xl p-3 shadow-2xl"
                        style={{
                          background: "var(--surface-raised)",
                          border: "1px solid var(--surface-border)",
                          animation: "bubbleTooltipIn 0.2s ease-out",
                        }}
                        onMouseEnter={() => setHoveredId(c.id)}
                        onMouseLeave={() => setHoveredId(null)}
                      >
                        <div className="space-y-1.5 text-xs">
                          <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{c.name}</p>
                          <p>
                            <span style={{ color: "var(--text-muted)" }}>Buy Likelihood: </span>
                            <span style={{ color: `rgb(${bubbleColor})`, fontWeight: 600 }}>{likelihood}%</span>
                          </p>
                          <p>
                            <span style={{ color: "var(--text-muted)" }}>Prefers: </span>
                            <span style={{ color: "var(--text-primary)" }}>{c.preferences}</span>
                          </p>
                          <p>
                            <span style={{ color: "var(--text-muted)" }}>Budget: </span>
                            <span style={{ color: "var(--text-primary)" }}>{formatLabel(c.budget_preference)}</span>
                          </p>
                          <p>
                            <span style={{ color: "var(--text-muted)" }}>Group: </span>
                            <span style={{ color: "var(--text-primary)" }}>
                              {c.group_size_preference === 1 ? "Solo" : c.group_size_preference === 2 ? "Date" : `${c.group_size_preference}+`}
                            </span>
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Exit zones (bottom) */}
            <div className="flex items-center justify-between pt-3 mt-2">
              {/* Bought exit */}
              <div
                className="flex items-center gap-2 rounded-full px-4 py-1.5"
                style={{ background: "rgba(91,217,123,0.1)", border: "1px solid rgba(91,217,123,0.2)" }}
              >
                <span className="text-xs">&#10003;</span>
                <span className="text-xs font-medium" style={{ color: "var(--accent-green)" }}>
                  Bought Tickets
                </span>
              </div>

              {/* Left exit */}
              <div
                className="flex items-center gap-2 rounded-full px-4 py-1.5"
                style={{ background: "rgba(217,91,91,0.1)", border: "1px solid rgba(217,91,91,0.2)" }}
              >
                <span className="text-xs font-medium" style={{ color: "var(--accent-red)" }}>
                  Left Without Buying
                </span>
                <span className="text-xs">&#10007;</span>
              </div>
            </div>

            <p className="mt-2 text-center text-xs" style={{ color: "var(--text-muted)" }}>
              {floatingCount} customers in pool
            </p>
          </div>
        </div>

        {/* ── Right: Live Conversation Feed ────────────────────────────────── */}
        <div className="w-1/2 relative">
          <div className="surface-card rounded-2xl p-5 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: "var(--gold)" }}>
                Live Agent Conversations
              </h3>
              {liveConversations.size > 0 && (
                <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--accent-green)" }}>
                  <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--accent-green)" }} />
                  {[...liveConversations.values()].filter((c) => !c.outcome).length} active
                </span>
              )}
            </div>

            <div ref={feedRef} className="flex-1 overflow-y-auto space-y-3" style={{ maxHeight: "calc(100vh - 320px)" }}>
              {liveConversations.size === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <div
                    className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
                    style={{ background: "var(--gold-glow)", border: "1px solid rgba(212,168,83,0.2)" }}
                  >
                    <span className="text-3xl">&#128172;</span>
                  </div>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    Start the simulation to see live conversations
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    Each customer&#39;s journey appears here in real-time
                  </p>
                </div>
              )}

              {[...liveConversations.entries()].reverse().map(([name, conv]) => {
                const isActive = !conv.outcome;
                const isBooked = conv.outcome === "booked";
                return (
                  <div
                    key={name}
                    className="animate-fade-in rounded-xl p-3"
                    style={{
                      background: isActive
                        ? "rgba(212,168,83,0.06)"
                        : isBooked
                          ? "rgba(91,217,123,0.06)"
                          : "rgba(217,91,91,0.06)",
                      border: `1px solid ${isActive ? "rgba(212,168,83,0.2)" : isBooked ? "rgba(91,217,123,0.2)" : "rgba(217,91,91,0.2)"}`,
                    }}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                          style={{
                            background: conv.agentType === "manager" ? "rgba(91,217,123,0.2)" : "rgba(212,168,83,0.2)",
                            color: conv.agentType === "manager" ? "var(--accent-green)" : "var(--gold)",
                          }}
                        >
                          {name.split(" ")[0][0]}
                        </div>
                        <div>
                          <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{name}</p>
                          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            {conv.agentType === "manager" ? "Manager Agent" : "Promoter Agent"}
                          </p>
                        </div>
                      </div>
                      <span
                        className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
                        style={{
                          color: isActive ? "var(--gold)" : isBooked ? "var(--accent-green)" : "var(--accent-red)",
                          background: isActive ? "rgba(212,168,83,0.15)" : isBooked ? "rgba(91,217,123,0.15)" : "rgba(217,91,91,0.15)",
                        }}
                      >
                        {isActive ? "LIVE" : isBooked ? "BOOKED" : "LEFT"}
                      </span>
                    </div>

                    {/* Steps */}
                    <div className="space-y-1.5 pl-2" style={{ borderLeft: `2px solid ${isActive ? "rgba(212,168,83,0.3)" : isBooked ? "rgba(91,217,123,0.2)" : "rgba(217,91,91,0.2)"}` }}>
                      {conv.steps.map((s, i) => {
                        const icon =
                          s.step === "greeting" ? "\uD83D\uDDE3\uFE0F" :
                          s.step === "browsing" ? "\uD83D\uDD0D" :
                          s.step === "checking" ? "\uD83D\uDCCB" :
                          s.step === "booking" ? "\uD83C\uDFAB" :
                          s.step === "booked" ? "\u2705" :
                          s.step === "response" ? "\uD83D\uDCAC" :
                          s.step === "left" ? "\uD83D\uDEB6" : "\u2022";
                        return (
                          <div key={i} className="flex items-start gap-2 animate-fade-in">
                            <span className="text-xs mt-0.5 shrink-0">{icon}</span>
                            <p className="text-xs leading-relaxed" style={{
                              color: s.step === "booked" ? "var(--accent-green)" :
                                     s.step === "left" ? "var(--accent-red)" :
                                     "var(--text-secondary)",
                            }}>
                              {s.message}
                            </p>
                          </div>
                        );
                      })}
                      {isActive && conv.steps.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--gold)" }} />
                          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>thinking...</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
