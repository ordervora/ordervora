# Easy Tobacco Shop — Phase 1 Production Audit

**Scope:** `Smokey.html` (storefront), `admin_smokey.html` (admin dashboard), `supabase-schema_smokey.sql` (database schema).
**Mandate:** Audit only. No code in the audited files was modified to produce this report.
**Method:** Full line-by-line read of all three files (CSS, HTML, JS, SQL) plus targeted cross-checks (duplicate IDs, accessibility attributes, FK integrity, RLS policies, dead code paths).

---

## Critical Issues

1. **Any authenticated user is a full admin.** `admin_smokey.html` (`doLogin()` / `enterApp()`) performs zero role/claim check after `sb.auth.signInWithPassword()` succeeds — it grants full dashboard access to *any* account that can authenticate. This is compounded by the database: every business table in `supabase-schema_smokey.sql` has a policy of the form `FOR ALL USING (auth.role() = 'authenticated')` (brands, categories, products, flavors, product_media, inventory, customers, addresses, coupons, orders, order_items, reviews, wishlists, settings, admin_log). There is no `is_admin` claim, no role column, no `auth.users.raw_app_meta_data` check anywhere in either the client or the SQL. **A customer account and an admin account are functionally identical** — anyone who can sign up gets full CRUD over every product, order, customer record, and coupon in the business.
2. **The storefront never talks to the database.** `Smokey.html` contains zero references to `supabase`/`createClient` (confirmed via full-file search). `placeOrder()` just shows a toast and empties the in-memory `cart` array — no row is ever written to `orders`/`order_items`. This means: the admin-managed catalog (products/brands/categories/inventory) never reaches the live site, and **no order placed by a real customer is ever recorded** anywhere. The entire Orders/Customers/Analytics surface of the admin dashboard is structurally incapable of reflecting real storefront activity as currently wired.
3. **Stored XSS via unescaped `innerHTML`.** Both files interpolate raw strings into `innerHTML` without escaping: storefront search results (`handleSearch`, no-results branch renders the raw query string), and the admin dashboard renders product names, brand/category names, customer names/emails, and order data directly into table cells via template literals (`renderProducts`, `renderCustomers`, `renderOrders`, `renderBrands`, `renderCategories`, `renderDashboard`). Combined with Critical #1 (anyone can become an authenticated "admin" and insert/update rows), this is a path to script execution inside a privileged admin session, not just a cosmetic bug.
4. **Admin dashboard ships non-functional by default.** `admin_smokey.html` hardcodes `SUPABASE_URL = "YOUR_SUPABASE_URL"` and `SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY"` as literal placeholder strings in the page source. There is no env-var injection or build step — every deployment requires manually editing the HTML file in place. If this ships unedited (easy to do by accident), the entire admin dashboard is dead on arrival (the code does detect this and shows a warning, but the operational risk of a manual, unautomatable config step remains).
5. **Age gate provides no real verification.** `verifyAge()` in `Smokey.html` simply does `localStorage.setItem('ets_age_verified','1')` on a button click — there is no date-of-birth capture, no ID check, nothing server-side. For a tobacco/nicotine product storefront this is a compliance-relevant control that currently verifies nothing and is trivially bypassed (clear the click, or set the key directly).

---

## High Priority

