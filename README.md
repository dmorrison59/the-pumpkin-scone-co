# The Pumpkin Scone Co. — preorder site

A one-page Next.js storefront for selling seasonal pumpkin scones with Stripe-hosted Checkout.

## Included
- Real product photography supplied by the business owner
- 4-pack ($19) and 8-pack ($36) ordering
- Quantity selector
- Customer name, email, and phone capture
- Stripe Checkout Session API route
- Stripe TEST-key friendly setup
- Success page
- Mobile responsive layout
- Editable pickup/cutoff copy

## Run locally
1. Install Node.js 20.9+.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Add your Stripe **test** secret key to `STRIPE_SECRET_KEY`.
5. Run `npm run dev`.
6. Open `http://localhost:3000`.

## Stripe
The checkout route creates a new hosted Checkout Session for each purchase. It can either:
- use built-in `price_data` ($19 / $36), or
- use Stripe Price IDs if `STRIPE_PRICE_4_PACK` and `STRIPE_PRICE_8_PACK` are set.

Use test mode until the site, prices, pickup workflow, refunds, and order confirmation are fully verified.

## Before launch
Replace the temporary pickup text with the final pickup location/window and add:
- customer-facing contact email/phone
- final order cutoff wording
- allergen statement
- any Pennsylvania-required food labeling/disclosures
- privacy/terms/refund language as appropriate
- final domain in `NEXT_PUBLIC_SITE_URL`

## Deploy
Recommended: GitHub -> Vercel. Add the same environment variables in Vercel, then connect your GoDaddy (or other registrar) domain through DNS.
