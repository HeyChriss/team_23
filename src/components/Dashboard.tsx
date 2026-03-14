"use client";

import { useEffect, useState, useCallback, useRef } from "react";

// ── Types (from TheaterStateController) ──────────────────────────────────────

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

interface GenreTrend {
  category: string;
  total_showtimes: number;
  total_tickets: number;
  total_revenue: number;
  avg_fill_rate: number;
  booking_count: number;
}

interface DailySnapshot {
  date: string;
  total_showtimes: number;
  total_capacity: number;
  total_booked: number;
  fill_rate: number;
  revenue: number;
  bookings: number;
}

interface Alert {
  type: string;
  severity: string;
  message: string;
  data: Record<string, unknown>;
}

interface ShowtimeStatus {
  id: number;
  movie_id: number;
  movie_name: string;
  category: string;
  theater_id: number;
  theater_name: string;
  screen_type: string;
  show_date: string;
  start_time: string;
  end_time: string;
  ticket_price: number;
  seat_count: number;
  seats_available: number;
  seats_booked: number;
  fill_rate: number;
  status: string;
  revenue: number;
}

interface MoviePerformance {
  id: number;
  name: string;
  category: string;
  language: string;
  director: string;
  total_showtimes: number;
  total_bookings: number;
  total_tickets: number;
  total_revenue: number;
  avg_fill_rate: number;
}

interface FullState {
  kpis: KPIs;
  theaters: TheaterSummary[];
  dailySnapshots: DailySnapshot[];
  genreTrends: GenreTrend[];
  alerts: Alert[];
  simTime: string;
}

type SubTab = "overview" | "theaters" | "movies" | "schedule" | "alerts";

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-[#2a2a30] text-[#8a8880]",
  selling: "bg-[#1a2a3a] text-[#5b8fd9]",
  sold_out: "bg-[#3a1a1a] text-[#d95b5b]",
  cancelled: "bg-[#3a2a1a] text-[#d4a853]",
  completed: "bg-[#1a3a1a] text-[#5bd97b]",
};

const ALERT_STYLE: Record<string, string> = {
  info: "border-[#5b8fd9]/30 bg-[#5b8fd9]/10 text-[#5b8fd9]",
  warning: "border-[#d4a853]/30 bg-[#d4a853]/10 text-[#d4a853]",
  critical: "border-[#d95b5b]/30 bg-[#d95b5b]/10 text-[#d95b5b]",
};

function formatCurrency(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function FillButton({ showtimeId, seatsAvailable, onUpdate }: {
  showtimeId: number;
  seatsAvailable: number;
  onUpdate: () => void;
}) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localSeats = useRef(seatsAvailable);
  const [filling, setFilling] = useState(false);
  const [isFull, setIsFull] = useState(seatsAvailable <= 0);
  const [particles, setParticles] = useState<{ id: number; x: number; emoji: string }[]>([]);
  const nextId = useRef(0);

  // Sync when parent data refreshes
  useEffect(() => {
    localSeats.current = seatsAvailable;
    setIsFull(seatsAvailable <= 0);
  }, [seatsAvailable]);

  const TICKET_EMOJIS = ["🎟️", "🎫", "🎬", "🍿"];

  const spawnParticle = () => {
    const id = nextId.current++;
    const x = Math.random() * 60 - 30;
    const emoji = TICKET_EMOJIS[Math.floor(Math.random() * TICKET_EMOJIS.length)];
    setParticles((prev) => [...prev, { id, x, emoji }]);
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== id));
    }, 1000);
  };

  const stopFilling = useCallback(() => {
    setFilling(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    onUpdate();
  }, [onUpdate]);

  const doBookAndAnimate = useCallback(() => {
    if (localSeats.current <= 0) {
      setIsFull(true);
      stopFilling();
      return;
    }
    localSeats.current = Math.max(0, localSeats.current - 5);
    if (localSeats.current <= 0) setIsFull(true);
    spawnParticle();
    fetch("/api/theater-state/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showtimeId, tickets: 5 }),
    });
  }, [showtimeId, stopFilling]);

  const startFilling = () => {
    if (localSeats.current <= 0) return;
    setFilling(true);
    doBookAndAnimate();
    intervalRef.current = setInterval(doBookAndAnimate, 200);
  };

  return (
    <div className="relative">
      {/* Floating ticket particles */}
      {particles.map((p) => (
        <span
          key={p.id}
          className="pointer-events-none absolute text-sm"
          style={{
            left: "50%",
            bottom: "100%",
            animation: "ticketFloat 1s ease-out forwards",
            transform: `translateX(${p.x}px)`,
          }}
        >
          {p.emoji}
        </span>
      ))}
      <button
        onMouseEnter={startFilling}
        onMouseLeave={stopFilling}
        disabled={isFull}
        className={`w-20 rounded-lg px-4 py-2 text-sm font-medium text-center transition-all ${
          isFull
            ? "bg-[#19191d] text-[#3a3a40] cursor-not-allowed"
            : filling
              ? "bg-[#5bd97b] text-[#0a0a0a] animate-pulse"
              : "bg-[#2a2a30] text-[#8a8880] hover:bg-[#5bd97b] hover:text-[#0a0a0a]"
        }`}
      >
        {isFull ? "Full" : filling ? "Filling..." : "Fill"}
      </button>
    </div>
  );
}

