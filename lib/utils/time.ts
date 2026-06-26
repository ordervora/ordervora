/**
 * Time formatting helpers for the KDS timers.
 *
 * Kitchen timers count UP from when an order was placed (age) or when it started
 * cooking (prep). They are formatted compactly (m:ss, or h:mm:ss past an hour)
 * with tabular spacing in mind, so the numbers don't jitter as they tick.
 */

/** Seconds between an ISO timestamp and now (never negative). */
export function secondsSince(iso: string, now: number = Date.now()): number {
  const then = new Date(iso).getTime();
  return Math.max(0, Math.floor((now - then) / 1000));
}

/** Formats a duration in seconds as m:ss, or h:mm:ss beyond an hour. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const ss = secs.toString().padStart(2, '0');
  if (hours > 0) {
    const mm = minutes.toString().padStart(2, '0');
    return `${hours}:${mm}:${ss}`;
  }
  return `${minutes}:${ss}`;
}

/** A short clock label like "7:24 PM" for when an order was placed. */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}
