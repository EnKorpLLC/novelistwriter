"use client";

import { useCallback, useEffect, useState } from "react";
import { REFUND_WINDOW_DAYS, dollars, type SellerTier } from "@/lib/direct-sale-rules";
import { LULU_TRIM_OPTIONS, kdpPaperbackRoyalty, paperbackShare } from "@/lib/print-rules";
import { BuyPaperbackButton } from "@/components/BuyPaperbackButton";

type Edition = {
  trim: string;
  paper: "cream" | "white";
  finish: "matte" | "gloss";
  pageCount: number;
  interiorStatus: string;
  coverStatus: string;
  fileErrors: string[];
  printCostCents: number | null;
  proofOk: boolean;
  priceCents: number;
  saleOn: boolean;
  freeEbook: boolean;
  hasInterior: boolean;
  hasCover: boolean;
};
type Data = {
  connected: boolean;
  sandbox: boolean;
  storageReady: boolean;
  tier: SellerTier | null;
  edition: Edition | null;
  defaults: { trim: string; paper: "cream" | "white"; pageCount: number };
  coverSize: { width: number; height: number } | null;
  live: boolean;
  reason: string | null;
  migrationNeeded?: boolean;
  error?: string;
};

const STATUS: Record<string, string> = { none: "Not uploaded", checking: "Lulu is checking it…", ok: "✓ Passed Lulu's check", error: "Lulu found a problem" };

