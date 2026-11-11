"use client";

import { useCallback, useEffect, useState } from "react";
import { EXPORT_FOLDER, folderFiles, type AudioStore } from "@/lib/audio/local-store";
import { dollars, type AudiobookSale } from "@/lib/direct-sale-rules";

type FileRow = { id: string; title: string; fileName: string; bytes: number; durationMs: number; isSample: boolean };
type State = { sale: AudiobookSale; ebookPriceCents: number; files: FileRow[]; ready: boolean; reason: string | null; storageReady: boolean; canUseDelivered: boolean; migrationNeeded?: boolean; error?: string };

const mb = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${Math.max(1, Math.round(b / 1024 ** 2))} MB`);

/** Audio tab, author side: put the finished audiobook on sale on the launch page, alone or with the ebook. */
export function AudioSellPanel({ projectId, store }: { projectId: string; store: AudioStore | null }) {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [bundle, setBundle] = useState("");

  const load = useCallback(async () => {
    const d = await fetch(`/api/projects/${projectId}/audiobook`)
      .then((r) => r.json())
      .catch(() => null);
    if (!d) return;
    setS(d);
    if (d.sale) {
      setPrice((d.sale.priceCents / 100).toFixed(2));
      setBundle(d.sale.bundlePriceCents != null ? (d.sale.bundlePriceCents / 100).toFixed(2) : "");
    }
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const r = await fetch(`/api/projects/${projectId}/audiobook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Couldn't do that");
    return d;
  }

  async function save(patch: Partial<AudiobookSale>) {
    if (!s) return;
    const sale = { ...s.sale, ...patch };
    setS({ ...s, sale });
    await post({ action: "settings", sale }).catch((e) => setMsg(e.message));
    await load();
  }

  async function uploadFromExport() {
    if (!store) return setMsg("Choose where recordings are saved (section 1) so we can read your export folder.");
    const files = (await folderFiles(store, EXPORT_FOLDER)).filter((f) => /\.mp3$/i.test(f.name));
    if (!files.length) return setMsg("Export everything first (section 4), then upload.");
    await upload(files);
  }

  /** Name files like "001 Chapter One.mp3" so they play in order; "Retail Sample.mp3" becomes the launch-page sample. */
  async function upload(files: File[]) {
    setMsg(null);
    try {
      for (const [i, f] of files.entries()) {
        setBusy(`Uploading ${i + 1} of ${files.length}: ${f.name}`);
        const up = await post({ action: "upload_url", name: f.name });
        const put = await fetch(String(up.url), { method: "PUT", body: f, headers: { "Content-Type": "audio/mpeg" } });
        if (!put.ok) throw new Error(`${f.name} didn't upload (${put.status}). Try again.`);
        await post({ action: "uploaded", name: f.name });
      }
      setMsg(`Uploaded ${files.length} files.`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function act(action: "use_delivered" | "clear", done: string) {
    if (action === "clear" && !window.confirm("Remove the audiobook files from sale? Buyers who already bought it keep access only while files are here.")) return;
    setBusy(action === "clear" ? "Removing…" : "Copying your narrator's files…");
    setMsg(null);
    try {
      await post({ action });
      setMsg(done);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't do that");
    } finally {
      setBusy(null);
    }
  }

  if (!s) return <p className="mt-2 text-xs text-muted">Loading…</p>;
  if (s.migrationNeeded) return <p className="mt-2 text-sm text-danger">{s.error}</p>;
  const listening = s.files.filter((f) => !f.isSample);
  const hours = listening.reduce((n, f) => n + f.durationMs, 0) / 3_600_000;
  const both = s.ebookPriceCents + s.sale.priceCents;

  return (
    <div className="mt-2 space-y-4 text-xs">
      <p className="text-sm text-muted">
        Sell the finished audiobook on your launch page, alone or with the ebook, through the same checkout, sales tax, fees, refunds, and monthly payouts as your ebooks. Buyers stream it or
        download the MP3s to keep.
      </p>

      <div>
        <p className="text-sm text-ink">Listening copy</p>
        {listening.length ? (
          <p className="mt-1 text-muted">
            {listening.length} files · {hours.toFixed(1)} hours · {mb(s.files.reduce((n, f) => n + f.bytes, 0))}
            {s.files.some((f) => f.isSample) ? " · retail sample plays on your launch page" : " · no retail sample yet"}
          </p>
        ) : (
          <p className="mt-1 text-muted">Nothing uploaded yet.</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {store && (
            <button type="button" disabled={Boolean(busy) || !s.storageReady} className="border border-line px-3 py-1.5 disabled:opacity-50" onClick={() => void uploadFromExport()}>
              {listening.length ? "Upload again from my export folder" : "Upload from my export folder"}
            </button>
          )}
          <label className={`cursor-pointer border border-line px-3 py-1.5 ${busy || !s.storageReady ? "pointer-events-none opacity-50" : ""}`}>
            Choose MP3 files…
            <input
              type="file"
              accept=".mp3,audio/mpeg"
              multiple
              className="sr-only"
              onChange={(e) => {
                const picked = [...(e.target.files || [])].sort((a, b) => a.name.localeCompare(b.name));
                e.target.value = "";
                if (picked.length) void upload(picked);
              }}
            />
          </label>
          {s.canUseDelivered && (
            <button type="button" disabled={Boolean(busy)} className="border border-line px-3 py-1.5 disabled:opacity-50" onClick={() => void act("use_delivered", "Your narrator's finished files are now the listening copy.")}>
              Use my narrator&apos;s delivered files
            </button>
          )}
          {listening.length > 0 && (
            <button type="button" disabled={Boolean(busy)} className="text-danger underline disabled:opacity-50" onClick={() => void act("clear", "Removed.")}>
              Remove
            </button>
          )}
        </div>
        {busy && <p className="mt-1 text-muted">{busy}</p>}
        <p className="mt-1 text-[11px] text-muted">
          Recorded somewhere else? Choose the MP3s (192 kbps works best). Name them like &quot;001 Chapter One.mp3&quot; so they play in order; a file named &quot;Retail Sample.mp3&quot; plays on your launch page.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-muted">Audiobook price ($)</span>
          <input
            type="number"
            min={0.99}
            step={0.01}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => void save({ priceCents: Math.round(Number(price) * 100) })}
            className="mt-1 w-full border border-line bg-paper px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-muted">Ebook + audiobook ($, optional)</span>
          <input
            type="number"
            min={0.99}
            step={0.01}
            value={bundle}
            placeholder={`Less than ${dollars(both)}`}
            onChange={(e) => setBundle(e.target.value)}
            onBlur={() => void save({ bundlePriceCents: bundle.trim() ? Math.round(Number(bundle) * 100) : null })}
            className="mt-1 w-full border border-line bg-paper px-2 py-1.5 text-sm"
          />
          <span className="text-[11px] text-muted">Shown when it&apos;s cheaper than both ({dollars(both)}) and the ebook is on sale too</span>
        </label>
        <label className="flex items-start gap-2 pt-5">
          <input type="checkbox" className="mt-0.5" checked={s.sale.humanNarrated} onChange={(e) => void save({ humanNarrated: e.target.checked })} />
          <span>
            Narrated by a person
            <span className="block text-[11px] text-muted">No AI voice. Shown to buyers.</span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.sale.on} onChange={(e) => void save({ on: e.target.checked })} /> Sell the audiobook here
        </label>
        <span className={s.ready ? "text-accent" : "text-muted"}>{s.ready ? "✓ On sale on your launch page" : s.reason}</span>
      </div>
      {msg && <p className="text-ink">{msg}</p>}
    </div>
  );
}
