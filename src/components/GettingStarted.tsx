"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { helpPath } from "@/lib/help-routes";

export type ChecklistStep = { label: string; done: boolean; href?: string; help: string };

/** A first-steps checklist that ticks itself off, links each step to its help article, and can be hidden. */
export function GettingStarted({ id, title, steps }: { id: string; title: string; steps: ChecklistStep[] }) {
  const key = `nw-getting-started-${id}`;
  const [hidden, setHidden] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(key) === "hidden");
    } catch {
      setHidden(false);
    }
  }, [key]);

  const done = steps.filter((s) => s.done).length;
  if (hidden !== false || done === steps.length) return null;

  return (
    <section className="font-ui border border-line bg-paper-deep/30 p-5 text-sm" aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl">{title}</h2>
        <span className="text-xs text-muted">
          {done} of {steps.length} done
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full bg-line/60" aria-hidden="true">
        <div className="h-full bg-accent transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-4 space-y-2.5">
        {steps.map((s) => (
          <li key={s.label} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${s.done ? "border-accent bg-accent text-paper" : "border-line text-transparent"}`}
            >
              ✓
            </span>
            <span className="min-w-0 flex-1">
              <span className="sr-only">{s.done ? "Done: " : "To do: "}</span>
              {s.href && !s.done ? (
                <Link href={s.href} className="text-ink underline-offset-4 hover:text-accent hover:underline">
                  {s.label}
                </Link>
              ) : (
                <span className={s.done ? "text-muted line-through" : "text-ink"}>{s.label}</span>
              )}
              <a href={helpPath(s.help)} target="_blank" rel="noopener" className="ml-2 text-xs text-accent underline">
                How
              </a>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-4 text-xs">
        <Link href="/help" className="text-accent underline">
          Browse all help
        </Link>
        <button
          type="button"
          className="text-muted underline"
          onClick={() => {
            try {
              localStorage.setItem(key, "hidden");
            } catch {
              /* private mode */
            }
            setHidden(true);
          }}
        >
          Hide this
        </button>
      </div>
    </section>
  );
}