6. **Four+ unsynchronized sources of truth for catalog data.** `Smokey.html` hardcodes the same products independently in the main catalog grid, the deals section, the homepage carousel, and the `searchData` JS array used by search — and they have already drifted from each other and from the SQL seed data (e.g., the Crown Bar 60K flavor list differs between the catalog markup and the seed `INSERT`). Whichever one an admin "fixes" first, the other three (and the database) stay wrong.
7. **`customers.auth_user_id` has no foreign key.** It's declared as a bare `UUID UNIQUE` column in `supabase-schema_smokey.sql`, not `REFERENCES auth.users(id)`. Nothing enforces that a customer row's `auth_user_id` actually points to a real Supabase Auth user — orphaned or mismatched links are possible with no DB-level guard.
8. **Uploaded images are never cleaned up.** `deleteProduct()` only deletes the `products` row (relying on `ON DELETE CASCADE` for `flavors`/`inventory`/`product_media`); it never calls `sb.storage.from(STORAGE_BUCKET).remove(...)`. Likewise `handleImageUpload()` uploads to Storage **immediately on file selection**, before the product is saved — if the modal is cancelled, those files are never deleted. Storage usage (and cost) only grows.
9. **No error handling anywhere.** Zero `try/catch` blocks exist across either file's ~1,850 combined lines of JS. Several Supabase calls inside `saveProduct()` don't even check `{ error }` (the `flavors` delete/insert and `product_media` delete/insert calls) — a failure partway through silently leaves a product with stale or missing flavors/images and the UI reports success regardless.
10. **Storage bucket and its RLS policies are not actually provisioned.** The `product-images` bucket creation and its storage policies exist in `supabase-schema_smokey.sql` only as **commented-out** SQL. On a fresh database, `handleImageUpload()` will fail outright because the bucket referenced by `STORAGE_BUCKET` doesn't exist.
11. **Dead/buggy cart-open state.** `let cartOpen = false;` in `Smokey.html` is never reassigned `true` anywhere in the file, so the `Escape`-key-closes-cart keydown handler is permanent dead code. Cart visibility is driven purely by a CSS class elsewhere, indicating the JS state variable and the actual UI state have already diverged.
12. **Two entire schema-backed features are unreachable from both apps.** The `reviews` table (with `is_approved`/`is_featured` moderation flags) and the `wishlists` table have **no UI anywhere** — the storefront's "reviews" are four hardcoded marketing quotes baked into the HTML (`review-chip` divs), not data from the `reviews` table, and there is no submission form. The admin dashboard's sidebar has 10 views (dashboard/products/inventory/brands/categories/orders/customers/coupons/analytics/settings) — **no "Reviews" view exists at all**, so even an admin has no way to moderate the table the schema was clearly built to support.

---

## Medium Priority

