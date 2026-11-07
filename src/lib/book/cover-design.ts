/**
 * Cover builder: the saved design, its defaults, and one renderer shared by the editor, the ebook cover
 * export, and the print wrap PDF. Positions are fractions of a panel's trim box, so a design survives
 * page-count and trim changes; the spine resizes itself.
 */
import { BARCODE, type CoverWrap, type Rect } from "@/lib/book/cover-math";
import { FONTS, type FontId } from "@/lib/book/styles";

export type Panel = "front" | "back" | "spine";
export type Fill = { color: string; color2: string | null };
export type Art = {
  path: string;
  /** "front" covers the front panel; "wrap" runs across back, spine, and front */
  scope: "front" | "wrap";
  zoom: number;
  /** Pan within the overflow, -1 to 1 */
  x: number;
  y: number;
  /** Darkening over the art, 0 to 0.7, to keep text readable */
  dim: number;
  width: number;
  height: number;
};
export type TextRole = "title" | "subtitle" | "author" | "series" | "tagline" | "blurb" | "spineTitle" | "spineAuthor" | "custom";
export type TextLayer = {
  id: string;
  type: "text";
  role: TextRole;
  panel: Panel;
  text: string;
  font: FontId;
  /** Points */
  size: number;
  color: string;
  /** Letter spacing in em */
  spacing: number;
  align: "left" | "center" | "right";
  x: number;
  y: number;
  w: number;
  lineHeight: number;
  upper: boolean;
  italic: boolean;
  bold: boolean;
  shadow: boolean;
  outline: string | null;
};
export type ImageLayer = {
  id: string;
  type: "image";
  role: "photo" | "logo";
  panel: Panel;
  path: string;
  x: number;
  y: number;
  w: number;
  width: number;
  height: number;
};
export type Layer = TextLayer | ImageLayer;
export type CoverDesign = { v: 1; front: Fill; back: Fill; spine: Fill; art: Art | null; layers: Layer[] };

export const ROLE_LABEL: Record<TextRole | ImageLayer["role"], string> = {
  title: "Title",
  subtitle: "Subtitle",
  author: "Author",
  series: "Series line",
  tagline: "Tagline",
  blurb: "Back cover blurb",
  spineTitle: "Spine title",
  spineAuthor: "Spine author",
  custom: "Text",
  photo: "Author photo",
  logo: "Logo",
};

export const MAX_LAYERS = 30;
const FONT_IDS = Object.keys(FONTS) as FontId[];

let idSeq = 0;
export function newLayerId(): string {
  idSeq += 1;
  return `l${Date.now().toString(36)}${idSeq}`;
}

export function textLayer(partial: Partial<TextLayer> & Pick<TextLayer, "role" | "panel" | "text" | "font">): TextLayer {
  return {
    id: newLayerId(),
    type: "text",
    size: 14,
    color: "#f3ede1",
    spacing: 0,
    align: "center",
    x: 0.08,
    y: 0.5,
    w: 0.84,
    lineHeight: 1.15,
    upper: false,
    italic: false,
    bold: false,
    shadow: false,
    outline: null,
    ...partial,
  };
}

/** A starting design from the book's details and style, so authors never face a blank canvas. */
export function defaultDesign(input: {
  title: string;
  subtitle: string;
  author: string;
  series: string;
  blurb: string;
  heading: FontId;
  body: FontId;
  trimWidth: number;
}): CoverDesign {
  const ink = "#f3ede1";
  const gold = "#d9b26f";
  const layers: Layer[] = [];
  if (input.series) {
    layers.push(textLayer({ role: "series", panel: "front", text: input.series, font: input.heading, size: 11, color: gold, spacing: 0.22, upper: true, y: 0.08 }));
  }
  layers.push(
    textLayer({ role: "title", panel: "front", text: input.title, font: input.heading, size: Math.round(input.trimWidth * 8.5), color: ink, y: 0.18, lineHeight: 1.05, shadow: true })
  );
  if (input.subtitle) {
    layers.push(textLayer({ role: "subtitle", panel: "front", text: input.subtitle, font: input.body, size: 15, color: ink, italic: true, y: 0.44 }));
  }
  layers.push(
    textLayer({ role: "author", panel: "front", text: input.author, font: input.heading, size: 20, color: ink, spacing: 0.14, upper: true, y: 0.85 }),
    textLayer({
      role: "blurb",
      panel: "back",
      text: input.blurb || "Your book description goes here. Edit it in the panel on the right.",
      font: input.body,
      size: 11,
      color: ink,
      align: "left",
      x: 0.12,
      y: 0.12,
      w: 0.76,
      lineHeight: 1.4,
    }),
    textLayer({ role: "spineTitle", panel: "spine", text: input.title, font: input.heading, size: 14, color: ink, upper: true, spacing: 0.08, y: 0.06, w: 0.62 }),
    textLayer({ role: "spineAuthor", panel: "spine", text: input.author, font: input.heading, size: 11, color: ink, upper: true, spacing: 0.08, y: 0.72, w: 0.24 })
  );
  return {
    v: 1,
    front: { color: "#1d2633", color2: "#3b4a5e" },
    back: { color: "#1d2633", color2: null },
    spine: { color: "#1d2633", color2: null },
    art: null,
    layers,
  };
}

