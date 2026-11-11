"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownToolbar, markdownShortcut } from "@/components/MarkdownToolbar";
import { FIELD_LABEL, type Point, type TextBlock, type TextField } from "@/lib/site-text-registry";

type Block = { key: string; page: string; label: string; fields: TextField[]; defaults: TextBlock; edited: boolean; updatedAt: string | null; value: TextBlock };

const input = "mt-1 block w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink";
const PAGE_LINK: Record<string, string> = { Home: "/", "For authors": "/authors", "For readers": "/readers", Pricing: "/pricing", Plans: "/pricing" };

function move<T>(list: T[], i: number, by: number) {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** A paragraph box with Bold, Italic, and Link buttons. */
function FormattedField({ label, rows, value, onChange }: { label: string; rows: number; value: string; onChange: (next: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="text-xs text-muted">
      {label}
      <div className="mt-1">
        <MarkdownToolbar target={ref} value={value} onChange={onChange} inline />
        <textarea
          ref={ref}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => markdownShortcut(e, value, onChange)}
          className="block w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink"
        />
      </div>
    </div>
  );
}

function BlockEditor({ block, onSaved, onNote }: { block: Block; onSaved: () => void; onNote: (m: string | null) => void }) {
  const [v, setV] = useState<TextBlock>(block.value);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(block.value);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/site-text", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: block.key, value: v }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not save");
      onNote(`Saved "${block.label}". It's live on the site now.`);
      onSaved();
    } catch (e) {
      onNote(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm(`Put "${block.label}" back to the original wording?`)) return;
    setBusy(true);
    await fetch(`/api/admin/site-text?key=${block.key}`, { method: "DELETE" });
    setV(block.defaults);
    setBusy(false);
    onNote(`"${block.label}" is back to the original wording.`);
    onSaved();
  }

  const items = v.items || [];
  const list = v.list || [];
  const faq = v.faq || [];

  return (
    <div className="space-y-3 border border-line p-4 text-sm">
      {block.fields.includes("kicker") && (
        <label className="block text-xs text-muted">
          {FIELD_LABEL.kicker}
          <input value={v.kicker || ""} onChange={(e) => setV({ ...v, kicker: e.target.value })} className={input} />
        </label>
      )}
      {block.fields.includes("heading") && (
        <label className="block text-xs text-muted">
          {FIELD_LABEL.heading}
          <textarea rows={2} value={v.heading || ""} onChange={(e) => setV({ ...v, heading: e.target.value })} className={`${input} font-display text-lg`} />
        </label>
      )}
      {block.fields.includes("intro") && <FormattedField label={FIELD_LABEL.intro} rows={4} value={v.intro || ""} onChange={(intro) => setV({ ...v, intro })} />}
      {block.fields.includes("note") && <FormattedField label={FIELD_LABEL.note} rows={2} value={v.note || ""} onChange={(note) => setV({ ...v, note })} />}
      {block.fields.includes("items") && (
        <div>
          <p className="text-xs text-muted">{FIELD_LABEL.items}</p>
          {items.map((p, i) => (
            <div key={i} className="mt-2 grid gap-1 border border-line/70 p-2">
              <input value={p.t} placeholder="Title" onChange={(e) => setV({ ...v, items: items.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)) })} className={`${input} font-medium`} />
              <textarea rows={2} value={p.d} placeholder="Description" onChange={(e) => setV({ ...v, items: items.map((x, j) => (j === i ? { ...x, d: e.target.value } : x)) })} className={input} />
              <div className="flex gap-3 text-xs">
                <button type="button" className="text-muted underline" onClick={() => setV({ ...v, items: move<Point>(items, i, -1) })}>
                  Up
                </button>
                <button type="button" className="text-muted underline" onClick={() => setV({ ...v, items: move<Point>(items, i, 1) })}>
                  Down
                </button>
                <button type="button" className="text-danger underline" onClick={() => setV({ ...v, items: items.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="mt-2 text-xs text-accent underline" onClick={() => setV({ ...v, items: [...items, { t: "", d: "" }] })}>
            Add a point
          </button>
        </div>
      )}
      {block.fields.includes("list") && (
        <div>
          <p className="text-xs text-muted">{FIELD_LABEL.list}</p>
          {list.map((x, i) => (
            <div key={i} className="mt-1 flex gap-2">
              <textarea rows={1} value={x} onChange={(e) => setV({ ...v, list: list.map((y, j) => (j === i ? e.target.value : y)) })} className={`${input} mt-0`} />
              <div className="flex shrink-0 flex-col text-[11px]">
                <button type="button" className="text-muted underline" onClick={() => setV({ ...v, list: move(list, i, -1) })}>
                  Up
                </button>
                <button type="button" className="text-muted underline" onClick={() => setV({ ...v, list: move(list, i, 1) })}>
                  Down
                </button>
                <button type="button" className="text-danger underline" onClick={() => setV({ ...v, list: list.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="mt-2 text-xs text-accent underline" onClick={() => setV({ ...v, list: [...list, ""] })}>
            Add a line
          </button>
        </div>
      )}
      {block.fields.includes("faq") && (
        <div>
          <p className="text-xs text-muted">{FIELD_LABEL.faq}</p>
          {faq.map((f, i) => (
            <div key={i} className="mt-2 grid gap-1 border border-line/70 p-2">
              <input value={f.q} placeholder="Question" onChange={(e) => setV({ ...v, faq: faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} className={`${input} font-medium`} />
              <textarea rows={3} value={f.a} placeholder="Answer" onChange={(e) => setV({ ...v, faq: faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} className={input} />
              <div className="flex gap-3 text-xs">
                <button type="button" className="text-muted underline" onClick={() => setV({ ...v, faq: move(faq, i, -1) })}>
                  Up
                </button>
                <button type="button" className="text-muted underline" onClick={() => setV({ ...v, faq: move(faq, i, 1) })}>
                  Down
                </button>
                <button type="button" className="text-danger underline" onClick={() => setV({ ...v, faq: faq.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="mt-2 text-xs text-accent underline" onClick={() => setV({ ...v, faq: [...faq, { q: "", a: "" }] })}>
            Add a question
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <button type="button" disabled={busy || !dirty} className="bg-accent px-4 py-2 text-paper disabled:opacity-50" onClick={() => void save()}>
          Save
        </button>
        {dirty && (
          <button type="button" className="text-xs text-muted underline" onClick={() => setV(block.value)}>
            Undo changes
          </button>
        )}
        {block.edited && (
          <button type="button" disabled={busy} className="ml-auto text-xs text-muted underline" onClick={() => void reset()}>
            Reset to original wording
          </button>
        )}
      </div>
    </div>
  );
}

/** Edit the wording on the home page, For authors, For readers, the plan lists, and the pricing questions. */
export function AdminSiteText({ onNote }: { onNote: (msg: string | null) => void }) {
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [page, setPage] = useState("Home");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/site-text");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      onNote(json.error || "Could not load site text");
      setBlocks([]);
      return;
    }
    setBlocks(json.blocks);
  }, [onNote]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!blocks) return <p className="mt-6 text-sm text-muted">Loading…</p>;
  const pages = [...new Set(blocks.map((b) => b.page))];

  return (
    <div className="mt-6 text-sm">
      <p className="max-w-3xl text-muted">
        Change the wording here and it goes live straight away. Anything you don&apos;t change keeps the original wording, and every
        section can be put back. Select words and use the Bold, Italic, and Link buttons; in a heading, Enter starts a new line. Prices
        stay as they are, since Stripe charges them.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {pages.map((p) => (
          <button key={p} type="button" onClick={() => setPage(p)} className={`border px-3 py-1.5 ${page === p ? "border-accent bg-accent/5 text-ink" : "border-line text-muted"}`}>
            {p}
            {blocks.some((b) => b.page === p && b.edited) ? " •" : ""}
          </button>
        ))}
        {(PAGE_LINK[page] || page.startsWith("Help")) && (
          <a href={PAGE_LINK[page] || "/help"} target="_blank" rel="noopener noreferrer" className="self-center text-xs text-accent underline">
            Open the page
          </a>
        )}
      </div>
      {page.startsWith("Help") && (
        <p className="mt-3 max-w-3xl text-xs text-muted">
          In help articles, the heading is the title, the intro is the summary, the list is the numbered steps, the points are tips, and the questions show at
          the end.
        </p>
      )}
      <ul className="mt-4 space-y-2">
        {blocks
          .filter((b) => b.page === page)
          .map((b) => (
            <li key={b.key}>
              <button type="button" onClick={() => setOpen(open === b.key ? null : b.key)} className="flex w-full items-baseline justify-between border border-line px-3 py-2 text-left">
                <span>
                  {b.label}
                  {b.value.heading && <span className="ml-2 text-muted">“{b.value.heading.split("\n")[0]}”</span>}
                </span>
                <span className="text-xs text-muted">{b.edited ? "Edited" : "Original"}</span>
              </button>
              {open === b.key && (
                <div className="mt-2">
                  <BlockEditor key={`${b.key}-${b.updatedAt}`} block={b} onSaved={() => void load()} onNote={onNote} />
                </div>
              )}
            </li>
          ))}
      </ul>
    </div>
  );
}
