/**
 * Maps a restaurant's stored brand colors to the CSS custom properties the
 * customer stylesheet reads. The storefront is rebrandable per tenant: whatever
 * colors a restaurant configures override the warm default palette. Unknown or
 * missing values fall back to the stylesheet defaults (by omitting the variable).
 */

import type { Tables } from '@/types/database.types';

type BrandColors = {
  brand?: string;
  brandInk?: string;
  ink?: string;
  paper?: string;
};

/**
 * Builds an inline style object of CSS variables from a restaurant's
 * brand_colors JSON. Only well-formed string values are applied.
 */
export function brandStyle(
  restaurant: Pick<Tables<'restaurants'>, 'brand_colors'>,
): Record<string, string> {
  const colors = (restaurant.brand_colors ?? {}) as BrandColors;
  const style: Record<string, string> = {};

  if (typeof colors.brand === 'string') style['--brand'] = colors.brand;
  if (typeof colors.brandInk === 'string') style['--brand-ink'] = colors.brandInk;
  if (typeof colors.ink === 'string') style['--ink'] = colors.ink;
  if (typeof colors.paper === 'string') style['--paper'] = colors.paper;

  return style;
}
