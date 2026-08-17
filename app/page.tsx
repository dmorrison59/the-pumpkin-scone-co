"use client";

import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";

type Pack = "4" | "8";

const products = {
  "4": { label: "4-Pack", price: 19, scones: 4 },
  "8": { label: "8-Pack", price: 36, scones: 8 },
} as const;

export default function Home() {
  const [pack, setPack] = useState<Pack>("8");
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selected = products[pack];
  const total = selected.price * quantity;
  const totalScones = selected.scones * quantity;

  const checkoutText = useMemo(
    () => `Order & Pay $${total.toFixed(2)}`,
    [total]
  );

  async function handleCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack, quantity, name, email, phone }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to start checkout.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start checkout.");
      setLoading(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <Image
          src="/scones/scone-hero.jpeg"
          alt="Fresh pumpkin scones with vanilla glaze and pumpkin spice drizzle"
          fill
          priority
          sizes="100vw"
          className="heroImage"
        />
        <div className="heroShade" />
        <div className="heroContent shell">
          <p className="eyebrow">Small-batch • seasonal • preorder only</p>
          <h1>The Pumpkin Scone Co.</h1>
          <p className="tagline">Pumpkin Scone. Period.</p>
          <p className="heroCopy">
            Soft pumpkin-spice scones finished with a vanilla glaze and a warm pumpkin-spice drizzle.
            Baked fresh for local pickup.
          </p>
          <a className="primaryButton heroButton" href="#order">Order this week</a>
        </div>
      </section>

      <section className="intro shell">
        <div>
          <p className="sectionKicker">One thing, done well</p>
          <h2>Fall in a scone.</h2>
        </div>
        <p>
          No giant menu. No freezer case. Just fresh pumpkin scones made in limited batches during the fall season.
          Choose a 4-pack to try them or an 8-pack to share — if you want to.
        </p>
      </section>

      <section className="gallery shell" aria-label="Pumpkin scone gallery">
        <div className="galleryLarge">
          <Image src="/scones/scone-close.jpeg" alt="Close-up of a glazed pumpkin scone" fill sizes="(max-width: 800px) 100vw, 60vw" />
        </div>
        <div className="gallerySmall top">
          <Image src="/scones/scone-batch.jpeg" alt="Fresh pumpkin scones on a cooling rack" fill sizes="(max-width: 800px) 100vw, 40vw" />
        </div>
        <div className="gallerySmall">
          <Image src="/scones/scone-rack.jpeg" alt="Batch of pumpkin scones cooling after glazing" fill sizes="(max-width: 800px) 100vw, 40vw" />
        </div>
      </section>

      <section id="order" className="orderSection">
        <div className="shell orderGrid">
          <div className="orderInfo">
            <p className="sectionKicker">Preorder</p>
            <h2>Choose your box.</h2>
            <p>
              Order online and pay securely through Stripe. Your scones are baked for the scheduled pickup window,
              so there is no need to wonder whether your box will be there.
            </p>

            <div className="pickupCard">
              <span>Current pickup plan</span>
              <strong>Saturday • 9:00 AM–1:00 PM</strong>
              <small>Orders close Thursday at 8:00 PM. Pickup location details can be added before launch.</small>
            </div>
          </div>

          <form className="orderCard" onSubmit={handleCheckout}>
            <fieldset>
              <legend>Select a box</legend>
              <div className="packChoices">
                {(Object.keys(products) as Pack[]).map((key) => {
                  const product = products[key];
                  return (
                    <label key={key} className={`packChoice ${pack === key ? "selected" : ""}`}>
                      <input
                        type="radio"
                        name="pack"
                        value={key}
                        checked={pack === key}
                        onChange={() => setPack(key)}
                      />
                      <span>
                        <strong>{product.label}</strong>
                        <small>{product.scones} pumpkin scones</small>
                      </span>
                      <b>${product.price}</b>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <label className="fieldLabel">
              Quantity
              <select value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>

            <div className="customerGrid">
              <label className="fieldLabel full">
                Name
                <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </label>
              <label className="fieldLabel">
                Email
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </label>
              <label className="fieldLabel">
                Phone
                <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              </label>
            </div>

            <div className="summaryRow">
              <span>{totalScones} scones</span>
              <strong>${total.toFixed(2)}</strong>
            </div>

            <button className="primaryButton checkoutButton" type="submit" disabled={loading}>
              {loading ? "Opening secure checkout…" : checkoutText}
            </button>
            <p className="secureNote">Secure payment is completed on Stripe&apos;s hosted checkout page.</p>
            {error && <p className="errorMessage">{error}</p>}
          </form>
        </div>
      </section>

      <section className="steps shell">
        <p className="sectionKicker">How it works</p>
        <div className="stepGrid">
          <div><span>01</span><h3>Pick your box</h3><p>Choose 4 or 8 scones and the number of boxes you want.</p></div>
          <div><span>02</span><h3>Pay online</h3><p>Stripe handles the card payment securely before your order is confirmed.</p></div>
          <div><span>03</span><h3>We bake fresh</h3><p>Your order is included in the next limited small-batch bake.</p></div>
          <div><span>04</span><h3>Pick it up</h3><p>Stop by during the posted pickup window and your box will be ready.</p></div>
        </div>
      </section>

      <section className="finePrint">
        <div className="shell fineGrid">
          <div>
            <h2>The Pumpkin Scone Co.</h2>
            <p>Pumpkin Scone. Period.</p>
          </div>
          <div>
            <strong>Before launch</strong>
            <p>Add final pickup location, contact information, allergen statement, and any Pennsylvania-required food labeling.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
