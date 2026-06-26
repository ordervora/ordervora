'use client';

/**
 * useKdsPreferences — device-local KDS sound preferences.
 *
 * Persists the chosen alert sound, volume, and mute state in localStorage so a
 * kitchen tablet remembers its settings across reloads. These are device
 * preferences, separate from the owner's restaurant_settings. Reads are guarded
 * for SSR (no window on the server).
 */

import { useCallback, useEffect, useState } from 'react';

import type { SoundId } from '@/lib/sound';

const STORAGE_KEY = 'ordervora.kds.prefs';

export interface KdsPreferences {
  soundId: SoundId;
  volume: number;
  muted: boolean;
}

const DEFAULT_PREFS: KdsPreferences = {
  soundId: 'chime',
  volume: 1,
  muted: false,
};

function readStored(): KdsPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<KdsPreferences>;
    return {
      soundId: parsed.soundId ?? DEFAULT_PREFS.soundId,
      volume:
        typeof parsed.volume === 'number'
          ? Math.max(0, Math.min(1, parsed.volume))
          : DEFAULT_PREFS.volume,
      muted: parsed.muted ?? DEFAULT_PREFS.muted,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export interface UseKdsPreferencesResult extends KdsPreferences {
  setSoundId: (id: SoundId) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
}

export function useKdsPreferences(): UseKdsPreferencesResult {
  const [prefs, setPrefs] = useState<KdsPreferences>(DEFAULT_PREFS);

  // Hydrate from storage after mount to avoid SSR/client mismatch.
  useEffect(() => {
    setPrefs(readStored());
  }, []);

  const persist = useCallback((next: KdsPreferences) => {
    setPrefs(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  }, []);

  const setSoundId = useCallback(
    (id: SoundId) => persist({ ...readStored(), soundId: id }),
    [persist],
  );
  const setVolume = useCallback(
    (volume: number) =>
      persist({ ...readStored(), volume: Math.max(0, Math.min(1, volume)) }),
    [persist],
  );
  const setMuted = useCallback(
    (muted: boolean) => persist({ ...readStored(), muted }),
    [persist],
  );

  return { ...prefs, setSoundId, setVolume, setMuted };
}
