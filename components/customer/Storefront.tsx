'use client';

/**
 * Storefront — the restaurant landing + menu browse experience.
 *
 * The customer's main screen: hero with restaurant identity and hours, a
 * pickup/delivery toggle, sticky category navigation, and the full menu grouped
 * by category. Tapping a product opens the ProductModal to choose modifiers and
 * add to the cart. The CartRail floats at the bottom once items are added.
 */

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { UtensilsCrossed } from 'lucide-react';

import type { MenuCategory, ProductWithModifiers } from '@/lib/services/menu.service';
import type { Restaurant } from '@/lib/services/restaurant.service';
import { useCart } from '@/lib/cart/CartProvider';
import { formatMoney } from '@/lib/cart/pricing';
import { EmptyState } from '@/components/customer/EmptyState';
import { ProductModal } from './ProductModal';
import { CartRail } from './CartRail';

export interface StorefrontProps {
  restaurant: Restaurant;
  menu: MenuCategory[];
}

function hoursToday(restaurant: Restaurant): string | null {
  const hours = restaurant.hours as Record<string, string> | null;
  if (!hours) return null;
  const dayKey = new Date()
    .toLocaleDateString('en-US', { weekday: 'long' })
    .toLowerCase();
  return hours[dayKey] ?? null;
}

export function Storefront({ restaurant, menu }: StorefrontProps) {
  const { cart, setFulfillment } = useCart();
  const [activeProduct, setActiveProduct] = useState<ProductWithModifiers | null>(
    null,
  );
  const [activeCategory, setActiveCategory] = useState<string | null>(
    menu[0]?.id ?? null,
  );
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const nonEmptyCategories = useMemo(
    () => menu.filter((category) => category.products.length > 0),
    [menu],
  );

  const today = hoursToday(restaurant);
  const site = (restaurant.site_content ?? {}) as Partial<{
    tagline: string;
    about_heading: string;
    about_text: string;
  }>;

  function scrollToCategory(categoryId: string) {
    setActiveCategory(categoryId);
    const el = sectionRefs.current[categoryId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <div className="ov-shell">
      <header className="ov-hero">
        {restaurant.logo_url && (
          <img
            className="ov-hero-logo"
            src={restaurant.logo_url}
            alt={restaurant.name}
          />
        )}
        <h1>{restaurant.name}</h1>
        {site.tagline && <p className="ov-hero-tagline">{site.tagline}</p>}
        <div className="ov-hero-meta">
          {restaurant.address && <span>{restaurant.address}</span>}
          {today && (
            <span>
              Today <b>{today}</b>
            </span>
          )}
          <Link className="ov-link" href={`/${restaurant.slug}/account`}>
            Account
          </Link>
        </div>

        <div className="ov-fulfillment" role="tablist" aria-label="Fulfillment">
          <button
            type="button"
            className="ov-seg"
            data-active={cart.fulfillment === 'pickup'}
            onClick={() => setFulfillment('pickup')}
          >
            Pickup
          </button>
          <button
            type="button"
            className="ov-seg"
            data-active={cart.fulfillment === 'delivery'}
            onClick={() => setFulfillment('delivery')}
          >
            Delivery
          </button>
        </div>
      </header>

      {nonEmptyCategories.length > 1 && (
        <nav className="ov-catnav" aria-label="Menu categories">
          {nonEmptyCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              className="ov-chip"
              data-active={category.id === activeCategory}
              onClick={() => scrollToCategory(category.id)}
            >
              {category.emoji ? `${category.emoji} ` : ''}
              {category.name}
            </button>
          ))}
        </nav>
      )}

      <main>
        {nonEmptyCategories.map((category) => (
          <section
            key={category.id}
            className="ov-section"
            ref={(el: HTMLElement | null) => {
              sectionRefs.current[category.id] = el;
            }}
          >
            <h2>{category.name}</h2>
            {category.blurb && <p>{category.blurb}</p>}
            <div className="ov-products">
              {category.products.map((product, index) => {
                const image =
                  product.product_images.find((img) => img.is_primary)?.url ??
                  product.product_images[0]?.url ??
                  null;
                const out = !product.is_available;
                return (
                  <button
                    key={product.id}
                    type="button"
                    className="ov-product ov-stagger-in"
                    data-out={out}
                    disabled={out}
                    style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                    onClick={() => !out && setActiveProduct(product)}
                  >
                    <div className="ov-product-body">
                      <div className="ov-product-name">{product.name}</div>
                      {product.description && (
                        <div className="ov-product-desc">
                          {product.description}
                        </div>
                      )}
                      <div className="ov-product-foot">
                        <span className="ov-price">
                          {formatMoney(Number(product.price), restaurant.currency)}
                        </span>
                        {product.tag && !out && (
                          <span className="ov-badge">{product.tag}</span>
                        )}
                        {out && <span className="ov-out-badge">Sold out</span>}
                      </div>
                    </div>
                    {image && (
                      <img className="ov-thumb" src={image} alt={product.name} />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {nonEmptyCategories.length === 0 && (
          <EmptyState
            icon={UtensilsCrossed}
            title="Menu unavailable"
            description="This restaurant's menu isn't available right now. Please check back soon."
          />
        )}
      </main>

      {site.about_text && (
        <section className="ov-about">
          <h2>{site.about_heading || 'About'}</h2>
          <p>{site.about_text}</p>
        </section>
      )}

      {activeProduct && (
        <ProductModal
          product={activeProduct}
          currency={restaurant.currency}
          onClose={() => setActiveProduct(null)}
        />
      )}

      <CartRail slug={restaurant.slug} currency={restaurant.currency} />
    </div>
  );
}
