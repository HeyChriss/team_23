import { describe, it, expect } from "vitest";
import { withWriteLock } from "./write-queue";

describe("Write Queue (Async Mutex)", () => {
  it("executes a single function and returns its result", async () => {
    const result = await withWriteLock(() => 42);
    expect(result).toBe(42);
  });

  it("executes an async function and returns its result", async () => {
    const result = await withWriteLock(async () => {
      return "async-result";
    });
    expect(result).toBe("async-result");
  });

  it("serializes concurrent writes (no interleaving)", async () => {
    const order: number[] = [];

    const task = (id: number, delayMs: number) =>
      withWriteLock(async () => {
        order.push(id);
        await new Promise((r) => setTimeout(r, delayMs));
        order.push(id * 10);
        return id;
      });

    // Launch 3 concurrent tasks — they should execute sequentially
    const [r1, r2, r3] = await Promise.all([
      task(1, 30),
      task(2, 10),
      task(3, 5),
    ]);

    expect(r1).toBe(1);
    expect(r2).toBe(2);
    expect(r3).toBe(3);

    // Each task should start and finish before the next starts
    // Order: 1, 10, 2, 20, 3, 30
    expect(order).toEqual([1, 10, 2, 20, 3, 30]);
  });

  it("propagates errors without breaking the queue", async () => {
    // First call throws
    const p1 = withWriteLock(() => {
      throw new Error("boom");
    });
    await expect(p1).rejects.toThrow("boom");

    // Second call should still work
    const result = await withWriteLock(() => "recovered");
    expect(result).toBe("recovered");
  });

  it("propagates async errors without breaking the queue", async () => {
    const p1 = withWriteLock(async () => {
      throw new Error("async-boom");
    });
    await expect(p1).rejects.toThrow("async-boom");

    const result = await withWriteLock(async () => "ok");
    expect(result).toBe("ok");
  });

  it("handles high concurrency without data loss", async () => {
    let counter = 0;
    const N = 50;

    const tasks = Array.from({ length: N }, () =>
      withWriteLock(() => {
        counter++;
        return counter;
      })
    );

    const results = await Promise.all(tasks);

    expect(counter).toBe(N);
    // Each task should have seen a unique counter value
    expect(new Set(results).size).toBe(N);
    // Results should be sequential
    expect(results).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  });
});
