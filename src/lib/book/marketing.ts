/** Browser-only: 3D book mockups and ad and social images made from the cover. */
import { coverFontFamily } from "@/lib/book/cover-design";
import type { FontId } from "@/lib/book/styles";

export type MarketingFormatId = "mockup" | "facebook" | "square" | "story" | "pinterest" | "bookbub";

export const MARKETING_FORMATS: { id: MarketingFormatId; label: string; w: number; h: number; use: string }[] = [
  { id: "facebook", label: "Facebook and link ad", w: 1200, h: 628, use: "Facebook and Instagram feed ads, link previews, X posts" },
  { id: "square", label: "Square post", w: 1080, h: 1080, use: "Instagram, Facebook, and Threads posts" },
  { id: "story", label: "Story", w: 1080, h: 1920, use: "Instagram, Facebook, and TikTok stories and reels covers" },
  { id: "pinterest", label: "Pinterest pin", w: 1000, h: 1500, use: "Pinterest and tall graphics" },
  { id: "bookbub", label: "BookBub ad", w: 300, h: 250, use: "BookBub and display ads" },
  { id: "mockup", label: "3D book (transparent)", w: 1200, h: 1500, use: "Your website, newsletter, and anywhere you need just the book" },
];

export type MarketingText = {
  headline: string;
  subline: string;
  button: string;
  background: "blur" | "solid";
  color: string;
  textColor: string;
  font: FontId;
};

/** The cover's average color, for a background that matches it. */
export function averageColor(img: HTMLImageElement): string {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  const ctx = c.getContext("2d");
  if (!ctx) return "#1d2633";
  ctx.drawImage(img, 0, 0, 8, 8);
  const d = ctx.getImageData(0, 0, 8, 8).data;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
  }
  const n = d.length / 4;
  // Darkened a little so light text stays readable
  const hex = (v: number) => Math.round((v / n) * 0.6).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** A paperback turned slightly, spine toward the viewer's left. Returns the book's width. */
export function drawBook3d(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, top: number, height: number): number {
  const faceW = height * (img.naturalWidth / img.naturalHeight) * 0.9;
  const spineW = height * 0.075;
  const x0 = cx - (faceW + spineW) / 2;
  const far = 0.06;

  // Floor shadow: a circle squashed into an ellipse under the book
  const squash = 0.12;
  const sx = cx + faceW * 0.05;
  const sy = (top + height) / squash;
  const r = faceW * 0.75;
  ctx.save();
  ctx.scale(1, squash);
  const sh = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
  sh.addColorStop(0, "rgba(0,0,0,0.38)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sh;
  ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  ctx.restore();

  const slices = 140;
  const sw = img.naturalWidth / slices;
  // Front face: the far edge is a touch shorter, which reads as a turn
  for (let i = 0; i < slices; i++) {
    const t = i / slices;
    const h = height * (1 - far * t);
    ctx.drawImage(img, i * sw, 0, sw, img.naturalHeight, x0 + spineW + t * faceW, top + (height - h) / 2, faceW / slices + 0.8, h);
  }

  // Spine: the cover's left edge, stretched and shaded
  const spineSrc = img.naturalWidth * 0.06;
  const spineSlices = 24;
  for (let j = 0; j < spineSlices; j++) {
    const t = j / spineSlices;
    const h = height * (1 - 0.035 * (1 - t));
    ctx.drawImage(img, (spineSrc / spineSlices) * j, 0, spineSrc / spineSlices, img.naturalHeight, x0 + t * spineW, top + (height - h) / 2, spineW / spineSlices + 0.8, h);
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, top + height * 0.0175);
  ctx.lineTo(x0 + spineW, top);
  ctx.lineTo(x0 + spineW, top + height);
  ctx.lineTo(x0, top + height * 0.9825);
  ctx.closePath();
  const shade = ctx.createLinearGradient(x0, 0, x0 + spineW, 0);
  shade.addColorStop(0, "rgba(0,0,0,0.55)");
  shade.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.restore();

  // Hinge crease and a soft sheen across the cover
  const sheen = ctx.createLinearGradient(x0 + spineW, 0, x0 + spineW + faceW, 0);
  sheen.addColorStop(0, "rgba(0,0,0,0.35)");
  sheen.addColorStop(0.03, "rgba(255,255,255,0.18)");
  sheen.addColorStop(0.09, "rgba(255,255,255,0)");
  sheen.addColorStop(0.7, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0 + spineW, top);
  ctx.lineTo(x0 + spineW + faceW, top + (height * far) / 2);
  ctx.lineTo(x0 + spineW + faceW, top + height - (height * far) / 2);
  ctx.lineTo(x0 + spineW, top + height);
  ctx.closePath();
  ctx.fillStyle = sheen;
  ctx.fill();
  ctx.restore();
  return faceW + spineW;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (line && ctx.measureText(next).width > maxW) {
        out.push(line);
        line = w;
      } else line = next;
    }
    if (line) out.push(line);
  }
  return out;
}