/** Sell tab: the paperback, printed and shipped by Lulu for each order. */
export function PaperbackPanel({ projectId }: { projectId: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [form, setForm] = useState({ trim: "6x9", paper: "cream", finish: "matte", pageCount: "", price: "16.99", freeEbook: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/print-edition`).catch(() => null);
    const data = (r?.ok ? await r.json() : null) as Data | null;
    if (!data) return;
    setD(data);
    const e = data.edition;
    setForm({
      trim: e?.trim || data.defaults.trim,
      paper: e?.paper || data.defaults.paper,
      finish: e?.finish || "matte",
      pageCount: String(e?.pageCount || data.defaults.pageCount || ""),
      price: ((e?.priceCents || 1699) / 100).toFixed(2),
      freeEbook: e?.freeEbook ?? true,
    });
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);
  // Lulu checks files in the background; look again while one is running
  useEffect(() => {
    if (d?.edition?.interiorStatus !== "checking" && d?.edition?.coverStatus !== "checking") return;
    const t = setTimeout(() => void load(), 8000);
    return () => clearTimeout(t);
  }, [d, load]);

  async function post(body: Record<string, unknown>) {
    const r = await fetch(`/api/projects/${projectId}/print-edition`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Something went wrong");
    return j as Record<string, unknown>;
  }
  async function run(label: string, fn: () => Promise<string | void>) {
    setBusy(label);
    setMsg(null);
    try {
      const done = await fn();
      if (done) setMsg({ ok: true, text: done });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(null);
      await load();
    }
  }
  async function upload(kind: "interior" | "cover", file: File) {
    await run(kind, async () => {
      if (!/\.pdf$/i.test(file.name)) throw new Error("Upload a PDF.");
      const up = await post({ action: "upload_url", kind });
      const put = await fetch(String(up.url), { method: "PUT", body: file, headers: { "Content-Type": "application/pdf" } });
      if (!put.ok) throw new Error(`The file didn't upload (${put.status}). Try again.`);
      const res = await post({ action: "uploaded", kind, key: up.key });
      return res.checking ? "Uploaded. Lulu is checking it; this takes a minute or two." : "Uploaded.";
    });
  }

  if (!d) return null;
  const e = d.edition;
  const tier = d.tier || "pro";
  const priceCents = Math.round(Number(form.price.replace(/[^0-9.]/g, "")) * 100) || 0;
  const share = e?.printCostCents ? paperbackShare(priceCents, e.printCostCents, tier) : null;
  const pages = Number(form.pageCount) || 0;
  const input = "mt-1 block w-full border border-line bg-paper px-2 py-1.5 text-sm";

  return (
    <div className="mt-5 border-t border-line pt-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-ink">Paperback, printed on demand</p>
        {d.live && <span className="text-xs text-accent">✓ On sale on your launch page</span>}
      </div>
      <p className="text-xs text-muted">
        Lulu prints and ships each order, so there&apos;s no stock and nothing to mail yourself. Readers pay your price plus shipping at cost, and get the ebook
        free if you like. US readers for now.
      </p>
      {d.migrationNeeded ? (
        <p className="mt-2 text-xs text-danger">{d.error}</p>
      ) : !d.connected ? (
        <p className="mt-2 text-xs text-muted">Paperback printing turns on once Novelist Writer connects its Lulu account. Your print layout and cover builder are ready when it does.</p>
      ) : (
        <ol className="mt-3 space-y-5">
          <li>
            <p className="text-ink">1. Size, page count, and price</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-muted">
                Trim size
                <select value={form.trim} onChange={(ev) => setForm({ ...form, trim: ev.target.value })} className={input}>
                  {LULU_TRIM_OPTIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted">
                Paper
                <select value={form.paper} onChange={(ev) => setForm({ ...form, paper: ev.target.value })} className={input}>
                  <option value="cream">Cream</option>
                  <option value="white">White</option>
                </select>
              </label>
              <label className="text-xs text-muted">
                Cover finish
                <select value={form.finish} onChange={(ev) => setForm({ ...form, finish: ev.target.value })} className={input}>
                  <option value="matte">Matte</option>
                  <option value="gloss">Gloss</option>
                </select>
              </label>
              <label className="text-xs text-muted">
                Pages (from your print layout)
                <input value={form.pageCount} onChange={(ev) => setForm({ ...form, pageCount: ev.target.value.replace(/\D/g, "") })} inputMode="numeric" className={input} />
              </label>
              <label className="text-xs text-muted">
                Price (USD)
                <input value={form.price} onChange={(ev) => setForm({ ...form, price: ev.target.value })} inputMode="decimal" className={input} />
              </label>
              <label className="flex items-center gap-2 pt-5 text-xs">
                <input type="checkbox" checked={form.freeEbook} onChange={(ev) => setForm({ ...form, freeEbook: ev.target.checked })} /> Ebook free with each paperback
              </label>
            </div>
            <button
              type="button"
              disabled={Boolean(busy)}
              className="mt-2 border border-accent px-3 py-1.5 text-xs text-accent disabled:opacity-50"
              onClick={() =>
                void run("settings", async () => {
                  const r = await post({ action: "settings", ...form, pageCount: pages, priceCents });
                  return r.reset ? "Saved. The size or length changed, so upload new files and order a new proof." : "Saved.";
                })
              }
            >
              Save
            </button>
            {share && e && (
              <p className="mt-2 text-xs text-muted">
                At {dollars(priceCents)}: printing {dollars(share.printCents)}, our fee {dollars(share.feeCents)}, Stripe about {dollars(share.stripeCents)}, so you keep about{" "}
                <strong className="text-ink">{dollars(share.authorCents)}</strong> a copy. KDP would pay about {dollars(kdpPaperbackRoyalty(priceCents, e.pageCount))}.
                {share.authorCents < 100 ? " Raise the price: you need to keep at least $1.00 a copy." : ""}
              </p>
            )}
          </li>

          {e && (
            <li>
              <p className="text-ink">2. Print files (PDF)</p>
              <p className="text-xs text-muted">
                The interior from your{" "}
                <a href={`/project/${projectId}/print`} className="underline">
                  print layout
                </a>{" "}
                at the same trim size, and the full cover (back, spine, front)
                {d.coverSize ? (
                  <>
                    {" "}
                    at exactly <strong className="text-ink">{d.coverSize.width.toFixed(3)}″ × {d.coverSize.height.toFixed(3)}″</strong>, which includes Lulu&apos;s spine and bleed
                  </>
                ) : (
                  " (save the page count to see the exact size Lulu needs)"
                )}
                . Lulu&apos;s spine can differ a little from KDP&apos;s, so match the cover builder&apos;s wrap to that size. No ISBN is needed to sell here; if your KDP
                paperback uses KDP&apos;s free ISBN, leave it and its barcode off this cover.{" "}
                <a href="/isbn" target="_blank" className="underline">
                  ISBNs explained
                </a>
              </p>
              {!d.storageReady && <p className="mt-1 text-xs text-danger">File storage isn&apos;t set up yet.</p>}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(["interior", "cover"] as const).map((kind) => {
                  const status = kind === "interior" ? e.interiorStatus : e.coverStatus;
                  return (
                    <div key={kind} className="border border-line p-2 text-xs">
                      <p className="text-ink">{kind === "interior" ? "Interior" : "Cover"}</p>
                      <p className={status === "ok" ? "text-accent" : status === "error" ? "text-danger" : "text-muted"}>{STATUS[status] || status}</p>
                      {d.storageReady && (
                        <label className="mt-1 inline-block cursor-pointer text-accent underline">
                          {busy === kind ? "Uploading…" : status === "none" ? "Upload PDF" : "Replace"}
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            className="hidden"
                            disabled={Boolean(busy)}
                            onChange={(ev) => {
                              const f = ev.target.files?.[0];
                              ev.target.value = "";
                              if (f) void upload(kind, f);
                            }}
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
              {e.fileErrors.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-danger">
                  {e.fileErrors.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
            </li>
          )}

          {e && e.interiorStatus === "ok" && e.coverStatus === "ok" && (
            <li>
              <p className="text-ink">3. Proof copy</p>
              <p className="text-xs text-muted">Order one copy at Lulu&apos;s cost and check it in your hands: cover colors, margins, page order. Selling opens once you confirm it.</p>
              <div className="mt-2 flex flex-wrap items-start gap-3">
                <BuyPaperbackButton projectId={projectId} priceCents={e.printCostCents || 0} proof />
                {!e.proofOk ? (
                  <button type="button" disabled={Boolean(busy)} className="border border-line px-3 py-2 text-xs" onClick={() => void run("proof", async () => (await post({ action: "proof_ok" }), "Confirmed. You can turn on selling below."))}>
                    My proof looks right
                  </button>
                ) : (
                  <span className="text-xs text-accent">✓ Proof confirmed</span>
                )}
              </div>
            </li>
          )}

          {e && e.proofOk && (
            <li>
              <p className="text-ink">4. Sell it</p>
              <label className="mt-1 flex items-center gap-2">
                <input type="checkbox" checked={e.saleOn} disabled={Boolean(busy)} onChange={(ev) => void run("sale", async () => void (await post({ action: "sale", on: ev.target.checked })))} />
                Sell the paperback on my launch page
              </label>
              {e.saleOn && !d.live && d.reason && <p className="mt-1 text-xs text-danger">Not on sale yet: {d.reason}</p>}
              <p className="mt-1 text-xs text-muted">Your share is paid {REFUND_WINDOW_DAYS} days after each copy ships. Printed-to-order books can&apos;t be returned, but misprints and lost packages are replaced.</p>
            </li>
          )}
        </ol>
      )}
      {d.sandbox && <p className="mt-2 text-xs text-muted">Lulu is in test mode: orders go to Lulu&apos;s sandbox and are never printed.</p>}
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-accent" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
