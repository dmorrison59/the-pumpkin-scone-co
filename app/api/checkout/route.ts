import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getPickupPlan } from "../../lib/pickup";

type Pack = "4" | "8";

type CheckoutBody = {
  pack?: Pack;
  quantity?: number;
  name?: string;
  email?: string;
  phone?: string;
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
  const pickupPlan = getPickupPlan();

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
        pickup_date: pickupPlan.pickupDate,
        pickup_window: pickupPlan.pickupWindow,
        fulfillment_status: "paid",
      },
      success_url: `${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/#order`,
      allow_promotion_codes: false,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error", error);
    return NextResponse.json(
      { error: "Unable to start Stripe checkout. Check your Stripe key and try again." },
      { status: 500 }
    );
  }
}
