# Deploy

1. Create a GitHub repo and push this project.
2. Import the repo in Vercel; set env vars from `.env.example`.
3. Create a Supabase project; run `supabase/schema.sql`; create private Storage bucket `manuscripts`.
4. In Stripe, create products/prices for project unlock, credit packs, Pro/Studio; paste price IDs into env.
5. Point Stripe webhook to `https://YOUR_DOMAIN/api/stripe/webhook` for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
6. Add `novelistwriter.com` domain in Vercel.
7. Set Supabase Auth redirect URLs to your production URL.

## Local

```bash
cp .env.example .env.local
npm install
npm run dev
```
