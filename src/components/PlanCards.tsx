import Link from "next/link";
import { FOUNDING_PERCENT, foundingPrice } from "@/lib/plans";
import { sitePlans } from "@/lib/site-text";
import { InlineText } from "@/components/Markdown";

type Offers = {
  founding: { cap: number; left: number; percent: number };
  lifetime: Record<"pro" | "studio", { cap: number; left: number; cents: number }>;
} | null;

/** Free / Pro / Studio cards for the public pages, with your edited plan lists and founding prices while spots remain. */
export async function PlanCards({ offers = null }: { offers?: Offers }) {
  const plans = await sitePlans();
  const founding = Boolean(offers && offers.founding.left > 0);
  return (
    <>
      {founding && offers && (
        <p className="font-ui mb-4 border border-accent bg-accent/5 p-3 text-sm">
          <strong>Founding member pricing:</strong> the first {offers.founding.cap} subscribers keep {FOUNDING_PERCENT}% off Pro or Studio for
          life. <span className="text-accent">{offers.founding.left} spots left.</span>
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((p) => {
          const highlight = p.id === "studio";
          const discounted = founding && p.id !== "free";
          return (
            <div key={p.id} className={`flex flex-col border p-6 ${highlight ? "border-accent" : "border-line"}`}>
              <h3 className="font-display text-2xl">{p.name}</h3>
              <p className="mt-1 text-3xl text-ink">
                {discounted ? foundingPrice(p.price) : p.price}
                <span className="font-ui text-sm text-muted"> {p.note}</span>
                {discounted && <span className="font-ui ml-2 text-sm text-muted line-through">{p.price}</span>}
              </p>
              {discounted && <p className="font-ui text-xs text-accent">Founding price, for life</p>}
              <p className="font-ui mt-2 text-sm text-muted">{p.lead}</p>
              <ul className="font-ui mt-4 flex-1 space-y-2 text-sm text-ink">
                {p.items.map((i, n) => (
                  <li key={n} className="border-t border-line pt-2">
                    <InlineText text={i} />
                  </li>
                ))}
              </ul>
              <Link
                href={p.id === "free" ? "/signup" : "/billing"}
                className={`font-ui mt-6 inline-block px-4 py-2 text-center text-sm ${highlight ? "bg-accent text-paper" : "border border-line text-accent"}`}
              >
                {p.id === "free" ? "Start free" : `Get ${p.name}`}
              </Link>
            </div>
          );
        })}
      </div>
      <p className="font-ui mt-4 text-xs text-muted">
        Pro and Studio can be billed monthly or yearly. Cancel anytime.
        {offers && (offers.lifetime.pro.left > 0 || offers.lifetime.studio.left > 0) && (
          <>
            {" "}
            Prefer to pay once?{" "}
            <Link href="/lifetime" className="text-accent underline">
              Lifetime plans
            </Link>{" "}
            while spots last.
          </>
        )}
      </p>
    </>
  );
}
