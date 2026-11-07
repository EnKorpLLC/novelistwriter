"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Chapter, Project } from "@/lib/types";
import {
  HEADING_FORMATS,
  PRINT_SIZES,
  SCENE_BREAKS,
  TRIM_SIZES,
  detectChapterKind,
  normalizeDetails,
  normalizeFormat,
  type BookDetails,
  type ChapterKind,
  type FormatSettings,
} from "@/lib/book/format";
import { BOOK_STYLES, FONTS, bookCss, getStyle } from "@/lib/book/styles";
import { buildBook, type BookExtras } from "@/lib/book/model";
import { renderChapter, renderSection } from "@/lib/book/render";
import { MATTER_TYPES } from "@/lib/matter";
import { MatterEditor } from "@/components/MatterEditor";
import { STORES, type StoreId } from "@/lib/book/stores";

type Matter = { id: string; matter_type: string; title: string; content_html: string; enabled: boolean; sort_order: number };

type Device = "kindle" | "phone" | "tablet";
type Mode = "light" | "sepia" | "dark";

const DEVICES: Record<Device, { label: string; w: number; h: number; font: number; radius: number }> = {
  kindle: { label: "Kindle", w: 300, h: 420, font: 15, radius: 14 },
  phone: { label: "Phone", w: 270, h: 540, font: 15, radius: 28 },
  tablet: { label: "Tablet", w: 440, h: 580, font: 17, radius: 18 },
};

const MODES: Record<Mode, { label: string; bg: string; fg: string }> = {
  light: { label: "Light", bg: "#ffffff", fg: "#1a1a1a" },
  sepia: { label: "Sepia", bg: "#f4ecd8", fg: "#5b4636" },
  dark: { label: "Dark", bg: "#141414", fg: "#d8d4cc" },
};

const DETAIL_FIELDS: { key: keyof BookDetails; label: string; placeholder?: string }[] = [
  { key: "penName", label: "Author name on the book (pen name)", placeholder: "Uses your display name if empty" },
  { key: "seriesName", label: "Series name" },
  { key: "seriesNumber", label: "Book number in series", placeholder: "1" },
  { key: "isbnEbook", label: "Ebook ISBN (optional)" },
  { key: "isbnPrint", label: "Print ISBN (optional)" },
  { key: "imprint", label: "Imprint or publisher name", placeholder: "Optional" },
  { key: "edition", label: "Edition", placeholder: "First edition" },
  { key: "copyrightYear", label: "Copyright year", placeholder: String(new Date().getFullYear()) },
  { key: "copyrightHolder", label: "Copyright holder", placeholder: "Uses the author name if empty" },
];

const KIND_LABEL: Record<ChapterKind, string> = { chapter: "Numbered chapter", unnumbered: "Unnumbered (prologue, epilogue…)", part: "Part divider" };

