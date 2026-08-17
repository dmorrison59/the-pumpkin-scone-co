import Link from "next/link";
import Stripe from "stripe";
import { formatPickupDate } from "../lib/pickup";

export const dynamic = "force-dynamic";

function money(cents: number | null) {
  if (cents == null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const secretKey = process.env.STRIPE_SECRET_KEY;

  let session: Stripe.Checkout.Session | null = null;

  if (session_id && secretKey) {
    try {
      const stripe = new Stripe(secretKey);
      session = await stripe.checkout.sessions.retrieve(session_id);
    } catch {
      session = null;
    }
  }

  const totalScones = session?.metadata?.total_scones;
  const packSize = session?.metadata?.pack_size;
  const boxQuantity = session?.metadata?.box_quantity;
  const pickupDate = session?.metadata?.pickup_date;
  const pickupWindow = session?.metadata?.pickup_window || "9:00 AM–1:00 PM";

  return (
    <main className="successPage">
      <div className="successCard">
        <p className="sectionKicker">Order received</p>
        <h1>You&apos;re on the bake list.</h1>

        {session?.payment_status === "paid" ? (
          <>
            <p>
              Payment received. We&apos;ve reserved your pumpkin scones for the
              scheduled pickup window.
            </p>

            <div className="successOrder">
              <div>
                <span>Order</span>
                <strong>{boxQuantity} × {packSize}-pack</strong>
              </div>
              <div>
                <span>Total scones</span>
                <strong>{totalScones}</strong>
              </div>
              <div>
                <span>Paid</span>
                <strong>{money(session.amount_total)}</strong>
              </div>
              <div>
                <span>Pickup</span>
                <strong>
                  {pickupDate ? formatPickupDate(pickupDate) : "Saturday"}
                  <br />
                  {pickupWindow}
                </strong>
              </div>
            </div>

            <p className="successNote">
              Keep your Stripe receipt for your records. Final pickup location
              details will be provided before pickup.
            </p>
          </>
        ) : (
          <p>
            Your Stripe checkout was completed. Keep your Stripe receipt for your
            records.
          </p>
        )}

        {session_id && (
          <small>Confirmation reference: {session_id.slice(0, 24)}…</small>
        )}

        <Link className="primaryButton" href="/">
          Back to The Pumpkin Scone Co.
        </Link>
      </div>
    </main>
  );
}
