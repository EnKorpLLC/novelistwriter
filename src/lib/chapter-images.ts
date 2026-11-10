"use client";

import { createClient } from "@/lib/supabase/client";
import { coverPublicUrl } from "@/lib/cover";
import { canvasBlob, loadImage } from "@/lib/book/cover-template";

export const MAX_CHAPTER_IMAGES = 100;
const MAX_BYTES = 1_500_000;
// Long edge in pixels: enough for 300 DPI across a 6-inch page, small enough to keep storage and ebooks light
const MAX_EDGE = { full: 2400, break: 800 } as const;

export type ImageRole = keyof typeof MAX_EDGE;

/** Shrink in the browser before upload. Transparent PNGs (ornaments) stay PNG; everything else becomes JPEG. */
async function prepare(file: File, role: ImageRole): Promise<Blob> {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE[role] / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare images");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);

  if (file.type === "image/png" || file.type === "image/gif" || file.type === "image/webp") {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = false;
    for (let i = 3; i < data.length; i += 16) {
      if (data[i] < 250) {
        transparent = true;
        break;
      }
    }
    if (transparent) {
      const png = await canvasBlob(canvas, "image/png");
      if (png.size <= MAX_BYTES) return png;
    }
  }
  // JPEG has no transparency: paint white behind
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const fctx = flat.getContext("2d")!;
  fctx.fillStyle = "#ffffff";
  fctx.fillRect(0, 0, flat.width, flat.height);
  fctx.drawImage(canvas, 0, 0);
  let quality = 0.88;
  let blob = await canvasBlob(flat, "image/jpeg", quality);
  while (blob.size > MAX_BYTES && quality > 0.55) {
    quality -= 0.08;
    blob = await canvasBlob(flat, "image/jpeg", quality);
  }
  if (blob.size > MAX_BYTES) throw new Error("That image is still too large after shrinking. Try a smaller one.");
  return blob;
}

/** Upload an image for a chapter and return its public address. */
export async function uploadChapterImage(projectId: string, file: File, role: ImageRole): Promise<{ src: string; width: number; height: number }> {
  if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) throw new Error("Use a JPEG, PNG, GIF, or WebP image.");
  if (file.size > 40 * 1024 * 1024) throw new Error("That image is over 40 MB. Save a smaller copy and try again.");
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to add images.");
  const folder = `${user.id}/${projectId}/chapter-images`;
  const { data: existing } = await supabase.storage.from("covers").list(folder, { limit: MAX_CHAPTER_IMAGES + 1 });
  if ((existing?.length || 0) >= MAX_CHAPTER_IMAGES) throw new Error(`A book can have up to ${MAX_CHAPTER_IMAGES} images.`);

  const blob = await prepare(file, role);
  const dims = await loadImage(blob);
  const ext = blob.type === "image/png" ? "png" : "jpg";
  const path = `${folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage.from("covers").upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const src = coverPublicUrl(path);
  if (!src) throw new Error("Upload failed");
  const out = { src, width: dims.naturalWidth, height: dims.naturalHeight };
  URL.revokeObjectURL(dims.src);
  return out;
}
