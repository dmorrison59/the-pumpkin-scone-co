import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getPickupPlan } from "../../lib/pickup";
import { attachPickupCheckout, releasePickup, reservePickupWindow, windowsConfigured, type PickupReservation } from "../../lib/pickup-windows-store";

type Pack = "4" | "8";

type CheckoutBody = {
  pack?: Pack;
  quantity?: number;
  name?: string;
  email?: string;
  phone?: string;
  pickup_window_id?: string;
};

const PACKS = {
  "4": { name: "4-Pack Pumpkin Scones", unitAmount: 1900, envPrice: "STRIPE_PRICE_4_PACK" },
  "8": { name: "8-Pack Pumpkin Scones", unitAmount: 3600, envPrice: "STRIPE_PRICE_8_PACK" },
} as const;

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || secretKey.includes("replace_me")) {
    return NextResponse.json(
      { error: "Stripe is not connected yet." },
      { status: 503 }
    );
  }

  let body: CheckoutBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid order request." }, { status: 400 });
  }

  const pack = body.pack;
  const quantity = Number(body.quantity);
  const name = body.name?.trim();
  const email = body.email?.trim();
  const phone = body.phone?.trim();

  if (!pack || !(pack in PACKS) || !Number.isInteger(quantity) || quantity < 1 || quantity > 6) {
    return NextResponse.json({ error: "Please choose a valid box and quantity." }, { status: 400 });
  }

  if (!name || !email || !phone) {
    return NextResponse.json({ error: "Name, email, and phone are required." }, { status: 400 });
  }

  const stripe = new Stripe(secretKey);
  const product = PACKS[pack];
  const configuredPriceId = process.env[product.envPrice];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const pickupSchedulingEnabled = process.env.PICKUP_SCHEDULING_ENABLED === "true";
  if (pickupSchedulingEnabled && !windowsConfigured()) {
    return NextResponse.json({ error: "Pickup scheduling is temporarily unavailable." }, { status: 503 });
  }
  const pickupPlan = getPickupPlan();
  let reservation: PickupReservation | null = null;
  if (pickupSchedulingEnabled) {
    if (!body.pickup_window_id) {
      return NextResponse.json({ error: "Please choose an available pickup location and window." }, { status: 400 });
    }
    try { reservation = await reservePickupWindow(body.pickup_window_id); }
    catch { return NextResponse.json({ error: "That pickup window is no longer available. Please choose another." }, { status: 409 }); }
  }

  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = configuredPriceId
    ? { price: configuredPriceId, quantity }
    : {
        price_data: {
          currency: "usd",
          unit_amount: product.unitAmount,
          product_data: {
            name: product.name,
            description:
              "Fresh seasonal pumpkin scones with vanilla glaze and pumpkin-spice drizzle.",
          },
        },
        quantity,
      };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [lineItem],
      customer_email: email,
      phone_number_collection: { enabled: true },
      billing_address_collection: "auto",
      metadata: {
        customer_name: name,
        customer_phone: phone,
        pack_size: pack,
        box_quantity: String(quantity),
        total_scones: String(Number(pack) * quantity),
        pickup_date: reservation?.pickup_date ?? pickupPlan.pickupDate,
        pickup_window: reservation?.pickup_window ?? pickupPlan.pickupWindow,
        ...(reservation ? {
          pickup_location: reservation.pickup_label,
          pickup_address: reservation.pickup_address,
          pickup_window_id: body.pickup_window_id!,
          pickup_reservation_token: reservation.reservation_token,
        } : {}),
        fulfillment_status: "paid",
      },
      success_url: `${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/#order`,
      ...(reservation ? { expires_at: Math.floor(Date.now() / 1000) + 30 * 60 } : {}),
      allow_promotion_codes: false,
    });

    if (!session.url) {
      if (reservation) await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
      throw new Error("Stripe did not return a checkout URL");
    }
    if (reservation && !(await attachPickupCheckout(reservation.reservation_token, session.id))) {
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
      throw new Error("Pickup reservation could not be attached to checkout");
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (reservation) await releasePickup({ token: reservation.reservation_token }).catch(() => undefined);
    console.error("Stripe checkout error", error);
    return NextResponse.json(
      { error: "Unable to start Stripe checkout. Check your Stripe key and try again." },
      { status: 500 }
    );
  }
}
