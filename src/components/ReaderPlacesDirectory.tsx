"use client";

import { useState } from "react";
import type { PlaceGoal } from "@/lib/marketing-year";
import { CATEGORY_LABEL, COST_LABEL, GOAL_LABEL, PLACES_REVIEWED, READER_PLACES, type PlaceCategory, type PlaceCost } from "@/lib/reader-places";

/** Where readers are: places to post and promote, with costs and self-promotion rules. */
export function ReaderPlacesDirectory({ goal: initialGoal = null }: { goal?: PlaceGoal | null }) {
  const [goal, setGoal] = useState<PlaceGoal | null>(initialGoal);
  const [cost, setCost] = useState<PlaceCost | "any">("any");
  const places = READER_PLACES.filter((p) => (!goal || p.goals.includes(goal)) && (cost === "any" || p.cost === cost));
  const groups = (Object.keys(CATEGORY_LABEL) as PlaceCategory[]).map((c) => ({ c, list: places.filter((p) => p.category === c) })).filter((g) => g.list.length);
  const chip = (on: boolean) => `border px-3 py-1.5 ${on ? "border-accent bg-accent/5 text-ink" : "border-line text-muted hover:text-ink"}`;

  return (
    <div className="font-ui">
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" className={chip(!goal)} onClick={() => setGoal(null)}>
          Any goal
        </button>
        {(Object.keys(GOAL_LABEL) as PlaceGoal[]).map((g) => (
          <button key={g} type="button" className={chip(goal === g)} onClick={() => setGoal(g)}>
            {GOAL_LABEL[g]}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <button type="button" className={chip(cost === "any")} onClick={() => setCost("any")}>
          Any cost
        </button>
        {(Object.keys(COST_LABEL) as PlaceCost[]).map((c) => (
          <button key={c} type="button" className={chip(cost === c)} onClick={() => setCost(c)}>
            {COST_LABEL[c]}
          </button>
        ))}
      </div>

      {groups.length === 0 && <p className="mt-6 text-sm text-muted">Nothing matches both filters. Try “Any cost”.</p>}
      {groups.map(({ c, list }) => (
        <section key={c} className="mt-8">
          <h3 className="text-xs uppercase tracking-wide text-accent">{CATEGORY_LABEL[c]}</h3>
          <ul className="mt-3 grid gap-4 md:grid-cols-2">
            {list.map((p) => (
              <li key={p.id} className="border border-line p-4 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <a
                    href={p.url}
                    {...(p.url.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="font-display text-lg text-ink hover:text-accent"
                  >
                    {p.name}
                  </a>
                  <span className="border border-line px-2 py-0.5 text-[11px] text-muted">{COST_LABEL[p.cost]}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{p.costNote}</p>
                <p className="mt-3">
                  <span className="text-ink">Rules: </span>
                  <span className="text-muted">{p.rules}</span>
                </p>
                <p className="mt-2">
                  <span className="text-ink">Tip: </span>
                  <span className="text-muted">{p.tip}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="mt-8 text-xs text-muted">
        Prices and rules change. Check each site before you book or post. Last reviewed {PLACES_REVIEWED}. We don&apos;t take
        payment from any of these.
      </p>
    </div>
  );
}
