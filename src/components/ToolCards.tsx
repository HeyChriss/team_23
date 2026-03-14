"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ToolPartBase {
  type: string;
  state: string;
  result?: any;
}

// ── Loading shimmer ────────────────────────────────
function LoadingCard({ label }: { label: string }) {
  return (
    <div className="my-2 flex items-center gap-2 rounded-xl border border-zinc-700/50 bg-zinc-900/80 px-4 py-3 text-sm text-zinc-400">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-400" />
      {label}
    </div>
  );
}

// ── Generic fallback ───────────────────────────────
function GenericCard({ result }: { result: any }) {
  return (
    <pre className="my-2 max-h-48 overflow-auto rounded-xl border border-zinc-700/50 bg-zinc-900/80 p-4 text-xs text-zinc-300">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

// ── getNowShowing / searchMovies ───────────────────
function MovieGridCard({ result }: { result: any }) {
  const movies = result?.movies ?? result?.results ?? [];
  if (!movies.length) return <p className="my-2 text-sm text-zinc-400">No movies found.</p>;

  return (
    <div className="my-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {movies.map((m: any) => (
        <div
          key={m.id}
          className="rounded-xl border border-zinc-700/50 bg-zinc-900/80 p-3"
        >
          <p className="font-medium text-zinc-100 leading-tight">{m.name}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-medium text-blue-300">
              {m.category}
            </span>
            <span className="text-[11px] text-zinc-500">
              {m.length_minutes} min
            </span>
          </div>
          {m.director && (
            <p className="mt-1 text-[11px] text-zinc-500 truncate">
              Dir. {m.director}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── getMovieDetails ────────────────────────────────
function MovieDetailCard({ result }: { result: any }) {
  if (result?.error) return <p className="my-2 text-sm text-red-400">{result.error}</p>;
  return (
    <div className="my-2 rounded-xl border border-zinc-700/50 bg-zinc-900/80 p-4">
      <h3 className="text-lg font-semibold text-zinc-100">{result.name}</h3>
      <div className="mt-1 flex flex-wrap gap-2">
        <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-300">
          {result.category}
        </span>
        <span className="text-xs text-zinc-400">{result.length_minutes} min</span>
        <span className="text-xs text-zinc-400">{result.language}</span>
      </div>
      <div className="mt-3 space-y-1 text-sm text-zinc-300">
        <p><span className="text-zinc-500">Director:</span> {result.director}</p>
        <p><span className="text-zinc-500">Cast:</span> {result.actors}</p>
        {result.release_date && (
          <p><span className="text-zinc-500">Released:</span> {result.release_date}</p>
        )}
      </div>
    </div>
  );
}

// ── getShowtimes ───────────────────────────────────
function ShowtimesCard({ result }: { result: any }) {
  const showtimes = result?.showtimes ?? [];
  if (!showtimes.length) return <p className="my-2 text-sm text-zinc-400">No showtimes found.</p>;

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-zinc-700/50">
      <div className="bg-zinc-900/80 px-4 py-2 text-xs font-medium text-zinc-400">
        Showtimes for {result.date} &middot; {showtimes.length} showing{showtimes.length !== 1 && "s"}
      </div>
      <div className="max-h-64 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50 text-left text-xs text-zinc-500">
              <th className="px-4 py-2">Time</th>
              <th className="px-4 py-2">Movie</th>
              <th className="px-4 py-2">Theater</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2 text-right">Price</th>
              <th className="px-4 py-2 text-right">Seats</th>
            </tr>
          </thead>
          <tbody>
            {showtimes.map((s: any) => (
              <tr key={s.showtime_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="px-4 py-2 font-mono text-zinc-200">{s.start_time}</td>
                <td className="px-4 py-2 text-zinc-200 max-w-[140px] truncate">{s.movie_name}</td>
                <td className="px-4 py-2 text-zinc-400">{s.theater_name}</td>
                <td className="px-4 py-2">
                  <ScreenBadge type={s.screen_type} />
                </td>
                <td className="px-4 py-2 text-right text-zinc-200">${Number(s.ticket_price).toFixed(2)}</td>
                <td className="px-4 py-2 text-right">
                  <span className={s.seats_available < 20 ? "text-amber-400" : "text-green-400"}>
                    {s.seats_available}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScreenBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    IMAX: "bg-purple-500/20 text-purple-300",
    Dolby: "bg-pink-500/20 text-pink-300",
    "3D": "bg-cyan-500/20 text-cyan-300",
    Standard: "bg-zinc-700/50 text-zinc-400",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${colors[type] ?? colors.Standard}`}>
      {type}
    </span>
  );
}

// ── getTheaters ────────────────────────────────────
function TheatersCard({ result }: { result: any }) {
  const theaters = result?.theaters ?? [];
  return (
    <div className="my-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {theaters.map((t: any) => (
        <div key={t.id} className="rounded-xl border border-zinc-700/50 bg-zinc-900/80 p-3">
          <p className="font-medium text-zinc-100">{t.name}</p>
          <div className="mt-1 flex items-center gap-2">
            <ScreenBadge type={t.screen_type} />
            <span className="text-xs text-zinc-500">{t.seat_count} seats</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── checkSeatAvailability ──────────────────────────
function SeatAvailabilityCard({ result }: { result: any }) {
  if (result?.error) return <p className="my-2 text-sm text-red-400">{result.error}</p>;
  return (
    <div className="my-2 rounded-xl border border-zinc-700/50 bg-zinc-900/80 p-4">
      <p className="font-medium text-zinc-100">{result.movie}</p>
      <p className="mt-1 text-sm text-zinc-400">
        {result.theater} &middot; <ScreenBadge type={result.screenType} />
      </p>
      <div className="mt-3 flex gap-4">
        <div>
          <p className="text-2xl font-bold text-green-400">{result.seatsAvailable}</p>
          <p className="text-xs text-zinc-500">seats left</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-zinc-200">${Number(result.ticketPrice).toFixed(2)}</p>
          <p className="text-xs text-zinc-500">per ticket</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {result.date} at {result.time}
      </p>
    </div>
  );
}

// ── bookTickets ────────────────────────────────────
function BookingCard({ result }: { result: any }) {
  if (result?.error) return <p className="my-2 text-sm text-red-400">{result.error}</p>;
  return (
    <div className="my-2 rounded-xl border border-green-700/50 bg-green-950/30 p-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">✅</span>
        <h3 className="font-semibold text-green-300">Booking Confirmed!</h3>
      </div>
      <div className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-400">Confirmation</span>
          <span className="font-mono font-bold text-green-300">{result.confirmationCode}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Movie</span>
          <span className="text-zinc-200">{result.movie}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Theater</span>
          <span className="text-zinc-200">{result.theater}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Date & Time</span>
          <span className="text-zinc-200">{result.date} at {result.time}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Tickets</span>
          <span className="text-zinc-200">{result.tickets} × {result.pricePerTicket}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-green-800/50 pt-2">
          <span className="font-medium text-zinc-300">Total</span>
          <span className="text-lg font-bold text-green-300">{result.totalPrice}</span>
        </div>
      </div>
    </div>
  );
}

// ── getConcessionMenu ──────────────────────────────
function ConcessionCard({ result }: { result: any }) {
  const sections: { key: string; emoji: string; label: string }[] = [
    { key: "popcorn", emoji: "🍿", label: "Popcorn" },
    { key: "drinks", emoji: "🥤", label: "Drinks" },
    { key: "snacks", emoji: "🌭", label: "Snacks" },
    { key: "combos", emoji: "🎉", label: "Combos" },
  ];

  return (
    <div className="my-2 rounded-xl border border-zinc-700/50 bg-zinc-900/80 p-4">
      <h3 className="font-semibold text-zinc-100">Concession Menu</h3>
      <div className="mt-3 space-y-3">
        {sections.map(({ key, emoji, label }) => {
          const items = result?.[key];
          if (!items?.length) return null;
          return (
            <div key={key}>
              <p className="mb-1 text-xs font-medium text-zinc-500">
                {emoji} {label}
              </p>
              {items.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between py-0.5 text-sm">
                  <span className="text-zinc-300">
                    {item.item}
                    {item.description && (
                      <span className="ml-1 text-xs text-zinc-500">— {item.description}</span>
                    )}
                  </span>
                  <span className="font-medium text-zinc-200">{item.price}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── checkLoyaltyPoints ─────────────────────────────
function LoyaltyCard({ result }: { result: any }) {
  const tierColors: Record<string, string> = {
    Bronze: "bg-amber-800/30 text-amber-400",
    Silver: "bg-zinc-600/30 text-zinc-300",
    Gold: "bg-yellow-600/30 text-yellow-300",
    Platinum: "bg-purple-600/30 text-purple-300",
  };

  return (
    <div className="my-2 rounded-xl border border-zinc-700/50 bg-zinc-900/80 p-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">⭐</span>
        <div>
          <p className="font-medium text-zinc-100">{result.name}</p>
          <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${tierColors[result.tier] ?? tierColors.Bronze}`}>
            {result.tier}
          </span>
        </div>
      </div>
      <div className="mt-3 flex gap-4">
        <div>
          <p className="text-2xl font-bold text-yellow-300">{result.points?.toLocaleString()}</p>
          <p className="text-xs text-zinc-500">points</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-zinc-300">{result.totalVisitsThisYear}</p>
          <p className="text-xs text-zinc-500">visits this year</p>
        </div>
      </div>
      {result.pointsToNextTier && (
        <p className="mt-2 text-xs text-zinc-400">
          {result.pointsToNextTier} more points to reach {result.nextTier}
        </p>
      )}
      {result.rewards?.length > 0 && (
        <div className="mt-3 border-t border-zinc-800 pt-2">
          <p className="mb-1 text-xs font-medium text-zinc-500">Available Rewards</p>
          {result.rewards.map((r: string, i: number) => (
            <p key={i} className="text-sm text-green-400">🎁 {r}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Loading labels per tool ────────────────────────
const loadingLabels: Record<string, string> = {
  "tool-getNowShowing": "Checking what's playing...",
  "tool-getMovieDetails": "Looking up movie...",
  "tool-getShowtimes": "Finding showtimes...",
  "tool-searchMovies": "Searching movies...",
  "tool-checkSeatAvailability": "Checking seats...",
  "tool-bookTickets": "Booking tickets...",
  "tool-getConcessionMenu": "Loading menu...",
  "tool-checkLoyaltyPoints": "Checking points...",
  "tool-getTheaters": "Loading theaters...",
};

// ── Main dispatcher ────────────────────────────────
export function ToolResultCard({ part }: { part: ToolPartBase }) {
  const toolType = part.type; // e.g. "tool-getNowShowing"

  // Still loading
  if (part.state !== "output-available") {
    return <LoadingCard label={loadingLabels[toolType] ?? "Working..."} />;
  }

  const result = part.result;

  switch (toolType) {
    case "tool-getNowShowing":
    case "tool-searchMovies":
      return <MovieGridCard result={result} />;
    case "tool-getMovieDetails":
      return <MovieDetailCard result={result} />;
    case "tool-getShowtimes":
      return <ShowtimesCard result={result} />;
    case "tool-getTheaters":
      return <TheatersCard result={result} />;
    case "tool-checkSeatAvailability":
      return <SeatAvailabilityCard result={result} />;
    case "tool-bookTickets":
      return <BookingCard result={result} />;
    case "tool-getConcessionMenu":
      return <ConcessionCard result={result} />;
    case "tool-checkLoyaltyPoints":
      return <LoyaltyCard result={result} />;
    default:
      return <GenericCard result={result} />;
  }
}
