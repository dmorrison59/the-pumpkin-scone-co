# Pumpkin Scone Co. — Admin Dashboard Upgrade

This upgrade adds:

- `/admin` — private order dashboard
- paid order count
- 4-pack box count
- 8-pack box count
- total scones
- recipe batches (8 scones per batch)
- total Stripe revenue
- customer/order table
- improved order confirmation page
- simple browser username/password protection for `/admin`

## Files

Copy these files into your existing project:

- `app/admin/page.tsx` — NEW
- `proxy.ts` — NEW
- `app/success/page.tsx` — REPLACE existing file
- append `admin-styles.css.txt` to the bottom of `app/globals.css`

## Vercel environment variables

Keep your existing:

- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_SITE_URL`

Add:

- `ADMIN_USER`
- `ADMIN_PASSWORD`

Example:

ADMIN_USER=david
ADMIN_PASSWORD=choose-a-strong-password

Set both for Production.

## Deploy

After copying the files:

git add .
git commit -m "Add Stripe order admin dashboard"
git push

Vercel should automatically redeploy from GitHub.

## Open dashboard

After deployment:

https://www.thepumpkinsconeco.com/admin

Your browser will ask for the `ADMIN_USER` and `ADMIN_PASSWORD` values.

## Important

The dashboard reads up to the latest 100 Stripe Checkout Sessions and only counts paid orders that contain the scone order metadata created by the current checkout route.

For the initial seasonal launch, Stripe itself acts as the order source of truth. This avoids adding Supabase until you need features Stripe does not provide, such as pickup-status editing, customer notes, or long-term operational reporting.
