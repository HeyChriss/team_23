/**
 * In-memory event bus for the simulation engine.
 *
 * The engine pushes events here. The frontend polls for new events.
 * Dead simple — no streams, no SSE, no buffering issues.
 */

import type { SSEEvent } from "./simulation-engine";

interface StoredEvent {
  index: number;
  type: string;
  data: unknown;
  timestamp: number;
}

class SimulationEventBus {
  private events: StoredEvent[] = [];
  private _nextIndex = 0;

  push(event: SSEEvent): void {
    const idx = this._nextIndex++;
    console.log(`[EventBus] #${idx} ${event.type}${event.data && typeof event.data === "object" && "summary" in (event.data as Record<string,unknown>) ? ` — ${(event.data as Record<string,unknown>).summary}` : ""}`);
    this.events.push({
      index: idx,
      type: event.type,
      data: event.data,
      timestamp: Date.now(),
    });

    // Keep max 500 events in memory
    if (this.events.length > 500) {
      this.events = this.events.slice(-300);
    }
  }

  /** Get all events with index >= since */
  getSince(since: number): StoredEvent[] {
    return this.events.filter((e) => e.index >= since);
  }

  /** Get the next index the client should ask for */
  get nextIndex(): number {
    return this._nextIndex;
  }

  clear(): void {
    this.events = [];
    this._nextIndex = 0;
  }
}

let _bus: SimulationEventBus | null = null;

export function getEventBus(): SimulationEventBus {
  if (!_bus) {
    _bus = new SimulationEventBus();
  }
  return _bus;
}