export default function Dashboard() {
  const [state, setState] = useState<FullState | null>(null);
  const [showtimes, setShowtimes] = useState<ShowtimeStatus[]>([]);
  const [movies, setMovies] = useState<MoviePerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<SubTab>("overview");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTheater, setSelectedTheater] = useState<number | null>(null);
  const [movieSearch, setMovieSearch] = useState("");

  const fetchData = useCallback(async () => {
    const [fullRes, showtimeRes, movieRes] = await Promise.all([
      fetch("/api/theater-state?view=full"),
      fetch("/api/theater-state?view=showtimes"),
      fetch("/api/theater-state?view=movies&limit=100"),
    ]);
    const full: FullState = await fullRes.json();
    const st = await showtimeRes.json();
    const mv = await movieRes.json();

    setState(full);
    setShowtimes(st.showtimes || []);
    setMovies(mv.movies || []);

    if (!selectedDate && full.dailySnapshots.length > 0) {
      setSelectedDate(full.dailySnapshots[0].date);
    }
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="animate-pulse text-[#8a8880] text-lg">
          Loading theater state...
        </span>
      </div>
    );
  }

  const { kpis } = state;

  const filteredShowtimes = showtimes.filter((s) => {
    if (selectedDate && s.show_date !== selectedDate) return false;
    if (selectedTheater && s.theater_id !== selectedTheater) return false;
    return true;
  });

  const filteredMovies = movies.filter(
    (m) =>
      m.name.toLowerCase().includes(movieSearch.toLowerCase()) ||
      m.category.toLowerCase().includes(movieSearch.toLowerCase()) ||
      m.director.toLowerCase().includes(movieSearch.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      {/* Sim time indicator */}
      <div className="mb-5 flex items-center justify-between animate-fade-in">
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          Simulation Time:{" "}
          <span style={{ color: "var(--text-secondary)" }}>
            {new Date(state.simTime).toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        {state.alerts.length > 0 && (
          <button
            onClick={() => setSubTab("alerts")}
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{ background: "var(--gold-glow)", color: "var(--gold)", border: "1px solid rgba(212,168,83,0.25)" }}
          >
            {state.alerts.length} alert{state.alerts.length !== 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="mb-6 flex gap-1 rounded-lg p-1" style={{ background: "var(--surface)" }}>
        {(
          [
            ["overview", "Overview"],
            ["theaters", "Theaters"],
            ["movies", "Movies"],
            ["schedule", "Schedule"],
            ["alerts", `Alerts (${state.alerts.length})`],
          ] as [SubTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`tab-pill flex-1 ${subTab === key ? "active" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview ────────────────────────────────────── */}
      {subTab === "overview" && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: "Revenue", value: formatCurrency(kpis.total_revenue), sub: `${formatCurrency(kpis.revenue_per_screen)} per screen` },
              { label: "Tickets Sold", value: kpis.total_tickets_sold.toLocaleString(), sub: `${kpis.total_bookings} bookings` },
              { label: "Avg Fill Rate", value: `${kpis.avg_fill_rate}%`, sub: `${kpis.sold_out_count} sold out` },
              { label: "Avg Booking", value: formatCurrency(kpis.avg_booking_value), sub: `${kpis.tickets_per_showtime} tickets/show` },
            ].map((card) => (
              <div
                key={card.label}
                className="surface-card rounded-xl p-5"
              >
                <p className="text-sm text-[#8a8880]">{card.label}</p>
                <p className="mt-1 text-3xl font-bold">{card.value}</p>
                <p className="mt-1 text-xs text-[#5a5850]">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Promo stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="surface-card rounded-xl p-5">
              <p className="text-sm text-[#8a8880]">Active Promos</p>
              <p className="mt-1 text-3xl font-bold">{kpis.total_promos_active}</p>
            </div>
            <div className="surface-card rounded-xl p-5">
              <p className="text-sm text-[#8a8880]">Promo Redemptions</p>
              <p className="mt-1 text-3xl font-bold">{kpis.total_promo_redemptions}</p>
            </div>
            <div className="surface-card rounded-xl p-5">
              <p className="text-sm text-[#8a8880]">Discounts Given</p>
              <p className="mt-1 text-3xl font-bold">{formatCurrency(kpis.total_discount_given)}</p>
            </div>
          </div>

          {/* Genre trends */}
          <div className="surface-card rounded-xl p-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-[#d4a853]">
              Genre Performance
            </h3>
            <div className="overflow-hidden rounded-lg border border-[#2a2a30]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#111113] text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-2">Genre</th>
                    <th className="px-4 py-2">Shows</th>
                    <th className="px-4 py-2">Tickets</th>
                    <th className="px-4 py-2">Revenue</th>
                    <th className="px-4 py-2">Fill Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {state.genreTrends.map((g) => (
                    <tr key={g.category} className="hover:bg-zinc-800/50">
                      <td className="px-4 py-2 font-medium">{g.category}</td>
                      <td className="px-4 py-2 text-[#8a8880]">{g.total_showtimes}</td>
                      <td className="px-4 py-2 text-[#8a8880]">{g.total_tickets}</td>
                      <td className="px-4 py-2 text-[#f0eee6]">{formatCurrency(g.total_revenue)}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className={`h-full rounded-full ${g.avg_fill_rate > 60 ? "bg-green-500" : g.avg_fill_rate > 30 ? "bg-yellow-500" : "bg-red-500"}`}
                              style={{ width: `${Math.min(g.avg_fill_rate, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-[#8a8880]">{g.avg_fill_rate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Daily revenue chart */}
          <div className="surface-card rounded-xl p-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-[#d4a853]">
              Daily Performance
            </h3>
            <div className="flex items-end gap-2">
              {state.dailySnapshots.map((d) => {
                const maxRev = Math.max(...state.dailySnapshots.map((x) => x.revenue));
                const height = maxRev > 0 ? (d.revenue / maxRev) * 120 : 0;
                return (
                  <div
                    key={d.date}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <span className="text-xs text-[#f0eee6]">
                      {formatCurrency(d.revenue)}
                    </span>
                    <div
                      className="w-full rounded-t"
                      style={{ background: "var(--gold)", height: `${Math.max(height, 4)}px` }}
                    />
                    <span className="text-xs text-[#5a5850]">
                      {new Date(d.date + "T12:00:00").toLocaleDateString(
                        "en-US",
                        { weekday: "short", month: "short", day: "numeric" }
                      )}
                    </span>
                    <span className="text-xs text-zinc-600">
                      {d.fill_rate}% fill
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Theaters ────────────────────────────────────── */}
      {subTab === "theaters" && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {state.theaters.map((t) => (
            <div
              key={t.id}
              className="surface-card rounded-xl p-5"
            >
              <div className="flex items-start justify-between">
                <h3 className="text-lg font-semibold">{t.name}</h3>
                <div
                  className={`rounded-full px-2 py-0.5 text-xs ${t.is_active ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}
                >
                  {t.is_active ? "Active" : "Closed"}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-bold">{t.seat_count}</p>
                  <p className="text-xs text-[#5a5850]">Seats</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{t.total_showtimes}</p>
                  <p className="text-xs text-[#5a5850]">Showings</p>
                </div>
                <div>
                  <p className={`text-2xl font-bold ${t.fill_rate > 60 ? "text-green-400" : t.fill_rate > 30 ? "text-yellow-400" : "text-red-400"}`}>
                    {t.fill_rate}%
                  </p>
                  <p className="text-xs text-[#5a5850]">Fill Rate</p>
                </div>
              </div>
              <div className="mt-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full ${t.fill_rate > 60 ? "bg-green-500" : t.fill_rate > 30 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${t.fill_rate}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-zinc-600">
                  {t.total_booked.toLocaleString()} / {t.total_capacity.toLocaleString()} seats booked
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Movies ──────────────────────────────────────── */}
      {subTab === "movies" && (
        <div className="space-y-4">
          <input
            value={movieSearch}
            onChange={(e) => setMovieSearch(e.target.value)}
            placeholder="Search movies by title, genre, or director..."
            className="cinema-input w-full rounded-xl px-4 py-3"
          />
          <div className="overflow-hidden rounded-xl border border-[#2a2a30]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#111113] text-xs uppercase text-[#8a8880]">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Genre</th>
                  <th className="px-4 py-3">Director</th>
                  <th className="px-4 py-3">Showings</th>
                  <th className="px-4 py-3">Tickets</th>
                  <th className="px-4 py-3">Revenue</th>
                  <th className="px-4 py-3">Fill Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filteredMovies.map((m) => (
                  <tr
                    key={m.id}
                    className="bg-[#0a0a0c] transition-colors hover:bg-[#19191d]"
                  >
                    <td className="px-4 py-3 font-medium">{m.name}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs">
                        {m.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#8a8880]">{m.director}</td>
                    <td className="px-4 py-3 text-[#8a8880]">{m.total_showtimes}</td>
                    <td className="px-4 py-3 text-[#8a8880]">{m.total_tickets}</td>
                    <td className="px-4 py-3 text-[#f0eee6]">
                      {formatCurrency(m.total_revenue)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className={`h-full rounded-full ${m.avg_fill_rate > 60 ? "bg-green-500" : m.avg_fill_rate > 30 ? "bg-yellow-500" : "bg-red-500"}`}
                            style={{ width: `${Math.min(m.avg_fill_rate, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-[#8a8880]">{m.avg_fill_rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[#5a5850]">
            Showing {filteredMovies.length} of {movies.length} movies
          </p>
        </div>
      )}

      {/* ── Schedule ────────────────────────────────────── */}
      {subTab === "schedule" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="flex gap-1 rounded-lg bg-[#111113] p-1">
              {state.dailySnapshots.map((d) => (
                <button
                  key={d.date}
                  onClick={() => setSelectedDate(d.date)}
                  className={`tab-pill ${
                    selectedDate === d.date ? "active" : ""
                  }`}
                >
                  {new Date(d.date + "T12:00:00").toLocaleDateString(
                    "en-US",
                    { weekday: "short", month: "short", day: "numeric" }
                  )}
                </button>
              ))}
            </div>
            <select
              value={selectedTheater ?? ""}
              onChange={(e) =>
                setSelectedTheater(
                  e.target.value ? Number(e.target.value) : null
                )
              }
              className="cinema-input rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Theaters</option>
              {state.theaters.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Schedule grid */}
          <div className="overflow-hidden rounded-xl border border-[#2a2a30]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#111113] text-xs uppercase text-[#8a8880]">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Movie</th>
                  <th className="px-4 py-3">Theater</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Seats</th>
                  <th className="px-4 py-3">Revenue</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filteredShowtimes.map((s) => (
                  <tr
                    key={s.id}
                    className="bg-[#0a0a0c] transition-colors hover:bg-[#19191d]"
                  >
                    <td className="px-4 py-3 font-mono text-[#f0eee6]">
                      {s.start_time} — {s.end_time}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.movie_name}</div>
                      <div className="text-xs text-[#5a5850]">{s.category}</div>
                    </td>
                    <td className="px-4 py-3 text-[#8a8880]">
                      {s.theater_name}
                    </td>
                    <td className="px-4 py-3 text-[#f0eee6]">
                      ${s.ticket_price.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className={`h-full rounded-full ${s.fill_rate > 80 ? "bg-red-500" : s.fill_rate > 50 ? "bg-yellow-500" : "bg-green-500"}`}
                            style={{ width: `${s.fill_rate}%` }}
                          />
                        </div>
                        <span className="text-xs text-[#8a8880]">
                          {s.seats_available}/{s.seat_count}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#f0eee6] text-xs">
                      {formatCurrency(s.revenue)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[s.status] || STATUS_BADGE.scheduled}`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <FillButton
                        showtimeId={s.id}
                        seatsAvailable={s.seats_available}
                        onUpdate={fetchData}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[#5a5850]">
            {filteredShowtimes.length} showtime
            {filteredShowtimes.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      {/* ── Alerts ──────────────────────────────────────── */}
      {subTab === "alerts" && (
        <div className="space-y-3">
          {state.alerts.length === 0 ? (
            <div className="py-20 text-center text-zinc-500">
              No alerts — everything is running smoothly.
            </div>
          ) : (
            state.alerts.map((a, i) => (
              <div
                key={i}
                className={`rounded-lg border p-4 ${ALERT_STYLE[a.severity] || ALERT_STYLE.info}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="mr-2 rounded bg-zinc-800 px-1.5 py-0.5 text-xs uppercase">
                      {a.type.replace("_", " ")}
                    </span>
                    <span className="text-sm">{a.message}</span>
                  </div>
                  <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-xs">
                    {a.severity}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
