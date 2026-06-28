/**
 * Typed, validated environment access.
 *
 * Splits variables into two surfaces:
 *   - `clientEnv`  : NEXT_PUBLIC_* values that are safe to ship to the browser.
 *   - `serverEnv`  : secrets that must never reach the client bundle.
 *
 * Accessing `serverEnv` from code that runs in the browser throws immediately,
 * which is the guardrail that keeps the service-role key server-only.
 */

/**
 * Takes the already-read value (not a source+key pair) so every call site
 * keeps a literal `process.env.NEXT_PUBLIC_X` member expression in the
 * source. Next.js's compiler only inlines that exact literal pattern into
 * the client bundle — reading via a variable key (`source[key]`) defeats
 * the inlining and leaves the value undefined in the browser.
 */
function requireVar(value: string | undefined, key: string): string {
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
        `Add it to .env.local (see config/env.example).`,
    );
  }
  return value;
}

function optionalVar(value: string | undefined): string | undefined {
  return value === '' ? undefined : value;
}

/** True when executing in a browser context. */
const isBrowser = typeof window !== 'undefined';

/**
 * Public configuration. Only NEXT_PUBLIC_* keys belong here so they can be
 * inlined into the client bundle by Next.js.
 */
export const clientEnv = {
  supabaseUrl: requireVar(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    'NEXT_PUBLIC_SUPABASE_URL',
  ),
  supabaseAnonKey: requireVar(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ),
  /** Canonical site origin, used for OAuth redirects. */
  siteUrl: requireVar(process.env.NEXT_PUBLIC_SITE_URL, 'NEXT_PUBLIC_SITE_URL'),
  /** Stripe publishable key for the Payment Element (safe for the browser). */
  stripePublishableKey: optionalVar(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  ),
} as const;

/**
 * Server-only configuration. Throws if read in the browser so a misplaced
 * import surfaces loudly instead of leaking a secret.
 */
export const serverEnv = new Proxy(
  {} as {
    supabaseServiceRoleKey: string;
    stripeSecretKey: string | undefined;
    stripeWebhookSecret: string | undefined;
  },
  {
    get(_target, prop: string) {
      if (isBrowser) {
        throw new Error(
          `serverEnv.${prop} was accessed in the browser. ` +
            `Server secrets must only be read in server code.`,
        );
      }
      switch (prop) {
        case 'supabaseServiceRoleKey':
          return requireVar(
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            'SUPABASE_SERVICE_ROLE_KEY',
          );
        case 'stripeSecretKey':
          // Stripe is introduced in Phase 3; optional during Phase 0.
          return optionalVar(process.env.STRIPE_SECRET_KEY);
        case 'stripeWebhookSecret':
          return optionalVar(process.env.STRIPE_WEBHOOK_SECRET);
        default:
          return undefined;
      }
    },
  },
);
