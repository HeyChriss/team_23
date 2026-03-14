/**
 * Simulation control endpoint.
 * POST /api/simulation/control — start, stop, reset the simulation.
 * GET /api/simulation/control — get current status.
 */

import { getSimulationEngine } from "@/lib/simulation-engine";
import { getSimulationClock } from "@/lib/simulation-clock";
import { getRecentEvents } from "@/lib/event-store";
import { getEventBus } from "@/lib/simulation-events-bus";

export async function POST(req: Request) {
  const { action } = await req.json();
  const engine = getSimulationEngine();
  const bus = getEventBus();

  switch (action) {
    case "start": {
      if (engine.isRunning) {
        console.log("[SimControl] Already running, ignoring start");
        return Response.json({ status: "already_running" });
      }
      console.log("[SimControl] Starting simulation engine...");
      const abortController = new AbortController();
      engine.setAbortController(abortController);

      engine.runLoop(
        (event) => bus.push(event),
        abortController.signal
      ).catch((e) => {
        console.error("[SimControl] Engine loop error:", e);
      }).finally(() => {
        console.log("[SimControl] Engine loop ended");
      });

      return Response.json({ status: "started" });
    }

    case "stop":
      console.log("[SimControl] Stopping simulation");
      engine.stop();
      return Response.json({ status: "stopped" });

    case "reset":
      console.log("[SimControl] Resetting simulation");
      engine.reset();
      bus.clear();
      return Response.json({ status: "reset" });

    default:
      return Response.json({ error: "Unknown action. Use: start, stop, reset" }, { status: 400 });
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
