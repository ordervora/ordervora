'use client';

/**
 * StartShiftOverlay — the gate before the board goes live.
 *
 * Browsers block sound until a user gesture, and fullscreen needs one too. This
 * overlay turns "Start shift" into that gesture: it unlocks the audio engine and
 * requests fullscreen, then hands control to the board. It also lets the kitchen
 * pick and preview an alert sound up front.
 */

import { useState } from 'react';

import { SOUND_OPTIONS, playSound, unlockAudio, type SoundId } from '@/lib/sound';

export interface StartShiftOverlayProps {
  restaurantName: string;
  soundId: SoundId;
  onSoundChange: (id: SoundId) => void;
  onStart: () => void;
}

export function StartShiftOverlay({
  restaurantName,
  soundId,
  onSoundChange,
  onStart,
}: StartShiftOverlayProps) {
  const [starting, setStarting] = useState(false);

  async function handleStart() {
    setStarting(true);
    await unlockAudio();
    // Confirm the chosen sound is audible as feedback that audio is unlocked.
    playSound(soundId, 1);
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // Fullscreen can be declined by the browser or OS; the board runs anyway.
    }
    onStart();
  }

  async function preview(id: SoundId) {
    onSoundChange(id);
    await unlockAudio();
    playSound(id, 1);
  }

  return (
    <div className="kds-overlay">
      <div className="kds-panel">
        <h2>{restaurantName} — Kitchen Display</h2>
        <p>
          Pick an alert sound, then start the shift. Starting enables sound and
          full-screen so tickets are easy to read across the kitchen.
        </p>

        <span className="kds-field-label">Alert sound</span>
        <div className="kds-sound-list">
          {SOUND_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="kds-sound-row"
              data-selected={option.id === soundId}
              onClick={() => preview(option.id)}
            >
              <span>
                <span className="kds-sound-row-label">{option.label}</span>
                <br />
                <span className="kds-sound-row-desc">{option.description}</span>
              </span>
              <span className="kds-sound-row-desc">Tap to hear</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="kds-cta"
          disabled={starting}
          onClick={handleStart}
        >
          {starting ? 'Starting…' : 'Start shift'}
        </button>
      </div>
    </div>
  );
}
