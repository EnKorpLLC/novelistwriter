import "server-only";
import { cache } from "react";
import { PLANS, type PlanCopy } from "@/lib/plans";
import { SITE_TEXT_BY_KEY, mergeBlock, type TextBlock } from "@/lib/site-text-registry";

/** Every saved edit, read once per page render. Empty (built-in wording) when the database isn't reachable. */
const overrides = cache(async (): Promise<Map<string, TextBlock>> => {
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const { data, error } = await createServiceClient().from("site_text").select("key, value");
    if (error) return new Map();
    return new Map((data || []).map((r) => [r.key as string, r.value as TextBlock]));
  } catch {
    return new Map();
  }
});

/** A block as shown on the site. */
export async function siteText(key: string): Promise<TextBlock> {
  const entry = SITE_TEXT_BY_KEY.get(key);
  if (!entry) throw new Error(`Unknown site text: ${key}`);
  return mergeBlock(entry, (await overrides()).get(key));
}

/** Plan cards with your edited lead lines and feature lists (prices stay in code, since Stripe charges them). */
export async function sitePlans(): Promise<PlanCopy[]> {
  const blocks = await Promise.all(PLANS.map((p) => siteText(`plans.${p.id}`)));
  return PLANS.map((p, i) => ({ ...p, lead: blocks[i].intro || p.lead, items: blocks[i].list?.length ? blocks[i].list! : p.items }));
}

export async function siteFaq(): Promise<{ q: string; a: string }[]> {
  return (await siteText("pricing.faq")).faq || [];
}
