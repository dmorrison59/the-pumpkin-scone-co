import Stripe from "stripe";
import { NextResponse } from "next/server";
import { confirmPaidPickup, listPendingPickupSessions, releasePickup, windowsConfigured } from "../../../lib/pickup-windows-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Protected by existing Basic Auth proxy for /api/admin/*.
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  if (!windowsConfigured() || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe or pickup database unavailable" }, { status: 503 });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sessions = await listPendingPickupSessions(50).catch(() => null);
  if (!sessions) return NextResponse.json({ error: "Cannot load reservations" }, { status: 503 });

  const result = { inspected: 0, confirmed: 0, released: 0, deferred: 0, errors: 0 };
  for (const record of sessions) {
    result.inspected++;
    try {
      const session = await stripe.checkout.sessions.retrieve(record.checkout_session_id);
      if (session.payment_status === "paid") {
        const confirmed = await confirmPaidPickup(session.id);
        if (confirmed) result.confirmed++;
        else result.errors++;
        continue;
      }
      if (session.status === "expired") {
        if (await releasePickup({ sessionId: session.id })) result.released++;
        else result.errors++;
        continue;
      }
      if (session.status === "open") {
        // The database hold has passed its expiry; expire Stripe first,
        // then release only after Stripe confirms expiration.
        const expired = await stripe.checkout.sessions.expire(session.id);
        if (expired.status === "expired" && (await releasePickup({ sessionId: session.id }))) {
          result.released++;
        } else result.deferred++;
        continue;
      }
      // Closed but unpaid/async sessions need manual investigation.
      result.deferred++;
    } catch {
      // Fail closed: unknown Stripe state never results in released capacity.
      result.errors++;
    }
  }
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
