import Link from "next/link";

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;

  return (
    <main className="successPage">
      <div className="successCard">
        <p className="sectionKicker">Order received</p>
        <h1>You&apos;re on the bake list.</h1>
        <p>
          Your Stripe checkout was completed. Keep your Stripe receipt for your records. We&apos;ll use the final
          launch setup to include exact pickup instructions and contact details here.
        </p>
        {session_id && <small>Confirmation reference: {session_id.slice(0, 24)}…</small>}
        <Link className="primaryButton" href="/">Back to The Pumpkin Scone Co.</Link>
      </div>
    </main>
  );
}
