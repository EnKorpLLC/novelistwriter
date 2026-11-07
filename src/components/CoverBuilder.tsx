"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { coverPublicUrl } from "@/lib/cover";
import { normalizeFormat, TRIM_SIZES } from "@/lib/book/format";
import { FONTS, type FontId } from "@/lib/book/styles";
import { TRIM_INCHES } from "@/lib/book/print";
import { coverWrap, type Rect } from "@/lib/book/cover-math";
import {
  MAX_LAYERS,
  ROLE_LABEL,
  artPlacement,
  coverIssues,
  defaultDesign,
  drawCover,
  loadCoverFonts,
  newLayerId,
  normalizeCoverDesign,
  panelRect,
  snapLayer,
  textLayer,
  type CoverDesign,
  type Fill,
  type ImageLayer,
  type Layer,
  type LayerBox,
  type Panel,
  type TextLayer,
} from "@/lib/book/cover-design";
import { canvasBlob, downloadBlob, loadImage, prepareCoverUpload } from "@/lib/book/cover-template";

type BookInfo = { title: string; subtitle: string; author: string; series: string; blurb: string; heading: FontId; body: FontId };

const MAX_ART_BYTES = 20 * 1024 * 1024;
const PANELS: { id: Panel; label: string }[] = [
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
  { id: "spine", label: "Spine" },
];

