/**
 * GET /api/simulation/events?since=N
 *
 * Polling endpoint — returns new simulation events since index N.
 * Frontend polls every 300ms for real-time updates.
 * No SSE, no streams, no buffering — just JSON.
 */

import { getEventBus } from "@/lib/simulation-events-bus";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const bus = getEventBus();
  const since = parseInt(req.nextUrl.searchParams.get("since") || "0");

  const events = bus.getSince(since);

  return NextResponse.json({
    events,
    nextIndex: bus.nextIndex,
  });
}
