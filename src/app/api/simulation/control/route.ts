/**
 * Simulation control endpoint.
 * POST /api/simulation/control — start, stop, reset the simulation.
 * GET /api/simulation/control — get current status.
 */

import { getSimulationEngine } from "@/lib/simulation-engine";
import { getSimulationClock } from "@/lib/simulation-clock";
import { getRecentEvents } from "@/lib/event-store";

export async function POST(req: Request) {
  const { action } = await req.json();
  const engine = getSimulationEngine();

  switch (action) {
    case "stop":
      engine.stop();
      return Response.json({ status: "stopped" });

    case "reset":
      engine.reset();
      return Response.json({ status: "reset" });

    default:
      return Response.json({ error: "Unknown action. Use: stop, reset" }, { status: 400 });
  }
}

export async function GET() {
  const engine = getSimulationEngine();
  const clock = getSimulationClock();

  return Response.json({
    isRunning: engine.isRunning,
    dayNumber: engine.dayNumber,
    clock: clock.getState(),
    recentEvents: getRecentEvents(20),
  });
}
