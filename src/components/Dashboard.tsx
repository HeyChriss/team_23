"use client";

import { useEffect, useState } from "react";

interface Theater {
  id: number;
  name: string;
  seat_count: number;
  screen_type: string;
  is_active: number;
}

interface Movie {
  id: number;
  name: string;
  category: string;
  length_minutes: number;
  language: string;
  director: string;
  actors: string;
}

interface Showtime {
  id: number;
  show_date: string;
  start_time: string;
  end_time: string;
  ticket_price: number;
  seats_available: number;
  status: string;
  movie_id: number;
  movie_name: string;
  category: string;
  length_minutes: number;
  theater_id: number;
  theater_name: string;
  seat_count: number;
  screen_type: string;
}

interface ScreenType {
  screen_type: string;
  count: number;
  total_seats: number;
}

interface ShowtimeByDate {
  show_date: string;
  count: number;
}

interface Stats {
  totalTheaters: number;
  totalSeats: number;
  totalMovies: number;
  totalShowtimes: number;
  screenTypes: ScreenType[];
  showtimesByDate: ShowtimeByDate[];
}

interface TheaterData {
  theaters: Theater[];
  movies: Movie[];
  showtimes: Showtime[];
  stats: Stats;
}

type SubTab = "overview" | "theaters" | "movies" | "schedule";

const SCREEN_BADGE: Record<string, string> = {
  IMAX: "bg-purple-600/20 text-purple-400 border-purple-500/30",
  Dolby: "bg-blue-600/20 text-blue-400 border-blue-500/30",
  "3D": "bg-green-600/20 text-green-400 border-green-500/30",
  Standard: "bg-zinc-600/20 text-zinc-400 border-zinc-500/30",
};

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-zinc-700 text-zinc-300",
  selling: "bg-blue-600/20 text-blue-400",
  sold_out: "bg-red-600/20 text-red-400",
  cancelled: "bg-yellow-600/20 text-yellow-400",
  completed: "bg-green-600/20 text-green-400",
};

