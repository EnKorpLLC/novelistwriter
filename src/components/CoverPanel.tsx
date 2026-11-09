"use client";

import { useEffect, useMemo, useState } from "react";
import { coverPublicUrl } from "@/lib/cover";
import { TRIM_SIZES, normalizeFormat, type FormatSettings } from "@/lib/book/format";
import { checkEbookCover, coverWrap, type CoverWrap, type EbookCoverCheck } from "@/lib/book/cover-math";
import { downloadBlob, loadImage, prepareCoverUpload, templatePdf, templatePng } from "@/lib/book/cover-template";
import { getStyle } from "@/lib/book/styles";
import { MarketingImages } from "@/components/MarketingImages";

const MAX_UPLOAD = 5 * 1024 * 1024;

function WrapDiagram({ wrap }: { wrap: CoverWrap }) {
  const s = 40;
  const R = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x * s, y: r.y * s, width: r.w * s, height: r.h * s });
  return (
    <svg viewBox={`0 0 ${wrap.width * s} ${wrap.height * s}`} className="w-full border border-line bg-white" role="img" aria-label="Cover wrap layout">
      <rect x={0} y={0} width={wrap.width * s} height={wrap.height * s} fill="rgba(220,70,70,0.16)" />
      <rect x={wrap.bleed * s} y={wrap.bleed * s} width={(wrap.width - 2 * wrap.bleed) * s} height={(wrap.height - 2 * wrap.bleed) * s} fill="#fff" stroke="#000" strokeWidth={1} />
      <rect {...R(wrap.spineRect)} fill="rgba(60,90,160,0.1)" stroke="#000" strokeWidth={1} />
      <rect {...R(wrap.barcode)} fill="rgba(0,0,0,0.12)" />
      {[wrap.backSafe, wrap.frontSafe, ...(wrap.spineSafe ? [wrap.spineSafe] : [])].map((r, i) => (
        <rect key={i} {...R(r)} fill="none" stroke="#2f5fb3" strokeDasharray="5 4" strokeWidth={1} />
      ))}
      <text x={(wrap.back.x + wrap.back.w / 2) * s} y={(wrap.trim.h / 2 + wrap.bleed) * s} textAnchor="middle" fontSize={14} fill="#666">
        Back
      </text>
      <text x={(wrap.front.x + wrap.front.w / 2) * s} y={(wrap.trim.h / 2 + wrap.bleed) * s} textAnchor="middle" fontSize={14} fill="#666">
        Front
      </text>
      <text x={(wrap.barcode.x + wrap.barcode.w / 2) * s} y={(wrap.barcode.y + wrap.barcode.h / 2) * s + 4} textAnchor="middle" fontSize={10} fill="#555">
        Barcode
      </text>
    </svg>
  );
}

