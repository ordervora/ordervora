'use client';

/**
 * SettingsPanel — in-shift sound and alert preferences.
 *
 * Lets the kitchen change the alert sound, adjust volume, and mute without
 * leaving the board. Device-local preferences only — this is distinct from the
 * owner's restaurant_settings, which configures the business. Closes back to the
 * board when done.
 */

import { SOUND_OPTIONS, playSound, type SoundId } from '@/lib/sound';
import type { ChangeEvent } from 'react';

export interface SettingsPanelProps {
  soundId: SoundId;
  volume: number;
  muted: boolean;
  onSoundChange: (id: SoundId) => void;
  onVolumeChange: (volume: number) => void;
  onMutedChange: (muted: boolean) => void;
  onClose: () => void;
}

export function SettingsPanel({
  soundId,
  volume,
  muted,
  onSoundChange,
  onVolumeChange,
  onMutedChange,
  onClose,
}: SettingsPanelProps) {
  function preview(id: SoundId) {
    onSoundChange(id);
    if (!muted) playSound(id, volume);
  }

  return (
    <div className="kds-overlay">
      <div className="kds-panel">
        <h2>Sound &amp; alerts</h2>
        <p>Tune how new tickets announce themselves. Saved on this device.</p>

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

        <span className="kds-field-label">
          Volume — {Math.round(volume * 100)}%
        </span>
        <input
          className="kds-range"
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onVolumeChange(Number(e.target.value) / 100)
          }
        />

        <button
          type="button"
          className="kds-sound-row"
          data-selected={muted}
          onClick={() => onMutedChange(!muted)}
          style={{ marginBottom: 18 }}
        >
          <span className="kds-sound-row-label">
            {muted ? 'Muted' : 'Sound on'}
          </span>
          <span className="kds-sound-row-desc">
            {muted ? 'Tap to unmute' : 'Tap to mute'}
          </span>
        </button>

        <button
          type="button"
          className="kds-cta"
          data-variant="neutral"
          onClick={onClose}
        >
          Back to board
        </button>
      </div>
    </div>
  );
}
