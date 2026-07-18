# Novelist Writer

The studio where you write the book and AI stress-tests the craft—coherence, voice, arcs, and KDP readiness—**without writing a word of your novel**.

## Stack

- **Next.js** on **Vercel**
- **Supabase** (Auth, Postgres + RLS, Storage)
- **Stripe** (project unlocks, AI credits, optional Pro/Studio)
- **GitHub** for source control

## Getting started

1. Copy `.env.example` to `.env.local` and fill in keys.
2. Run the SQL in `supabase/schema.sql` in your Supabase SQL editor.
3. Create a Storage bucket named `manuscripts` (private).
4. `npm install && npm run dev`

## Product rules

AI never drafts replacement manuscript prose. Critique, examples (labeled, non-insertable), tracking only.

## Monetization

- Free forever writing studio; first project free
- Extra projects: one-time unlock
- AI: credit packs (pay per run)
- Optional Pro/Studio subscription