/* ---------- Validation (server and client) ---------- */

const num = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};
const color = (v: unknown, dflt: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : dflt);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const panel = (v: unknown): Panel => (v === "back" || v === "spine" ? v : "front");
const font = (v: unknown): FontId => (FONT_IDS.includes(v as FontId) ? (v as FontId) : "ebgaramond");
const storagePath = (v: unknown) => (typeof v === "string" && /^[\w\-/.]{1,300}$/.test(v) && !v.includes("..") ? v : "");

function fill(v: unknown, dflt: string): Fill {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { color: color(o.color, dflt), color2: o.color2 ? color(o.color2, dflt) : null };
}

export function normalizeCoverDesign(raw: unknown): CoverDesign | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const a = o.art && typeof o.art === "object" ? (o.art as Record<string, unknown>) : null;
  const artPath = a ? storagePath(a.path) : "";
  const layers: Layer[] = [];
  for (const item of Array.isArray(o.layers) ? o.layers.slice(0, MAX_LAYERS) : []) {
    if (!item || typeof item !== "object") continue;
    const l = item as Record<string, unknown>;
    const base = { id: str(l.id, 40) || newLayerId(), panel: panel(l.panel), x: num(l.x, -0.5, 1.5, 0.1), y: num(l.y, -0.5, 1.5, 0.5), w: num(l.w, 0.02, 1.5, 0.8) };
    if (l.type === "image") {
      const path = storagePath(l.path);
      if (!path) continue;
      layers.push({ ...base, type: "image", role: l.role === "logo" ? "logo" : "photo", path, width: num(l.width, 1, 20000, 1000), height: num(l.height, 1, 20000, 1000) });
    } else {
      const role = (Object.keys(ROLE_LABEL) as string[]).includes(l.role as string) && l.role !== "photo" && l.role !== "logo" ? (l.role as TextRole) : "custom";
      layers.push({
        ...base,
        type: "text",
        role,
        text: str(l.text, 3000),
        font: font(l.font),
        size: num(l.size, 4, 200, 14),
        color: color(l.color, "#f3ede1"),
        spacing: num(l.spacing, -0.1, 1, 0),
        align: l.align === "left" || l.align === "right" ? l.align : "center",
        lineHeight: num(l.lineHeight, 0.8, 2.5, 1.15),
        upper: l.upper === true,
        italic: l.italic === true,
        bold: l.bold === true,
        shadow: l.shadow === true,
        outline: l.outline ? color(l.outline, "#000000") : null,
      });
    }
  }
  return {
    v: 1,
    front: fill(o.front, "#1d2633"),
    back: fill(o.back, "#1d2633"),
    spine: fill(o.spine, "#1d2633"),
    art: artPath && a
      ? {
          path: artPath,
          scope: a.scope === "wrap" ? "wrap" : "front",
          zoom: num(a.zoom, 1, 4, 1),
          x: num(a.x, -1, 1, 0),
          y: num(a.y, -1, 1, 0),
          dim: num(a.dim, 0, 0.7, 0),
          width: num(a.width, 1, 30000, 1600),
          height: num(a.height, 1, 30000, 2560),
        }
      : null,
    layers,
  };
}

/* ---------- Rendering (browser) ---------- */

export const coverFontFamily = (id: FontId) => `NWC ${FONTS[id].family}`;

let fontsLoading: Promise<void> | null = null;
/** Registers every bundled font with the page so canvas text uses them. */
export function loadCoverFonts(): Promise<void> {
  if (fontsLoading) return fontsLoading;
  const faces: FontFace[] = [];
  for (const id of FONT_IDS) {
    const f = FONTS[id];
    faces.push(new FontFace(coverFontFamily(id), `url(${f.regular})`, { weight: "300 900", style: "normal" }));
    if (f.italic) faces.push(new FontFace(coverFontFamily(id), `url(${f.italic})`, { weight: "300 900", style: "italic" }));
  }
  fontsLoading = Promise.all(
    faces.map((face) =>
      face
        .load()
        .then((loaded) => {
          document.fonts.add(loaded);
        })
        .catch(() => undefined)
    )
  ).then(() => undefined);
  return fontsLoading;
}

