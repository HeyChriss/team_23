/**
 * SSE endpoint for simulation event stream.
 * GET /api/simulation/stream
 *
 * Uses a TransformStream to ensure each event is flushed immediately
 * to the client — no internal buffering.
 */

import { getSimulationEngine, type SSEEvent } from "@/lib/simulation-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const engine = getSimulationEngine();
  const abortController = new AbortController();
  engine.setAbortController(abortController);

  const encoder = new TextEncoder();

  // TransformStream gives us a writer that flushes immediately
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Run the engine in the background — the response starts streaming immediately
  (async () => {
    function emit(event: SSEEvent) {
      try {
        const chunk = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
        writer.write(encoder.encode(chunk));
      } catch {
        // Stream closed by client
      }
    }

    // Initial ping so EventSource connects
    emit({
      type: "day_start",
      data: { dayNumber: engine.dayNumber, date: "", simTime: new Date().toISOString() },
    });

    try {
      await engine.runLoop(emit, abortController.signal);
    } catch {
      // Engine stopped or errored
    } finally {
      try { await writer.close(); } catch { /* already closed */ }
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
