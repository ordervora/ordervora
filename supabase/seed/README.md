# Demo Deli — Seed Data

Populates a complete, multi-tenant-friendly demo tenant (**Demo Deli**) so every
surface has realistic data to render and exercise.

## What gets seeded

| Step | File | Contents |
|------|------|----------|
| 01 | `01_restaurant.ts` | Demo Deli restaurant + settings (branding, hours, tax, loyalty tiers, delivery fee) |
| 02 | `02_staff.ts` | Five auth users + roster: owner, manager, cashier, kitchen, delivery |
| 03 | `03_menu.ts` | 5 categories, 13 products, food costs, images, 7 modifier groups + options |
| 04 | `04_customers.ts` | 5 customers across loyalty tiers (one VIP) + saved addresses |
| 05 | `05_coupons.ts` | One coupon of each type (percent, fixed, free delivery, free item) |
| 06 | `06_orders.ts` | 9 orders spanning every KDS column + completed + cancelled, with items, financials, modifiers, and event timelines |
| 07 | `07_reviews.ts` | 5 reviews across sources, some with owner replies |

Everything is keyed by `restaurant_id`. Nothing is hardcoded as a platform
default — Demo Deli is just tenant data identified by its slug.

## Coverage

- **KDS** — live orders in `accepted` (Waiting), `preparing`, and `ready`, including a VIP order and a delivery order, each with a prep-timer timestamp.
- **Customer tracking** — active orders carry an `order_events` timeline so the tracker advances through stages.
- **Coupons** — `WELCOME10`, `SAVE5`, `FREESHIP`, `FREEFRIES`; two are already applied on seeded orders.
- **Loyalty** — completed orders award ledger points; balances are reconciled to the ledger at the end.
- All order financials satisfy the schema's reconciliation CHECK (`total = subtotal − discount + tax + delivery + tip`).

## Running

Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment
(printed by `supabase start`).

```bash
npm run db:seed
```

### A second tenant

The seed is multi-tenant friendly. To create a second isolated tenant, set a
different slug:

```bash
SEED_SLUG=second-deli npm run db:seed
```

## Demo sign-in

Staff accounts share the password set in `02_staff.ts`:

- `owner@demodeli.example` — full access (dashboard + KDS)
- `manager@demodeli.example` — operations + revenue
- `kitchen@demodeli.example` — KDS only (no financial data)
- `cashier@demodeli.example`, `delivery@demodeli.example`

Storefront: `/demo-deli`

## Idempotency

Each step clears its own data for the tenant before reinserting, so re-running
produces the same clean dataset rather than duplicates. The restaurant row is
reused by slug.
