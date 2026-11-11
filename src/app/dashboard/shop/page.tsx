"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { dollars } from "@/lib/direct-sale-rules";
import { ITEM_KINDS, type ShopItem, type ShopSettings } from "@/lib/shop-rules";

type Data = {
  items: ShopItem[];
  extras?: { id: string; title: string; projectId: string }[];
  settings: ShopSettings;
  books: { id: string; title: string }[];
  seller: { tier: string | null; termsAccepted: boolean; payoutsEnabled: boolean } | null;
  storageReady: boolean;
  migrationNeeded?: boolean;
  error?: string;
};
type Form = {
  id?: string;
  kind: string;
  projectId: string;
  title: string;
  description: string;
  price: string;
  stock: string;
  personalize: boolean;
  active: boolean;
  rights: boolean;
  includes: { ebook: string; audiobook: string; extraIds: string[] };
  numbered: boolean;
  limitedTotal: string;
  /** Set when editing a numbered edition: its size can't change */
  lockedTotal: number | null;
  shipsOn: string;
};

const blank: Form = {
  kind: "signed_book",
  projectId: "",
  title: "",
  description: "",
  price: "24.99",
  stock: "10",
  personalize: true,
  active: true,
  rights: false,
  includes: { ebook: "", audiobook: "", extraIds: [] },
  numbered: false,
  limitedTotal: "100",
  lockedTotal: null,
  shipsOn: "",
};
const toCents = (v: string) => Math.round(Number(v.replace(/[^0-9.]/g, "")) * 100) || 0;

