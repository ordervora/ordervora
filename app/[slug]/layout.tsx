import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import { getServerClient } from '@/lib/supabase/server';
import { restaurantService } from '@/lib/services';
import { CartProvider } from '@/lib/cart/CartProvider';
import { brandStyle } from '@/lib/cart/brand';

import './customer.css';

/**
 * Customer storefront layout.
 *
 * Resolves the tenant by slug, applies its brand colors as CSS variables, and
 * wraps the surface in the cart provider scoped to this restaurant. An unknown
 * or inactive slug renders the not-found page.
 */
export default async function StorefrontLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getServerClient();
  const result = await restaurantService.getRestaurantBySlug(client, slug);

  if (result.error || !result.data) {
    notFound();
  }

  const restaurant = result.data;

  return (
    <div className="ov" style={brandStyle(restaurant)}>
      <CartProvider restaurantId={restaurant.id}>{children}</CartProvider>
    </div>
  );
}
