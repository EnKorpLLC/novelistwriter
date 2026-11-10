"use client";

import { useCallback, useEffect, useState } from "react";
import { Markdown } from "@/components/Markdown";

type Faq = { q: string; a: string };
type ReportData = { generatedAt: string; period: string; minGroup: number; sections: { title: string; note: string; rows: { label: string; display: string }[] }[] };
type Page = {
  id: string;
  kind: "guide" | "report" | "page";
  slug: string;
  title: string;
  summary: string;
  body: string;
  faq: Faq[];
  author_name: string;
  related_path: string;
  related_label: string;
  data: ReportData | null;
  status: "draft" | "published";
  published_at: string | null;
  updated_at: string;
  path: string;
};
type Tracking = {
  month: string;
  tools: string[];
  questions: { id: string; question: string; active: boolean }[];
  checks: { question_id: string; tool: string; mentioned: boolean; linked: boolean; notes: string }[];
  history: { month: string; checked: number; mentioned: number; linked: number }[];
  listings: { key: string; label: string; url: string; status: string; notes: string }[];
};

const input = "mt-1 block w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink";
const KIND_LABEL = { guide: "Guide", report: "Report", page: "Site page" };

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong");
  return json;
}

function Editor({ onNote }: { onNote: (m: string | null) => void }) {
  const [pages, setPages] = useState<Page[] | null>(null);
  const [meta, setMeta] = useState<{ sitePages: string[]; myName: string; starterSlugs: string[] }>({ sitePages: [], myName: "", starterSlugs: [] });
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Page | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const json = await call("/api/admin/content", "GET");
      setPages(json.pages);
      setMeta({ sitePages: json.sitePages, myName: json.myName, starterSlugs: json.starterSlugs });
    } catch (e) {
      onNote(e instanceof Error ? e.message : "Could not load");
      setPages([]);
    }
  }, [onNote]);
  useEffect(() => {
    void load();
  }, [load]);

  const open = (p: Page) => {
    setOpenId(p.id);
    setDraft({ ...p, faq: p.faq.length ? p.faq : [] });
    setPreview(false);
  };

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      onNote(done);
      await load();
    } catch (e) {
      onNote(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function save(extra: Partial<Page> = {}) {
    if (!draft) return;
    const json = await call("/api/admin/content", "PATCH", { ...draft, ...extra, faq: draft.faq.filter((f) => f.q.trim() && f.a.trim()) });
    setDraft({ ...json.page });
  }

  if (!pages) return <p className="mt-6 text-sm text-muted">Loading…</p>;
  const missingStarters = meta.starterSlugs.filter((s) => !pages.some((p) => p.slug === s)).length;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2">
          {(["guide", "report"] as const).map((k) => (
            <button
              key={k}
              type="button"
              disabled={busy}
              className="border border-line px-3 py-1.5 text-xs"
              onClick={() => {
                const title = window.prompt(`Title for the new ${KIND_LABEL[k].toLowerCase()}:`);
                if (title) void run(() => call("/api/admin/content", "POST", { kind: k, title, authorName: meta.myName }), `${KIND_LABEL[k]} created as a draft.`);
              }}
            >
              New {KIND_LABEL[k].toLowerCase()}
            </button>
          ))}
          {meta.sitePages
            .filter((s) => !pages.some((p) => p.kind === "page" && p.slug === s))
            .map((s) => (
              <button key={s} type="button" disabled={busy} className="border border-line px-3 py-1.5 text-xs" onClick={() => void run(() => call("/api/admin/content", "POST", { kind: "page", slug: s, title: s.replace(/-/g, " "), authorName: meta.myName }), "Page created as a draft.")}>
                Edit /{s}
              </button>
            ))}
        </div>
        {missingStarters > 0 && (
          <button
            type="button"
            disabled={busy}
            className="w-full bg-accent px-3 py-2 text-xs text-paper"
            onClick={() => void run(() => call("/api/admin/content", "POST", { action: "import", authorName: meta.myName }), "Starter drafts loaded. Nothing is public until you publish it.")}
          >
            Load {missingStarters} starter draft{missingStarters === 1 ? "" : "s"}
          </button>
        )}
        {(["page", "guide", "report"] as const).map((k) => {
          const list = pages.filter((p) => p.kind === k);
          if (!list.length) return null;
          return (
            <div key={k}>
              <h4 className="text-xs uppercase tracking-wide text-muted">{KIND_LABEL[k]}s</h4>
              <ul className="mt-1 space-y-1">
                {list.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => open(p)} className={`w-full border px-2 py-1.5 text-left ${openId === p.id ? "border-accent" : "border-line"}`}>
                      <span className="block truncate">{p.title}</span>
                      <span className={`text-[11px] ${p.status === "published" ? "text-accent" : "text-muted"}`}>{p.status === "published" ? "Published" : "Draft"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </aside>

      {!draft ? (
        <p className="text-sm text-muted">Pick a page to edit, or start a new one. Drafts stay private until you publish.</p>
      ) : (
        <section className="min-w-0 space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wide text-accent">
              {KIND_LABEL[draft.kind]} · {draft.status === "published" ? "Published" : "Draft"}
            </span>
            <div className="flex flex-wrap gap-3 text-xs">
              <button type="button" className="text-accent underline" onClick={() => setPreview((p) => !p)}>
                {preview ? "Edit" : "Preview"}
              </button>
              {draft.status === "published" && (
                <a href={draft.path} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                  View on the site
                </a>
              )}
            </div>
          </div>

          {preview ? (
            <div className="border border-line p-5">
              <h1 className="font-display text-3xl">{draft.title}</h1>
              {draft.summary && <p className="mt-3 border-l-4 border-accent bg-paper-deep/40 p-3">{draft.summary}</p>}
              <Markdown source={draft.body} />
              {draft.faq.filter((f) => f.q && f.a).length > 0 && (
                <dl className="mt-6 space-y-3">
                  {draft.faq.map((f, i) => (
                    <div key={i}>
                      <dt className="font-display">{f.q}</dt>
                      <dd className="text-muted">{f.a}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ) : (
            <>
              <label className="block text-xs text-muted">
                Title
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={input} />
              </label>
              {draft.kind !== "page" && (
                <label className="block text-xs text-muted">
                  Address: {draft.kind === "guide" ? "/guides/" : "/reports/"}
                  <input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} className={input} />
                </label>
              )}
              <label className="block text-xs text-muted">
                The short answer (first thing readers and search engines see; 1–3 sentences)
                <textarea rows={3} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} className={input} />
              </label>
              <label className="block text-xs text-muted">
                Body (## heading, ### smaller heading, - list, 1. numbered, **bold**, *italic*, [link](/page), &gt; quote, - [ ] checkbox)
                <textarea rows={22} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className={`${input} font-mono text-[13px] leading-relaxed`} />
              </label>
              <div>
                <p className="text-xs text-muted">Questions (shown at the end and given to search engines)</p>
                {draft.faq.map((f, i) => (
                  <div key={i} className="mt-2 grid gap-1 border border-line p-2">
                    <input value={f.q} placeholder="Question" onChange={(e) => setDraft({ ...draft, faq: draft.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} className={input} />
                    <textarea rows={2} value={f.a} placeholder="Answer" onChange={(e) => setDraft({ ...draft, faq: draft.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} className={input} />
                    <button type="button" className="justify-self-start text-xs text-danger underline" onClick={() => setDraft({ ...draft, faq: draft.faq.filter((_, j) => j !== i) })}>
                      Remove
                    </button>
                  </div>
                ))}
                <button type="button" className="mt-2 text-xs text-accent underline" onClick={() => setDraft({ ...draft, faq: [...draft.faq, { q: "", a: "" }] })}>
                  Add a question
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-xs text-muted">
                  Author name
                  <input value={draft.author_name} onChange={(e) => setDraft({ ...draft, author_name: e.target.value })} className={input} />
                </label>
                <label className="block text-xs text-muted">
                  Related link (a page here)
                  <input value={draft.related_path} placeholder="/tools/spine-calculator" onChange={(e) => setDraft({ ...draft, related_path: e.target.value })} className={input} />
                </label>
                <label className="block text-xs text-muted">
                  Related link text
                  <input value={draft.related_label} onChange={(e) => setDraft({ ...draft, related_label: e.target.value })} className={input} />
                </label>
              </div>
              {draft.kind === "report" && (
                <div className="border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted">
                      Numbers: anonymous totals over the last 90 days. Groups smaller than 10 people are left out.
                    </p>
                    <button type="button" disabled={busy} className="border border-line px-3 py-1.5 text-xs" onClick={() => void run(async () => {
                      const json = await call("/api/admin/content", "POST", { action: "stats", id: draft.id });
                      setDraft({ ...draft, data: json.data });
                    }, "Report numbers updated.")}>
                      Fill with the latest numbers
                    </button>
                  </div>
                  {draft.data?.sections?.length ? (
                    <ul className="mt-2 space-y-1 text-xs">
                      {draft.data.sections.flatMap((s) => s.rows.map((r) => (
                        <li key={`${s.title}-${r.label}`}>
                          {s.title}: {r.label} <strong>{r.display}</strong>
                        </li>
                      )))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-muted">{draft.data ? "Not enough activity yet for any number to be safe to publish." : "No numbers yet."}</p>
                  )}
                </div>
              )}
            </>
          )}

          <div className="flex flex-wrap gap-3 border-t border-line pt-3">
            <button type="button" disabled={busy} className="border border-line px-4 py-2" onClick={() => void run(() => save(), "Saved.")}>
              Save
            </button>
            {draft.status === "draft" ? (
              <button type="button" disabled={busy} className="bg-accent px-4 py-2 text-paper" onClick={() => void run(() => save({ status: "published" }), "Published. It's live now.")}>
                Publish
              </button>
            ) : (
              <button type="button" disabled={busy} className="border border-line px-4 py-2" onClick={() => void run(() => save({ status: "draft" }), "Unpublished; back to draft.")}>
                Unpublish
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              className="ml-auto text-xs text-danger underline"
              onClick={() => {
                if (!window.confirm(`Delete "${draft.title}"? This can't be undone.`)) return;
                void run(async () => {
                  await call(`/api/admin/content?id=${draft.id}`, "DELETE");
                  setDraft(null);
                  setOpenId(null);
                }, "Deleted.");
              }}
            >
              Delete
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Tracking({ onNote }: { onNote: (m: string | null) => void }) {
  const [data, setData] = useState<Tracking | null>(null);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [question, setQuestion] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await call(`/api/admin/search-tracking?month=${month}`, "GET"));
    } catch (e) {
      onNote(e instanceof Error ? e.message : "Could not load");
    }
  }, [month, onNote]);
  useEffect(() => {
    void load();
  }, [load]);

  async function record(questionId: string, tool: string, patch: { mentioned?: boolean; linked?: boolean }) {
    if (!data) return;
    const cur = data.checks.find((c) => c.question_id === questionId && c.tool === tool) || { mentioned: false, linked: false, notes: "" };
    const next = { ...cur, ...patch };
    if (patch.linked) next.mentioned = true;
    if (patch.mentioned === false) next.linked = false;
    await call("/api/admin/search-tracking", "PATCH", { month, questionId, tool, ...next });
    await load();
  }

  if (!data) return <p className="mt-6 text-sm text-muted">Loading…</p>;
  const active = data.questions.filter((q) => q.active);

  return (
    <div className="mt-6 space-y-10 text-sm">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-lg">Monthly AI answer check</h3>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="border border-line bg-paper px-2 py-1" />
        </div>
        <p className="mt-1 max-w-2xl text-xs text-muted">
          Once a month, ask each tool these questions in a fresh chat. Tick whether the answer mentions Novelist Writer, and whether it links to us.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-1.5 font-normal">Question</th>
                {data.tools.map((t) => (
                  <th key={t} className="py-1.5 text-center font-normal">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.map((q) => (
                <tr key={q.id} className="border-b border-line/60 align-top">
                  <td className="py-2 pr-3">
                    {q.question}
                    <button type="button" className="ml-2 text-[11px] text-muted underline" onClick={() => void call("/api/admin/search-tracking", "PATCH", { questionId: q.id, active: false }).then(load)}>
                      retire
                    </button>
                  </td>
                  {data.tools.map((t) => {
                    const c = data.checks.find((x) => x.question_id === q.id && x.tool === t);
                    return (
                      <td key={t} className="py-2 text-center text-xs">
                        <label className="block">
                          <input type="checkbox" checked={Boolean(c?.mentioned)} onChange={(e) => void record(q.id, t, { mentioned: e.target.checked })} /> named
                        </label>
                        <label className="block">
                          <input type="checkbox" checked={Boolean(c?.linked)} onChange={(e) => void record(q.id, t, { linked: e.target.checked })} /> linked
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void call("/api/admin/search-tracking", "POST", { question })
              .then(() => {
                setQuestion("");
                return load();
              })
              .catch((err) => onNote(err instanceof Error ? err.message : "Could not add"));
          }}
        >
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Add a question people ask AI tools" className="flex-1 border border-line bg-paper px-2 py-1.5" />
          <button type="submit" className="border border-line px-3">
            Add
          </button>
        </form>
        {data.history.length > 0 && (
          <ul className="mt-4 space-y-1 text-xs">
            {data.history.map((h) => (
              <li key={h.month}>
                {h.month.slice(0, 7)}: named in {h.mentioned} of {h.checked} answers, linked in {h.linked}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="font-display text-lg">Listings and outreach</h3>
        <p className="mt-1 text-xs text-muted">Use the same name, description, and links everywhere.</p>
        <ul className="mt-3 space-y-2">
          {data.listings.map((l) => (
            <li key={l.key} className="grid items-center gap-2 border border-line p-2 sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)]">
              <span>{l.label}</span>
              <select
                value={l.status}
                onChange={(e) => void call("/api/admin/search-tracking", "PATCH", { listing: l.key, status: e.target.value }).then(load)}
                className="border border-line bg-paper px-2 py-1"
              >
                <option value="todo">To do</option>
                <option value="submitted">Submitted</option>
                <option value="live">Live</option>
                <option value="skip">Skip</option>
              </select>
              <input
                defaultValue={l.url}
                placeholder="Listing URL"
                onBlur={(e) => e.target.value !== l.url && void call("/api/admin/search-tracking", "PATCH", { listing: l.key, url: e.target.value }).then(load)}
                className="border border-line bg-paper px-2 py-1"
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** G7: guides, reports, and site pages you write here, plus the AI answer check and listings. */
export function AdminContent({ onNote }: { onNote: (msg: string | null) => void }) {
  const [view, setView] = useState<"pages" | "tracking">("pages");
  return (
    <div className="mt-4">
      <div className="flex gap-4 text-sm">
        <button type="button" className={view === "pages" ? "text-ink underline" : "text-muted hover:text-ink"} onClick={() => setView("pages")}>
          Guides, reports, and pages
        </button>
        <button type="button" className={view === "tracking" ? "text-ink underline" : "text-muted hover:text-ink"} onClick={() => setView("tracking")}>
          AI answer check and listings
        </button>
      </div>
      {view === "pages" ? <Editor onNote={onNote} /> : <Tracking onNote={onNote} />}
    </div>
  );
}
