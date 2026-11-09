"use client";

import { useMemo, useState } from "react";
import { PLAN_KIND_LABEL, buildYearPlan, type PlanBook, type PlanIdea, type PlanKind, type PlaceGoal } from "@/lib/marketing-year";

type Props = {
  books: PlanBook[];
  today: string;
  pro: boolean;
  studio: boolean;
  /** plan_key of every post already on the calendar */
  planned: Set<string>;
  onAdd: (idea: PlanIdea) => Promise<void>;
  onMakeCard: (idea: PlanIdea) => void;
  onPlaces: (goal: PlaceGoal) => void;
};

function monthLabel(day: string) {
  return new Date(`${day.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
function dayLabel(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** Twelve months of ideas built from the author's books. Every idea is a prompt; the author writes the post. */
export function MarketingYearPlan({ books, today, pro, studio, planned, onAdd, onMakeCard, onPlaces }: Props) {
  const ideas = useMemo(() => buildYearPlan(books, today), [books, today]);
  const [kind, setKind] = useState<PlanKind | "all">("all");
  const [wholeYear, setWholeYear] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const horizon = useMemo(() => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 3);
    return d.toISOString().slice(0, 10);
  }, [today]);

  const kinds = [...new Set(ideas.map((i) => i.kind))];
  const shown = ideas.filter((i) => (kind === "all" || i.kind === kind) && (wholeYear || i.day <= horizon));
  const months = [...new Set(shown.map((i) => i.day.slice(0, 7)))];
  const bookTitle = (id: string | null) => books.find((b) => b.id === id)?.title;
  const chip = (on: boolean) => `border px-3 py-1.5 ${on ? "border-accent bg-accent/5 text-ink" : "border-line text-muted hover:text-ink"}`;

  if (!books.length) return <p className="mt-4 text-sm text-muted">Create a book and your plan appears here.</p>;

  return (
    <div className="font-ui">
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <button type="button" className={chip(kind === "all")} onClick={() => setKind("all")}>
          Everything
        </button>
        {kinds.map((k) => (
          <button key={k} type="button" className={chip(kind === k)} onClick={() => setKind(k)}>
            {PLAN_KIND_LABEL[k]}
            {k === "series" || k === "deal" ? " (Studio)" : ""}
          </button>
        ))}
      </div>
      {!books.some((b) => b.published || b.releaseDate) && (
        <p className="mt-3 text-xs text-muted">
          Backlist spotlights, book birthdays, and price promotions appear once a book is published or has a release date.
        </p>
      )}

      {months.map((m) => (
        <div key={m} className="mt-6">
          <h3 className="text-sm text-ink">{monthLabel(m)}</h3>
          <ul className="mt-2 space-y-2">
            {shown
              .filter((i) => i.day.startsWith(m))
              .map((i) => {
                const locked = i.studio ? !studio : !pro;
                const onCalendar = planned.has(i.key);
                return (
                  <li key={i.key} className="border border-line p-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-ink">
                        <span className="text-muted">{dayLabel(i.day)} · </span>
                        {i.title}
                      </span>
                      <span className="text-[11px] uppercase tracking-wide text-accent">
                        {PLAN_KIND_LABEL[i.kind]}
                        {i.studio ? " · Studio" : ""}
                      </span>
                    </div>
                    <p className="mt-1 text-muted">{i.why}</p>
                    {bookTitle(i.bookId) && i.kind !== "backlist" && i.kind !== "anniversary" && <p className="mt-1 text-xs text-muted">Book: {bookTitle(i.bookId)}</p>}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      {onCalendar ? (
                        <span className="text-muted">✓ On your calendar</span>
                      ) : locked ? (
                        <a href="/billing" className="text-accent underline">
                          {i.studio ? "Studio" : "Pro"} adds this to your calendar
                        </a>
                      ) : (
                        <button
                          type="button"
                          disabled={adding === i.key}
                          className="text-accent underline disabled:opacity-50"
                          onClick={async () => {
                            setAdding(i.key);
                            await onAdd(i).finally(() => setAdding(null));
                          }}
                        >
                          Add to calendar
                        </button>
                      )}
                      {i.card !== "none" && i.bookId && (
                        <button type="button" className="text-accent underline" onClick={() => onMakeCard(i)}>
                          {i.card === "cover" ? "Make a cover image" : `Make a ${i.card} card`}
                        </button>
                      )}
                      {i.placesGoal && (
                        <button type="button" className="text-accent underline" onClick={() => onPlaces(i.placesGoal!)}>
                          Where to post this
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
      {!wholeYear && ideas.some((i) => i.day > horizon) && (
        <button type="button" className="mt-4 text-sm text-accent underline" onClick={() => setWholeYear(true)}>
          Show the whole year
        </button>
      )}
    </div>
  );
}
