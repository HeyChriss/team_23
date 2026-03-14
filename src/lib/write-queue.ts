/**
 * Simple async mutex for serializing SQLite write operations.
 * Prevents SQLITE_BUSY errors when multiple agents try to write concurrently.
 */

let _lock: Promise<void> = Promise.resolve();

export function withWriteLock<T>(fn: () => T | Promise<T>): Promise<T> {
  let release: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });

  const result = _lock.then(async () => {
    try {
      return await fn();
    } finally {
      release!();
    }
  });

  _lock = next;
  return result;
}
