"use client";

import { useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { uploadChapterImage, type ImageRole } from "@/lib/chapter-images";

/** Toolbar button: add a map, illustration, chapter art, or an image scene break. */
export function ChapterImageButton({ editor, projectId }: { editor: Editor; projectId: string }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<ImageRole>("full");
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function add(file: File) {
    setBusy(true);
    setError(null);
    try {
      const { src } = await uploadChapterImage(projectId, file, role);
      const nodes = [{ type: "image", attrs: { src, alt: role === "break" ? "" : alt.trim(), role } }];
      // Keep typing after the image: a paragraph follows it
      editor
        .chain()
        .focus()
        .insertContent([...nodes, { type: "paragraph" }])
        .run();
      setOpen(false);
      setAlt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the image");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <span className="relative">
      <button
        type="button"
        title="Add an image: a map, illustration, or image scene break"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className={`rounded-sm px-2 py-1 text-xs ${open ? "bg-accent text-paper" : "text-ink hover:bg-paper-deep"}`}
      >
        Image
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 border border-line bg-paper p-3 text-xs shadow-lg">
          <p className="text-ink">Add an image here</p>
          <div className="mt-2 space-y-1">
            <label className="flex items-start gap-2">
              <input type="radio" name="img-role" className="mt-0.5" checked={role === "full"} onChange={() => setRole("full")} />
              <span>
                Map, illustration, or chapter art
                <span className="block text-muted">Full width of the page</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="img-role" className="mt-0.5" checked={role === "break"} onChange={() => setRole("break")} />
              <span>
                Ornament or image scene break
                <span className="block text-muted">Small and centered, between scenes</span>
              </span>
            </label>
          </div>
          {role === "full" && (
            <label className="mt-2 block">
              Description for readers who can&apos;t see it
              <input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Map of the northern kingdoms" className="mt-1 w-full border border-line px-2 py-1" />
            </label>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void add(e.target.files[0])} />
          <div className="mt-3 flex items-center gap-2">
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="bg-accent px-3 py-1.5 text-paper disabled:opacity-60">
              {busy ? "Adding…" : "Choose image"}
            </button>
            <button type="button" className="text-muted underline" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          <p className="mt-2 text-muted">Images are shrunk before upload. For print, use art at least 1800 pixels wide.</p>
          {error && <p className="mt-2 text-danger">{error}</p>}
        </div>
      )}
    </span>
  );
}
