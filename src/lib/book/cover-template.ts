/** Browser-only: cover wrap templates (PNG and PDF) and ebook cover conversion. */
import { BARCODE, BLEED, SAFE, type CoverWrap, type Rect } from "@/lib/book/cover-math";

const DPI = 300;

function summary(wrap: CoverWrap): [string, string] {
  const px = (n: number) => Math.round(n * DPI);
  return [
    `${wrap.trim.w}" x ${wrap.trim.h}" trim · ${wrap.pages} pages · ${wrap.paper} paper · spine ${wrap.spine}"`,
    `Full cover ${wrap.width}" x ${wrap.height}" (${px(wrap.width)} x ${px(wrap.height)} px at ${DPI} DPI)`,
  ];
}

/** Draws the guides with any 2D context, `s` pixels per inch. */
function drawGuides(ctx: CanvasRenderingContext2D, wrap: CoverWrap, s: number) {
  const R = (r: Rect) => [r.x * s, r.y * s, r.w * s, r.h * s] as const;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, wrap.width * s, wrap.height * s);

  // Bleed band
  ctx.fillStyle = "rgba(220, 70, 70, 0.16)";
  const b = BLEED * s;
  ctx.fillRect(0, 0, wrap.width * s, b);
  ctx.fillRect(0, wrap.height * s - b, wrap.width * s, b);
  ctx.fillRect(0, 0, b, wrap.height * s);
  ctx.fillRect(wrap.width * s - b, 0, b, wrap.height * s);

  ctx.fillStyle = "rgba(60, 90, 160, 0.08)";
  ctx.fillRect(...R(wrap.spineRect));

  ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
  ctx.fillRect(...R(wrap.barcode));

  ctx.lineWidth = Math.max(1, s / 100);
  ctx.strokeStyle = "#000000";
  ctx.setLineDash([]);
  ctx.strokeRect(BLEED * s, BLEED * s, (wrap.width - 2 * BLEED) * s, (wrap.height - 2 * BLEED) * s);
  for (const x of [wrap.spineRect.x, wrap.spineRect.x + wrap.spineRect.w]) {
    ctx.beginPath();
    ctx.moveTo(x * s, BLEED * s);
    ctx.lineTo(x * s, (wrap.height - BLEED) * s);
    ctx.stroke();
  }

  ctx.strokeStyle = "#2f5fb3";
  ctx.setLineDash([s / 12, s / 20]);
  for (const r of [wrap.backSafe, wrap.frontSafe, ...(wrap.spineSafe ? [wrap.spineSafe] : [])]) ctx.strokeRect(...R(r));
  ctx.setLineDash([]);

  const label = (text: string, x: number, y: number, size: number, color = "#555") => {
    ctx.fillStyle = color;
    ctx.font = `${size * s}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(text, x * s, y * s);
  };
  const mid = wrap.trim.h / 2 + BLEED;
  label("BACK COVER", wrap.back.x + wrap.back.w / 2, mid, 0.28);
  label("FRONT COVER", wrap.front.x + wrap.front.w / 2, mid, 0.28);
  label(`Barcode area ${BARCODE.w}" x ${BARCODE.h}"`, wrap.barcode.x + wrap.barcode.w / 2, wrap.barcode.y + wrap.barcode.h / 2, 0.12);
  label(`Safe area: keep text ${SAFE}" inside the trim (blue)`, wrap.front.x + wrap.front.w / 2, wrap.front.y + 0.45, 0.1, "#2f5fb3");
  label(`Bleed ${BLEED}" (red) is trimmed off`, wrap.back.x + wrap.back.w / 2, wrap.back.y + 0.45, 0.1, "#b33a3a");
  const [line1, line2] = summary(wrap);
  label(line1, wrap.back.x + wrap.back.w / 2, mid + 0.35, 0.1, "#333");
  label(line2, wrap.back.x + wrap.back.w / 2, mid + 0.52, 0.1, "#333");

  ctx.save();
  ctx.translate((wrap.spineRect.x + wrap.spineRect.w / 2) * s, mid * s);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = "#555";
  ctx.font = `${Math.min(0.16, Math.max(0.06, wrap.spine * 0.5)) * s}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(wrap.spineText ? `SPINE ${wrap.spine}"` : `SPINE ${wrap.spine}" (no text)`, 0, 0);
  ctx.restore();
}

export function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image"))), type, quality));
}

/** A 300 DPI PNG of the full wrap with guides, for designers who work in pixels. */
export async function templatePng(wrap: CoverWrap): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(wrap.width * DPI);
  canvas.height = Math.round(wrap.height * DPI);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser");
  drawGuides(ctx, wrap, DPI);
  return canvasBlob(canvas, "image/png");
}

/** An exact-size vector PDF of the wrap with guides. */
export async function templatePdf(wrap: CoverWrap): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const pt = 72;
  const page = pdf.addPage([wrap.width * pt, wrap.height * pt]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  // PDF y runs up from the bottom
  const box = (r: Rect) => ({ x: r.x * pt, y: (wrap.height - r.y - r.h) * pt, width: r.w * pt, height: r.h * pt });
  const W = wrap.width * pt;
  const H = wrap.height * pt;
  const b = BLEED * pt;

  const bleedColor = rgb(0.86, 0.27, 0.27);
  for (const r of [
    { x: 0, y: 0, width: W, height: b },
    { x: 0, y: H - b, width: W, height: b },
    { x: 0, y: 0, width: b, height: H },
    { x: W - b, y: 0, width: b, height: H },
  ]) {
    page.drawRectangle({ ...r, color: bleedColor, opacity: 0.16 });
  }
  page.drawRectangle({ ...box(wrap.spineRect), color: rgb(0.24, 0.35, 0.63), opacity: 0.08 });
  page.drawRectangle({ ...box(wrap.barcode), color: rgb(0, 0, 0), opacity: 0.12 });
  page.drawRectangle({ x: b, y: b, width: W - 2 * b, height: H - 2 * b, borderColor: rgb(0, 0, 0), borderWidth: 0.5 });
  for (const x of [wrap.spineRect.x, wrap.spineRect.x + wrap.spineRect.w]) {
    page.drawLine({ start: { x: x * pt, y: b }, end: { x: x * pt, y: H - b }, thickness: 0.5, color: rgb(0, 0, 0) });
  }
  for (const r of [wrap.backSafe, wrap.frontSafe, ...(wrap.spineSafe ? [wrap.spineSafe] : [])]) {
    page.drawRectangle({ ...box(r), borderColor: rgb(0.18, 0.37, 0.7), borderWidth: 0.5, borderDashArray: [4, 3] });
  }

  const text = (t: string, cx: number, top: number, size: number, color = rgb(0.33, 0.33, 0.33)) => {
    const w = font.widthOfTextAtSize(t, size);
    page.drawText(t, { x: cx * pt - w / 2, y: (wrap.height - top) * pt - size / 3, size, font, color });
  };
  const mid = wrap.trim.h / 2 + BLEED;
  text("BACK COVER", wrap.back.x + wrap.back.w / 2, mid, 20);
  text("FRONT COVER", wrap.front.x + wrap.front.w / 2, mid, 20);
  text(`Barcode area ${BARCODE.w}" x ${BARCODE.h}"`, wrap.barcode.x + wrap.barcode.w / 2, wrap.barcode.y + wrap.barcode.h / 2, 8);
  text(`Safe area: keep text ${SAFE}" inside the trim (blue)`, wrap.front.x + wrap.front.w / 2, wrap.front.y + 0.45, 7, rgb(0.18, 0.37, 0.7));
  text(`Bleed ${BLEED}" (red) is trimmed off`, wrap.back.x + wrap.back.w / 2, wrap.back.y + 0.45, 7, rgb(0.7, 0.23, 0.23));
  const [line1, line2] = summary(wrap);
  text(line1, wrap.back.x + wrap.back.w / 2, mid + 0.35, 7.5, rgb(0.2, 0.2, 0.2));
  text(line2, wrap.back.x + wrap.back.w / 2, mid + 0.52, 7.5, rgb(0.2, 0.2, 0.2));

  const spineLabel = wrap.spineText ? `SPINE ${wrap.spine}"` : `SPINE ${wrap.spine}" (no text)`;
  const spineSize = Math.min(11, Math.max(4, wrap.spine * pt * 0.5));
  const lw = font.widthOfTextAtSize(spineLabel, spineSize);
  page.drawText(spineLabel, {
    x: (wrap.spineRect.x + wrap.spineRect.w / 2) * pt - spineSize / 3,
    y: (wrap.height - mid) * pt + lw / 2,
    size: spineSize,
    font,
    color: rgb(0.33, 0.33, 0.33),
    rotate: degrees(-90),
  });

  pdf.setTitle("Cover template");
  pdf.setCreator("Novelist Writer");
  return pdf.save();
}

export function downloadBlob(data: Blob | Uint8Array, name: string, type?: string) {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: type || "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image"));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Stores and our ebook builds want JPEG: WebP gets dropped by some exporters, and large PNGs blow past
 * the upload limit. JPEGs under the limit pass through untouched.
 */
export async function prepareCoverUpload(file: File, maxBytes: number): Promise<File> {
  if (file.type === "image/jpeg" && file.size <= maxBytes) return file;
  if (file.type === "image/png" && file.size <= maxBytes / 2) return file;
  const img = await loadImage(file);
  const maxH = 3200;
  const scale = Math.min(1, maxH / img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);
  let quality = 0.92;
  let blob = await canvasBlob(canvas, "image/jpeg", quality);
  while (blob.size > maxBytes && quality > 0.6) {
    quality -= 0.08;
    blob = await canvasBlob(canvas, "image/jpeg", quality);
  }
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
