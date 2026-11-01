import Link from "next/link";
import { PLANS } from "@/lib/plans";

/** Free / Pro / Studio cards for the public pages. */
export function PlanCards() {
  return (
    <>
      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map((p) => {
          const highlight = p.id === "studio";
          return (
            <div key={p.id} className={`flex flex-col border p-6 ${highlight ? "border-accent" : "border-line"}`}>
              <h3 className="font-display text-2xl">{p.name}</h3>
              <p className="mt-1 text-3xl text-ink">
                {p.price}
                <span className="font-ui text-sm text-muted"> {p.note}</span>
              </p>
              <p className="font-ui mt-2 text-sm text-muted">{p.lead}</p>
              <ul className="font-ui mt-4 flex-1 space-y-2 text-sm text-ink">
                {p.items.map((i) => (
                  <li key={i} className="border-t border-line pt-2">
                    {i}
                  </li>
                ))}
              </ul>
              <Link
                href={p.id === "free" ? "/signup" : "/billing"}
                className={`font-ui mt-6 inline-block px-4 py-2 text-center text-sm ${
                  highlight ? "bg-accent text-paper" : "border border-line text-accent"
                }`}
              >
                {p.id === "free" ? "Start free" : `Get ${p.name}`}
              </Link>
            </div>
          );
        })}
      </div>
      <p className="font-ui mt-4 text-xs text-muted">Pro and Studio can be billed monthly or yearly. Cancel anytime.</p>
    </>
  );
}
