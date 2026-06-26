'use client';

/**
 * useTicker — a shared clock that re-renders on an interval.
 *
 * Timers across the board (order age, prep elapsed) all derive from the current
 * time. Rather than each ticket holding its own interval, the board reads this
 * one ticking value so every timer advances in lockstep and the page schedules a
 * single update per second.
 */

import { useEffect, useState } from 'react';

export function useTicker(intervalMs = 1000): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
