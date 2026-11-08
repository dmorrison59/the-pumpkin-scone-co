import Stripe from "stripe";
import { NextResponse } from "next/server";
import { confirmPaidPickup, releasePickup, windowsConfigured } from "../../../lib/pickup-windows-store";

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

function emailRow(label: string, value: string): string {
  return `<div style="padding:10px 0;border-bottom:1px solid #eadbcc"><span style="font-size:12px;color:#755a4a">${escapeHtml(label)}</span><br><strong style="font-size:15px;color:#36261f">${escapeHtml(value)}</strong></div>`;
}

function emailLayout(heading: string, greeting: string, details: string, footer: string): string {
  return `<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:#fcf4e9;font-family:Arial,Helvetica,sans-serif;color:#36261f">
    <div style="max-width:560px;margin:auto;background:#fff;border:1px solid #ebdbca;border-radius:16px;overflow:hidden">
      <div style="background:#3e2b23;padding:28px 30px;color:#fff9f0">
        <div style="letter-spacing:2px;text-transform:uppercase;font-size:11px;color:#efbc92">Small-batch · Seasonal · Preorder only</div>
        <div style="font-family:Georgia,serif;font-size:29px;margin-top:10px">The Pumpkin Scone Co.</div>
      </div>
      <div style="padding:28px 30px">
        <h1 style="font-family:Georgia,serif;color:#bf5b2c;font-weight:normal;font-size:27px;margin:0 0 16px">${escapeHtml(heading)}</h1>
        <p style="line-height:1.6;margin:0 0 20px">${escapeHtml(greeting)}</p>
        <div style="padding:12px 18px;border:1px solid #ebdbca;border-radius:12px;background:#fffbf6">${details}</div>
        <p style="font-size:13px;line-height:1.6;color:#755a4a;margin-top:22px">${escapeHtml(footer)}</p>
      </div>
    </div>
  </body></html>`;
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

  // Subscribe to checkout.session.expired in Stripe before enabling scheduling.
  if (event.type === "checkout.session.expired") {
    const expired = event.data.object as Stripe.Checkout.Session;
    if (expired.metadata?.pickup_reservation_token) {
      // Return retryable failure if Neon is down; never acknowledge a lost release.
      if (!windowsConfigured()) return NextResponse.json({ error: "Pickup database unavailable" }, { status: 503 });
      try {
        const released = await releasePickup({ sessionId: expired.id });
        if (!released) return NextResponse.json({ error: "No associated pickup reservation found" }, { status: 500 });
      } catch { return NextResponse.json({ error: "Could not release expired reservation" }, { status: 500 }); }
    }
    return NextResponse.json({ received: true });
  }
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  // A completed Checkout session does not always mean payment cleared (async payment methods).
  if (session.mode !== "payment" || session.payment_status !== "paid") {
    return NextResponse.json({ received: true });
  }

  if (session.metadata?.pickup_reservation_token) {
    if (!windowsConfigured()) return NextResponse.json({ error: "Pickup database unavailable" }, { status: 503 });
    try {
      const confirmed = await confirmPaidPickup(session.id);
      if (!confirmed) return NextResponse.json({ error: "Pickup reservation could not be confirmed" }, { status: 500 });
    } catch {
      return NextResponse.json({ error: "Pickup reservation persistence failure" }, { status: 500 });
    }
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

  const details = [
    emailRow("Order", `${quantity} × ${packSize}-pack pumpkin scones`),
    emailRow("Total paid", amount),
    emailRow("Pickup date", pickupDate),
    emailRow("Pickup window", pickupWindow),
    ...(metadata.pickup_location ? [emailRow("Pickup location", metadata.pickup_location)] : []),
    ...(metadata.pickup_address ? [emailRow("Pickup address", metadata.pickup_address)] : []),
    emailRow("Stripe order reference", session.id),
  ].join("");
  const customerHtml = emailLayout(
    "You’re on the bake list!",
    `Hi ${customerName}, thanks for ordering. Your payment has been confirmed.`,
    details,
    metadata.pickup_address
      ? "Please arrive at the listed pickup location during your scheduled window. Keep this email for your records."
      : "We’ll contact you with final pickup instructions. Keep this email for your records."
  );
  const ownerHtml = emailLayout(
    "A new order is in!",
    "A customer has completed a paid order. Here’s what to prepare:",
    [emailRow("Customer", customerName), emailRow("Email", customerEmail), emailRow("Phone", phone), details].join(""),
    "Order details are also available in your Stripe dashboard."
  );

  try {
    // Separate keys make Stripe webhook retries safe against duplicate email sends.
    // Resend idempotency is time-limited; for durable deduplication, add a persistent
    // order/event table before accepting production orders at scale.
    await Promise.all([
      sendEmail({
        to: customerEmail,
        subject: "Your Pumpkin Scone Co. order is confirmed",
        html: customerHtml,
        idempotencyKey: `pumpkin-customer-${session.id}`,
      }),
      sendEmail({
        to: OWNER,
        subject: "🎃 New paid Pumpkin Scone Co. order",
        html: ownerHtml,
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