export function CoverBuilder({
  projectId,
  userId,
  book,
  formatSettings,
  savedDesign,
  migrationNeeded,
  pro,
}: {
  projectId: string;
  userId: string;
  book: BookInfo;
  formatSettings: unknown;
  savedDesign: unknown;
  migrationNeeded: boolean;
  pro: boolean;
}) {
  const format = useMemo(() => normalizeFormat(formatSettings), [formatSettings]);
  const [pagesInput, setPagesInput] = useState(format.lastPageCount ? String(format.lastPageCount) : "");
  const pages = Number(pagesInput) > 0 ? Number(pagesInput) : 300;
  const wrap = useMemo(
    () => coverWrap({ trim: format.trim, pages, paper: format.paper, printer: format.printer }),
    [format.trim, format.paper, format.printer, pages]
  );
  const makeDefault = useCallback(() => defaultDesign({ ...book, trimWidth: TRIM_INCHES[format.trim].w }), [book, format.trim]);
  const [design, setDesign] = useState<CoverDesign>(() => normalizeCoverDesign(savedDesign) || makeDefault());
  const [selected, setSelected] = useState<string | null>(null);
  const [guides, setGuides] = useState(true);
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(() => new Map());
  const [fontsReady, setFontsReady] = useState(false);
  const [boxes, setBoxes] = useState<LayerBox[]>([]);
  const [saveState, setSaveState] = useState<string>("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState({ w: 900, h: 600 });

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef(1);
  const requested = useRef(new Set<string>());
  const dirty = useRef(false);
  const drag = useRef<{ id: string; start: { x: number; y: number }; orig: { x: number; y: number }; box: Rect } | null>(null);

  const change = useCallback((fn: (d: CoverDesign) => CoverDesign) => {
    dirty.current = true;
    setDesign(fn);
  }, []);
  const updateLayer = useCallback(
    (id: string, patch: Partial<TextLayer> | Partial<ImageLayer>) =>
      change((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) })),
    [change]
  );

  useEffect(() => {
    void loadCoverFonts().then(() => setFontsReady(true));
  }, []);

  // Load saved images from storage; new uploads are added straight from the file
  useEffect(() => {
    const paths = [design.art?.path, ...design.layers.map((l) => (l.type === "image" ? l.path : null))].filter((p): p is string => !!p);
    for (const path of paths) {
      if (requested.current.has(path)) continue;
      requested.current.add(path);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => setImages((prev) => new Map(prev).set(path, img));
      img.onerror = () => setNote("An image in this design couldn't be loaded. Upload it again.");
      img.src = coverPublicUrl(path) || "";
    }
  }, [design]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setView({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = Math.max(20, Math.min((view.w - 32) / wrap.width, (view.h - 32) / wrap.height));
    scaleRef.current = s;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${wrap.width * s}px`;
    canvas.style.height = `${wrap.height * s}px`;
    canvas.width = Math.round(wrap.width * s * dpr);
    canvas.height = Math.round(wrap.height * s * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    setBoxes(drawCover(ctx, design, wrap, images, { s, guides, selected }));
  }, [design, wrap, images, fontsReady, guides, selected, view]);

  const save = useCallback(
    async (d: CoverDesign) => {
      setSaveState("Saving…");
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cover_design: d }),
      });
      if (res.ok) {
        dirty.current = false;
        setSaveState("Saved");
      } else setSaveState((await res.json().catch(() => ({}))).error || "Could not save");
    },
    [projectId]
  );

  useEffect(() => {
    if (!dirty.current) return;
    setSaveState("Unsaved changes");
    const t = setTimeout(() => void save(design), 1500);
    return () => clearTimeout(t);
  }, [design, save]);

  /* ---------- Canvas interaction ---------- */

  function toSheet(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scaleRef.current, y: (e.clientY - r.top) / scaleRef.current };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const pt = toSheet(e);
    const pad = 0.05;
    const hit = [...boxes]
      .reverse()
      .find((b) => !b.hidden && pt.x >= b.rect.x - pad && pt.x <= b.rect.x + b.rect.w + pad && pt.y >= b.rect.y - pad && pt.y <= b.rect.y + b.rect.h + pad);
    if (!hit) {
      setSelected(null);
      return;
    }
    const layer = design.layers.find((l) => l.id === hit.id);
    if (!layer) return;
    setSelected(hit.id);
    drag.current = { id: hit.id, start: pt, orig: { x: layer.x, y: layer.y }, box: hit.rect };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Some pens and synthetic events have no capturable pointer; dragging still works without capture
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    if (!d) return;
    const pt = toSheet(e);
    const layer = design.layers.find((l) => l.id === d.id);
    if (!layer) return;
    const dx = pt.x - d.start.x;
    const dy = pt.y - d.start.y;
    const P = panelRect(wrap, layer.panel);
    if (layer.panel === "spine") {
      updateLayer(d.id, { y: d.orig.y + dy / P.h });
      return;
    }
    updateLayer(d.id, snapLayer(layer, { ...d.box, x: d.box.x + dx, y: d.box.y + dy }, wrap));
  }

  function onPointerUp() {
    drag.current = null;
  }

  /* ---------- Images ---------- */

  async function uploadImage(file: File, kind: "art" | "photo" | "logo") {
    if (!pro) {
      setNote("Uploading artwork and photos is part of Pro and Studio.");
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      setNote("That image is over 40 MB. Save a smaller copy and try again.");
      return;
    }
    setBusy(kind);
    setNote(null);
    try {
      const ready = kind === "art" ? await prepareCoverUpload(file, MAX_ART_BYTES) : file;
      const img = await loadImage(ready);
      const ext = ready.type === "image/png" ? "png" : ready.type === "image/webp" ? "webp" : "jpg";
      const path = `${userId}/${projectId}/design/${kind}-${Date.now().toString(36)}.${ext}`;
      const { error } = await createClient().storage.from("covers").upload(path, ready, { contentType: ready.type, upsert: true });
      if (error) throw new Error(`Upload failed: ${error.message}`);
      requested.current.add(path);
      setImages((prev) => new Map(prev).set(path, img));
      if (kind === "art") {
        const old = design.art?.path;
        change((d) => ({
          ...d,
          art: { path, scope: d.art?.scope || "front", zoom: 1, x: 0, y: 0, dim: d.art?.dim ?? 0.15, width: img.naturalWidth, height: img.naturalHeight },
        }));
        if (old) void createClient().storage.from("covers").remove([old]);
      } else {
        const layer: ImageLayer = {
          id: newLayerId(),
          type: "image",
          role: kind,
          panel: "back",
          path,
          x: 0.12,
          y: kind === "photo" ? 0.6 : 0.84,
          w: kind === "photo" ? 0.24 : 0.16,
          width: img.naturalWidth,
          height: img.naturalHeight,
        };
        change((d) => ({ ...d, layers: [...d.layers, layer] }));
        setSelected(layer.id);
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  function removeLayer(id: string) {
    const layer = design.layers.find((l) => l.id === id);
    change((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) }));
    setSelected(null);
    if (layer?.type === "image") void createClient().storage.from("covers").remove([layer.path]);
  }

  function moveLayer(id: string, dir: -1 | 1) {
    change((d) => {
      const i = d.layers.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.layers.length) return d;
      const layers = [...d.layers];
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...d, layers };
    });
  }

  function addText(role: "custom" | "tagline") {
    if (design.layers.length >= MAX_LAYERS) return;
    const layer = textLayer({
      role,
      panel: "front",
      text: role === "tagline" ? "A tagline that hooks the reader" : "New text",
      font: role === "tagline" ? book.body : book.heading,
      size: role === "tagline" ? 13 : 18,
      italic: role === "tagline",
      y: role === "tagline" ? 0.62 : 0.5,
    });
    change((d) => ({ ...d, layers: [...d.layers, layer] }));
    setSelected(layer.id);
  }

  /* ---------- Exports ---------- */

  const issues = useMemo(() => coverIssues(design, wrap, boxes), [design, wrap, boxes]);
  const errors = issues.filter((i) => i.level === "error");

  function missingImages() {
    const paths = [design.art?.path, ...design.layers.map((l) => (l.type === "image" ? l.path : null))].filter((p): p is string => !!p);
    return paths.some((p) => !images.has(p));
  }

  async function render(region: "front" | "wrap"): Promise<Blob> {
    await loadCoverFonts();
    if (missingImages()) throw new Error("Images are still loading. Try again in a moment.");
    const canvas = document.createElement("canvas");
    const s = region === "front" ? 1600 / wrap.front.w : 300;
    canvas.width = Math.round((region === "front" ? wrap.front.w : wrap.width) * s);
    canvas.height = Math.round((region === "front" ? wrap.front.h : wrap.height) * s);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser");
    drawCover(ctx, design, wrap, images, { s, offset: region === "front" ? { x: wrap.front.x, y: wrap.front.y } : undefined });
    return canvasBlob(canvas, "image/jpeg", region === "front" ? 0.92 : 0.95);
  }

  function confirmProblems() {
    return !errors.length || window.confirm(`${errors.length} problem${errors.length === 1 ? "" : "s"} could show in print. Continue anyway?`);
  }

  async function saveAsEbookCover() {
    if (!confirmProblems()) return;
    setBusy("ebook");
    setNote(null);
    try {
      const blob = await render("front");
      const fd = new FormData();
      fd.append("file", new File([blob], "cover.jpg", { type: "image/jpeg" }));
      const res = await fetch(`/api/projects/${projectId}/cover`, { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save the cover");
      setNote("Saved as your ebook cover. Your ebooks, launch page, and share images use it now.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not save the cover");
    } finally {
      setBusy(null);
    }
  }

  async function downloadEbook() {
    setBusy("jpg");
    try {
      downloadBlob(await render("front"), `${book.title.replace(/[^\w\- ]+/g, "").trim() || "cover"}-ebook.jpg`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not make the image");
    } finally {
      setBusy(null);
    }
  }

  async function downloadPrintPdf() {
    if (!confirmProblems()) return;
    setBusy("pdf");
    setNote(null);
    try {
      const jpg = new Uint8Array(await (await render("wrap")).arrayBuffer());
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([wrap.width * 72, wrap.height * 72]);
      const image = await pdf.embedJpg(jpg);
      page.drawImage(image, { x: 0, y: 0, width: wrap.width * 72, height: wrap.height * 72 });
      pdf.setTitle(`${book.title} paperback cover`);
      pdf.setCreator("Novelist Writer");
      downloadBlob(await pdf.save(), `${book.title.replace(/[^\w\- ]+/g, "").trim() || "cover"}-paperback-${format.trim}-${wrap.pages}p.pdf`, "application/pdf");
      if (!pagesInput || String(format.lastPageCount) !== pagesInput) {
        setNote("Downloaded. Check that the page count matches your final interior; the spine width depends on it.");
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not make the PDF");
    } finally {
      setBusy(null);
    }
  }

  /* ---------- Sidebar ---------- */

  const sel = design.layers.find((l) => l.id === selected) || null;
  const input = "mt-1 block w-full border border-line bg-paper px-2 py-1 text-sm text-ink";
  const fillControl = (key: "front" | "back" | "spine", label: string) => {
    const f: Fill = design[key];
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="w-12 text-muted">{label}</span>
        <input type="color" value={f.color} onChange={(e) => change((d) => ({ ...d, [key]: { ...d[key], color: e.target.value } }))} />
        <label className="flex items-center gap-1 text-muted">
          <input
            type="checkbox"
            checked={!!f.color2}
            onChange={(e) => change((d) => ({ ...d, [key]: { ...d[key], color2: e.target.checked ? "#000000" : null } }))}
          />
          Fade to
        </label>
        {f.color2 && <input type="color" value={f.color2} onChange={(e) => change((d) => ({ ...d, [key]: { ...d[key], color2: e.target.value } }))} />}
      </div>
    );
  };

  return (
    <div className="font-ui flex h-screen flex-col bg-paper">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/project/${projectId}?tab=cover`} className="text-accent hover:underline">
            ← Cover
          </Link>
          <span className="truncate font-display text-lg text-ink">{book.title}</span>
          <span className="text-muted">Cover builder</span>
          <span className="text-xs text-muted">{saveState}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1 text-muted">
            <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />
            Guides
          </label>
          <button type="button" disabled={!pro || !!busy} onClick={() => void saveAsEbookCover()} className="bg-accent px-3 py-2 text-paper disabled:opacity-50">
            {busy === "ebook" ? "Saving…" : "Use as ebook cover"}
          </button>
          <button type="button" disabled={!pro || !!busy} onClick={() => void downloadPrintPdf()} className="border border-line px-3 py-2 disabled:opacity-50">
            {busy === "pdf" ? "Making PDF…" : "Paperback PDF"}
          </button>
          <button type="button" disabled={!pro || !!busy} onClick={() => void downloadEbook()} className="border border-line px-3 py-2 disabled:opacity-50">
            {busy === "jpg" ? "Making…" : "Ebook JPEG"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div ref={stageRef} className="flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#3a3a3a]">
          <canvas
            ref={canvasRef}
            className="touch-none shadow-2xl"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>

        <aside className="w-80 shrink-0 space-y-5 overflow-y-auto border-l border-line p-4 text-sm">
          {migrationNeeded && <p className="text-danger">Database needs an update. Run supabase/migration_formatting.sql in the Supabase SQL editor.</p>}
          {note && <p className="text-ink">{note}</p>}
          {!pro && (
            <div className="border border-accent/40 bg-accent/5 p-3 text-xs">
              <p className="text-ink">Try the builder freely. Uploading art and exporting covers are part of Pro and Studio.</p>
              <a href="/billing" className="mt-2 inline-block bg-accent px-3 py-1.5 text-paper">
                Get Pro
              </a>
            </div>
          )}

          <section>
            <h2 className="font-display text-lg">Size</h2>
            <label className="mt-2 block text-xs text-muted">
              Page count
              <input type="number" min={1} value={pagesInput} placeholder="300" onChange={(e) => setPagesInput(e.target.value)} className={input} />
            </label>
            <p className="mt-1 text-[11px] text-muted">
              {TRIM_SIZES.find((t) => t.id === format.trim)?.label} trim, {format.paper} paper. Spine {wrap.spine}&quot;. Full cover {wrap.width}&quot; ×{" "}
              {wrap.height}&quot;. Change trim or paper in the{" "}
              <Link href={`/project/${projectId}?tab=cover`} className="text-accent underline">
                Cover tab
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg">Background</h2>
            <div className="mt-2 space-y-2">
              {fillControl("front", "Front")}
              {fillControl("spine", "Spine")}
              {fillControl("back", "Back")}
              <button type="button" className="text-xs text-accent underline" onClick={() => change((d) => ({ ...d, back: { ...d.front }, spine: { ...d.front } }))}>
                Match back and spine to the front
              </button>
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg">Artwork</h2>
            <p className="mt-1 text-[11px] text-muted">Your own art or a licensed stock image. For print, aim for 300 DPI at full size.</p>
            <label className={`mt-2 inline-block cursor-pointer border border-line px-3 py-1.5 text-xs ${pro ? "hover:border-accent" : "opacity-50"}`}>
              {busy === "art" ? "Uploading…" : design.art ? "Replace art" : "Upload art"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={!pro || !!busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadImage(f, "art");
                }}
              />
            </label>
            {design.art && (
              <div className="mt-2 space-y-2 text-xs">
                <label className="block text-muted">
                  Covers
                  <select
                    value={design.art.scope}
                    onChange={(e) => change((d) => (d.art ? { ...d, art: { ...d.art, scope: e.target.value as "front" | "wrap" } } : d))}
                    className={input}
                  >
                    <option value="front">The front only</option>
                    <option value="wrap">Back, spine, and front</option>
                  </select>
                </label>
                {(
                  [
                    ["zoom", "Zoom", 1, 3, 0.01],
                    ["x", "Move left / right", -1, 1, 0.01],
                    ["y", "Move up / down", -1, 1, 0.01],
                    ["dim", "Darken for text", 0, 0.7, 0.01],
                  ] as const
                ).map(([key, label, min, max, step]) => (
                  <label key={key} className="block text-muted">
                    {label}
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={design.art?.[key] ?? 0}
                      onChange={(e) => change((d) => (d.art ? { ...d, art: { ...d.art, [key]: Number(e.target.value) } } : d))}
                      className="block w-full"
                    />
                  </label>
                ))}
                <p className="text-muted">
                  {design.art.width} × {design.art.height} px · {artPlacement(wrap, design.art).dpi} DPI in print
                </p>
                <button
                  type="button"
                  className="text-danger underline"
                  onClick={() => {
                    const old = design.art?.path;
                    change((d) => ({ ...d, art: null }));
                    if (old) void createClient().storage.from("covers").remove([old]);
                  }}
                >
                  Remove art
                </button>
              </div>
            )}
          </section>

          <section>
            <h2 className="font-display text-lg">Layers</h2>
            <ul className="mt-2 space-y-1">
              {[...design.layers].reverse().map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(l.id)}
                    className={`block w-full truncate border px-2 py-1 text-left text-xs ${selected === l.id ? "border-accent bg-accent/5" : "border-line"}`}
                  >
                    <span className="text-muted">{ROLE_LABEL[l.role]}:</span> {l.type === "text" ? l.text.slice(0, 40) || "(empty)" : "image"}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <button type="button" className="border border-line px-2 py-1" onClick={() => addText("custom")}>
                + Text
              </button>
              <button type="button" className="border border-line px-2 py-1" onClick={() => addText("tagline")}>
                + Tagline
              </button>
              {(["photo", "logo"] as const).map((kind) => (
                <label key={kind} className={`cursor-pointer border border-line px-2 py-1 ${pro ? "" : "opacity-50"}`}>
                  {busy === kind ? "Uploading…" : kind === "photo" ? "+ Author photo" : "+ Logo"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={!pro || !!busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void uploadImage(f, kind);
                    }}
                  />
                </label>
              ))}
            </div>
          </section>

          {sel && (
            <section className="border border-line p-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base">{ROLE_LABEL[sel.role]}</h2>
                <span className="flex gap-2 text-xs">
                  <button type="button" onClick={() => moveLayer(sel.id, 1)} title="Bring forward">
                    ↑
                  </button>
                  <button type="button" onClick={() => moveLayer(sel.id, -1)} title="Send back">
                    ↓
                  </button>
                  <button type="button" className="text-danger" onClick={() => removeLayer(sel.id)}>
                    Delete
                  </button>
                </span>
              </div>
              <label className="mt-2 block text-xs text-muted">
                Where
                <select value={sel.panel} onChange={(e) => updateLayer(sel.id, { panel: e.target.value as Panel, x: 0.1, y: 0.4 })} className={input}>
                  {PANELS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              {sel.type === "text" ? (
                <div className="mt-2 space-y-2 text-xs">
                  <label className="block text-muted">
                    Text
                    <textarea value={sel.text} rows={sel.role === "blurb" ? 7 : 2} onChange={(e) => updateLayer(sel.id, { text: e.target.value })} className={input} />
                  </label>
                  <label className="block text-muted">
                    Font
                    <select value={sel.font} onChange={(e) => updateLayer(sel.id, { font: e.target.value as FontId })} className={input}>
                      {(Object.keys(FONTS) as FontId[]).map((id) => (
                        <option key={id} value={id}>
                          {FONTS[id].family}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-muted">
                      Size (pt)
                      <input type="number" min={4} max={200} value={sel.size} onChange={(e) => updateLayer(sel.id, { size: Number(e.target.value) || sel.size })} className={input} />
                    </label>
                    <label className="block text-muted">
                      Color
                      <input type="color" value={sel.color} onChange={(e) => updateLayer(sel.id, { color: e.target.value })} className="mt-1 block h-7 w-full" />
                    </label>
                  </div>
                  <label className="block text-muted">
                    Letter spacing
                    <input type="range" min={-0.05} max={0.5} step={0.01} value={sel.spacing} onChange={(e) => updateLayer(sel.id, { spacing: Number(e.target.value) })} className="block w-full" />
                  </label>
                  {sel.panel !== "spine" && (
                    <label className="block text-muted">
                      Line spacing
                      <input type="range" min={0.8} max={2} step={0.05} value={sel.lineHeight} onChange={(e) => updateLayer(sel.id, { lineHeight: Number(e.target.value) })} className="block w-full" />
                    </label>
                  )}
                  <label className="block text-muted">
                    {sel.panel === "spine" ? "Length along the spine" : "Width"}
                    <input type="range" min={0.1} max={1} step={0.01} value={sel.w} onChange={(e) => updateLayer(sel.id, { w: Number(e.target.value) })} className="block w-full" />
                  </label>
                  <div className="flex gap-2">
                    {(["left", "center", "right"] as const).map((a) => (
                      <button key={a} type="button" onClick={() => updateLayer(sel.id, { align: a })} className={`border px-2 py-0.5 ${sel.align === a ? "border-accent" : "border-line"}`}>
                        {a}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {(
                      [
                        ["upper", "Capitals"],
                        ["italic", "Italic"],
                        ["bold", "Bold"],
                        ["shadow", "Shadow"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-1 text-muted">
                        <input type="checkbox" checked={sel[key]} onChange={(e) => updateLayer(sel.id, { [key]: e.target.checked })} />
                        {label}
                      </label>
                    ))}
                    <label className="flex items-center gap-1 text-muted">
                      <input type="checkbox" checked={!!sel.outline} onChange={(e) => updateLayer(sel.id, { outline: e.target.checked ? "#000000" : null })} />
                      Outline
                    </label>
                    {sel.outline && <input type="color" value={sel.outline} onChange={(e) => updateLayer(sel.id, { outline: e.target.value })} />}
                  </div>
                </div>
              ) : (
                <label className="mt-2 block text-xs text-muted">
                  Size
                  <input type="range" min={0.05} max={1} step={0.01} value={sel.w} onChange={(e) => updateLayer(sel.id, { w: Number(e.target.value) })} className="block w-full" />
                </label>
              )}
              <p className="mt-2 text-[11px] text-muted">Drag it on the cover. It snaps to the center and the safe area.</p>
            </section>
          )}

          <section>
            <h2 className="font-display text-lg">Checks</h2>
            {issues.length === 0 ? (
              <p className="mt-1 text-xs text-accent">✓ Everything is inside the safe area and sharp enough to print.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-xs">
                {issues.map((i, n) => (
                  <li key={n}>
                    <button type="button" className={`text-left ${i.level === "error" ? "text-danger" : "text-ink"}`} onClick={() => i.layerId && setSelected(i.layerId)}>
                      {i.level === "error" ? "✗" : "!"} {i.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {wrap.warnings.map((w) => (
              <p key={w} className="mt-1 text-xs text-muted">
                {w}
              </p>
            ))}
          </section>

          <section className="text-xs text-muted">
            <p>No AI art: covers here are made from your own artwork and words.</p>
            <button
              type="button"
              className="mt-2 text-accent underline"
              onClick={() => {
                if (window.confirm("Start over from a fresh layout? Your uploaded art and photos stay in your design.")) {
                  const fresh = makeDefault();
                  change((d) => ({ ...fresh, art: d.art, layers: [...fresh.layers, ...d.layers.filter((l) => l.type === "image")] }));
                  setSelected(null);
                }
              }}
            >
              Start over from a fresh layout
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
