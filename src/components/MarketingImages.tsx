"use client";

import { useEffect, useRef, useState } from "react";
import { FONTS, type FontId } from "@/lib/book/styles";
import { loadCoverFonts } from "@/lib/book/cover-design";
import { canvasBlob, downloadBlob } from "@/lib/book/cover-template";
import { MARKETING_FORMATS, averageColor, drawMarketing, type MarketingFormatId, type MarketingText } from "@/lib/book/marketing";

export function MarketingImages({
  coverUrl,
  pro,
  title,
  defaults,
  font,
}: {
  coverUrl: string | null;
  pro: boolean | null;
  title: string;
  defaults: { headline: string; subline: string; button: string };
  font: FontId;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [formatId, setFormatId] = useState<MarketingFormatId>("facebook");
  const [text, setText] = useState<MarketingText>({ ...defaults, background: "blur", color: "#1d2633", textColor: "#ffffff", font });
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    void loadCoverFonts().then(() => setFontsReady(true));
  }, []);

  useEffect(() => {
    if (!coverUrl) return;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      setImg(image);
      setFailed(false);
      setText((t) => ({ ...t, color: averageColor(image) }));
    };
    image.onerror = () => setFailed(true);
    // A separate URL keeps this CORS request from reusing the plain <img> cache entry
    image.src = /^https?:/.test(coverUrl) ? `${coverUrl}${coverUrl.includes("?") ? "&" : "?"}m=1` : coverUrl;
  }, [coverUrl]);

  const fmt = MARKETING_FORMATS.find((f) => f.id === formatId)!;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    canvas.width = fmt.w;
    canvas.height = fmt.h;
    const ctx = canvas.getContext("2d");
    if (ctx) drawMarketing(ctx, formatId, img, text);
  }, [img, formatId, text, fmt, fontsReady]);

  async function download() {
    if (!canvasRef.current) return;
    setBusy(true);
    try {
      const png = formatId === "mockup";
      const blob = await canvasBlob(canvasRef.current, png ? "image/png" : "image/jpeg", 0.92);
      const name = `${title.replace(/[^\w\- ]+/g, "").trim() || "book"}-${formatId}-${fmt.w}x${fmt.h}.${png ? "png" : "jpg"}`;
      downloadBlob(blob, name);
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 block w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink";

  return (
    <section className="border border-line p-4">
      <h3 className="font-display text-lg">Marketing images</h3>
      <p className="mt-1 text-xs text-muted">A 3D book and ready-sized images for ads and social posts, made from your cover.</p>
      {!coverUrl ? (
        <p className="mt-3 text-sm text-muted">Add an ebook cover above first.</p>
      ) : failed ? (
        <p className="mt-3 text-sm text-danger">Your cover couldn&apos;t be loaded for editing. Upload it again and try once more.</p>
      ) : (
        <div className="mt-3 grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="space-y-3 text-xs">
            <label className="block text-muted">
              Size
              <select value={formatId} onChange={(e) => setFormatId(e.target.value as MarketingFormatId)} className={input}>
                {MARKETING_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label} ({f.w} × {f.h})
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px]">{fmt.use}</span>
            </label>
            {formatId !== "mockup" && (
              <>
                <label className="block text-muted">
                  Headline
                  <textarea rows={2} value={text.headline} onChange={(e) => setText((t) => ({ ...t, headline: e.target.value }))} className={input} />
                </label>
                {formatId !== "bookbub" && (
                  <label className="block text-muted">
                    Second line
                    <input value={text.subline} onChange={(e) => setText((t) => ({ ...t, subline: e.target.value }))} className={input} />
                  </label>
                )}
                <label className="block text-muted">
                  Button (leave empty for none)
                  <input value={text.button} onChange={(e) => setText((t) => ({ ...t, button: e.target.value }))} className={input} />
                </label>
                <label className="block text-muted">
                  Headline font
                  <select value={text.font} onChange={(e) => setText((t) => ({ ...t, font: e.target.value as FontId }))} className={input}>
                    {(Object.keys(FONTS) as FontId[]).map((id) => (
                      <option key={id} value={id}>
                        {FONTS[id].family}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap items-center gap-3 text-muted">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={text.background === "blur"}
                      onChange={(e) => setText((t) => ({ ...t, background: e.target.checked ? "blur" : "solid" }))}
                    />
                    Blurred cover behind
                  </label>
                  <label className="flex items-center gap-1">
                    Color
                    <input type="color" value={text.color} onChange={(e) => setText((t) => ({ ...t, color: e.target.value }))} />
                  </label>
                  <label className="flex items-center gap-1">
                    Text
                    <input type="color" value={text.textColor} onChange={(e) => setText((t) => ({ ...t, textColor: e.target.value }))} />
                  </label>
                </div>
              </>
            )}
            {pro === false ? (
              <div>
                <p className="text-ink">Downloading marketing images is part of Pro and Studio.</p>
                <a href="/billing" className="mt-2 inline-block bg-accent px-3 py-1.5 text-paper">
                  Get Pro
                </a>
              </div>
            ) : (
              <button type="button" disabled={!img || busy || pro === null} onClick={() => void download()} className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50">
                {busy ? "Saving…" : `Download ${formatId === "mockup" ? "PNG" : "JPEG"}`}
              </button>
            )}
          </div>
          <div className="flex items-start justify-center rounded bg-[repeating-conic-gradient(#e8e4dc_0%_25%,#f6f3ee_0%_50%)] bg-[length:20px_20px] p-3">
            <canvas ref={canvasRef} className="max-h-[32rem] max-w-full shadow" style={{ aspectRatio: `${fmt.w} / ${fmt.h}` }} />
          </div>
        </div>
      )}
    </section>
  );
}