/** Fits text into a box, shrinking it until it takes at most `maxLines`. Returns the bottom edge. */
function textBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  o: { x: number; y: number; w: number; size: number; maxLines: number; align: CanvasTextAlign; font: string; color: string; weight?: number; italic?: boolean }
): number {
  if (!text.trim()) return o.y;
  let size = o.size;
  let lines: string[] = [];
  for (; size > 8; size *= 0.92) {
    ctx.font = `${o.italic ? "italic " : ""}${o.weight || 400} ${size}px ${o.font}`;
    lines = wrap(ctx, text, o.w);
    if (lines.length <= o.maxLines) break;
  }
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align;
  ctx.textBaseline = "top";
  const ax = o.align === "center" ? o.x + o.w / 2 : o.align === "right" ? o.x + o.w : o.x;
  lines.forEach((l, i) => ctx.fillText(l, ax, o.y + i * size * 1.18));
  return o.y + lines.length * size * 1.18;
}

function button(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, size: number, align: "left" | "center", color: string, font: string) {
  if (!label.trim()) return;
  ctx.font = `600 ${size}px ${font}`;
  const w = ctx.measureText(label).width + size * 1.8;
  const h = size * 2.1;
  const left = align === "center" ? x - w / 2 : x;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(left, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, left + w / 2, y + h / 2);
}

export function drawMarketing(ctx: CanvasRenderingContext2D, id: MarketingFormatId, img: HTMLImageElement, text: MarketingText) {
  const f = MARKETING_FORMATS.find((m) => m.id === id)!;
  const { w, h } = f;
  ctx.clearRect(0, 0, w, h);

  if (id !== "mockup") {
    ctx.fillStyle = text.color;
    ctx.fillRect(0, 0, w, h);
    if (text.background === "blur" && "filter" in ctx) {
      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * 1.2;
      ctx.save();
      ctx.filter = `blur(${Math.round(Math.min(w, h) * 0.04)}px)`;
      ctx.drawImage(img, (w - img.naturalWidth * scale) / 2, (h - img.naturalHeight * scale) / 2, img.naturalWidth * scale, img.naturalHeight * scale);
      ctx.restore();
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, w, h);
    }
  }

  const head = `"${coverFontFamily(text.font)}", Georgia, serif`;
  const body = `"${coverFontFamily("lora")}", Georgia, serif`;
  const accent = "#f4d58d";
  const tc = text.textColor;

  switch (id) {
    case "mockup":
      drawBook3d(ctx, img, w / 2, h * 0.07, h * 0.82);
      break;
    case "facebook": {
      drawBook3d(ctx, img, w * 0.26, h * 0.08, h * 0.8);
      const x = w * 0.52;
      const tw = w * 0.42;
      let y = textBlock(ctx, text.headline, { x, y: h * 0.16, w: tw, size: 54, maxLines: 3, align: "left", font: head, color: tc, weight: 600 });
      y = textBlock(ctx, text.subline, { x, y: y + 18, w: tw, size: 28, maxLines: 2, align: "left", font: body, color: tc, italic: true });
      button(ctx, text.button, x, y + 30, 26, "left", accent, body);
      break;
    }
    case "square": {
      drawBook3d(ctx, img, w / 2, h * 0.06, h * 0.56);
      let y = textBlock(ctx, text.headline, { x: w * 0.08, y: h * 0.67, w: w * 0.84, size: 50, maxLines: 2, align: "center", font: head, color: tc, weight: 600 });
      y = textBlock(ctx, text.subline, { x: w * 0.1, y: y + 12, w: w * 0.8, size: 30, maxLines: 1, align: "center", font: body, color: tc, italic: true });
      button(ctx, text.button, w / 2, Math.min(y + 24, h - 100), 28, "center", accent, body);
      break;
    }
    case "story":
    case "pinterest": {
      const tall = id === "story";
      textBlock(ctx, text.headline, { x: w * 0.08, y: h * (tall ? 0.1 : 0.06), w: w * 0.84, size: tall ? 70 : 62, maxLines: 3, align: "center", font: head, color: tc, weight: 600 });
      drawBook3d(ctx, img, w / 2, h * (tall ? 0.3 : 0.27), h * (tall ? 0.46 : 0.52));
      const y = textBlock(ctx, text.subline, { x: w * 0.1, y: h * (tall ? 0.8 : 0.83), w: w * 0.8, size: tall ? 40 : 36, maxLines: 2, align: "center", font: body, color: tc, italic: true });
      button(ctx, text.button, w / 2, y + 24, tall ? 38 : 32, "center", accent, body);
      break;
    }
    case "bookbub": {
      drawBook3d(ctx, img, w * 0.27, h * 0.07, h * 0.84);
      const x = w * 0.52;
      const y = textBlock(ctx, text.headline, { x, y: h * 0.12, w: w * 0.44, size: 20, maxLines: 4, align: "left", font: head, color: tc, weight: 600 });
      button(ctx, text.button, x, Math.min(y + 12, h - 44), 12, "left", accent, body);
      break;
    }
  }
}
