/**
 * SSE endpoint for simulation event stream.
 * GET /api/simulation/stream
 *
 * Uses a message queue + interval drain pattern to guarantee
 * events flush to the client immediately, bypassing all buffering.
 */

import { getSimulationEngine, type SSEEvent } from "@/lib/simulation-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const engine = getSimulationEngine();
  const abortController = new AbortController();
  engine.setAbortController(abortController);

  const encoder = new TextEncoder();

  // Message queue — engine pushes, stream drains
  const queue: string[] = [];
  let streamClosed = false;

  function emit(event: SSEEvent) {
    if (streamClosed) return;
    queue.push(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
  }

  // Initial ping
  emit({
    type: "day_start",
    data: { dayNumber: engine.dayNumber, date: "", simTime: new Date().toISOString() },
  });

  // Start engine in background
  const engineDone = engine.runLoop(emit, abortController.signal).catch(() => {}).finally(() => {
    streamClosed = true;
  });

  const stream = new ReadableStream({
    start(controller) {
      // Drain queue every 50ms — guarantees events reach client promptly
      // Also sends a heartbeat comment to force HTTP flush
      const drainInterval = setInterval(() => {
        let sent = false;
        while (queue.length > 0) {
          const msg = queue.shift()!;
          try {
            controller.enqueue(encoder.encode(msg));
            sent = true;
          } catch {
            clearInterval(drainInterval);
            abortController.abort();
            return;
          }
        }

        // Send heartbeat comment even if no events — forces HTTP flush
        if (!sent && !streamClosed) {
          try {
            controller.enqueue(encoder.encode(`: heartbeat\n\n`));
          } catch {
            clearInterval(drainInterval);
            abortController.abort();
            return;
          }
        }

        if (streamClosed && queue.length === 0) {
          clearInterval(drainInterval);
          try { controller.close(); } catch { /* already closed */ }
        }
      }, 50);

      // Also check if engine finishes
      engineDone.then(() => {
        // Drain any remaining
        while (queue.length > 0) {
          try {
            controller.enqueue(encoder.encode(queue.shift()!));
          } catch { break; }
        }
        clearInterval(drainInterval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      streamClosed = true;
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Content-Encoding": "none",
    },
  });
}