export function FormatPanel({
  projectId,
  project,
  chapters,
  matter: initialMatter,
}: {
  projectId: string;
  project: Project & { format_settings?: unknown; book_details?: unknown };
  chapters: Chapter[];
  matter: Matter[];
}) {
  const [format, setFormat] = useState<FormatSettings>(() => normalizeFormat(project.format_settings));
  const [details, setDetails] = useState<BookDetails>(() => normalizeDetails(project.book_details));
  const [subtitle, setSubtitle] = useState(project.subtitle || "");
  const [matter, setMatter] = useState<Matter[]>(() => [...initialMatter].sort((a, b) => a.sort_order - b.sort_order));
  const [info, setInfo] = useState<{
    pro: boolean;
    studio?: boolean;
    linkedStores?: StoreId[];
    authorName: string;
    extras: BookExtras;
    migrationNeeded?: boolean;
  } | null>(null);
  const [storePick, setStorePick] = useState<StoreId>("kindle");
  const [note, setNote] = useState<string | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addType, setAddType] = useState("back_acknowledgments");
  const [downloading, setDownloading] = useState(false);
  const [device, setDevice] = useState<Device>("kindle");
  const [mode, setMode] = useState<Mode>("light");
  const [previewTarget, setPreviewTarget] = useState<string>(chapters[0] ? `ch:${chapters[0].id}` : "front:title-page");

  useEffect(() => {
    void fetch(`/api/projects/${projectId}/format`)
      .then(async (r) => {
        if (!r.ok) return;
        const json = await r.json();
        setInfo(json);
        if (json.formatSettings) setFormat(normalizeFormat(json.formatSettings));
        if (json.bookDetails) setDetails(normalizeDetails(json.bookDetails));
        setSubtitle(json.subtitle || "");
        if (Array.isArray(json.matter)) setMatter([...json.matter].sort((a: Matter, b: Matter) => a.sort_order - b.sort_order));
      })
      .catch(() => null);
  }, [projectId]);

  const saveProject = useCallback(
    async (patch: Record<string, unknown>) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      return json;
    },
    [projectId]
  );

  async function updateFormat(patch: Partial<FormatSettings>) {
    const next = { ...format, ...patch };
    setFormat(next);
    setNote(null);
    try {
      await saveProject({ format_settings: patch });
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not save");
    }
  }

  async function saveDetails() {
    setSavingDetails(true);
    setNote(null);
    try {
      await saveProject({ book_details: details, subtitle });
      setNote("Book details saved.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSavingDetails(false);
    }
  }

  async function patchMatter(id: string, patch: Partial<Matter>) {
    setMatter((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    const res = await fetch(`/api/matter/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) setNote((await res.json().catch(() => ({}))).error || "Could not save the page");
  }

  async function moveMatter(id: string, dir: -1 | 1) {
    const m = matter.find((x) => x.id === id);
    if (!m) return;
    const side = m.matter_type.startsWith("front_") ? "front_" : "back_";
    const group = matter.filter((x) => x.matter_type.startsWith(side));
    const idx = group.findIndex((x) => x.id === id);
    const swap = group[idx + dir];
    if (!swap) return;
    const reordered = [...group];
    [reordered[idx], reordered[idx + dir]] = [reordered[idx + dir], reordered[idx]];
    const others = matter.filter((x) => !x.matter_type.startsWith(side));
    const front = side === "front_" ? reordered : others.filter((x) => x.matter_type.startsWith("front_"));
    const back = side === "back_" ? reordered : others.filter((x) => x.matter_type.startsWith("back_"));
    const next = [...front, ...back].map((x, i) => ({ ...x, sort_order: i }));
    setMatter(next);
    await fetch(`/api/projects/${projectId}/matter`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((x) => x.id) }),
    });
  }

  async function addMatter() {
    setNote(null);
    const res = await fetch(`/api/projects/${projectId}/matter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matter_type: addType }),
    });
    const json = await res.json();
    if (!res.ok) {
      setNote(json.error || "Could not add the page");
      return;
    }
    setMatter((list) => [...list, json.matter].sort((a, b) => a.sort_order - b.sort_order));
    setEditingId(json.matter.id);
  }

  async function deleteMatter(m: Matter) {
    if (!window.confirm(`Delete the "${m.title}" page?`)) return;
    setMatter((list) => list.filter((x) => x.id !== m.id));
    await fetch(`/api/matter/${m.id}`, { method: "DELETE" });
  }

  async function downloadEpub(store?: StoreId | "all") {
    setDownloading(true);
    setNote(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/format`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(store ? { store } : {}),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not build the ebook");
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || (store === "all" ? "ebooks.zip" : "book.epub");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not build the ebook");
    } finally {
      setDownloading(false);
    }
  }

  const style = getStyle(format.style);
  const book = useMemo(
    () =>
      buildBook({
        title: project.title || "Untitled",
        subtitle,
        author: info?.authorName || "Author",
        details,
        format,
        styleHeadingFormat: style.headingFormat,
        chapters,
        matter,
        extras: info?.extras,
      }),
    [project.title, subtitle, info, details, format, style.headingFormat, chapters, matter]
  );

  const previewHtml = useMemo(() => {
    const [kind, id] = previewTarget.split(":");
    let body = "";
    if (kind === "ch") {
      const ch = book.chapters.find((c) => c.id === id) || book.chapters[0];
      if (ch) body = renderChapter(ch, book, style);
    } else {
      const s = [...book.front, ...book.back].find((x) => x.id === id);
      if (s) body = renderSection(s, book, style, { recordUrl: info?.extras?.recordUrl });
    }
    const m = MODES[mode];
    return `<!doctype html><html><head><meta charset="utf-8"><style>${bookCss(style, "preview")}
html,body{background:${m.bg};color:${m.fg};font-size:${DEVICES[device].font}px}
body{padding:18px 16px 40px}
a{color:inherit}
</style></head><body>${body || "<p>Nothing to show yet.</p>"}</body></html>`;
  }, [previewTarget, book, style, mode, device, info]);

  const previewOptions = [
    ...book.front.map((s) => ({ value: `front:${s.id}`, label: `Front: ${s.title}` })),
    ...book.chapters.map((c) => ({ value: `ch:${c.id}`, label: c.tocLabel })),
    ...book.back.map((s) => ({ value: `back:${s.id}`, label: `Back: ${s.title}` })),
  ];

  const front = matter.filter((m) => m.matter_type.startsWith("front_"));
  const back = matter.filter((m) => m.matter_type.startsWith("back_"));
  const autoNote = (type: string) => MATTER_TYPES.find((t) => t.type === type)?.auto;

  const matterList = (list: Matter[]) => (
    <ul className="space-y-2">
      {list.map((m, i) => (
        <li key={m.id} className="border border-line p-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={m.enabled} onChange={(e) => void patchMatter(m.id, { enabled: e.target.checked })} />
              <input
                value={m.title}
                onChange={(e) => setMatter((l) => l.map((x) => (x.id === m.id ? { ...x, title: e.target.value } : x)))}
                onBlur={(e) => void patchMatter(m.id, { title: e.target.value })}
                className="w-48 border-b border-transparent bg-transparent focus:border-line focus:outline-none"
              />
            </label>
            <span className="flex gap-2 text-xs">
              <button type="button" disabled={i === 0} className="text-muted disabled:opacity-30" onClick={() => void moveMatter(m.id, -1)} aria-label="Move up">
                ↑
              </button>
              <button type="button" disabled={i === list.length - 1} className="text-muted disabled:opacity-30" onClick={() => void moveMatter(m.id, 1)} aria-label="Move down">
                ↓
              </button>
              {m.matter_type !== "front_toc" && (
                <button type="button" className="text-accent hover:underline" onClick={() => setEditingId(editingId === m.id ? null : m.id)}>
                  {editingId === m.id ? "Close" : "Edit"}
                </button>
              )}
              <button type="button" className="text-danger hover:underline" onClick={() => void deleteMatter(m)}>
                Delete
              </button>
            </span>
          </div>
          {autoNote(m.matter_type) && <p className="mt-1 text-[11px] text-muted">{autoNote(m.matter_type)}.</p>}
          {editingId === m.id && (
            <div className="mt-2">
              <MatterEditor
                initialHtml={m.content_html}
                onCancel={() => setEditingId(null)}
                onSave={async (html) => {
                  await patchMatter(m.id, { content_html: html });
                  setEditingId(null);
                }}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="font-ui mx-auto max-w-6xl space-y-8">
          <div>
            <h2 className="font-display text-2xl">Format</h2>
            <p className="mt-1 text-sm text-muted">
              Choose a book style, set up your title, copyright, and back pages, preview it on devices, and download a
              polished ebook for Kindle, Apple Books, Kobo, and other stores, plus a print-ready paperback PDF.
            </p>
            {info?.migrationNeeded && (
              <p className="mt-2 text-sm text-danger">
                Database needs an update. Run supabase/migration_formatting.sql in the Supabase SQL editor.
              </p>
            )}
            {note && <p className="mt-2 text-sm text-ink">{note}</p>}
          </div>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-8">
              <section className="border border-line p-4">
                <h3 className="font-display text-lg">Book style</h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {BOOK_STYLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => void updateFormat({ style: s.id })}
                      className={`border p-3 text-left ${format.style === s.id ? "border-accent bg-accent/5" : "border-line hover:border-ink/30"}`}
                    >
                      <span className="block text-sm text-ink" style={{ fontFamily: `"${FONTS[s.heading].family}", Georgia, serif` }}>
                        {s.name}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted">{s.feel}</span>
                      <span className="mt-1 block text-[10px] text-muted">
                        {FONTS[s.body].family} · {FONTS[s.heading].family} headings
                      </span>
                    </button>
                  ))}
                </div>
                <style>{BOOK_STYLES.map((s) => `@font-face{font-family:"${FONTS[s.heading].family}";src:url("${FONTS[s.heading].regular}");font-weight:300 800;}`).join("")}</style>
              </section>

              <section className="border border-line p-4">
                <h3 className="font-display text-lg">Chapter openings</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-muted">
                    Chapter heading
                    <select
                      value={format.headingFormat || ""}
                      onChange={(e) => void updateFormat({ headingFormat: (e.target.value || null) as FormatSettings["headingFormat"] })}
                      className="mt-1 block w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink"
                    >
                      <option value="">Style default ({HEADING_FORMATS.find((h) => h.id === style.headingFormat)?.label})</option>
                      {HEADING_FORMATS.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-muted">
                    First paragraph
                    <select
                      value={format.firstLine}
                      onChange={(e) => void updateFormat({ firstLine: e.target.value as FormatSettings["firstLine"] })}
                      className="mt-1 block w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink"
                    >
                      <option value="style">Style default ({style.firstLine === "dropcap" ? "drop cap" : style.firstLine === "smallcaps" ? "small capitals" : "plain"})</option>
                      <option value="dropcap">Drop cap</option>
                      <option value="smallcaps">Small capitals on the first words</option>
                      <option value="none">Plain</option>
                    </select>
                  </label>
                  <label className="text-xs text-muted">
                    Scene break
                    <select
                      value={format.sceneBreak || ""}
                      onChange={(e) => void updateFormat({ sceneBreak: e.target.value || null })}
                      className="mt-1 block w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink"
                    >
                      <option value="">Style default ({style.ornament})</option>
                      {SCENE_BREAKS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-5 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={format.showChapterTitles} onChange={(e) => void updateFormat({ showChapterTitles: e.target.checked })} />
                    Show chapter titles
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  Scene breaks come from a line with just * * *, ⁂, #, or a divider in your chapters.
                </p>
              </section>

              <section className="border border-line p-4">
                <h3 className="font-display text-lg">Chapters, parts, and prologues</h3>
                <p className="mt-1 text-xs text-muted">
                  Prologues, epilogues, and interludes aren&apos;t numbered, and &ldquo;Part One&rdquo; becomes a divider page.
                  We detect these from titles; change any that are wrong.
                </p>
                <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
                  {book.chapters.map((c) => {
                    const src = chapters.find((x) => x.id === c.id);
                    const auto = detectChapterKind(src?.title || "");
                    return (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 py-1 text-sm">
                        <span className="min-w-0 truncate text-ink" title={src?.title}>
                          {c.tocLabel}
                        </span>
                        <select
                          value={format.chapterKinds[c.id] || ""}
                          onChange={(e) => {
                            const kinds = { ...format.chapterKinds };
                            if (e.target.value) kinds[c.id] = e.target.value as ChapterKind;
                            else delete kinds[c.id];
                            void updateFormat({ chapterKinds: kinds });
                          }}
                          className="border border-line bg-paper px-1.5 py-1 text-xs"
                        >
                          <option value="">Auto: {KIND_LABEL[auto]}</option>
                          {(Object.keys(KIND_LABEL) as ChapterKind[]).map((k) => (
                            <option key={k} value={k}>
                              {KIND_LABEL[k]}
                            </option>
                          ))}
                        </select>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="border border-line p-4">
                <h3 className="font-display text-lg">Book details</h3>
                <p className="mt-1 text-xs text-muted">Used on the title page, copyright page, and in the ebook&apos;s store information.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-muted sm:col-span-2">
                    Subtitle
                    <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="mt-1 block w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink" />
                  </label>
                  {DETAIL_FIELDS.map((f) => (
                    <label key={f.key} className="text-xs text-muted">
                      {f.label}
                      <input
                        value={String(details[f.key] ?? "")}
                        placeholder={f.placeholder}
                        onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))}
                        className="mt-1 block w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink"
                      />
                    </label>
                  ))}
                </div>
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={details.humanStatement}
                    onChange={(e) => setDetails((d) => ({ ...d, humanStatement: e.target.checked }))}
                  />
                  <span>
                    Add &ldquo;Written by a human in Novelist Writer&rdquo; to the copyright page
                    <span className="block text-xs text-muted">Links to your public writing record when it&apos;s published.</span>
                  </span>
                </label>
                <button
                  type="button"
                  disabled={savingDetails}
                  onClick={() => void saveDetails()}
                  className="mt-3 bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50"
                >
                  {savingDetails ? "Saving…" : "Save book details"}
                </button>
              </section>

              <section className="border border-line p-4">
                <h3 className="font-display text-lg">Front and back pages</h3>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={format.titlePage} onChange={(e) => void updateFormat({ titlePage: e.target.checked })} />
                    Title page
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={format.autoCopyright} onChange={(e) => void updateFormat({ autoCopyright: e.target.checked })} />
                    Build the copyright page for me
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={format.autoAlsoBy} onChange={(e) => void updateFormat({ autoAlsoBy: e.target.checked })} />
                    Build &ldquo;Also by&rdquo; from my other books
                  </label>
                </div>
                <h4 className="mt-4 text-xs uppercase tracking-wide text-muted">Front</h4>
                <div className="mt-2">{matterList(front)}</div>
                <h4 className="mt-4 text-xs uppercase tracking-wide text-muted">Back</h4>
                <div className="mt-2">{matterList(back)}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <select value={addType} onChange={(e) => setAddType(e.target.value)} className="border border-line bg-paper px-2 py-1.5 text-sm">
                    {MATTER_TYPES.filter((t) => t.type !== "front_toc").map((t) => (
                      <option key={t.type} value={t.type}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => void addMatter()} className="border border-line px-3 py-1.5 text-accent">
                    Add page
                  </button>
                </div>
              </section>
            </div>

            <div className="lg:sticky lg:top-0 lg:self-start">
              <section className="border border-line p-4">
                <h3 className="font-display text-lg">Preview</h3>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {(Object.keys(DEVICES) as Device[]).map((d) => (
                    <button key={d} type="button" onClick={() => setDevice(d)} className={device === d ? "text-ink underline" : "text-muted hover:text-ink"}>
                      {DEVICES[d].label}
                    </button>
                  ))}
                  <span className="text-line">|</span>
                  {(Object.keys(MODES) as Mode[]).map((m) => (
                    <button key={m} type="button" onClick={() => setMode(m)} className={mode === m ? "text-ink underline" : "text-muted hover:text-ink"}>
                      {MODES[m].label}
                    </button>
                  ))}
                </div>
                <select
                  value={previewTarget}
                  onChange={(e) => setPreviewTarget(e.target.value)}
                  className="mt-2 block w-full border border-line bg-paper px-2 py-1.5 text-xs"
                >
                  {previewOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <div
                  className="mx-auto mt-3 border-[10px] border-ink/85 shadow-lg"
                  style={{ width: DEVICES[device].w + 20, borderRadius: DEVICES[device].radius }}
                >
                  <iframe
                    title="Book preview"
                    srcDoc={previewHtml}
                    sandbox="allow-same-origin"
                    style={{ width: DEVICES[device].w, height: DEVICES[device].h, display: "block", border: 0, borderRadius: DEVICES[device].radius - 8 }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  Readers can change the font and size on their device; headings and openings keep your style.
                </p>
              </section>

              <section className="mt-4 border border-line p-4">
                <h3 className="font-display text-lg">Download</h3>
                {info && !info.pro ? (
                  <div className="mt-2 text-sm">
                    <p className="text-ink">Styled ebooks are part of Pro and Studio.</p>
                    <p className="mt-1 text-xs text-muted">
                      You can set everything up and preview it now. A basic DOCX and EPUB are always in the Tools tab.
                    </p>
                    <a href="/billing" className="mt-3 inline-block bg-accent px-4 py-2 text-xs text-paper">
                      Get Pro
                    </a>
                  </div>
                ) : (
                  <div className="mt-2">
                    <button
                      type="button"
                      disabled={downloading || !info}
                      onClick={() => void downloadEpub()}
                      className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50"
                    >
                      {downloading ? "Building…" : "Download ebook (EPUB)"}
                    </button>
                    <p className="mt-2 text-[11px] text-muted">
                      Upload it to Kindle Direct Publishing, Apple Books, Kobo, Barnes &amp; Noble, and Google Play.
                    </p>
                  </div>
                )}
              </section>

              <section className="mt-4 border border-line p-4">
                <h3 className="font-display text-lg">An ebook for each store</h3>
                <p className="mt-1 text-xs text-muted">
                  Stores don&apos;t like ebooks that send readers to rival stores. Each build points your review request and
                  &ldquo;Also by&rdquo; links at that store only, using the buy links on your Launch tab.
                </p>
                {info && !info.studio ? (
                  <div className="mt-2 text-sm">
                    <p className="text-xs text-ink">Per-store ebooks are part of Studio.</p>
                    <a href="/billing" className="mt-2 inline-block bg-accent px-3 py-1.5 text-xs text-paper">
                      Get Studio
                    </a>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <select value={storePick} onChange={(e) => setStorePick(e.target.value as StoreId)} className="border border-line bg-paper px-2 py-1.5 text-xs">
                        {STORES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                            {s.id !== "generic" && info?.linkedStores && !info.linkedStores.includes(s.id) ? " (no link yet)" : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={downloading || !info}
                        onClick={() => void downloadEpub(storePick)}
                        className="border border-accent px-3 py-1.5 text-xs text-accent disabled:opacity-50"
                      >
                        Download
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={downloading || !info}
                      onClick={() => void downloadEpub("all")}
                      className="text-xs text-accent underline disabled:opacity-50"
                    >
                      Download every store as a zip
                    </button>
                    <p className="text-[11px] text-muted">
                      Without a link for a store, &ldquo;Also by&rdquo; uses your launch pages and the review page is left out.
                    </p>
                  </div>
                )}
              </section>

              <section className="mt-4 border border-line p-4">
                <h3 className="font-display text-lg">Paperback</h3>
                <p className="mt-1 text-xs text-muted">
                  Lay out your book as printed pages in this style, with page numbers, running heads, and margins set for KDP,
                  then save a print-ready PDF.
                </p>
                <p className="mt-2 text-xs text-ink">
                  {TRIM_SIZES.find((t) => t.id === format.trim)?.label} · {PRINT_SIZES.find((p) => p.id === format.printSize)?.label}
                  {format.lastPageCount ? ` · ${format.lastPageCount} pages` : ""}
                </p>
                <a href={`/project/${projectId}/print`} className="mt-3 inline-block border border-accent px-4 py-2 text-sm text-accent">
                  Open print layout
                </a>
                {info && !info.pro && <p className="mt-2 text-[11px] text-muted">Free plans see the first chapters. Full PDFs are on Pro.</p>}
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
