import Link from 'next/link';

/**
 * Shown when a restaurant slug doesn't resolve to an active restaurant.
 */
export default function StorefrontNotFound() {
  return (
    <div className="ov-shell">
      <div className="ov-empty">
        <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>
          Restaurant not found
        </p>
        <p>This ordering page isn’t available. Check the link and try again.</p>
        <Link className="ov-link" href="/">
          Go home
        </Link>
      </div>
    </div>
  );
}
