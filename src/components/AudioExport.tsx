"use client";

import { useState } from "react";
import { assemble, findPauses, frameDb, readPcm, sentenceCuts, sentencesOf, type Pcm } from "@/lib/audio/assemble";
import { encodeMp3, master, storeChecks, type Check } from "@/lib/audio/master";
import { EXPORT_FOLDER, clearFolder, folderFiles, readFile, saveFile, type AudioStore } from "@/lib/audio/local-store";
import { canvasBlob } from "@/lib/book/cover-template";
import { rootTake, type ChapterReview, type StudioTake } from "@/components/AudioReview";

/** A recording slot: a chapter, or the opening or closing credits. */
export type AudioSlot = { id: string; kind: "opening" | "chapter" | "closing"; title: string; content_text: string; folder: string };
export type AudioSettings = { narrator: string; sampleChapterId: string | null; sampleSentence: number };

/** What the narrator reads for the credits. Stores ask for at least the title, author, and narrator. */
export function creditsScripts(book: { title: string; author: string; narrator: string }) {
  const year = new Date().getFullYear();
  const t = book.title || "Untitled";
  const a = book.author || "the author";
  const n = book.narrator || a;
  return {
    opening: `${t}. Written by ${a}. Narrated by ${n}.`,
    closing: `This has been ${t}, written by ${a}, narrated by ${n}. Copyright ${year} by ${a}. Production copyright ${year} by ${a}. The end.`,
  };
}

const MAX_SAMPLE_MS = 4.6 * 60_000;
const MIN_SAMPLE_MS = 60_000;
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled";

type Result = { checks: Check[]; file: string; minutes: number } | { error: string };

const CHECKLISTS: Record<string, string> = {
  "ACX (Audible and Amazon)": `Upload to ACX (acx.com)

1. Open your title in ACX and go to the Produce tab.
2. Upload "001 Opening Credits.mp3" into the Opening Credits slot.
3. Upload each chapter file into its own section, in order.
4. Upload the "Closing Credits" file into the Closing Credits slot.
5. Upload "Retail Sample.mp3" as the retail sample.
6. Upload "Cover 2400x2400.jpg" as the audiobook cover (ACX wants at least 2400 x 2400 pixels, square).

These files were checked against ACX's audio rules before export: loudness (RMS) -23 to -18 dB,
peaks at or below -3 dB, noise floor at or below -60 dB, 0.5 to 1 second of room tone at the start
and 1 to 5 seconds at the end, each file under 120 minutes, 192 kbps constant bit rate MP3 at 44.1 kHz.
ACX still reviews every title by ear; that can take a few weeks.
`,
  "Spotify for Authors": `Upload to Spotify for Authors (formerly Findaway Voices)

1. Create the audiobook and fill in the book details.
2. Upload the files in their numbered order: opening credits, chapters, closing credits.
3. Upload the retail sample if it asks for one, and the square cover.

The files are made to ACX's rules, which are the strictest of the common stores. Check the store's
current requirements before you upload, in case they've changed.
`,
  "Google Play Books": `Upload to Google Play Books (Partner Center)

1. Add a new audiobook and fill in the book details.
2. Upload the files in their numbered order; the numbers keep the chapters in sequence.
3. Add the square cover.

The files are made to ACX's rules, which are the strictest of the common stores. Check the store's
current requirements before you upload, in case they've changed.
`,
  Kobo: `Upload to Kobo Writing Life (audiobooks)

1. Create a new audiobook and fill in the book details.
2. Upload the files in their numbered order: opening credits, chapters, closing credits.
3. Add the square cover.

The files are made to ACX's rules, which are the strictest of the common stores. Check the store's
current requirements before you upload, in case they've changed.
`,
};

/** 2400 x 2400 square from the ebook cover: the cover centered on a blurred copy of itself. */
async function squareCover(url: string): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Couldn't load the cover"));
    i.src = `${url}${url.includes("?") ? "&" : "?"}sq=1`;
  });
  const S = 2400;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d")!;
  const cover = Math.max(S / img.width, S / img.height);
  ctx.filter = "blur(60px) brightness(0.8)";
  ctx.drawImage(img, (S - img.width * cover) / 2 - 80, (S - img.height * cover) / 2 - 80, img.width * cover + 160, img.height * cover + 160);
  ctx.filter = "none";
  const fit = Math.min(S / img.width, S / img.height) * 0.94;
  const w = img.width * fit;
  const h = img.height * fit;
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 50;
  ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
  return canvasBlob(c, "image/jpeg", 0.92);
}

