'use client';

/**
 * KDS sound engine.
 *
 * Generates alert tones with the Web Audio API rather than shipping audio files,
 * so alerts play instantly with zero network dependency on kitchen hardware that
 * may have flaky wifi. Several distinct alert profiles are offered so a kitchen
 * can pick one that cuts through their ambient noise. The AudioContext is
 * created lazily on first user gesture (browsers block autoplay until then),
 * which the KDS unlocks when the operator taps "Start shift".
 */

export type SoundId = 'chime' | 'bell' | 'ping' | 'alarm' | 'knock';

export interface SoundOption {
  id: SoundId;
  label: string;
  description: string;
}

/** The selectable alert profiles shown in KDS settings. */
export const SOUND_OPTIONS: readonly SoundOption[] = [
  { id: 'chime', label: 'Chime', description: 'Two-note rising chime' },
  { id: 'bell', label: 'Bell', description: 'Bright single bell' },
  { id: 'ping', label: 'Ping', description: 'Short high ping' },
  { id: 'alarm', label: 'Alarm', description: 'Urgent triple pulse' },
  { id: 'knock', label: 'Knock', description: 'Low double knock' },
];

interface ToneSpec {
  frequency: number;
  startAt: number;
  duration: number;
  type: OscillatorType;
  gain: number;
}

/** The note sequence for each alert profile. */
const PROFILES: Record<SoundId, ToneSpec[]> = {
  chime: [
    { frequency: 660, startAt: 0, duration: 0.18, type: 'sine', gain: 0.5 },
    { frequency: 880, startAt: 0.16, duration: 0.28, type: 'sine', gain: 0.5 },
  ],
  bell: [
    { frequency: 988, startAt: 0, duration: 0.5, type: 'triangle', gain: 0.45 },
  ],
  ping: [
    { frequency: 1320, startAt: 0, duration: 0.12, type: 'sine', gain: 0.45 },
  ],
  alarm: [
    { frequency: 740, startAt: 0, duration: 0.12, type: 'square', gain: 0.32 },
    { frequency: 740, startAt: 0.18, duration: 0.12, type: 'square', gain: 0.32 },
    { frequency: 740, startAt: 0.36, duration: 0.12, type: 'square', gain: 0.32 },
  ],
  knock: [
    { frequency: 180, startAt: 0, duration: 0.1, type: 'sine', gain: 0.6 },
    { frequency: 150, startAt: 0.16, duration: 0.12, type: 'sine', gain: 0.6 },
  ],
};

let audioContext: AudioContext | null = null;

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioContext) return audioContext;
  const Ctor =
    window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!Ctor) return null;
  audioContext = new Ctor();
  return audioContext;
}

/**
 * Unlocks audio playback. Browsers require a user gesture before sound can
 * play; call this from a click handler (the "Start shift" button). Returns true
 * when audio is available afterward.
 */
export async function unlockAudio(): Promise<boolean> {
  const ctx = getContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  return ctx.state === 'running';
}

/** Plays the given alert profile once at the chosen volume (0..1). */
export function playSound(id: SoundId, volume = 1): void {
  const ctx = getContext();
  if (!ctx || ctx.state !== 'running') return;

  const profile = PROFILES[id];
  const now = ctx.currentTime;

  for (const tone of profile) {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.frequency, now + tone.startAt);

    const peak = tone.gain * Math.max(0, Math.min(1, volume));
    // Quick attack, exponential release so it reads as a "ding", not a buzz.
    gainNode.gain.setValueAtTime(0.0001, now + tone.startAt);
    gainNode.gain.exponentialRampToValueAtTime(
      peak,
      now + tone.startAt + 0.01,
    );
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      now + tone.startAt + tone.duration,
    );

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(now + tone.startAt);
    oscillator.stop(now + tone.startAt + tone.duration + 0.02);
  }
}
