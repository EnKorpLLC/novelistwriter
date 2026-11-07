"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PRINT_SIZES, TRIM_SIZES, normalizeDetails, normalizeFormat, type FormatSettings } from "@/lib/book/format";
import { buildBook, type BookExtras, type ChapterInput, type MatterInput } from "@/lib/book/model";
import { getStyle } from "@/lib/book/styles";
import { TRIM_INCHES, estimatePages, kdpGutter, printMargins, renderPrintDocument } from "@/lib/book/print";
import { printChecklist } from "@/lib/kdp-checklist";

const SAMPLE_CHAPTERS = 3;

type Status =
  | { doc: string; state: "layout"; pages: number }
  | { doc: string; state: "done"; pages: number }
  | { doc: string; state: "error"; message: string };

type PrintMessage = { type?: string; pages?: number; message?: string };

export function PrintStudio(props: {
  projectId: string;
  title: string;
  subtitle: string;
  authorName: string;
  formatSettings: unknown;
  bookDetails: unknown;
  migrationNeeded: boolean;
  chapters: (ChapterInput & { word_count?: number | null })[];
  matter: MatterInput[];
  extras: BookExtras;
  pro: boolean;
  /** Box sets lay out several projects at once, so they don't save settings to any one of them */
  persist?: boolean;
  backHref?: string;
  backLabel?: string;
}) {
  const persist = props.persist !== false;
  const backHref = props.backHref || `/project/${props.projectId}?tab=format`;
  const initial = useMemo(() => normalizeFormat(props.formatSettings), [props.formatSettings]);
  // The saved page count lives apart from the layout settings so saving it doesn't trigger another layout
  const [format, setFormat] = useState<FormatSettings>(() => ({ ...initial, lastPageCount: null }));
  const [savedPages, setSavedPages] = useState<number | null>(initial.lastPageCount);
  const [gutterPages, setGutterPages] = useState<number | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [view, setView] = useState<"spread" | "single">("spread");
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [guides, setGuides] = useState(false);
  const [chromium, setChromium] = useState(true);
  const [frameLoads, setFrameLoads] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const passes = useRef(0);

  const sample = !props.pro;
  const details = useMemo(() => normalizeDetails(props.bookDetails), [props.bookDetails]);
  const style = getStyle(format.style);
  const words = useMemo(() => props.chapters.reduce((n, c) => n + (c.word_count || 0), 0), [props.chapters]);

  const book = useMemo(
    () =>
      buildBook({
        title: props.title,
        subtitle: props.subtitle,
        author: props.authorName,
        details,
        format,
        styleHeadingFormat: style.headingFormat,
        chapters: sample ? props.chapters.slice(0, SAMPLE_CHAPTERS) : props.chapters,
        matter: props.matter,
        extras: props.extras,
      }),
    [props.title, props.subtitle, props.authorName, props.chapters, props.matter, props.extras, details, format, style.headingFormat, sample]
  );

  const layoutPages = gutterPages ?? savedPages ?? estimatePages(book, words);
  const margins = useMemo(() => printMargins(format.trim, layoutPages), [format.trim, layoutPages]);
  const doc = useMemo(
    () => renderPrintDocument({ book, style, margins, recordUrl: props.extras.recordUrl }),
    [book, style, margins, props.extras.recordUrl]
  );
  const docRef = useRef(doc);
  docRef.current = doc;
  const current = status && status.doc === doc ? status : ({ doc, state: "layout", pages: 0 } as Status);

  useEffect(() => {
    setChromium(/Chrome\/|Edg\//.test(navigator.userAgent) && !/OPR\/|Firefox\//.test(navigator.userAgent));
  }, []);

  async function saveFormat(patch: Partial<FormatSettings>) {
    if (!persist) return;
    const res = await fetch(`/api/projects/${props.projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format_settings: patch }),
    });
    if (!res.ok) setNote((await res.json().catch(() => ({}))).error || "Could not save");
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const msg = (e.data || {}) as PrintMessage;
      const forDoc = docRef.current;
      if (msg.type === "nw-print-progress") {
        setStatus({ doc: forDoc, state: "layout", pages: Number(msg.pages) || 0 });
      } else if (msg.type === "nw-print-error") {
        setStatus({ doc: forDoc, state: "error", message: msg.message || "Layout failed" });
      } else if (msg.type === "nw-print-done") {
        const pages = Number(msg.pages) || 0;
        // KDP's gutter depends on the page count; lay out again if the count crossed into another band
        if (kdpGutter(pages) !== kdpGutter(layoutPages) && passes.current < 2) {
          passes.current += 1;
          setGutterPages(pages);
          return;
        }
        passes.current = 0;
        setStatus({ doc: forDoc, state: "done", pages });
        if (!sample && pages !== savedPages) {
          setSavedPages(pages);
          void saveFormat({ lastPageCount: pages });
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  });

  const trimWidth = TRIM_INCHES[format.trim].w;
  useEffect(() => {
    function apply() {
      const frame = frameRef.current;
      const root = frame?.contentDocument?.documentElement;
      if (!frame || !root) return;
      const across = (view === "spread" ? 2 : 1) * trimWidth * 96;
      const scale = zoom === "fit" ? Math.min(1.25, Math.max(0.3, (frame.clientWidth - 48) / across)) : zoom;
      root.classList.toggle("nw-single", view === "single");
      root.classList.toggle("nw-guides", guides);
      root.style.setProperty("--nw-zoom", String(Math.round(scale * 100) / 100));
    }
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [view, guides, zoom, trimWidth, current.state, frameLoads]);

  function update(patch: Partial<FormatSettings>) {
    const next = { ...format, ...patch };
    passes.current = 0;
    setFormat(next);
    setNote(null);
    void saveFormat(patch);
  }

  const checks =
    current.state === "done" && !sample
      ? printChecklist({
          pages: current.pages,
          format,
          hasTitlePage: book.front.some((s) => s.special === "title"),
          hasCopyright: book.front.some((s) => s.kind === "front_copyright"),
          isbnPrint: details.isbnPrint,
        })
      : [];

  const select = "mt-1 block w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink";

  return (
    <div className="font-ui flex h-screen flex-col bg-paper">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={backHref} className="text-accent hover:underline">
            ← {props.backLabel || "Format"}
          </Link>
          <span className="truncate font-display text-lg text-ink">{props.title}</span>
          <span className="text-muted">Print layout</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-muted">
            {current.state === "layout"
              ? `Laying out pages${current.pages ? `… ${current.pages}` : "…"}`
              : current.state === "done"
                ? `${current.pages} pages${sample ? " (sample)" : ""}`
                : "Layout failed"}
          </span>
          <button type="button" className={view === "spread" ? "text-ink underline" : "text-muted"} onClick={() => setView("spread")}>
            Spreads
          </button>
          <button type="button" className={view === "single" ? "text-ink underline" : "text-muted"} onClick={() => setView("single")}>
            Single pages
          </button>
          <select
            value={zoom}
            onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))}
            className="border border-line bg-paper px-1.5 py-1"
          >
            <option value="fit">Fit</option>
            {[0.5, 0.65, 0.8, 1, 1.25].map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-muted">
            <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />
            Margin guides
          </label>
          <button
            type="button"
            disabled={sample || current.state !== "done"}
            onClick={() => frameRef.current?.contentWindow?.print()}
            className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50"
          >
            Save as PDF
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <iframe
          ref={frameRef}
          title="Print layout"
          srcDoc={doc}
          onLoad={() => setFrameLoads((n) => n + 1)}
          className="min-w-0 flex-1 border-0 bg-[#d9d6d0]" />

        <aside className="w-80 shrink-0 space-y-5 overflow-y-auto border-l border-line p-4 text-sm">
          {props.migrationNeeded && (
            <p className="text-danger">Database needs an update. Run supabase/migration_formatting.sql in the Supabase SQL editor.</p>
          )}
          {note && <p className="text-danger">{note}</p>}
          {current.state === "error" && <p className="text-danger">The layout stopped: {current.message}</p>}

          {sample && (
            <div className="border border-accent/40 bg-accent/5 p-3">
              <p className="text-ink">You&apos;re seeing the first {SAMPLE_CHAPTERS} chapters.</p>
              <p className="mt-1 text-xs text-muted">
                Print-ready paperback PDFs of your whole book are part of Pro and Studio, with margins set for KDP and a
                checklist before you upload.
              </p>
              <a href="/billing" className="mt-2 inline-block bg-accent px-3 py-1.5 text-xs text-paper">
                Get Pro
              </a>
            </div>
          )}

          <section>
            <h2 className="font-display text-lg">Paperback settings</h2>
            <p className="mt-1 text-xs text-muted">
              Style: {style.name}.{" "}
              <Link href={backHref} className="text-accent underline">
                Change it in {props.backLabel || "Format"}
              </Link>
            </p>
            <label className="mt-3 block text-xs text-muted">
              Trim size
              <select value={format.trim} onChange={(e) => update({ trim: e.target.value as FormatSettings["trim"] })} className={select}>
                {TRIM_SIZES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-xs text-muted">
              Text size
              <select
                value={format.printSize}
                onChange={(e) => update({ printSize: e.target.value as FormatSettings["printSize"] })}
                className={select}
              >
                {PRINT_SIZES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-xs text-muted">
              Paper
              <select value={format.paper} onChange={(e) => update({ paper: e.target.value as FormatSettings["paper"] })} className={select}>
                <option value="cream">Cream (most fiction)</option>
                <option value="white">White</option>
              </select>
            </label>
            <label className="mt-3 flex items-center gap-2">
              <input type="checkbox" checked={format.chapterStartRight} onChange={(e) => update({ chapterStartRight: e.target.checked })} />
              Start chapters on right-hand pages
            </label>
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" checked={format.runningHeads} onChange={(e) => update({ runningHeads: e.target.checked })} />
              Author and title at the top of pages
            </label>
            <p className="mt-3 text-xs text-muted">
              Margins: {margins.inside}&quot; inside, {margins.outside}&quot; outside, {margins.top}&quot; top, {margins.bottom}&quot;
              bottom. The inside margin grows with the page count, following KDP&apos;s rules.
            </p>
          </section>

          {checks.length > 0 && (
            <section>
              <h2 className="font-display text-lg">Before you upload</h2>
              <ul className="mt-2 space-y-2">
                {checks.map((c) => (
                  <li key={c.id} className="flex items-start gap-2">
                    <span className={c.ok ? "text-accent" : c.ok === false ? "text-danger" : "text-muted"}>
                      {c.ok ? "✓" : c.ok === false ? "✗" : "○"}
                    </span>
                    <span>
                      {c.label}
                      {c.detail && <span className="block text-xs text-muted">{c.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="font-display text-lg">Saving the PDF</h2>
            {!chromium && (
              <p className="mt-1 text-xs text-danger">Use Chrome or Edge for this step. Other browsers can change the page size.</p>
            )}
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted">
              <li>Wait for the page count to stop changing, then click Save as PDF.</li>
              <li>Destination: Save as PDF.</li>
              <li>Margins: Default. Scale: 100. Turn off Headers and footers.</li>
              <li>Save, then upload the file to KDP as your manuscript with &ldquo;No bleed&rdquo;.</li>
              <li>Check it in KDP&apos;s print previewer before you publish.</li>
            </ol>
            {!sample && persist && current.state === "done" && (
              <p className="mt-2 text-xs text-muted">
                The page count ({current.pages}) is saved for the cover calculator.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
