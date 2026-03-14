/**
 * SSE endpoint for simulation event stream.
 * GET /api/simulation/stream — connects and streams events as the simulation runs.
 */

import { getSimulationEngine, type SSEEvent } from "@/lib/simulation-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const engine = getSimulationEngine();

  const abortController = new AbortController();
  engine.setAbortController(abortController);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function emit(event: SSEEvent) {
        try {
          const data = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch {
          // Stream closed
        }
      }

      // Send initial state
      emit({
        type: "day_start",
        data: { dayNumber: engine.dayNumber, date: "", simTime: new Date().toISOString() },
      });

      try {
        await engine.runLoop(emit, abortController.signal);
      } catch {
        // Engine stopped
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
