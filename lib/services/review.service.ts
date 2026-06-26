/**
 * Review service.
 *
 * Customer reviews and owner replies. Published reviews are public-readable;
 * a customer may post and edit their own; manager-tier replies to and moderates
 * reviews. The reply path stamps `replied`, `replied_by`, and `replied_at`.
 */

import {
  type Client,
  type ServiceResult,
  ok,
  fail,
  toServiceError,
} from './_shared';
import type { Tables, TablesInsert } from '@/types/database.types';

export type Review = Tables<'reviews'>;

interface ListReviewsOptions {
  /** Only reviews still awaiting a reply (the dashboard queue). */
  unrepliedOnly?: boolean;
  limit?: number;
}

/** Lists a restaurant's reviews, newest first. */
export async function listReviews(
  client: Client,
  restaurantId: string,
  options: ListReviewsOptions = {},
): Promise<ServiceResult<Review[]>> {
  const { unrepliedOnly = false, limit = 100 } = options;

  let query = client
    .from('reviews')
    .select('*')
    .eq('restaurant_id', restaurantId);

  if (unrepliedOnly) query = query.eq('replied', false);

  query = query.order('created_at', { ascending: false }).limit(limit);

  const { data, error } = await query;
  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Posts a review as the signed-in customer. */
export async function postReview(
  client: Client,
  input: TablesInsert<'reviews'>,
): Promise<ServiceResult<Review>> {
  if (input.rating < 1 || input.rating > 5) {
    return fail('Rating must be between 1 and 5.', 'invalid_rating');
  }

  const { data, error } = await client
    .from('reviews')
    .insert(input)
    .select('*')
    .single();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/**
 * Replies to a review (manager-tier). Records the reply text along with who
 * replied and when, and flips the `replied` flag so it leaves the queue.
 */
export async function replyToReview(
  client: Client,
  reviewId: string,
  reply: string,
  repliedBy: string,
): Promise<ServiceResult<Review>> {
  const trimmed = reply.trim();
  if (trimmed.length === 0) {
    return fail('A reply cannot be empty.', 'empty_reply');
  }

  const { data, error } = await client
    .from('reviews')
    .update({
      reply: trimmed,
      replied: true,
      replied_by: repliedBy,
      replied_at: new Date().toISOString(),
    })
    .eq('id', reviewId)
    .select('*')
    .single();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Publishes or unpublishes a review (manager-tier moderation). */
export async function setReviewPublished(
  client: Client,
  reviewId: string,
  isPublished: boolean,
): Promise<ServiceResult<Review>> {
  const { data, error } = await client
    .from('reviews')
    .update({ is_published: isPublished })
    .eq('id', reviewId)
    .select('*')
    .single();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Average rating and review count for a restaurant (published only). */
export async function getRatingSummary(
  client: Client,
  restaurantId: string,
): Promise<ServiceResult<{ average: number; count: number }>> {
  const { data, error } = await client
    .from('reviews')
    .select('rating')
    .eq('restaurant_id', restaurantId)
    .eq('is_published', true);

  if (error) return fail(error.message, toServiceError(error).code);

  const ratings = data ?? [];
  if (ratings.length === 0) return ok({ average: 0, count: 0 });

  const sum = (ratings as { rating: number }[]).reduce(
    (acc: number, row: { rating: number }) => acc + row.rating,
    0,
  );
  return ok({
    average: Math.round((sum / ratings.length) * 10) / 10,
    count: ratings.length,
  });
}