/** The author's shop: signed books, bookmarks, and prints they ship themselves, and their shipping rates. */
export default function ShopPage() {
  const [d, setD] = useState<Data | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [ship, setShip] = useState({ first: "5.00", each: "1.00", days: "5" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/shop").catch(() => null);
    const j = (r?.ok ? await r.json() : null) as Data | null;
    if (!j) return;
    setD(j);
    if (j.settings) setShip({ first: (j.settings.shipFirstCents / 100).toFixed(2), each: (j.settings.shipEachCents / 100).toFixed(2), days: String(j.settings.handlingDays) });
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/shop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Something went wrong");
    return j as Record<string, unknown>;
  }
  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setMsg(null);
    try {
      const done = await fn();
      if (done) setMsg({ ok: true, text: done });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(false);
    }
  }
  async function uploadPhoto(id: string, file: File) {
    await run(async () => {
      const up = await post({ action: "photo_url", id, name: file.name });
      const put = await fetch(String(up.url), { method: "PUT", body: file, headers: { "Content-Type": file.type || "image/jpeg" } });
      if (!put.ok) throw new Error(`The photo didn't upload (${put.status}).`);
      await post({ action: "photo_uploaded", id, key: up.key });
      return "Photo added.";
    });
  }

  const input = "mt-1 block w-full border border-line bg-paper px-2 py-1.5 text-sm";
  const ready = d?.seller && d.seller.tier && d.seller.termsAccepted && d.seller.payoutsEnabled;
  return (
    <div className="font-ui mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Link href="/dashboard" className="text-sm text-accent hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display mt-3 text-3xl">Your shop</h1>
      <p className="mt-2 text-sm text-muted">
        Signed books, bookmarks, prints, and stickers that you ship yourself, sold from your launch pages to US readers. You get the price and the shipping
        you charge, less our usual fee and Stripe&apos;s, 14 days after you mark each order shipped.{" "}
        <Link href="/dashboard/orders" className="text-accent underline">
          Orders to ship
        </Link>
      </p>
      {!d ? (
        <p className="mt-6 text-sm text-muted">Loading…</p>
      ) : d.migrationNeeded ? (
        <p className="mt-6 text-sm text-danger">{d.error}</p>
      ) : (
        <>
          {!ready && (
            <p className="mt-4 border border-accent/40 bg-accent/5 px-3 py-2 text-sm">
              {d.seller?.tier ? "Set up selling first: accept the seller terms and connect payouts in any book's Sell tab." : "The shop is part of Pro and Studio."}
            </p>
          )}
          {d.settings.pausedReason && (
            <div className="mt-4 border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
              <p className="text-ink">Your shop is paused. {d.settings.pausedReason}</p>
              <button type="button" disabled={busy} className="mt-2 bg-accent px-3 py-1.5 text-xs text-paper" onClick={() => void run(async () => (await post({ action: "settings", shipFirstCents: toCents(ship.first), shipEachCents: toCents(ship.each), handlingDays: Number(ship.days), reopen: true }), "Your shop is open again."))}>
                Reopen my shop
              </button>
            </div>
          )}

          <section className="mt-8 border border-line p-4 text-sm">
            <h2 className="font-display text-xl">Shipping</h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-muted">
                First item (USD)
                <input value={ship.first} onChange={(e) => setShip({ ...ship, first: e.target.value })} inputMode="decimal" className={input} />
              </label>
              <label className="text-xs text-muted">
                Each extra item
                <input value={ship.each} onChange={(e) => setShip({ ...ship, each: e.target.value })} inputMode="decimal" className={input} />
              </label>
              <label className="text-xs text-muted">
                Ships within (business days)
                <input value={ship.days} onChange={(e) => setShip({ ...ship, days: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={input} />
              </label>
            </div>
            <p className="mt-2 text-xs text-muted">
              Media Mail is the cheapest way to send books, but it&apos;s for books only: a bookmark or print in the package means First-Class or Ground Advantage
              instead. A PO box or return-address service keeps your home address off every package.
            </p>
            <button type="button" disabled={busy} className="mt-2 border border-accent px-3 py-1.5 text-xs text-accent" onClick={() => void run(async () => (await post({ action: "settings", shipFirstCents: toCents(ship.first), shipEachCents: toCents(ship.each), handlingDays: Number(ship.days) }), "Saved."))}>
              Save shipping
            </button>
          </section>

          <section className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-xl">Items</h2>
              {!form && (
                <button type="button" className="border border-accent px-3 py-1.5 text-xs text-accent" onClick={() => setForm({ ...blank })}>
                  Add an item
                </button>
              )}
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {d.items.map((it) => (
                <li key={it.id} className="flex flex-wrap items-start gap-3 border border-line p-3">
                  {it.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.photoUrl} alt="" className="h-16 w-16 border border-line object-cover" />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center border border-line text-[10px] text-muted">No photo</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={it.active ? "text-ink" : "text-muted line-through"}>{it.title}</span>
                    <span className="block text-xs text-muted">
                      {ITEM_KINDS.find((k) => k.id === it.kind)?.label} · {dollars(it.priceCents)} · {it.stock ? `${it.stock} in stock` : "sold out"}
                      {it.personalize ? " · can be personalized" : ""}
                      {it.limitedTotal ? ` · numbered edition of ${it.limitedTotal} (${it.limitedTotal - it.stock} sold)` : ""}
                      {it.shipsOn ? ` · pre-order, ready ${it.shipsOn}` : ""}
                      {it.kind === "package" ? " · with digital copies" : ""}
                      {it.projectId ? ` · ${d.books.find((b) => b.id === it.projectId)?.title || "a book"}` : " · all your launch pages"}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-3 text-xs">
                      <button
                        type="button"
                        className="text-accent underline"
                        onClick={() =>
                          setForm({
                            id: it.id,
                            kind: it.kind,
                            projectId: it.projectId || "",
                            title: it.title,
                            description: it.description,
                            price: (it.priceCents / 100).toFixed(2),
                            stock: String(it.stock),
                            personalize: it.personalize,
                            active: it.active,
                            rights: true,
                            includes: { ebook: it.includes.ebook || "", audiobook: it.includes.audiobook || "", extraIds: it.includes.extraIds || [] },
                            numbered: Boolean(it.limitedTotal),
                            limitedTotal: String(it.limitedTotal || 100),
                            lockedTotal: it.limitedTotal,
                            shipsOn: it.shipsOn || "",
                          })
                        }
                      >
                        Edit
                      </button>
                      {d.storageReady && (
                        <label className="cursor-pointer text-accent underline">
                          {it.photoUrl ? "Replace photo" : "Add photo"}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            disabled={busy}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) void uploadPhoto(it.id, f);
                            }}
                          />
                        </label>
                      )}
                      <button
                        type="button"
                        className="text-danger underline"
                        onClick={() => {
                          if (window.confirm(`Delete "${it.title}"?`)) void run(async () => String((await post({ action: "delete_item", id: it.id })).note || "Deleted."));
                        }}
                      >
                        Delete
                      </button>
                    </span>
                  </span>
                </li>
              ))}
              {!d.items.length && !form && <p className="text-muted">Nothing in your shop yet.</p>}
            </ul>

            {form && (
              <form
                className="mt-4 space-y-3 border border-line p-4 text-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await post({
                      action: "save_item",
                      ...form,
                      priceCents: toCents(form.price),
                      stock: Number(form.stock) || 0,
                      limitedTotal: form.numbered && !form.lockedTotal ? Number(form.limitedTotal) : undefined,
                      shipsOn: form.shipsOn || null,
                    });
                    setForm(null);
                    return "Saved.";
                  });
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-muted">
                    What it is
                    <select
                      value={form.kind}
                      onChange={(e) => setForm({ ...form, kind: e.target.value, personalize: e.target.value === "signed_book" || e.target.value === "package" ? form.personalize : false })}
                      className={input}
                    >
                      {ITEM_KINDS.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-muted">
                    Show it on
                    <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className={input}>
                      <option value="">All my launch pages</option>
                      {d.books.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block text-xs text-muted">
                  Name
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Signed paperback of The Ember Coast" className={input} />
                </label>
                <label className="block text-xs text-muted">
                  Description (optional)
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className={input} />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-xs text-muted">
                    Price (USD)
                    <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} inputMode="decimal" className={input} />
                  </label>
                  {form.numbered ? (
                    <label className="text-xs text-muted">
                      Edition size (numbered)
                      <input
                        value={form.lockedTotal ? String(form.lockedTotal) : form.limitedTotal}
                        disabled={Boolean(form.lockedTotal)}
                        onChange={(e) => setForm({ ...form, limitedTotal: e.target.value.replace(/\D/g, "") })}
                        inputMode="numeric"
                        className={input}
                      />
                    </label>
                  ) : (
                    <label className="text-xs text-muted">
                      How many you have
                      <input value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={input} />
                    </label>
                  )}
                  <label className="flex items-center gap-2 pt-5 text-xs">
                    <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> For sale
                  </label>
                </div>
                {form.kind === "package" && (
                  <fieldset className="space-y-2 border border-line p-3 text-xs">
                    <legend className="px-1 text-muted">Digital copies that come with it (delivered right away)</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-muted">
                        Ebook of
                        <select value={form.includes.ebook} onChange={(e) => setForm({ ...form, includes: { ...form.includes, ebook: e.target.value } })} className={input}>
                          <option value="">None</option>
                          {d.books.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-muted">
                        Audiobook of
                        <select value={form.includes.audiobook} onChange={(e) => setForm({ ...form, includes: { ...form.includes, audiobook: e.target.value } })} className={input}>
                          <option value="">None</option>
                          {d.books.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {(d.extras || []).length > 0 && (
                      <div className="space-y-1">
                        <p className="text-muted">Extras</p>
                        {(d.extras || []).map((x) => (
                          <label key={x.id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={form.includes.extraIds.includes(x.id)}
                              onChange={(e) =>
                                setForm({ ...form, includes: { ...form.includes, extraIds: e.target.checked ? [...form.includes.extraIds, x.id] : form.includes.extraIds.filter((y) => y !== x.id) } })
                              }
                            />
                            {x.title}
                          </label>
                        ))}
                      </div>
                    )}
                    <p className="text-muted">The audiobook only arrives if its files are uploaded in that book&apos;s Audio tab.</p>
                  </fieldset>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-start gap-2 text-xs">
                    <input type="checkbox" className="mt-0.5" checked={form.numbered} disabled={Boolean(form.lockedTotal)} onChange={(e) => setForm({ ...form, numbered: e.target.checked })} />
                    <span>
                      Numbered limited edition
                      <span className="block text-muted">Each copy gets its number (“No. 12 of 100”) on the order and packing slip. The size can&apos;t change once saved.</span>
                    </span>
                  </label>
                  <label className="text-xs text-muted">
                    Pre-order: ready to ship on (optional)
                    <input type="date" value={form.shipsOn} onChange={(e) => setForm({ ...form, shipsOn: e.target.value })} className={input} />
                  </label>
                </div>
                {(form.kind === "signed_book" || form.kind === "package") && (
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={form.personalize} onChange={(e) => setForm({ ...form, personalize: e.target.checked })} /> Readers can ask for a dedication (“To Sam”, up to 60 characters)
                  </label>
                )}
                {form.kind !== "signed_book" && form.kind !== "package" && !form.id && (
                  <label className="flex items-start gap-2 text-xs">
                    <input type="checkbox" className="mt-0.5" checked={form.rights} onChange={(e) => setForm({ ...form, rights: e.target.checked })} />
                    <span>I made this art, or I have the right to sell it as merchandise (art made for your book often only covers the book itself).</span>
                  </label>
                )}
                <div className="flex gap-3">
                  <button type="submit" disabled={busy} className="bg-accent px-4 py-2 text-paper disabled:opacity-50">
                    Save item
                  </button>
                  <button type="button" className="text-muted underline" onClick={() => setForm(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </section>
        </>
      )}
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-accent" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
