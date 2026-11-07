import Stripe from "stripe";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const FROM = "The Pumpkin Scone Co. <orders@thepumpkinsconeco.com>";
const OWNER = "dmorrison1004@gmail.com";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

async function sendEmail({
  to, subject, html, idempotencyKey,
}: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Resend email failed (${response.status}): ${responseBody.slice(0, 500)}`);
  }
}

export async function POST(request: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret || !process.env.RESEND_API_KEY) {
    console.error("Stripe webhook/email environment is not fully configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    const payload = await request.text();
    event = new Stripe(stripeKey).webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  // A completed Checkout session does not always mean payment cleared (async payment methods).
  if (session.mode !== "payment" || session.payment_status !== "paid") {
    return NextResponse.json({ received: true });
  }

  const customerEmail = session.customer_details?.email || session.customer_email;
  if (!customerEmail) {
    console.error("Paid Checkout session has no customer email", session.id);
    return NextResponse.json({ error: "Customer email missing" }, { status: 500 });
  }

  const metadata = session.metadata || {};
  const packSize = metadata.pack_size || "Unknown";
  const quantity = metadata.box_quantity || "Unknown";
  const customerName = metadata.customer_name || session.customer_details?.name || "Customer";
  const phone = metadata.customer_phone || session.customer_details?.phone || "Not provided";
  const pickupDate = metadata.pickup_date || "To be confirmed";
  const pickupWindow = metadata.pickup_window || "To be confirmed";
  const amount = session.amount_total == null
    ? "See Stripe dashboard"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: session.currency || "usd" }).format(session.amount_total / 100);

  const details = `
    <h2>Order confirmed</h2>
    <p><strong>Order:</strong> ${escapeHtml(quantity)} × ${escapeHtml(packSize)}-pack pumpkin scones</p>
    <p><strong>Total paid:</strong> ${escapeHtml(amount)}</p>
    <p><strong>Pickup date:</strong> ${escapeHtml(pickupDate)}</p>
    <p><strong>Pickup window:</strong> ${escapeHtml(pickupWindow)}</p>
    <p><strong>Stripe order reference:</strong> ${escapeHtml(session.id)}</p>
  `;

  try {
    // Separate keys make Stripe webhook retries safe against duplicate email sends.
    // Resend idempotency is time-limited; for durable deduplication, add a persistent
    // order/event table before accepting production orders at scale.
    await Promise.all([
      sendEmail({
        to: customerEmail,
        subject: "Your Pumpkin Scone Co. order is confirmed",
        html: `<p>Hi ${escapeHtml(customerName)},</p><p>Thanks for your order!</p>${details}<p>We'll contact you with any final pickup instructions.</p>`,
        idempotencyKey: `pumpkin-customer-${session.id}`,
      }),
      sendEmail({
        to: OWNER,
        subject: "🎃 New paid Pumpkin Scone Co. order",
        html: `<h2>New paid order</h2><p><strong>Customer:</strong> ${escapeHtml(customerName)}</p><p><strong>Email:</strong> ${escapeHtml(customerEmail)}</p><p><strong>Phone:</strong> ${escapeHtml(phone)}</p>${details}`,
        idempotencyKey: `pumpkin-owner-${session.id}`,
      }),
    ]);
  } catch (error) {
    console.error("Failed sending order emails", error);
    // Return 500 so Stripe retries. Resend idempotency keys prevent immediate duplicate sends.
    return NextResponse.json({ error: "Failed sending order notifications" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
