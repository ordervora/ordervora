'use client';

/**
 * KDS sound engine.
 *
 * Generates alert tones with the Web Audio API rather than shipping audio files,
 * so alerts play instantly with zero network dependency on kitchen hardware that
 * may have flaky wifi. 12 distinct alert profiles are offered so a kitchen
 * can pick one that cuts through their ambient noise. The AudioContext is
 * created lazily on first user gesture (browsers block autoplay until then),
 * which the KDS unlocks when the operator taps "Start shift".
 */

export type SoundId =
  | 'restaurant_bell'
  | 'kitchen_bell'
  | 'soft_bell'
  | 'double_bell'
  | 'triple_bell'
  | 'digital'
  | 'cash_register'
  | 'pickup_ready'
  | 'order_complete'
  | 'alarm'
  | 'emergency'
  | 'premium_chime';

export type SoundEventType =
  | 'new_order'
  | 'priority_order'
  | 'ready'
  | 'cancelled'
  | 'driver_assigned';

export interface SoundOption {
  id: SoundId;
  label: string;
  description: string;
}

/** All selectable alert profiles. */
export const SOUND_OPTIONS: readonly SoundOption[] = [
  { id: 'restaurant_bell',  label: 'Restaurant Bell',      description: 'Classic warm bell' },
  { id: 'kitchen_bell',     label: 'Kitchen Bell',         description: 'Sharp service ding' },
  { id: 'soft_bell',        label: 'Soft Bell',            description: 'Gentle notification' },
  { id: 'double_bell',      label: 'Double Bell',          description: 'Two quick dings' },
  { id: 'triple_bell',      label: 'Triple Bell',          description: 'Three rapid dings' },
  { id: 'digital',          label: 'Digital Notification', description: 'Electronic blip' },
  { id: 'cash_register',    label: 'Cash Register',        description: 'Classic ka-ching' },
  { id: 'pickup_ready',     label: 'Pickup Ready',         description: 'Ascending melody' },
  { id: 'order_complete',   label: 'Order Complete',       description: 'Completion fanfare' },
  { id: 'alarm',            label: 'Alarm',                description: 'Urgent triple pulse' },
  { id: 'emergency',        label: 'Emergency Alert',      description: 'High-priority siren' },
  { id: 'premium_chime',    label: 'Premium Chime',        description: 'Rich two-note chime' },
];

/** Default sound assignment per event type. */
export const DEFAULT_EVENT_SOUNDS: Record<SoundEventType, SoundId> = {
  new_order:      'restaurant_bell',
  priority_order: 'alarm',
  ready:          'pickup_ready',
  cancelled:      'soft_bell',
  driver_assigned: 'digital',
};

interface ToneSpec {
  frequency: number;
  startAt: number;
  duration: number;
  type: OscillatorType;
  gain: number;
}

const PROFILES: Record<SoundId, ToneSpec[]> = {
  restaurant_bell: [
    { frequency: 880,  startAt: 0,    duration: 0.6,  type: 'sine',     gain: 0.5 },
    { frequency: 1100, startAt: 0.05, duration: 0.4,  type: 'sine',     gain: 0.25 },
  ],
  kitchen_bell: [
    { frequency: 1320, startAt: 0,    duration: 0.35, type: 'triangle', gain: 0.55 },
  ],
  soft_bell: [
    { frequency: 660,  startAt: 0,    duration: 0.5,  type: 'sine',     gain: 0.3 },
    { frequency: 880,  startAt: 0.2,  duration: 0.4,  type: 'sine',     gain: 0.2 },
  ],
  double_bell: [
    { frequency: 988,  startAt: 0,    duration: 0.2,  type: 'triangle', gain: 0.5 },
    { frequency: 988,  startAt: 0.28, duration: 0.2,  type: 'triangle', gain: 0.5 },
  ],
  triple_bell: [
    { frequency: 1047, startAt: 0,    duration: 0.15, type: 'triangle', gain: 0.5 },
    { frequency: 1047, startAt: 0.22, duration: 0.15, type: 'triangle', gain: 0.5 },
    { frequency: 1047, startAt: 0.44, duration: 0.15, type: 'triangle', gain: 0.5 },
  ],
  digital: [
    { frequency: 1480, startAt: 0,    duration: 0.07, type: 'square',   gain: 0.2 },
    { frequency: 1760, startAt: 0.1,  duration: 0.07, type: 'square',   gain: 0.2 },
  ],
  cash_register: [
    { frequency: 1175, startAt: 0,    duration: 0.06, type: 'square',   gain: 0.3 },
    { frequency: 1568, startAt: 0.08, duration: 0.06, type: 'square',   gain: 0.3 },
    { frequency: 880,  startAt: 0.18, duration: 0.25, type: 'triangle', gain: 0.4 },
  ],
  pickup_ready: [
    { frequency: 523,  startAt: 0,    duration: 0.15, type: 'sine',     gain: 0.45 },
    { frequency: 659,  startAt: 0.18, duration: 0.15, type: 'sine',     gain: 0.45 },
    { frequency: 784,  startAt: 0.36, duration: 0.25, type: 'sine',     gain: 0.45 },
  ],
  order_complete: [
    { frequency: 523,  startAt: 0,    duration: 0.12, type: 'sine',     gain: 0.4 },
    { frequency: 659,  startAt: 0.14, duration: 0.12, type: 'sine',     gain: 0.4 },
    { frequency: 784,  startAt: 0.28, duration: 0.12, type: 'sine',     gain: 0.4 },
    { frequency: 1047, startAt: 0.42, duration: 0.3,  type: 'sine',     gain: 0.4 },
  ],
  alarm: [
    { frequency: 740,  startAt: 0,    duration: 0.12, type: 'square',   gain: 0.32 },
    { frequency: 740,  startAt: 0.18, duration: 0.12, type: 'square',   gain: 0.32 },
    { frequency: 740,  startAt: 0.36, duration: 0.12, type: 'square',   gain: 0.32 },
  ],
  emergency: [
    { frequency: 660,  startAt: 0,    duration: 0.1,  type: 'square',   gain: 0.38 },
    { frequency: 880,  startAt: 0.12, duration: 0.1,  type: 'square',   gain: 0.38 },
    { frequency: 660,  startAt: 0.24, duration: 0.1,  type: 'square',   gain: 0.38 },
    { frequency: 880,  startAt: 0.36, duration: 0.1,  type: 'square',   gain: 0.38 },
    { frequency: 660,  startAt: 0.48, duration: 0.1,  type: 'square',   gain: 0.38 },
  ],
  premium_chime: [
    { frequency: 660,  startAt: 0,    duration: 0.18, type: 'sine',     gain: 0.5 },
    { frequency: 880,  startAt: 0.16, duration: 0.28, type: 'sine',     gain: 0.5 },
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
    gainNode.gain.setValueAtTime(0.0001, now + tone.startAt);
    gainNode.gain.exponentialRampToValueAtTime(peak, now + tone.startAt + 0.01);
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