export function CoverPanel({
  projectId,
  coverPath,
  onCoverChange,
  book,
}: {
  projectId: string;
  coverPath: string | null;
  onCoverChange: (path: string | null, version?: number) => void;
  book: { title: string; tagline: string; published: boolean; releaseDate: string | null };
}) {
  const [format, setFormat] = useState<FormatSettings>(() => normalizeFormat(null));
  const [pro, setPro] = useState<boolean | null>(null);
  const [authorName, setAuthorName] = useState("");
  const [pagesInput, setPagesInput] = useState("");
  const [version, setVersion] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [checks, setChecks] = useState<EbookCoverCheck[]>([]);
  const [downloading, setDownloading] = useState<"png" | "pdf" | null>(null);
  const coverUrl = coverPath ? coverPublicUrl(coverPath, version) : null;

  useEffect(() => {
    void fetch(`/api/projects/${projectId}/format`)
      .then(async (r) => {
        if (!r.ok) return;
        const json = await r.json();
        const f = normalizeFormat(json.formatSettings);
        setFormat(f);
        setAuthorName(json.authorName || "");
        setPro(Boolean(json.pro));
        if (f.lastPageCount) setPagesInput(String(f.lastPageCount));
      })
      .catch(() => null);
  }, [projectId]);

  useEffect(() => {
    if (!coverUrl) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const type = /\.png$/i.test(coverPath || "") ? "image/png" : /\.webp$/i.test(coverPath || "") ? "image/webp" : "image/jpeg";
      setChecks(checkEbookCover({ width: img.naturalWidth, height: img.naturalHeight, type }));
    };
    img.src = coverUrl;
    return () => {
      cancelled = true;
    };
  }, [coverUrl, coverPath]);

  async function saveFormat(patch: Partial<FormatSettings>) {
    setFormat((f) => ({ ...f, ...patch }));
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format_settings: patch }),
    });
    if (!res.ok) setNote((await res.json().catch(() => ({}))).error || "Could not save");
  }

  async function upload(file: File) {
    setBusy(true);
    setNote(null);
    try {
      const ready = await prepareCoverUpload(file, MAX_UPLOAD);
      const img = await loadImage(ready);
      const pending = checkEbookCover({ width: img.naturalWidth, height: img.naturalHeight, type: ready.type, bytes: ready.size });
      URL.revokeObjectURL(img.src);
      const fd = new FormData();
      fd.append("file", ready);
      const res = await fetch(`/api/projects/${projectId}/cover`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error || "Cover upload failed");
        return;
      }
      setChecks(pending);
      setVersion(data.version ?? Date.now());
      onCoverChange(data.path, data.version);
      if (ready !== file) setNote("Converted to JPEG for the stores.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Cover upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove this book's cover image?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/cover`, { method: "DELETE" });
      if (!res.ok) {
        setNote((await res.json().catch(() => ({}))).error || "Could not remove the cover");
        return;
      }
      setChecks([]);
      onCoverChange(null);
      setVersion(Date.now());
    } finally {
      setBusy(false);
    }
  }

  const pages = Number(pagesInput);
  const wrap = useMemo(
    () => (pages > 0 ? coverWrap({ trim: format.trim, pages, paper: format.paper, printer: format.printer }) : null),
    [pages, format.trim, format.paper, format.printer]
  );

  async function download(kind: "png" | "pdf") {
    if (!wrap) return;
    setDownloading(kind);
    try {
      const name = `cover-template-${format.trim}-${wrap.pages}p`;
      if (kind === "png") downloadBlob(await templatePng(wrap), `${name}.png`);
      else downloadBlob(await templatePdf(wrap), `${name}.pdf`, "application/pdf");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not make the template");
    } finally {
      setDownloading(null);
    }
  }

  const select = "mt-1 block w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink";
  const mark = (ok: boolean | null) => (ok ? "✓" : ok === false ? "✗" : "○");
  const markColor = (ok: boolean | null) => (ok ? "text-accent" : ok === false ? "text-danger" : "text-muted");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="font-ui mx-auto max-w-5xl space-y-8">
          <div>
            <h2 className="font-display text-2xl">Cover</h2>
            <p className="mt-1 text-sm text-muted">
              Check your ebook cover against what the stores expect, and get the exact paperback wrap size, spine width,
              and a template for you or your designer.
            </p>
            {note && <p className="mt-2 text-sm text-ink">{note}</p>}
          </div>

          <section className="border border-accent/50 bg-accent/5 p-4">
            <h3 className="font-display text-lg">Cover builder</h3>
            <p className="mt-1 text-xs text-muted">
              Design the whole cover here: your art, title, author, back cover blurb, and a spine sized to your page count.
              It checks the safe area and print sharpness, then saves your ebook cover and a print-ready paperback PDF.
            </p>
            {coverUrl && (
              <p className="mt-1 text-xs text-muted">
                Already have a finished ebook cover? The builder can start from it, leave its title and author as they are,
                and add just the spine and back.
              </p>
            )}
            <a href={`/project/${projectId}/cover-builder`} className="mt-3 inline-block bg-accent px-4 py-2 text-sm text-paper">
              Open the cover builder
            </a>
            {pro === false && <p className="mt-2 text-[11px] text-muted">Try it free. Uploading art and exporting are part of Pro.</p>}
          </section>

          <section className="border border-line p-4">
            <h3 className="font-display text-lg">Ebook cover</h3>
            <div className="mt-3 flex flex-wrap gap-6">
              <div className="h-60 w-40 shrink-0 overflow-hidden border border-line bg-paper-deep">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt="Cover" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted">No cover yet</div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-3 text-sm">
                <p className="text-xs text-muted">
                  Shows on your projects, launch page, share images, and inside your ebooks. Best at {1600} × {2560} pixels.
                  JPG, PNG, or WebP; we convert to JPEG when that helps.
                </p>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-block cursor-pointer border border-line px-3 py-1.5 text-xs hover:border-accent">
                    {busy ? "Working…" : coverUrl ? "Replace cover" : "Upload cover"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void upload(f);
                      }}
                    />
                  </label>
                  {coverUrl && (
                    <button type="button" disabled={busy} onClick={() => void remove()} className="border border-line px-3 py-1.5 text-xs disabled:opacity-50">
                      Remove
                    </button>
                  )}
                </div>
                {checks.length > 0 && (
                  <ul className="space-y-1.5">
                    {checks.map((c) => (
                      <li key={c.label} className="flex items-start gap-2">
                        <span className={markColor(c.ok)}>{mark(c.ok)}</span>
                        <span>
                          {c.label}
                          {c.detail && <span className="block text-xs text-muted">{c.detail}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section className="border border-line p-4">
            <h3 className="font-display text-lg">Paperback cover size</h3>
            <p className="mt-1 text-xs text-muted">
              A paperback cover wraps around the book: back, spine, and front on one sheet, with extra bleed that gets
              trimmed off. The spine width depends on your page count and paper.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <label className="text-xs text-muted">
                Page count
                <input
                  type="number"
                  min={1}
                  value={pagesInput}
                  onChange={(e) => setPagesInput(e.target.value)}
                  className={select}
                  placeholder="e.g. 312"
                />
              </label>
              <label className="text-xs text-muted">
                Trim size
                <select value={format.trim} onChange={(e) => void saveFormat({ trim: e.target.value as FormatSettings["trim"] })} className={select}>
                  {TRIM_SIZES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted">
                Paper
                <select value={format.paper} onChange={(e) => void saveFormat({ paper: e.target.value as FormatSettings["paper"] })} className={select}>
                  <option value="cream">Cream</option>
                  <option value="white">White</option>
                </select>
              </label>
              <label className="text-xs text-muted">
                Printer
                <select value={format.printer} onChange={(e) => void saveFormat({ printer: e.target.value as FormatSettings["printer"] })} className={select}>
                  <option value="kdp">Amazon KDP</option>
                  <option value="ingram">IngramSpark</option>
                </select>
              </label>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              {format.lastPageCount && String(format.lastPageCount) === pagesInput
                ? "Page count from your last print layout."
                : (
                  <>
                    For the exact count,{" "}
                    <a href={`/project/${projectId}/print`} className="text-accent underline">
                      open the print layout
                    </a>{" "}
                    and it fills in here.
                  </>
                )}
              {" "}Changing the trim size or paper also changes your print layout.
            </p>

            {wrap && (
              <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
                <WrapDiagram wrap={wrap} />
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Spine width</dt>
                    <dd className="text-lg text-ink">{wrap.spine}&quot;</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Full cover, with bleed</dt>
                    <dd className="text-ink">
                      {wrap.width}&quot; × {wrap.height}&quot;
                    </dd>
                    <dd className="text-xs text-muted">
                      {Math.round(wrap.width * 300)} × {Math.round(wrap.height * 300)} pixels at 300 DPI
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Bleed and safe area</dt>
                    <dd className="text-xs text-ink">0.125&quot; bleed on every edge; keep text 0.125&quot; inside the trim</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Spine text</dt>
                    <dd className="text-xs text-ink">{wrap.spineText ? "Allowed" : "Leave the spine blank"}</dd>
                  </div>
                  {wrap.warnings.map((w) => (
                    <p key={w} className="text-xs text-danger">
                      {w}
                    </p>
                  ))}
                </dl>
              </div>
            )}

            <div className="mt-4 border-t border-line pt-4">
              <h4 className="text-sm text-ink">Cover template</h4>
              {pro === false ? (
                <div className="mt-2 text-sm">
                  <p className="text-xs text-muted">
                    Download an exact-size template with the bleed, spine, safe area, and barcode marked, as a PDF and a 300 DPI
                    image. Templates are part of Pro and Studio.
                  </p>
                  <a href="/billing" className="mt-2 inline-block bg-accent px-3 py-1.5 text-xs text-paper">
                    Get Pro
                  </a>
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-xs text-muted">
                    Exact size, with the bleed, spine, safe area, and barcode marked. Design on top of it, then hide the guides
                    before you export.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!wrap || !!downloading || pro === null}
                      onClick={() => void download("pdf")}
                      className="bg-accent px-3 py-1.5 text-xs text-paper disabled:opacity-50"
                    >
                      {downloading === "pdf" ? "Making…" : "Download PDF template"}
                    </button>
                    <button
                      type="button"
                      disabled={!wrap || !!downloading || pro === null}
                      onClick={() => void download("png")}
                      className="border border-line px-3 py-1.5 text-xs disabled:opacity-50"
                    >
                      {downloading === "png" ? "Making…" : "Download image (300 DPI PNG)"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {pro !== null && (
            <MarketingImages
              coverUrl={coverUrl}
              pro={pro}
              title={book.title}
              font={getStyle(format.style).heading}
              defaults={{
                headline: book.tagline || book.title,
                subline: authorName ? `by ${authorName}` : "",
                button: book.published ? "Read it now" : book.releaseDate ? "Preorder now" : "",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
