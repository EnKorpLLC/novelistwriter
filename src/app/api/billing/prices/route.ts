import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { CREDIT_PACKS } from "@/lib/types";

export type PackPrice = {
  pack: keyof typeof CREDIT_PACKS;
  label: string;
  credits: number;
  /** Unit amount in major currency units (e.g. 5 for $5). Null if price not configured. */
  usd: number | null;
};

/** Public catalog of credit-pack display prices from Stripe. */
export async function GET() {
  const stripe = getStripe();
  const packs: PackPrice[] = [];

  for (const [pack, def] of Object.entries(CREDIT_PACKS) as [
    keyof typeof CREDIT_PACKS,
    (typeof CREDIT_PACKS)[keyof typeof CREDIT_PACKS],
  ][]) {
    const priceId = process.env[def.envPrice];
    let usd: number | null = null;
    if (priceId) {
      try {
        const price = await stripe.prices.retrieve(priceId);
        if (typeof price.unit_amount === "number") {
          usd = price.unit_amount / 100;
        }
      } catch {
        usd = null;
      }
    }
    packs.push({
      pack,
      label: def.label,
      credits: def.credits,
      usd,
    });
  }

  return NextResponse.json({ packs });
}
