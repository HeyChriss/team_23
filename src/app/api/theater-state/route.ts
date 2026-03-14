import { getDb } from "@/lib/db";
import { getSimulationClock } from "@/lib/simulation-clock";
import { TheaterStateController } from "@/lib/theater-state";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/theater-state
 *
 * Query params:
 *   ?view=full          — full state (default)
 *   ?view=kpis          — KPIs only
 *   ?view=theaters      — theater summaries
 *   ?view=movies        — movie performance (optional: ?limit=20)
 *   ?view=showtimes     — showtime statuses (optional: ?date=, ?theaterId=, ?movieId=, ?status=, ?maxFillRate=, ?minFillRate=)
 *   ?view=genres        — genre trends
 *   ?view=screens       — screen type stats
 *   ?view=daily         — daily snapshots
 *   ?view=alerts        — current alerts
 *   ?view=availability  — theater availability for a date (?date= required)
 *   ?view=promos        — promotion summary
 *   ?view=revenue       — revenue by date
 */
export async function GET(req: NextRequest) {
  const db = getDb();
  const clock = getSimulationClock();
  const state = new TheaterStateController(db);
  const params = req.nextUrl.searchParams;
  const view = params.get("view") || "full";

  switch (view) {
    case "full":
      return NextResponse.json(state.getFullState(clock.nowISO()));

    case "kpis":
      return NextResponse.json({ kpis: state.getKPIs(), simTime: clock.nowISO() });

    case "theaters":
      return NextResponse.json({ theaters: state.getTheaterSummaries() });

    case "movies": {
      const limit = parseInt(params.get("limit") || "20");
      return NextResponse.json({ movies: state.getMoviePerformance(limit) });
    }

    case "showtimes":
      return NextResponse.json({
        showtimes: state.getShowtimeStatuses({
          date: params.get("date") || undefined,
          theaterId: params.get("theaterId") ? parseInt(params.get("theaterId")!) : undefined,
          movieId: params.get("movieId") ? parseInt(params.get("movieId")!) : undefined,
          status: params.get("status") || undefined,
          maxFillRate: params.get("maxFillRate") ? parseFloat(params.get("maxFillRate")!) : undefined,
          minFillRate: params.get("minFillRate") ? parseFloat(params.get("minFillRate")!) : undefined,
        }),
      });

    case "genres":
      return NextResponse.json({ genres: state.getGenreTrends() });

    case "screens":
      return NextResponse.json({ screens: state.getScreenTypeStats() });

    case "daily":
      return NextResponse.json({ daily: state.getDailySnapshots() });

    case "alerts":
      return NextResponse.json({ alerts: state.generateAlerts(), simTime: clock.nowISO() });

    case "availability": {
      const date = params.get("date") || clock.today();
      return NextResponse.json({ date, availability: state.getTheaterAvailability(date) });
    }

    case "promos":
      return NextResponse.json({ promotions: state.getPromotionSummary() });

    case "revenue":
      return NextResponse.json({ revenue: state.getRevenueByDate() });

    default:
      return NextResponse.json({ error: `Unknown view: ${view}` }, { status: 400 });
  }
}
