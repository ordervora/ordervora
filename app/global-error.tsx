'use client';

/**
 * Root-level error boundary. Catches exceptions thrown above/in the root
 * layout that `app/error.tsx` can't reach, reports them to the server log
 * endpoint (production hides the real message/stack from the browser), and
 * shows a recoverable fallback instead of Next.js's generic dead-end page.
 */

import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'global-error',
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        url: typeof window !== 'undefined' ? window.location.href : null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            minHeight: '100dvh',
            display: 'grid',
            placeItems: 'center',
            padding: '24px',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
          }}
        >
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              Something went wrong
            </h1>
            <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>
              We&rsquo;ve logged the issue. Please try again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: '11px 16px',
                borderRadius: 10,
                border: 'none',
                background: '#111827',
                color: '#fff',
                fontWeight: 600,
                fontSize: 15,
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
