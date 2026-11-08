# Pumpkin Scone Co. — Neon pickup scheduling (DRAFT — NOT FOR PRODUCTION)

## Status
- This branch is a draft. The existing live website remains on its original Saturday schedule.
- Uses the **Neon PostgreSQL** integration for Vercel, not Supabase.
- Neon schema applied to Preview branch `br-lingering-haze-bbwqxlud` only. Production branch `br-billowing-snow-bbycujtf` unchanged.
- Preview SQL smoke tests PASSED: reserve 1 of 1, reject extra reservation, attach session, confirm paid, duplicate confirm idempotency, release and duplicate release idempotency. Tests used rollback; Preview tables remain empty.
- Concurrent multi-connection race tests and end-to-end Stripe checkout tests have NOT run.
- Keep `PICKUP_SCHEDULING_ENABLED` unset in Production and Preview until the launch checklist passes.

## Database setup
1. Confirm the Neon Preview deployment connects to a separate Neon preview branch (do not infer this from the Vercel env variable labels alone).
2. **Completed in Preview only:** Applied `neon/001_pickup_schedule.sql`. The schema created `pickup_windows`, `pickup_reservations`, and atomic reservation functions.
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
- Schema installed and basic SQL smoke-tested on **separate Neon Preview** database. Full migration recovery and concurrency tests remain.
- Confirm concurrent last-slot checkouts cannot overbook.
- Confirm completed, duplicate, expired, delayed, and interrupted Stripe webhook handling.
- Implement/verify recovery or reconciliation for missed `checkout.session.expired` webhooks so abandoned holds cannot block capacity indefinitely.
- Handle cancellation/refund semantics, and prevent editing a confirmed window in a way that makes already-booked customer pickup impossible.
- Test DST transitions, cutoff boundaries, and no-availability behavior.
- Verify all email recipients receive the selected pickup location/address/date/time and admin reporting groups orders properly.
- Investigate production readiness/security controls (Basic Auth, rate limiting, idempotency, and admin action audit).
- Do not merge or enable for live payments before acceptance tests pass.

## Verification completed (Preview, November 2026)
- Neon project `pumpkin-scone-db` (`steep-violet-91746984`), Preview branch `br-lingering-haze-bbwqxlud`; production default `main` was not modified.
- **Two concurrent SQL reservation requests for a capacity-1 Preview window**: exactly one succeeded, the other returned `This pickup window is full`. Database counters showed one reserved / zero confirmed.
- Reserved test window released successfully and was **closed**; do not confuse it with a real customer pickup.
- Transaction-rollback test confirmed a booked window cannot be edited under the app's protected-update predicate.
- Eastern winter 8 PM cutoff resolved to 01:00 UTC; summer 8 PM resolved to 00:00 UTC.
- Vercel Preview builds for checkout guard, reconciliation route, admin control, and timezone correction: READY.
- Production Vercel deployment stayed on main at its previous commit.

## Live acceptance blockers (do not merge or enable)
1. Complete a real **Stripe sandbox** checkout in Preview, confirm metadata and both email notifications, then prove capacity accounting in Neon. Sandbox Stripe account connection/testing required.
2. Verify Stripe webhook endpoint receives `checkout.session.expired`; test missed, duplicate and delayed events. Trigger admin `/api/admin/pickup-reconcile` safely.
3. Verify admin browser POST actually saves and rereads a Preview pickup window and that the customer-facing picker renders available windows. SQL- and build-level checks alone are not browser acceptance.
4. Add automated scheduled reconciliation or an operator procedure to run the admin recovery button regularly; otherwise missed webhooks may leave stale holds until manually reconciled.
5. Evaluate async payments, refunds and customer communication before accepting live orders.
6. Strengthen private admin authentication and add security/rate limiting before releasing customer order data in production.
