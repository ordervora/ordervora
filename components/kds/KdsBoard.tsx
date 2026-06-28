'use client';

/**
 * KdsBoard — the live kitchen board.
 *
 * Orchestrates the whole surface: the start-shift gate, the three workflow
 * columns, the shared ticker, sound alerts on new tickets, connection status,
 * and the settings panel. Partitions the active tickets into Waiting / Preparing
 * / Ready by their order state.
 *
 * REVENUE FIREWALL: this component and everything it renders consume only the
 * money-free KDS views and operational order data. No financials service, no
 * payment data, no totals — by construction.
 */

import { useCallback, useMemo, useState } from 'react';

import { StationColumn } from './StationColumn';
import { StartShiftOverlay } from './StartShiftOverlay';
import { SettingsPanel } from './SettingsPanel';
import { useKdsBoard } from '@/hooks/useKdsBoard';
import { useOrderActions } from '@/hooks/useOrderActions';
import { useKdsPreferences } from '@/hooks/useKdsPreferences';
import { useTicker } from '@/hooks/useTicker';
import { playSound } from '@/lib/sound';
import type { KdsTicketDetail } from '@/lib/services/kds.service';
import type { OrderState } from '@/config/constants';

export interface KdsBoardProps {
  restaurantId: string;
  restaurantName: string;
}

type Column = 'waiting' | 'preparing' | 'ready';

/** Maps an order state to the board column it belongs in. */
function columnFor(state: OrderState | null): Column | null {
  switch (state) {
    case 'accepted':
      return 'waiting';
    case 'preparing':
      return 'preparing';
    case 'ready':
    case 'out_for_delivery':
      return 'ready';
    default:
      return null;
  }
}

export function KdsBoard({ restaurantId, restaurantName }: KdsBoardProps) {
  const prefs = useKdsPreferences();
  const [shiftStarted, setShiftStarted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const now = useTicker(1000);
  const actions = useOrderActions();

  // New-ticket sound. Reads the latest prefs through the closure each call.
  const handleNewTicket = useCallback(
    (_ticket: KdsTicketDetail) => {
      if (!shiftStarted) return;
      if (prefs.muted) return;
      playSound(prefs.soundId, prefs.volume);
    },
    [shiftStarted, prefs.muted, prefs.soundId, prefs.volume],
  );

  const { tickets, loading, error, newTicketIds, refetch } = useKdsBoard(
    restaurantId,
    handleNewTicket,
  );

  // Partition tickets into columns, preserving the oldest-first order.
  const columns = useMemo(() => {
    const buckets: Record<Column, KdsTicketDetail[]> = {
      waiting: [],
      preparing: [],
      ready: [],
    };
    for (const ticket of tickets) {
      const col = columnFor(ticket.state);
      if (col) buckets[col].push(ticket);
    }
    return buckets;
  }, [tickets]);

  const bump = useCallback(
    (orderId: string, toState: OrderState) => {
      void actions.bump(orderId, toState);
    },
    [actions],
  );

  const recall = useCallback(
    (orderId: string, toState: OrderState) => {
      void actions.recall(orderId, toState);
    },
    [actions],
  );

  const totalActive =
    columns.waiting.length + columns.preparing.length + columns.ready.length;

  return (
    <div className="kds-root">
      <header className="kds-bar">
        <div className="kds-bar-title">
          <span className="kds-bar-name">{restaurantName}</span>
          <span className="kds-bar-meta">
            {loading ? 'Loading…' : `${totalActive} active`}
          </span>
        </div>
        <div className="kds-bar-actions">
          <span
            className="kds-pill"
            data-live={error ? 'false' : 'true'}
            title={error ? 'Reconnecting' : 'Live'}
          >
            {error ? 'Reconnecting' : 'Live'}
          </span>
          <button
            type="button"
            className="kds-pill"
            data-on={!prefs.muted}
            onClick={() => prefs.setMuted(!prefs.muted)}
          >
            {prefs.muted ? 'Muted' : 'Sound on'}
          </button>
          <button
            type="button"
            className="kds-pill"
            onClick={() => void refetch()}
          >
            Refresh
          </button>
          <button
            type="button"
            className="kds-pill"
            onClick={() => setShowSettings(true)}
          >
            Settings
          </button>
        </div>
      </header>

      {error && (
        <div className="kds-banner">
          Live updates interrupted — {error}. Tap Refresh to reconcile the board.
        </div>
      )}
      {actions.error && <div className="kds-banner">{actions.error}</div>}

      <div className="kds-board">
        <StationColumn
          state="waiting"
          label="Waiting"
          tickets={columns.waiting}
          now={now}
          pendingOrderId={actions.pendingOrderId}
          newTicketIds={newTicketIds}
          onBump={bump}
          onRecall={recall}
        />
        <StationColumn
          state="preparing"
          label="Preparing"
          tickets={columns.preparing}
          now={now}
          pendingOrderId={actions.pendingOrderId}
          newTicketIds={newTicketIds}
          onBump={bump}
          onRecall={recall}
        />
        <StationColumn
          state="ready"
          label="Ready"
          tickets={columns.ready}
          now={now}
          pendingOrderId={actions.pendingOrderId}
          newTicketIds={newTicketIds}
          onBump={bump}
          onRecall={recall}
        />
      </div>

      {!shiftStarted && (
        <StartShiftOverlay
          restaurantName={restaurantName}
          soundId={prefs.soundId}
          onSoundChange={prefs.setSoundId}
          onStart={() => setShiftStarted(true)}
        />
      )}

      {showSettings && (
        <SettingsPanel
          soundId={prefs.soundId}
          volume={prefs.volume}
          muted={prefs.muted}
          onSoundChange={prefs.setSoundId}
          onVolumeChange={prefs.setVolume}
          onMutedChange={prefs.setMuted}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
