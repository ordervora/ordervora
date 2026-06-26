'use client';

/**
 * useRestaurant — loads a restaurant (by slug or id) on the client and exposes
 * it with loading/error state. For server rendering, call the restaurant
 * service directly with the server client; this hook is for client components
 * that need tenant context without a server round-trip already in hand.
 */

import { useEffect, useState } from 'react';

import { getBrowserClient } from '@/lib/supabase/client';
import { restaurantService } from '@/lib/services';
import type { Restaurant } from '@/lib/services/restaurant.service';

export interface UseRestaurantResult {
  restaurant: Restaurant | null;
  loading: boolean;
  error: string | null;
}

type Selector = { slug: string } | { id: string };

export function useRestaurant(selector: Selector): UseRestaurantResult {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = 'slug' in selector ? `slug:${selector.slug}` : `id:${selector.id}`;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const client = getBrowserClient();
    const load =
      'slug' in selector
        ? restaurantService.getRestaurantBySlug(client, selector.slug)
        : restaurantService.getRestaurantById(client, selector.id);

    load.then((result) => {
      if (!active) return;
      if (result.error) {
        setError(result.error.message);
        setRestaurant(null);
      } else {
        setRestaurant(result.data);
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
    // `key` captures the meaningful identity of `selector`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { restaurant, loading, error };
}
