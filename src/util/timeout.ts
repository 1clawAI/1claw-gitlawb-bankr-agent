// Wraps any async I/O with a 30s deadline so a hung upstream service fails as
// its own error type. Used by every client wrapper (steps 1–5).

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export const DEFAULT_TIMEOUT_MS = 30_000;

export async function withTimeout<T>(
  label: string,
  ms: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) throw new TimeoutError(label, ms);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
