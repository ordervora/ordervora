'use client';

/**
 * ReviewsManager — reviews and replies.
 *
 * Shows rating analytics (average + distribution), lists customer reviews across
 * sources, and lets an owner/manager reply inline. Replies go through the review
 * service, which stamps who replied and when. Scoped by restaurant_id under RLS.
 */

import { useEffect, useMemo, useState } from 'react';

import { getBrowserClient } from '@/lib/supabase/client';
import { useDashboard } from '@/lib/dashboard/context';
import { reviewService } from '@/lib/services';
import { useAuth } from '@/hooks/useAuth';
import { dateOnly } from '@/lib/dashboard/utils';
import type { Review } from '@/lib/services/review.service';

export function ReviewsManager() {
  const { restaurant } = useDashboard();
  const { user } = useAuth();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<{ average: number; count: number }>({
    average: 0,
    count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    const client = getBrowserClient();
    const [list, rating] = await Promise.all([
      reviewService.listReviews(client, restaurant.id, { limit: 100 }),
      reviewService.getRatingSummary(client, restaurant.id),
    ]);
    setReviews(list.error ? [] : list.data);
    if (!rating.error) setSummary(rating.data);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant.id]);

  const distribution = useMemo(() => {
    const dist = [0, 0, 0, 0, 0]; // index 0 => 1 star
    for (const r of reviews) {
      if (r.rating >= 1 && r.rating <= 5) {
        const idx = r.rating - 1;
        dist[idx] = (dist[idx] ?? 0) + 1;
      }
    }
    return dist;
  }, [reviews]);

  async function submitReply(reviewId: string) {
    if (!user) return;
    const text = (replyDraft[reviewId] ?? '').trim();
    if (!text) return;
    setSavingId(reviewId);
    const client = getBrowserClient();
    await reviewService.replyToReview(client, reviewId, text, user.id);
    setSavingId(null);
    setReplyDraft((prev) => ({ ...prev, [reviewId]: '' }));
    await load();
  }

  const maxDist = Math.max(1, ...distribution);

  return (
    <>
      <header className="dash-head">
        <div>
          <h1>Reviews</h1>
          <div className="dash-head-sub">{summary.count} reviews</div>
        </div>
      </header>

      <div className="dash-body">
        <div className="dash-grid" data-cols="3" style={{ marginBottom: 16 }}>
          <div className="dash-kpi" data-tone="brass">
            <div className="dash-kpi-label">Average rating</div>
            <div className="dash-kpi-value">
              {summary.average ? summary.average.toFixed(1) : '—'}
            </div>
            <div className="dash-kpi-sub">across {summary.count} reviews</div>
          </div>
          <div className="dash-panel" style={{ gridColumn: 'span 2' }}>
            <div className="dash-panel-head">
              <span className="dash-panel-title">Rating distribution</span>
            </div>
            <div className="dash-panel-body">
              <div className="dash-bars">
                {[5, 4, 3, 2, 1].map((star) => {
                  const n = distribution[star - 1] ?? 0;
                  return (
                    <div key={star}>
                      <div className="dash-bar-row">
                        <span className="dash-bar-label">{star} ★</span>
                        <span className="dash-bar-value">{n}</span>
                      </div>
                      <div className="dash-bar-track">
                        <div
                          className="dash-bar-fill"
                          style={{ width: `${(n / maxDist) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="dash-panel">
          <div className="dash-panel-head">
            <span className="dash-panel-title">All reviews</span>
          </div>
          <div className="dash-panel-body">
            {loading ? (
              <div className="dash-empty">Loading…</div>
            ) : reviews.length === 0 ? (
              <div className="dash-empty">No reviews yet.</div>
            ) : (
              <div className="dash-list">
                {reviews.map((review) => (
                  <div
                    key={review.id}
                    style={{
                      paddingBottom: 16,
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span className="dash-strong">
                        {'★'.repeat(review.rating)}
                        <span style={{ color: 'var(--line-strong)' }}>
                          {'★'.repeat(5 - review.rating)}
                        </span>
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {review.source} · {dateOnly(review.created_at)}
                      </span>
                    </div>
                    {review.text && (
                      <p style={{ margin: '8px 0', fontSize: 14 }}>
                        {review.text}
                      </p>
                    )}

                    {review.replied && review.reply ? (
                      <div
                        style={{
                          background: 'var(--surface-2)',
                          borderRadius: 8,
                          padding: '10px 12px',
                          fontSize: 13,
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 700,
                            color: 'var(--brass)',
                          }}
                        >
                          Your reply:{' '}
                        </span>
                        {review.reply}
                      </div>
                    ) : (
                      <div
                        style={{ display: 'flex', gap: 8, marginTop: 8 }}
                      >
                        <input
                          className="dash-input"
                          placeholder="Write a reply…"
                          value={replyDraft[review.id] ?? ''}
                          onChange={(e) =>
                            setReplyDraft((prev) => ({
                              ...prev,
                              [review.id]: e.target.value,
                            }))
                          }
                        />
                        <button
                          className="dash-btn"
                          data-variant="primary"
                          disabled={savingId === review.id}
                          onClick={() => void submitReply(review.id)}
                        >
                          {savingId === review.id ? 'Posting…' : 'Reply'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