export function panelRect(wrap: CoverWrap, p: Panel): Rect {
  return p === "front" ? wrap.front : p === "back" ? wrap.back : wrap.spineRect;
}

export type LayerBox = { id: string; panel: Panel; rect: Rect; hidden?: boolean };

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };

function wrapLines(ctx: Ctx, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = words[0];
    for (const w of words.slice(1)) {
      const next = `${line} ${w}`;
      if (ctx.measureText(next).width <= maxW) line = next;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

function paintFill(ctx: Ctx, f: Fill, r: Rect, s: number) {
  if (f.color2) {
    const g = ctx.createLinearGradient(0, r.y * s, 0, (r.y + r.h) * s);
    g.addColorStop(0, f.color);
    g.addColorStop(1, f.color2);
    ctx.fillStyle = g;
  } else ctx.fillStyle = f.color;
  ctx.fillRect(r.x * s, r.y * s, r.w * s, r.h * s);
}

export function artTarget(wrap: CoverWrap, art: Art): Rect {
  return art.scope === "wrap"
    ? { x: 0, y: 0, w: wrap.width, h: wrap.height }
    : { x: wrap.front.x, y: 0, w: wrap.width - wrap.front.x, h: wrap.height };
}

/** Where the art lands, in inches, after cover-fit, zoom, and pan. */
export function artPlacement(wrap: CoverWrap, art: Art): Rect & { dpi: number } {
  const t = artTarget(wrap, art);
  const scale = Math.max(t.w / art.width, t.h / art.height) * art.zoom;
  const w = art.width * scale;
  const h = art.height * scale;
  return { x: t.x - (w - t.w) * ((art.x + 1) / 2), y: t.y - (h - t.h) * ((art.y + 1) / 2), w, h, dpi: Math.round(1 / scale) };
}

function fontString(l: TextLayer, px: number) {
  return `${l.italic ? "italic " : ""}${l.bold ? 700 : 400} ${px}px "${coverFontFamily(l.font)}", Georgia, serif`;
}

function paintTextLines(ctx: Ctx, l: TextLayer, lines: string[], px: number, bx: number, by: number, bw: number) {
  ctx.textBaseline = "top";
  ctx.textAlign = l.align;
  const ax = l.align === "left" ? bx : l.align === "right" ? bx + bw : bx + bw / 2;
  const lh = px * l.lineHeight;
  lines.forEach((line, i) => {
    const ly = by + i * lh;
    if (l.outline) {
      ctx.save();
      ctx.shadowColor = "transparent";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(1, px * 0.08);
      ctx.strokeStyle = l.outline;
      ctx.strokeText(line, ax, ly);
      ctx.restore();
    }
    ctx.fillText(line, ax, ly);
  });
}

/**
 * Paints the design. `s` is pixels per inch; `offset` shifts the sheet (the ebook export draws only the
 * front panel). Returns each layer's box in sheet inches for hit-testing and warnings.
 */
export function drawCover(
  ctx: Ctx,
  design: CoverDesign,
  wrap: CoverWrap,
  images: Map<string, HTMLImageElement>,
  opts: { s: number; offset?: { x: number; y: number }; guides?: boolean; selected?: string | null }
): LayerBox[] {
  const s = opts.s;
  ctx.save();
  if (opts.offset) ctx.translate(-opts.offset.x * s, -opts.offset.y * s);

  paintFill(ctx, design.back, { x: 0, y: 0, w: wrap.spineRect.x, h: wrap.height }, s);
  paintFill(ctx, design.spine, { x: wrap.spineRect.x, y: 0, w: wrap.spine, h: wrap.height }, s);
  paintFill(ctx, design.front, { x: wrap.front.x, y: 0, w: wrap.width - wrap.front.x, h: wrap.height }, s);

  if (design.art) {
    const img = images.get(design.art.path);
    const t = artTarget(wrap, design.art);
    if (img) {
      const p = artPlacement(wrap, design.art);
      ctx.save();
      ctx.beginPath();
      ctx.rect(t.x * s, t.y * s, t.w * s, t.h * s);
      ctx.clip();
      ctx.drawImage(img, p.x * s, p.y * s, p.w * s, p.h * s);
      if (design.art.dim > 0) {
        ctx.fillStyle = `rgba(0,0,0,${design.art.dim})`;
        ctx.fillRect(t.x * s, t.y * s, t.w * s, t.h * s);
      }
      ctx.restore();
    }
  }

  const boxes: LayerBox[] = [];
  for (const l of design.layers) {
    const P = panelRect(wrap, l.panel);
    if (l.type === "image") {
      const w = l.w * P.w;
      const h = (w * l.height) / l.width;
      const rect = { x: P.x + l.x * P.w, y: P.y + l.y * P.h, w, h };
      const img = images.get(l.path);
      if (img) ctx.drawImage(img, rect.x * s, rect.y * s, rect.w * s, rect.h * s);
      else {
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(rect.x * s, rect.y * s, rect.w * s, rect.h * s);
      }
      boxes.push({ id: l.id, panel: l.panel, rect });
      continue;
    }

    const text = l.upper ? l.text.toUpperCase() : l.text;
    ctx.save();
    ctx.fillStyle = l.color;
    if (l.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = (l.size / 72) * s * 0.18;
      ctx.shadowOffsetY = (l.size / 72) * s * 0.04;
    }

    if (l.panel === "spine") {
      const along = l.w * P.h;
      const start = P.y + l.y * P.h;
      const rect = { x: P.x, y: start, w: P.w, h: along };
      if (!wrap.spineText) {
        boxes.push({ id: l.id, panel: l.panel, rect, hidden: true });
        ctx.restore();
        continue;
      }
      const px = Math.min((l.size / 72) * s, P.w * s * 0.62);
      ctx.font = fontString(l, px);
      if ("letterSpacing" in ctx) ctx.letterSpacing = `${l.spacing * px}px`;
      ctx.translate((P.x + P.w / 2) * s, start * s);
      ctx.rotate(Math.PI / 2);
      ctx.textBaseline = "middle";
      ctx.textAlign = l.align;
      const ax = l.align === "left" ? 0 : l.align === "right" ? along * s : (along * s) / 2;
      const line = text.replace(/\s*\n\s*/g, " ");
      if (l.outline) {
        ctx.lineWidth = Math.max(1, px * 0.08);
        ctx.strokeStyle = l.outline;
        ctx.strokeText(line, ax, 0);
      }
      ctx.fillText(line, ax, 0);
      const tw = ctx.measureText(line).width / s;
      ctx.restore();
      // The box is the text itself (its length along the spine, its cap height across it), so checks are exact
      const thick = (px / s) * 0.8;
      const from = l.align === "left" ? start : l.align === "right" ? start + along - tw : start + along / 2 - tw / 2;
      boxes.push({ id: l.id, panel: l.panel, rect: { x: P.x + P.w / 2 - thick / 2, y: from, w: thick, h: tw } });
      continue;
    }

    const px = (l.size / 72) * s;
    ctx.font = fontString(l, px);
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${l.spacing * px}px`;
    const bx = (P.x + l.x * P.w) * s;
    const by = (P.y + l.y * P.h) * s;
    const bw = l.w * P.w * s;
    const lines = wrapLines(ctx, text, bw);
    paintTextLines(ctx, l, lines, px, bx, by, bw);
    // A single long word can be wider than the box; measure what was actually drawn
    const widest = Math.max(bw, ...lines.map((line) => ctx.measureText(line).width));
    ctx.restore();
    const left = l.align === "left" ? bx : l.align === "right" ? bx + bw - widest : bx + bw / 2 - widest / 2;
    boxes.push({ id: l.id, panel: l.panel, rect: { x: left / s, y: by / s, w: widest / s, h: (lines.length * px * l.lineHeight) / s } });
  }

  if (opts.guides) paintGuides(ctx, wrap, s, boxes, opts.selected || null);
  ctx.restore();
  return boxes;
}

function paintGuides(ctx: Ctx, wrap: CoverWrap, s: number, boxes: LayerBox[], selected: string | null) {
  ctx.save();
  ctx.fillStyle = "rgba(220,70,70,0.28)";
  const b = wrap.bleed * s;
  ctx.fillRect(0, 0, wrap.width * s, b);
  ctx.fillRect(0, wrap.height * s - b, wrap.width * s, b);
  ctx.fillRect(0, 0, b, wrap.height * s);
  ctx.fillRect(wrap.width * s - b, 0, b, wrap.height * s);
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 1;
  for (const x of [wrap.spineRect.x, wrap.spineRect.x + wrap.spine]) {
    ctx.beginPath();
    ctx.moveTo(x * s, 0);
    ctx.lineTo(x * s, wrap.height * s);
    ctx.stroke();
  }
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = "rgba(120,180,255,0.9)";
  for (const r of [wrap.backSafe, wrap.frontSafe, ...(wrap.spineSafe ? [wrap.spineSafe] : [])]) ctx.strokeRect(r.x * s, r.y * s, r.w * s, r.h * s);
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(wrap.barcode.x * s, wrap.barcode.y * s, BARCODE.w * s, BARCODE.h * s);
  ctx.fillStyle = "#666";
  ctx.font = `${Math.max(9, 0.12 * s)}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Barcode", (wrap.barcode.x + BARCODE.w / 2) * s, (wrap.barcode.y + BARCODE.h / 2) * s);
  const sel = boxes.find((x) => x.id === selected);
  if (sel) {
    ctx.strokeStyle = "#ffcc33";
    ctx.lineWidth = 2;
    ctx.strokeRect(sel.rect.x * s - 3, sel.rect.y * s - 3, sel.rect.w * s + 6, sel.rect.h * s + 6);
  }
  ctx.restore();
}

/* ---------- Checks ---------- */

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const inside = (a: Rect, b: Rect) => a.x >= b.x - 0.001 && a.y >= b.y - 0.001 && a.x + a.w <= b.x + b.w + 0.001 && a.y + a.h <= b.y + b.h + 0.001;

export type CoverIssue = { level: "warn" | "error"; text: string; layerId?: string };

export function coverIssues(design: CoverDesign, wrap: CoverWrap, boxes: LayerBox[]): CoverIssue[] {
  const issues: CoverIssue[] = [];
  const label = (id: string) => {
    const l = design.layers.find((x) => x.id === id);
    return l ? ROLE_LABEL[l.role] : "A layer";
  };
  for (const box of boxes) {
    const layer = design.layers.find((l) => l.id === box.id);
    if (!layer) continue;
    if (box.hidden) {
      if (layer.type === "text" && layer.text.trim()) {
        issues.push({ level: "warn", layerId: box.id, text: `${label(box.id)} is hidden: KDP only allows spine text on books with 80 or more pages.` });
      }
      continue;
    }
    const safe = box.panel === "front" ? wrap.frontSafe : box.panel === "back" ? wrap.backSafe : wrap.spineSafe;
    if (safe && !inside(box.rect, safe)) {
      issues.push({ level: "error", layerId: box.id, text: `${label(box.id)} runs outside the safe area and could be trimmed off.` });
    }
    if (box.panel === "back" && overlaps(box.rect, wrap.barcode)) {
      issues.push({ level: "warn", layerId: box.id, text: `${label(box.id)} overlaps the barcode area. KDP prints the barcode there.` });
    }
    if (layer.type === "image") {
      const dpi = Math.round(layer.width / box.rect.w);
      if (dpi < 300) issues.push({ level: dpi < 200 ? "error" : "warn", layerId: box.id, text: `${label(box.id)} is ${dpi} DPI at this size. Print needs about 300.` });
    }
  }
  if (design.art) {
    const dpi = artPlacement(wrap, design.art).dpi;
    if (dpi < 300) {
      issues.push({ level: dpi < 200 ? "error" : "warn", text: `The cover art is ${dpi} DPI at print size. Print needs about 300, so it may look soft. A larger image fixes this.` });
    }
  }
  return issues;
}

/** Nudges a dragged box onto the safe-area edges and the panel's center line when it's close. */
export function snapLayer(layer: Layer, box: Rect, wrap: CoverWrap): { x: number; y: number } {
  const P = panelRect(wrap, layer.panel);
  if (layer.panel === "spine") return { x: layer.x, y: layer.y };
  const safe = layer.panel === "front" ? wrap.frontSafe : wrap.backSafe;
  const d = 0.08;
  let { x, y } = box;
  const cx = P.x + P.w / 2;
  if (Math.abs(x + box.w / 2 - cx) < d) x = cx - box.w / 2;
  if (Math.abs(x - safe.x) < d) x = safe.x;
  if (Math.abs(x + box.w - (safe.x + safe.w)) < d) x = safe.x + safe.w - box.w;
  if (Math.abs(y - safe.y) < d) y = safe.y;
  if (Math.abs(y + box.h - (safe.y + safe.h)) < d) y = safe.y + safe.h - box.h;
  return { x: (x - P.x) / P.w, y: (y - P.y) / P.h };
}