export default function Dashboard() {
  const [data, setData] = useState<TheaterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<SubTab>("overview");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTheater, setSelectedTheater] = useState<number | null>(null);
  const [movieSearch, setMovieSearch] = useState("");

  useEffect(() => {
    fetch("/api/theater")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (d.stats.showtimesByDate.length > 0) {
          setSelectedDate(d.stats.showtimesByDate[0].show_date);
        }
        setLoading(false);
      });
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="animate-pulse text-zinc-400 text-lg">
          Loading theater data...
        </span>
      </div>
    );
  }

  const filteredShowtimes = data.showtimes.filter((s) => {
    if (selectedDate && s.show_date !== selectedDate) return false;
    if (selectedTheater && s.theater_id !== selectedTheater) return false;
    return true;
  });

  const filteredMovies = data.movies.filter(
    (m) =>
      m.name.toLowerCase().includes(movieSearch.toLowerCase()) ||
      m.category.toLowerCase().includes(movieSearch.toLowerCase()) ||
      m.director.toLowerCase().includes(movieSearch.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      {/* Sub-tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-zinc-900 p-1">
        {(
          [
            ["overview", "Overview"],
            ["theaters", "Theaters"],
            ["movies", "Movies"],
            ["schedule", "Schedule"],
          ] as [SubTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              subTab === key
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview ────────────────────────────────────── */}
      {subTab === "overview" && (
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              {
                label: "Theaters",
                value: data.stats.totalTheaters,
                sub: `${data.stats.totalSeats.toLocaleString()} total seats`,
              },
              {
                label: "Movies",
                value: data.stats.totalMovies,
                sub: "in catalog",
              },
              {
                label: "Showtimes",
                value: data.stats.totalShowtimes,
                sub: "this week",
              },
              {
                label: "Days Scheduled",
                value: data.stats.showtimesByDate.length,
                sub: `${data.stats.showtimesByDate[0]?.show_date} — ${data.stats.showtimesByDate[data.stats.showtimesByDate.length - 1]?.show_date}`,
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"
              >
                <p className="text-sm text-zinc-400">{card.label}</p>
                <p className="mt-1 text-3xl font-bold">{card.value}</p>
                <p className="mt-1 text-xs text-zinc-500">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Screen type breakdown */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
              Screen Types
            </h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {data.stats.screenTypes.map((st) => (
                <div
                  key={st.screen_type}
                  className={`rounded-lg border p-4 ${SCREEN_BADGE[st.screen_type] || SCREEN_BADGE.Standard}`}
                >
                  <p className="text-lg font-bold">{st.screen_type}</p>
                  <p className="text-sm opacity-80">
                    {st.count} room{st.count > 1 ? "s" : ""}
                  </p>
                  <p className="text-sm opacity-80">
                    {st.total_seats} seats
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Showtimes per day */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
              Showtimes Per Day
            </h3>
            <div className="flex items-end gap-2">
              {data.stats.showtimesByDate.map((d) => {
                const max = Math.max(
                  ...data.stats.showtimesByDate.map((x) => x.count)
                );
                const height = (d.count / max) * 120;
                return (
                  <div
                    key={d.show_date}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <span className="text-xs text-zinc-300">{d.count}</span>
                    <div
                      className="w-full rounded-t bg-blue-600"
                      style={{ height: `${height}px` }}
                    />
                    <span className="text-xs text-zinc-500">
                      {new Date(d.show_date + "T12:00:00").toLocaleDateString(
                        "en-US",
                        { weekday: "short", month: "short", day: "numeric" }
                      )}
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
          {data.theaters.map((t) => {
            const theaterShowtimes = data.showtimes.filter(
              (s) => s.theater_id === t.id
            );
            const totalBooked = theaterShowtimes.reduce(
              (sum, s) => sum + (s.seat_count - s.seats_available),
              0
            );
            const totalCapacity = theaterShowtimes.reduce(
              (sum, s) => sum + s.seat_count,
              0
            );
            const fillRate =
              totalCapacity > 0
                ? Math.round((totalBooked / totalCapacity) * 100)
                : 0;

            return (
              <div
                key={t.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{t.name}</h3>
                    <span
                      className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-xs ${SCREEN_BADGE[t.screen_type] || SCREEN_BADGE.Standard}`}
                    >
                      {t.screen_type}
                    </span>
                  </div>
                  <div
                    className={`rounded-full px-2 py-0.5 text-xs ${t.is_active ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}
                  >
                    {t.is_active ? "Active" : "Closed"}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-2xl font-bold">{t.seat_count}</p>
                    <p className="text-xs text-zinc-500">Seats</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {theaterShowtimes.length}
                    </p>
                    <p className="text-xs text-zinc-500">Showings</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{fillRate}%</p>
                    <p className="text-xs text-zinc-500">Fill Rate</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Movies ──────────────────────────────────────── */}
      {subTab === "movies" && (
        <div className="space-y-4">
          <input
            value={movieSearch}
            onChange={(e) => setMovieSearch(e.target.value)}
            placeholder="Search movies by title, genre, or director..."
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 outline-none focus:border-blue-500"
          />
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900 text-xs uppercase text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Genre</th>
                  <th className="px-4 py-3">Director</th>
                  <th className="px-4 py-3">Runtime</th>
                  <th className="px-4 py-3">Language</th>
                  <th className="px-4 py-3">Showings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filteredMovies.map((m) => {
                  const showCount = data.showtimes.filter(
                    (s) => s.movie_id === m.id
                  ).length;
                  return (
                    <tr
                      key={m.id}
                      className="bg-zinc-950 transition-colors hover:bg-zinc-900"
                    >
                      <td className="px-4 py-3 font-medium">{m.name}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs">
                          {m.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{m.director}</td>
                      <td className="px-4 py-3 text-zinc-400">
                        {Math.floor(m.length_minutes / 60)}h{" "}
                        {m.length_minutes % 60}m
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{m.language}</td>
                      <td className="px-4 py-3 text-zinc-400">{showCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-500">
            Showing {filteredMovies.length} of {data.movies.length} movies
          </p>
        </div>
      )}

      {/* ── Schedule ────────────────────────────────────── */}
      {subTab === "schedule" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="flex gap-1 rounded-lg bg-zinc-900 p-1">
              {data.stats.showtimesByDate.map((d) => (
                <button
                  key={d.show_date}
                  onClick={() => setSelectedDate(d.show_date)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedDate === d.show_date
                      ? "bg-blue-600 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {new Date(d.show_date + "T12:00:00").toLocaleDateString(
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
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-white outline-none"
            >
              <option value="">All Theaters</option>
              {data.theaters.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.screen_type})
                </option>
              ))}
            </select>
          </div>

          {/* Schedule grid */}
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900 text-xs uppercase text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Movie</th>
                  <th className="px-4 py-3">Theater</th>
                  <th className="px-4 py-3">Screen</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Seats</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filteredShowtimes.map((s) => {
                  const fillPct = Math.round(
                    ((s.seat_count - s.seats_available) / s.seat_count) * 100
                  );
                  return (
                    <tr
                      key={s.id}
                      className="bg-zinc-950 transition-colors hover:bg-zinc-900"
                    >
                      <td className="px-4 py-3 font-mono text-zinc-300">
                        {s.start_time} — {s.end_time}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{s.movie_name}</div>
                        <div className="text-xs text-zinc-500">
                          {s.category} &middot; {s.length_minutes}min
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {s.theater_name}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs ${SCREEN_BADGE[s.screen_type] || SCREEN_BADGE.Standard}`}
                        >
                          {s.screen_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        ${s.ticket_price.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className={`h-full rounded-full ${fillPct > 80 ? "bg-red-500" : fillPct > 50 ? "bg-yellow-500" : "bg-green-500"}`}
                              style={{ width: `${fillPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-zinc-400">
                            {s.seats_available}/{s.seat_count}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[s.status] || STATUS_BADGE.scheduled}`}
                        >
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-500">
            {filteredShowtimes.length} showtime
            {filteredShowtimes.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
