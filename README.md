# OrderVora

Multi-tenant restaurant ordering platform — commission-free direct online ordering with a kitchen display system and an owner dashboard. Built with Next.js 15 (App Router), Supabase (Postgres + Auth + Realtime + Edge Functions), and Stripe Connect.

One codebase serves many restaurants. Every row is isolated by `restaurant_id` under Postgres Row Level Security; a single deployment hosts every tenant.

## Surfaces

| Surface | Route | Audience | Notes |
|---------|-------|----------|-------|
| Customer App | `/[slug]` | Diners | Mobile-first storefront, cart, checkout, live tracking, account, loyalty |
| KDS | `/kds` | Kitchen staff | Fullscreen ticket board, realtime, sound alerts — **never shows money** |
| Owner Dashboard | `/dashboard` | Owners / managers | Orders, menu, customers, coupons, reviews, staff, settings, analytics |

### The revenue firewall

Kitchen-tier staff must never see revenue, payments, tips, taxes, or profit. This is enforced in depth: RLS denies kitchen roles on financial tables, financial columns live in separate `*_financials` tables, and the KDS reads only money-free `kds_tickets*` views. The KDS surface contains zero references to financial data; the dashboard is its authorized, role-gated counterpart.

## Architecture

- **Server-authoritative pricing.** The client proposes a cart by reference (product/option ids, quantities). The `checkout` Edge Function re-reads true prices, applies coupons, computes tax/tip/delivery, and is the single source of truth for all money. A tampered client price cannot be honored.
- **Atomic orders.** `create_order_atomic` writes the order, financials, items, and modifiers in one transaction.
- **Stripe Connect.** PaymentIntents are created on each restaurant's connected account; the webhook confirms payment, advances the order, records redemptions, and awards loyalty.
- **Realtime.** Order state changes fan out to the KDS and the customer tracker over Supabase Realtime.

## Project layout

```
app/                 Next.js App Router
  [slug]/            Customer storefront, checkout, tracking, account
  kds/               Kitchen display system
  dashboard/         Owner dashboard (9 sections)
  auth/              Sign-in, OAuth callback, sign-out
components/          customer/, kds/, dashboard/ UI
lib/
  supabase/          Browser / server / service clients
  services/          11 typed data services (the only DB access layer)
  realtime/          Typed Realtime subscriptions
  rbac/              Role to permission matrix (mirrors RLS)
  cart/              Cart state, client pricing estimate, checkout client
  dashboard/         Dashboard context + utils
  sound/             WebAudio KDS alert engine
hooks/               React hooks (auth, realtime, KDS, customer)
config/              env + constants
types/               Generated database types
supabase/
  migrations/        0001 schema + RLS, 0002 checkout RPC + triggers
  functions/         5 Edge Functions + shared modules
  seed/              Demo Deli seed (multi-tenant friendly)
```

## Getting started

```bash
npm install
cp config/env.example .env.local   # fill in Supabase + Stripe keys
supabase start                     # local Postgres + Auth + Realtime
supabase db push                   # apply migrations 0001 + 0002
npm run db:seed                    # populate the Demo Deli tenant
npm run dev
```

Then visit:

- `http://localhost:3000/demo-deli` — customer storefront
- `http://localhost:3000/dashboard` — owner dashboard (sign in as `owner@demodeli.example`)
- `http://localhost:3000/kds` — kitchen display

### Edge Functions

```bash
supabase functions deploy checkout stripe-webhook validate-coupon refund-order advance-order
```

Set their secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PLATFORM_FEE_BPS`, `LOYALTY_POINTS_PER_UNIT`, and the `SUPABASE_*` keys) in the Supabase dashboard. See `config/env.example`.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | Lint |
| `npm run db:push` | Apply migrations |
| `npm run db:types` | Regenerate `types/database.types.ts` |
| `npm run db:seed` | Seed the Demo Deli tenant |

## Multi-tenancy

The seed is tenant-agnostic. To add a second isolated tenant:

```bash
SEED_SLUG=second-deli npm run db:seed
```

Both tenants share the schema and deployment; RLS keeps their data fully separate.

## Tech

Next.js 15 · React · TypeScript (strict) · Supabase · Stripe Connect · Vercel-ready.
