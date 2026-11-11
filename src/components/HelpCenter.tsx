"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type HelpEntry = { slug: string; audience: string; topic: string; title: string; summary: string; plan?: string; text: string };

// Hyphens dropped so "preorder" finds "pre-order" and "ebook" finds "e-book"
const flat = (s: string) => s.toLowerCase().replace(/-/g, "");
const words = (s: string) => flat(s).split(/[^a-z0-9]+/).filter(Boolean);

/** The help index: every article grouped by audience and topic, with a search box that filters as you type. */
export function HelpCenter({ entries, audiences }: { entries: HelpEntry[]; audiences: { id: string; label: string; blurb: string }[] }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const terms = words(q);
    if (!terms.length) return null;
    return entries
      .map((e) => {
        const title = flat(e.title);
        const body = flat(`${e.summary} ${e.topic} ${e.text}`);
        let score = 0;
        for (const t of terms) {
          if (title.includes(t)) score += 3;
          else if (body.includes(t)) score += 1;
          else return null;
        }
        return { e, score };
      })
      .filter((x): x is { e: HelpEntry; score: number } => Boolean(x))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.e);
  }, [q, entries]);

  const audienceLabel = (id: string) => audiences.find((a) => a.id === id)?.label || id;

  return (
    <div>
      <label className="font-ui mt-8 block">
        <span className="sr-only">Search help</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search help, like “pre-orders” or “ARC reviews”"
          className="w-full border border-line bg-paper px-4 py-3 text-base"
        />
      </label>

      {results ? (
        <section className="mt-8" aria-live="polite">
          <p className="font-ui text-sm text-muted">
            {results.length} {results.length === 1 ? "article" : "articles"}
          </p>
          <ul className="mt-4 space-y-4">
            {results.map((e) => (
              <li key={e.slug} className="border-t border-line pt-3">
                <Link href={`/help/${e.slug}`} className="font-display text-xl text-ink hover:text-accent">
                  {e.title}
                </Link>
                <p className="font-ui mt-0.5 text-xs text-muted">
                  For {audienceLabel(e.audience).toLowerCase()} · {e.topic}
                  {e.plan ? ` · ${e.plan}` : ""}
                </p>
                <p className="mt-1 text-muted">{e.summary}</p>
              </li>
            ))}
          </ul>
          {!results.length && (
            <p className="mt-4 text-muted">
              Nothing matched. Try another word, or{" "}
              <Link href="/contact" className="text-accent underline">
                ask us
              </Link>
              .
            </p>
          )}
        </section>
      ) : (
        <>
          <nav className="font-ui mt-6 flex flex-wrap gap-2 text-sm" aria-label="Help for">
            {audiences.map((a) => (
              <a key={a.id} href={`#${a.id}`} className="border border-line px-3 py-1.5 text-muted hover:border-accent hover:text-accent">
                {a.label}
              </a>
            ))}
          </nav>
          {audiences.map((a) => {
            const mine = entries.filter((e) => e.audience === a.id);
            const topics = [...new Set(mine.map((e) => e.topic))];
            return (
              <section key={a.id} id={a.id} className="mt-14 scroll-mt-24">
                <h2 className="font-display text-3xl">For {a.label.toLowerCase()}</h2>
                <p className="mt-1 text-muted">{a.blurb}</p>
                <div className="mt-6 grid gap-8 md:grid-cols-2">
                  {topics.map((t) => (
                    <div key={t}>
                      <h3 className="font-ui text-xs uppercase tracking-wide text-accent">{t}</h3>
                      <ul className="mt-2 space-y-2">
                        {mine
                          .filter((e) => e.topic === t)
                          .map((e) => (
                            <li key={e.slug}>
                              <Link href={`/help/${e.slug}`} className="text-ink underline-offset-4 hover:text-accent hover:underline">
                                {e.title}
                              </Link>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
