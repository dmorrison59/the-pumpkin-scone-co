# Pumpkin Scone Co. — Neon pickup scheduling (DRAFT — NOT FOR PRODUCTION)

## Status
- This branch is a draft. The existing live website remains on its original Saturday schedule.
- Uses the **Neon PostgreSQL** integration for Vercel, not Supabase.
- No Neon schema has been applied in this workflow and **no real database transaction tests have run**.
- Keep `PICKUP_SCHEDULING_ENABLED` unset in Production and Preview until the launch checklist passes.

## Database setup
1. Confirm the Neon Preview deployment connects to a separate Neon preview branch (do not infer this from the Vercel env variable labels alone).
2. In the **Preview branch only**, apply `neon/001_pickup_schedule.sql` with SQL editor read-only mode off. This schema creates `pickup_windows`, `pickup_reservations`, and locked reservation functions.
3. Set server-side `DATABASE_URL` (or `POSTGRES_URL`) for Preview through the Vercel Neon integration; these variables are already listed in the Vercel project.
4. Build the draft branch and verify `/admin/pickup-windows`, the protected admin POST endpoint, and the published-window GET endpoint.
5. For Preview only, set `PICKUP_SCHEDULING_ENABLED=true` **after** the schema and transactional tests are successful.
6. The Checkout Stripe webhook must subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.expired`.

## Rules
- Only the business owner publishes a location, date, shared pickup start/end window, order cutoff, and max order count.
- Customers choose from those windows; they cannot pick an individual time.
- Each paid order keeps its own snapshot of the published location/address/date/time.
- Server uses atomic SQL function `reserve_pickup_window` to enforce concurrent capacity, `attach_pickup_checkout` to pair Stripe session, `confirm_paid_pickup` when paid, and `release_pickup` on Stripe expiration.
- Public availability is off until the feature flag is enabled; server never trusts customer-submitted address/time values.
- Changing future slots does not rewrite already confirmed Stripe order metadata.

## Outstanding before launch — mandatory
- Test schema migration against **separate Neon Preview** database; inspect table constraints and functions.
- Confirm concurrent last-slot checkouts cannot overbook.
- Confirm completed, duplicate, expired, delayed, and interrupted Stripe webhook handling.
- Implement/verify recovery or reconciliation for missed `checkout.session.expired` webhooks so abandoned holds cannot block capacity indefinitely.
- Handle cancellation/refund semantics, and prevent editing a confirmed window in a way that makes already-booked customer pickup impossible.
- Test DST transitions, cutoff boundaries, and no-availability behavior.
- Verify all email recipients receive the selected pickup location/address/date/time and admin reporting groups orders properly.
- Investigate production readiness/security controls (Basic Auth, rate limiting, idempotency, and admin action audit).
- Do not merge or enable for live payments before acceptance tests pass.
