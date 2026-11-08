# Multi-location pickup windows — staged foundation

This branch adds a private /admin/pickup-windows schedule editor and read-only /api/pickup-windows public availability endpoint.

**Not ready to merge or launch**: The current checkout still uses the original Saturday pickup rule. No customer should be offered a selectable pickup window until checkout, Stripe metadata, confirmation emails, and atomic reservation lifecycle are integrated and tested.

## Required setup
1. Provision a dedicated Supabase project for The Pumpkin Scone Co.
2. Apply supabase/pickup_windows.sql.
3. Add PICKUP_SUPABASE_URL and PICKUP_SUPABASE_SERVICE_ROLE_KEY to Vercel server environments only. Do not put the service-role key in NEXT_PUBLIC_ variables, logs or chat.
4. Verify Basic Auth protection covers /admin/:path* and /api/admin/:path*.
5. Review the admin editor and test DB constraints before enabling customer-facing selection.

## Intended business rules
- Owner publishes named locations, specific dates, shared start/end windows and order cutoffs.
- Many customers can choose the same window. No individual appointment slots.
- Customer checkout must persist a snapshot of location/date/window on the Stripe order.
- Reservations must use an atomic DB transaction, enforce capacity with concurrent checkouts, expire abandoned checkout holds, and reconcile paid/completed/expired sessions.
- Closing a window blocks new reservations but never changes already confirmed orders.
- Cancel/refund and late webhook arrival must reconcile without overselling or duplicate reservations.
- If schedule storage is unavailable, checkout must fail closed rather than revert to an unapproved default Saturday.
- Confirm all times are interpreted as America/New_York, including daylight-saving transitions.

## Launch gate
Do not merge until all checkout integration, transactional reservation functions, lifecycle tests, email pickup details, and private admin authorization are verified. Current site remains unchanged.
