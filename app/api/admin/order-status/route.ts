import Stripe from "stripe";
import { NextResponse } from "next/server";

const ALLOWED_STATUSES = new Set(["paid", "ready", "picked_up"]);

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return NextResponse.json(
      { error: "Stripe is not configured." },
      { status: 503 }
    );
  }

  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");

  if (origin && origin !== requestUrl.origin) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const sessionId = String(formData.get("session_id") || "");
  const status = String(formData.get("status") || "");

  if (!sessionId.startsWith("cs_") || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "Invalid order status update." },
      { status: 400 }
    );
  }

  const stripe = new Stripe(secretKey);

  try {
    const existing = await stripe.checkout.sessions.retrieve(sessionId);

    if (
      existing.payment_status !== "paid" ||
      (existing.metadata?.pack_size !== "4" &&
        existing.metadata?.pack_size !== "8")
    ) {
      return NextResponse.json(
        { error: "This is not a paid scone order." },
        { status: 400 }
      );
    }

    await stripe.checkout.sessions.update(sessionId, {
      metadata: {
        ...existing.metadata,
        fulfillment_status: status,
        fulfillment_updated_at: new Date().toISOString(),
      },
    });

    return NextResponse.redirect(
      new URL("/admin", request.url),
      303
    );
  } catch (error) {
    console.error("Unable to update order status", error);

    return NextResponse.json(
      { error: "Unable to update this order." },
      { status: 500 }
    );
  }
}