export function AudioExport({
  store,
  slots,
  takes,
  reviews,
  settings,
  exportHint,
  coverUrl,
  onSettings,
}: {
  store: AudioStore | null;
  slots: AudioSlot[];
  takes: (StudioTake & { chapterId: string })[];
  reviews: Record<string, ChapterReview>;
  settings: AudioSettings;
  exportHint: string | null;
  coverUrl: string | null;
  onSettings: (s: AudioSettings) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [narrator, setNarrator] = useState(settings.narrator);
  const chapters = slots.filter((s) => s.kind === "chapter");
  const sampleSlot = chapters.find((c) => c.id === settings.sampleChapterId) || chapters[0];
  const sampleSentences = sampleSlot ? sentencesOf(sampleSlot.content_text) : [];
  const ready = (s: AudioSlot) => Boolean(rootTake(takes.filter((t) => t.chapterId === s.id)));
  const fileName = (s: AudioSlot, i: number) =>
    `${String(i + 1).padStart(3, "0")} ${s.kind === "opening" ? "Opening Credits" : s.kind === "closing" ? "Closing Credits" : safeName(s.title)}.mp3`;

  async function chapterAudio(s: AudioSlot): Promise<Pcm | null> {
    if (!store) return null;
    const mine = takes.filter((t) => t.chapterId === s.id);
    const root = rootTake(mine);
    if (!root) return null;
    const r = await assemble(
      root.id,
      mine.filter((t) => t.chosen),
      async (id) => {
        const t = mine.find((x) => x.id === id);
        const f = t && (await readFile(store, s.folder, t.fileName));
        return f ? readPcm(f) : null;
      }
    );
    return r?.pcm || null;
  }

  async function exportOne(s: AudioSlot, i: number): Promise<Result> {
    const pcm = await chapterAudio(s);
    if (!pcm) return { error: "Not recorded yet" };
    setBusy(`Mastering ${s.title}…`);
    setProgress(0);
    const m = await master(pcm);
    setBusy(`Encoding ${s.title}…`);
    const mp3 = await encodeMp3(m.samples, setProgress);
    const file = fileName(s, i);
    await saveFile(store!, EXPORT_FOLDER, file, mp3);
    return { checks: storeChecks(m), file, minutes: m.after.minutes };
  }

  async function exportSample(): Promise<Result> {
    if (!sampleSlot) return { error: "No chapters yet" };
    const pcm = await chapterAudio(sampleSlot);
    if (!pcm) return { error: `${sampleSlot.title} isn't recorded yet` };
    setBusy("Cutting the retail sample…");
    // Start and end on sentence breaks, as close to 5 minutes as fits with the room tone added
    const cuts = sentenceCuts(findPauses(frameDb(pcm)), sampleSentences.map((x) => x.text.length));
    const start = cuts[Math.min(settings.sampleSentence, cuts.length - 2)] || 0;
    const fits = cuts.filter((c) => c > start + MIN_SAMPLE_MS && c <= start + MAX_SAMPLE_MS);
    const end = fits.length ? fits[fits.length - 1] : Math.min(start + MAX_SAMPLE_MS, (pcm.data.length / pcm.rate) * 1000);
    const at = (ms: number) => Math.round((ms / 1000) * pcm.rate);
    const m = await master({ data: pcm.data.subarray(at(start), at(end)), rate: pcm.rate });
    setBusy("Encoding the retail sample…");
    const mp3 = await encodeMp3(m.samples, setProgress);
    await saveFile(store!, EXPORT_FOLDER, "Retail Sample.mp3", mp3);
    return { checks: storeChecks(m, "sample"), file: "Retail Sample.mp3", minutes: m.after.minutes };
  }

  async function run(which: "all" | string) {
    if (!store) return;
    setMsg(null);
    try {
      if (which === "all") {
        await clearFolder(store, EXPORT_FOLDER);
        setResults({});
      }
      for (let i = 0; i < slots.length; i++) {
        if (which !== "all" && which !== slots[i].id) continue;
        const r = await exportOne(slots[i], i).catch((e) => ({ error: e instanceof Error ? e.message : "Export failed" }));
        setResults((x) => ({ ...x, [slots[i].id]: r }));
      }
      if (which === "all" || which === "sample") {
        const r = await exportSample().catch((e) => ({ error: e instanceof Error ? e.message : "Export failed" }));
        setResults((x) => ({ ...x, sample: r }));
      }
      if (which === "all") {
        setBusy("Making the square cover…");
        if (coverUrl) {
          const cover = await squareCover(coverUrl).catch(() => null);
          if (cover) await saveFile(store, EXPORT_FOLDER, "Cover 2400x2400.jpg", cover);
          else setMsg("Couldn't make the square cover from your ebook cover. Upload a 2400 x 2400 JPG to each store yourself.");
        } else setMsg("Add a cover in the Cover tab to get a square audiobook cover with the export.");
        for (const [store_, text] of Object.entries(CHECKLISTS)) await saveFile(store, EXPORT_FOLDER, `How to upload - ${store_}.txt`, new Blob([text], { type: "text/plain" }));
      }
    } finally {
      setBusy(null);
      setProgress(0);
    }
  }

  async function downloadZip() {
    if (!store) return;
    setBusy("Zipping…");
    try {
      const files = await folderFiles(store, EXPORT_FOLDER);
      if (!files.length) return setMsg("Export first, then download.");
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const f of files) zip.file(f.name, f, { compression: "STORE" });
      const name = "audiobook-export.zip";
      // Stream straight to disk where the browser allows it, so a long book never sits in memory
      const picker = (window as Window & { showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
      if (picker) {
        const handle = await picker({ suggestedName: name, types: [{ description: "Zip", accept: { "application/zip": [".zip"] } }] }).catch(() => null);
        if (!handle) return;
        const w = await handle.createWritable();
        await new Promise<void>((resolve, reject) => {
          zip
            .generateInternalStream({ type: "uint8array", streamFiles: true })
            .on("data", (chunk, meta) => {
              void w.write(chunk as Uint8Array<ArrayBuffer>);
              setProgress(meta.percent / 100);
            })
            .on("error", reject)
            .on("end", () => resolve())
            .resume();
        });
        await w.close();
      } else {
        const blob = await zip.generateAsync({ type: "blob" }, (m) => setProgress(m.percent / 100));
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't make the zip");
    } finally {
      setBusy(null);
      setProgress(0);
    }
  }

  const row = (id: string, label: string, status: string, onExport: () => void) => {
    const r = results[id];
    const failed = r && "checks" in r ? r.checks.filter((c) => !c.ok) : [];
    return (
      <li key={id} className="py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0">
            {label} <span className="text-muted">· {status}</span>
          </span>
          <button type="button" disabled={Boolean(busy) || !store} className="text-accent underline disabled:opacity-50" onClick={onExport}>
            {r && "file" in r ? "Export again" : "Export"}
          </button>
        </div>
        {r && "error" in r && <p className="mt-0.5 text-danger">{r.error}</p>}
        {r && "checks" in r && (
          <p className={`mt-0.5 ${failed.length ? "text-danger" : "text-accent"}`}>
            {failed.length ? failed.map((c) => `${c.label}: ${c.detail}`).join(" · ") : `✓ Meets store specs · ${r.minutes.toFixed(1)} min · ${r.file}`}
          </p>
        )}
      </li>
    );
  };

  if (exportHint) return <p className="mt-2 text-sm text-danger">{exportHint}</p>;

  return (
    <div className="mt-2 space-y-4 text-xs">
      <p className="text-sm text-muted">
        Masters each chapter on this computer (rumble filter, room tone to spec, level, quieter pauses if the room is noisy, peak limiting), checks it against ACX&apos;s rules,
        and saves 192 kbps MP3 files to an <b>export</b> folder next to your recordings, ready for ACX, Spotify for Authors, Google Play, and Kobo.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-muted">Narrated by (for the credits)</span>
          <input
            value={narrator}
            onChange={(e) => setNarrator(e.target.value)}
            onBlur={() => narrator !== settings.narrator && onSettings({ ...settings, narrator: narrator.trim() })}
            placeholder="Your name if you narrate it yourself"
            className="mt-1 w-full border border-line bg-paper px-2 py-1.5 text-sm"
          />
        </label>
        <div>
          <span className="text-muted">Retail sample (up to 5 minutes, no credits)</span>
          <div className="mt-1 flex flex-wrap gap-2">
            <select
              value={sampleSlot?.id || ""}
              onChange={(e) => onSettings({ ...settings, sampleChapterId: e.target.value, sampleSentence: 0 })}
              className="max-w-full border border-line bg-paper px-2 py-1.5"
            >
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <select
              value={settings.sampleSentence}
              onChange={(e) => onSettings({ ...settings, sampleSentence: Number(e.target.value) })}
              className="min-w-0 max-w-full flex-1 border border-line bg-paper px-2 py-1.5"
              aria-label="Sample starts at"
            >
              {sampleSentences.slice(0, 40).map((s, i) => (
                <option key={i} value={i}>
                  From: {s.text.slice(0, 60)}
                  {s.text.length > 60 ? "…" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <ul className="divide-y divide-line border-y border-line">
        {slots.map((s) =>
          row(
            s.id,
            s.title,
            !ready(s) ? "not recorded" : s.kind !== "chapter" ? "recorded" : reviews[s.id]?.status === "approved" ? "approved" : reviews[s.id]?.status === "review" ? "in review" : "recorded, not approved",
            () => void run(s.id)
          )
        )}
        {row("sample", "Retail sample", sampleSlot ? `from ${sampleSlot.title}` : "no chapters", () => void run("sample"))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={Boolean(busy) || !store} className="bg-accent px-4 py-2 text-paper disabled:opacity-50" onClick={() => void run("all")}>
          Export everything
        </button>
        <button type="button" disabled={Boolean(busy) || !store} className="border border-line px-3 py-2 disabled:opacity-50" onClick={() => void downloadZip()}>
          Download the export as a zip
        </button>
        {busy && (
          <span className="text-muted">
            {busy} {progress > 0 && progress < 1 ? `${Math.round(progress * 100)}%` : ""}
          </span>
        )}
      </div>
      {!store && <p className="text-muted">Choose where recordings are saved first.</p>}
      {msg && <p className="text-danger">{msg}</p>}
      <p className="text-[11px] text-muted">
        Export everything also adds a 2400 × 2400 square cover made from your ebook cover and a short upload guide for each store. Stores have no upload API, so you upload the
        files yourself; they&apos;re yours to use anywhere.
      </p>
    </div>
  );
}
