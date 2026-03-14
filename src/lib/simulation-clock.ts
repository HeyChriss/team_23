/**
 * SimulationClock — A centralized, speed-controllable clock for the theater simulation.
 *
 * All code that needs "current time" should call SimulationClock.now() instead of new Date().
 *
 * Features:
 * - Configurable start time (defaults to first showtime date)
 * - Speed multiplier (1x = real-time, 60x = 1 real second = 1 sim minute, etc.)
 * - Pause / resume
 * - Manual time advancement (tick)
 */

export interface ClockState {
  simTime: string;          // ISO string of current simulated time
  speed: number;            // multiplier (1 = real-time, 60 = 1 real sec = 1 sim min)
  isPaused: boolean;
  isRunning: boolean;
  elapsedSimMs: number;     // total simulated milliseconds elapsed since start
  startTime: string;        // ISO string of simulation start time
}

class SimulationClockImpl {
  private _startSimTime: number;    // simulated start time in ms (epoch)
  private _startRealTime: number;   // real time when clock started/resumed in ms
  private _accumulatedSimMs: number; // sim ms accumulated before last pause
  private _speed: number;
  private _isPaused: boolean;
  private _isRunning: boolean;

  constructor() {
    // Default: start at March 14, 2026 8:00 AM
    this._startSimTime = new Date("2026-03-14T08:00:00Z").getTime();
    this._startRealTime = Date.now();
    this._accumulatedSimMs = 0;
    this._speed = 1;
    this._isPaused = true;
    this._isRunning = false;
  }

  /**
   * Get the current simulated time as a Date.
   */
  now(): Date {
    if (!this._isRunning || this._isPaused) {
      return new Date(this._startSimTime + this._accumulatedSimMs);
    }

    const realElapsed = Date.now() - this._startRealTime;
    const simElapsed = realElapsed * this._speed;
    return new Date(this._startSimTime + this._accumulatedSimMs + simElapsed);
  }

  /**
   * Get current simulated time as ISO string.
   */
  nowISO(): string {
    return this.now().toISOString();
  }

  /**
   * Get current simulated date as YYYY-MM-DD.
   */
  today(): string {
    return this.now().toISOString().split("T")[0];
  }

  /**
   * Get current simulated time as HH:MM (UTC).
   */
  currentTime(): string {
    const d = this.now();
    return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}`;
  }

  /**
   * Start or resume the clock.
   */
  start(): void {
    if (this._isRunning && !this._isPaused) return; // already running
    this._startRealTime = Date.now();
    this._isPaused = false;
    this._isRunning = true;
  }

  /**
   * Pause the clock. Simulated time freezes.
   */
  pause(): void {
    if (!this._isRunning || this._isPaused) return;
    // Accumulate elapsed sim time before pausing
    const realElapsed = Date.now() - this._startRealTime;
    this._accumulatedSimMs += realElapsed * this._speed;
    this._isPaused = true;
  }

  /**
   * Reset the clock to a specific start time.
   */
  reset(startTime?: string): void {
    this._startSimTime = startTime
      ? new Date(startTime).getTime()
      : new Date("2026-03-14T08:00:00Z").getTime();
    this._startRealTime = Date.now();
    this._accumulatedSimMs = 0;
    this._isPaused = true;
    this._isRunning = false;
  }

  /**
   * Set the speed multiplier.
   * Examples:
   *   1    = real-time
   *   60   = 1 real second = 1 sim minute
   *   3600 = 1 real second = 1 sim hour
   */
  setSpeed(multiplier: number): void {
    if (this._isRunning && !this._isPaused) {
      // Accumulate current progress before changing speed
      const realElapsed = Date.now() - this._startRealTime;
      this._accumulatedSimMs += realElapsed * this._speed;
      this._startRealTime = Date.now();
    }
    this._speed = Math.max(0.1, multiplier);
  }

  /**
   * Advance the clock by a fixed amount of simulated time.
   * Useful for step-by-step simulation.
   */
  advance(minutes: number): void {
    this._accumulatedSimMs += minutes * 60 * 1000;
  }

  /**
   * Jump to a specific simulated time.
   */
  jumpTo(isoString: string): void {
    const target = new Date(isoString).getTime();
    this._accumulatedSimMs = target - this._startSimTime;
    if (this._isRunning && !this._isPaused) {
      this._startRealTime = Date.now();
    }
  }

  /**
   * Get the full clock state (for API / frontend).
   */
  getState(): ClockState {
    return {
      simTime: this.nowISO(),
      speed: this._speed,
      isPaused: this._isPaused,
      isRunning: this._isRunning,
      elapsedSimMs: this._getElapsedSimMs(),
      startTime: new Date(this._startSimTime).toISOString(),
    };
  }

  get speed(): number {
    return this._speed;
  }

  get isPaused(): boolean {
    return this._isPaused;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  private _getElapsedSimMs(): number {
    if (!this._isRunning || this._isPaused) {
      return this._accumulatedSimMs;
    }
    const realElapsed = Date.now() - this._startRealTime;
    return this._accumulatedSimMs + realElapsed * this._speed;
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────
// One clock for the entire application.

let _instance: SimulationClockImpl | null = null;

export function getSimulationClock(): SimulationClockImpl {
  if (!_instance) {
    _instance = new SimulationClockImpl();
  }
  return _instance;
}

export type SimulationClock = SimulationClockImpl;