13. **Duplicate/dead CSS rule blocks in `Smokey.html`**: `.carousel-wrap` / `.carousel-track` / `.mini-brand-card` family defined twice (~lines 539–563 and again ~994–1026), and `.brand-card { transition }` defined twice (~line 410 area and again ~1052–1055). Later blocks silently win the cascade; the earlier ones are dead weight.
14. **Accessibility is almost entirely absent in the storefront.** Across the whole file there is exactly **one** `aria-*`/`role` attribute and **zero** `tabindex` attributes, despite **115** `onclick` handlers — many attached to non-interactive `<div>`/`<span>` elements (e.g. mobile nav items, filter buttons). Keyboard-only and screen-reader users cannot operate large parts of the site.
15. **`admin_log` table is entirely unused.** It's defined in the schema as an audit trail for admin actions but is never written to by any function in `admin_smokey.html`. No admin action (product edit/delete, order status change, coupon edit, etc.) is actually logged anywhere.
16. **No pagination anywhere in the admin dashboard.** Every `loadTable()` call does `select('*')` with no `.range()`/`.limit()`. Fine at current catalog size; will degrade linearly as products/orders/customers grow, since the entire dataset is downloaded and filtered client-side on every page load and on every keystroke in a search box.
17. **No coupon value bound.** `coupons.value NUMERIC(10,2)` has no `CHECK` constraint limiting a `percent`-type coupon to the 0–100 range, and `saveCoupon()` in the admin JS performs no client-side bound check either — an admin (or anyone with the "authenticated" RLS hole from Critical #1) can save a coupon with `type='percent', value=500`.
18. **Inventory management is incomplete.** The Inventory view only lets an admin edit `quantity` (via `saveStock()`); there's no UI to edit `low_stock_alert` or toggle `track_inventory` per product — those fields are display-only, requiring direct DB edits to change.
19. **Inconsistent escaping.** `renderSettings()` escapes only the `"` character before placing a value into an HTML attribute (`.replace(/"/g,'&quot;')`), while every other dynamic-data render path in the same file (`renderProducts`, `renderCustomers`, `renderOrders`, `renderBrands`, `renderCategories`) does no escaping at all — there's no consistent policy, just accidental partial coverage in one place.

---

## Low Priority

20. **Pervasive inline `onclick="..."` handlers** (115+ in the storefront alone) instead of `addEventListener`-based wiring — harder to test, and blocks ever adopting a strict Content-Security-Policy (which would have to allow inline script execution).
21. **Toast/notification helpers reimplemented independently** in each file (`showToast()` in `Smokey.html`, `toast()` in `admin_smokey.html`) rather than as shared, reusable code — minor duplication, no shared component layer between the two surfaces at all.
22. **IntersectionObserver-driven "reveal on scroll" content** in `Smokey.html` is `opacity:0` until JS runs and the observer fires — if a script error upstream throws before the observer is registered, that content stays permanently invisible with no `<noscript>`/fallback styling.
23. **Fabricated, randomized "X sold today" / "Y left in stock" indicators** are generated client-side and bear no relation to the real `inventory` table — a manipulative-by-design UI pattern that is also disconnected from actual stock data (see Critical #2 for why it can't be connected today anyway).

---

## Architecture Problems

- **Two fully disconnected static surfaces.** The storefront (`Smokey.html`) and the admin dashboard (`admin_smokey.html`) share no code, no data layer, and — critically — the storefront shares no *connection* to Supabase at all. The schema implies one unified product/order pipeline; in practice there are two independent islands, only one of which (admin) talks to the database.
- **No backend/server tier.** All "business logic" (slug generation, price math, validation) runs in the browser using the public anon key. That can be a valid pattern under Supabase *if* RLS correctly scopes what the anon/authenticated roles can do — but RLS here is misconfigured (see Security Problems), so the architecture currently has no real authorization boundary at all.
- **Configuration is baked into source, not environment.** Supabase URL/key are literal constants in the HTML; there's no `.env`, no build step, no per-environment config story.
- **The data model is far ahead of the implementation.** The schema supports full checkout (`orders`, `order_items`, `payment_status`), customer accounts (`customers.auth_user_id`), wishlists, and moderated reviews — none of which exist as real, wired features in the storefront today. `admin_log` exists architecturally but nothing writes to it.

## Security Problems

- RLS policy pattern `FOR ALL USING (auth.role() = 'authenticated')` applied uniformly to all 15 business tables — the single biggest production blocker (Critical #1).
- No client-side admin-role gate in `admin_smokey.html` to backstop the RLS gap — the two layers that should each independently restrict access are both absent.
- Unescaped `innerHTML` interpolation throughout both files — stored/DOM XSS surface (Critical #3).
- Self-attested, client-only age gate with no real verification for a regulated product category (Critical #5).
- No input validation/bounds on numeric fields users can submit through the admin (coupon percent, price, stock) beyond `isNaN` checks — relies entirely on well-behaved input.
- No rate limiting, no audit logging of admin actions (`admin_log` unused) — if Critical #1 is exploited, there is currently no trail to detect or investigate it.

## Performance Problems

- Every admin session fetches **every row of every table** on login (`loadAll()` → unpaginated `select('*')` × 9 tables) — no caching, no incremental loading.
- `renderTopProducts()` re-fetches the *entire* `order_items` table from scratch every time the Analytics view is opened, with no memoization.
- Duplicate CSS blocks (Medium #13) bloat the stylesheet for the storefront with no rendering benefit.
- Client-side search/filtering scans full in-memory arrays on every keystroke (acceptable at current catalog size; will not scale past a few hundred rows without becoming sluggish).
- Randomized "stock"/"sold" UI elements appear to be regenerated on each relevant render with no caching of the fake values, burning cycles on cosmetic-only state.

## Database Problems

- Missing FK: `customers.auth_user_id` → `auth.users(id)` (High #7).
- Storage bucket + storage RLS policies are commented-out SQL, never executed (High #10).
- `admin_log` table defined but write-path never implemented (Medium #15).
- No `CHECK` constraint bounding `coupons.value` for `type='percent'` (Medium #17).
- `orders.payment_method`/`payment_status` are free-text/status columns with no link to any actual payment-gateway record (no `payment_intent_id` or equivalent) — there is no way to reconcile an order against a real charge even once checkout is wired up.
- Schema otherwise reasonably normalized: 15 tables, consistent `UUID` PKs, appropriate `ON DELETE CASCADE`/`SET NULL` choices, 14 indexes, `updated_at` triggers, and a sequence-backed `order_number` generator — the structural bones are solid; the gaps are specifically around auth linkage, storage provisioning, and the admin-access policy model.

## Frontend Problems

- Duplicate CSS selector blocks (Medium #13).
- Near-zero accessibility semantics: 1 `aria-*`/`role` attribute, 0 `tabindex`, 115 `onclick` handlers, many on non-semantic elements (Medium #14).
- DOM XSS via unescaped search-result rendering in `handleSearch` (Critical #3).
- Dead `cartOpen` state variable (High #11).
- Four-way duplicated, drifted catalog data (High #6).
- 115+ inline `onclick` handlers vs. delegated listeners (Low #20).

## Admin Problems

- **Login:** no admin/staff role check — any authenticated user enters (Critical #1); hardcoded placeholder Supabase credentials mean the dashboard is non-functional until manually configured per deployment (Critical #4).
- **Product CRUD:** flavor and gallery-image persistence uses unguarded delete-then-reinsert with no transaction and several un-checked `{error}` results (High #9); images upload to Storage before the product is saved, orphaning files on a cancelled Add-Product flow (High #8).
- **Inventory:** only `quantity` is editable from the UI; `low_stock_alert` and `track_inventory` are display-only (Medium #18).
- **Coupons:** no bound on `percent`-type values, client or DB side (Medium #17).
- **Customers:** read-only list view — no detail drill-in, no way to view a customer's order history beyond a count, no link surfaced to `addresses`.
- **Analytics:** "Top Products" re-queries the full `order_items` table on every view (Performance, above); the 7-day revenue chart has no way to change the window.
- **Settings:** persisted via `upsert`, but the value-escaping for the rendered `<input>` is inconsistent with the rest of the file (Medium #19).
- **Reviews:** no admin view exists at all for the `reviews` table — moderation (`is_approved`/`is_featured`) is schema-only (High #12).
- **Audit trail:** `admin_log` table is never written to — no record of who changed what (Medium #15).

## Store Problems

- **Homepage / Catalog / Carousel / Deals:** four independently hardcoded, already-drifted copies of product data; none read from the database (High #6, Critical #2).
- **Search:** operates against a fifth hardcoded data source (`searchData`) and renders the no-results message via unescaped `innerHTML` (Critical #3).
- **Filters:** category filter buttons (`filterProducts()`) work correctly against the in-memory catalog, but — like everything else on the storefront — only ever filter hardcoded HTML, never live data.
- **Cart:** plain in-memory array, no persistence (the file does use `localStorage` elsewhere for the age gate, so this isn't a capability gap, just an unimplemented one) — a page refresh silently empties the cart; `cartOpen` state is dead (High #11).
- **Checkout:** `placeOrder()` never writes to the database — no order, no order items, no payment — it is a non-functional placeholder behind a real-looking checkout UI (Critical #2).
- **Customer login/account:** does not exist anywhere in the storefront, despite the schema's `customers.auth_user_id` clearly being designed for it.
- **Wishlist:** does not exist anywhere in the storefront, despite the `wishlists` table existing in the schema.
- **Reviews:** displayed reviews are four static, hardcoded testimonials with no connection to the `reviews` table; there is no review submission form anywhere on the site.

---

## Code Quality Score: 4/10
Reasonably organized, readable code with consistent naming and clear section comments in both files — but zero error handling anywhere, several un-checked async failure paths, four-to-five duplicated/drifted sources of the same catalog data, and dead state (`cartOpen`) indicate the codebase has accumulated unaddressed inconsistencies rather than active rot. Schema design is the strongest piece of the project.

## Security Score: 2/10
The combination of blanket "any authenticated user = admin" RLS policies with zero client-side role gating is a severe, exploitable privilege-escalation path that affects every business table. Unescaped `innerHTML` interpolation compounds it with a plausible XSS chain. The age gate provides no real compliance control. This is the single largest blocker to production readiness.

## Performance Score: 6/10
No real bottlenecks exist *today* because data volumes are small and there's effectively no live data flow into the storefront — but the admin's unpaginated, full-table-fetch-on-every-load pattern and the duplicate CSS will not hold up as the catalog/order/customer counts grow.

## Maintainability Score: 5/10
Clear, commented code with consistent conventions per file, but no shared component/data layer between storefront and admin, configuration baked into source rather than environment, and catalog data duplicated across (at least) five independent locations that already disagree with each other — every future content change requires manually touching multiple files and hoping nothing was missed.

## Overall Production Readiness Score: 3/10
The database schema is solid and the UI/UX layer is visually complete, but the project is **not production-ready**: the storefront cannot actually take orders (no DB write path exists), the admin dashboard's only access control is broken in a way that hands full business-data control to any signed-up user, and the two halves of the application (storefront and admin) are not actually connected to the same source of truth. These are not polish items — they are the core "does this business actually function" gaps that Phase 2 stabilization must close before this can safely go live.

---

*This report is the complete Phase 1 deliverable. No application code (`Smokey.html`, `admin_smokey.html`, `supabase-schema_smokey.sql`) was modified in producing it, per the Phase 1 mandate. Awaiting approval before any stabilization work begins.*
