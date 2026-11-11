"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { dollars, longDay } from "@/lib/direct-sale-rules";
import { ADDRESS_HIDE_DAYS, CARRIERS, TRACKING_REQUIRED_OVER_CENTS } from "@/lib/shop-rules";

type Order = {
  id: string;
  title: string;
  quantity: number;
  personalization: string | null;
  buyerName: string;
  orderedAt: string;
  shipBy: string | null;
  shippedAt: string | null;
  tracking: string | null;
  status: string;
  totalCents: number;
  youGetCents: number;
  address: { name: string; street1: string; street2?: string; city: string; state: string; postcode: string } | null;
};

const today = () => new Date().toISOString().slice(0, 10);

/** Shop orders to pack and ship, with packing slips to print and tracking to add. */
export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [ship, setShip] = useState<Record<string, { carrier: string; tracking: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [slips, setSlips] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/shop/orders").catch(() => null);
    const j = r?.ok ? await r.json() : null;
    setOrders(j?.orders || []);
    setHint(j?.migrationNeeded ? j.error : null);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!slips) return;
    const t = setTimeout(() => {
      window.print();
      setSlips(null);
    }, 100);
    return () => clearTimeout(t);
  }, [slips]);

  async function markShipped(o: Order) {
    const s = ship[o.id] || { carrier: "USPS", tracking: "" };
    setBusy(o.id);
    setMsg(null);
    const r = await fetch("/api/shop/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "shipped", id: o.id, ...s }) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: "Marked shipped. The reader has their tracking." } : { ok: false, text: j.error || "Couldn't save that" });
    await load();
  }

  const open = (orders || []).filter((o) => !o.shippedAt && o.status === "paid");
  const done = (orders || []).filter((o) => o.shippedAt || o.status !== "paid");
  const printing = slips ? (orders || []).filter((o) => slips.includes(o.id)) : [];

  return (
    <div className="font-ui mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="print:hidden">
        <Link href="/dashboard/shop" className="text-sm text-accent hover:underline">
          ← Your shop
        </Link>
        <h1 className="font-display mt-3 text-3xl">Orders to ship</h1>
        <p className="mt-2 text-sm text-muted">
          Pack, ship, and mark each order shipped with its tracking number. Orders over {dollars(TRACKING_REQUIRED_OVER_CENTS)} need tracking. An order not shipped
          within 5 days of its ship-by date is refunded and your shop pauses. Addresses disappear from here {ADDRESS_HIDE_DAYS} days after shipping.
        </p>
        {hint && <p className="mt-3 text-sm text-danger">{hint}</p>}
        {!orders ? (
          <p className="mt-6 text-sm text-muted">Loading…</p>
        ) : (
          <>
            <section className="mt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl">To ship ({open.length})</h2>
                {open.length > 0 && (
                  <button type="button" className="text-xs text-accent underline" onClick={() => setSlips(open.map((o) => o.id))}>
                    Print packing slips
                  </button>
                )}
              </div>
              <ul className="mt-3 space-y-3 text-sm">
                {open.map((o) => {
                  const s = ship[o.id] || { carrier: "USPS", tracking: "" };
                  const late = o.shipBy && o.shipBy < today();
                  return (
                    <li key={o.id} className={`border p-3 ${late ? "border-danger" : "border-line"}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-ink">{o.title}</span>
                        <span className={`text-xs ${late ? "text-danger" : "text-muted"}`}>{o.shipBy ? `Ship by ${longDay(o.shipBy)}` : ""}</span>
                      </div>
                      {o.personalization && <p className="mt-1">Dedication: “{o.personalization}”</p>}
                      {o.address && (
                        <p className="mt-1 whitespace-pre-line text-xs text-muted">
                          {[o.address.name, o.address.street1, o.address.street2, `${o.address.city}, ${o.address.state} ${o.address.postcode}`].filter(Boolean).join("\n")}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted">You get {dollars(o.youGetCents)} (price and shipping, after fees).</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <select value={s.carrier} onChange={(e) => setShip({ ...ship, [o.id]: { ...s, carrier: e.target.value } })} className="border border-line bg-paper px-2 py-1">
                          {CARRIERS.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                        <input value={s.tracking} onChange={(e) => setShip({ ...ship, [o.id]: { ...s, tracking: e.target.value } })} placeholder="Tracking number" className="w-48 border border-line bg-paper px-2 py-1" />
                        <button type="button" disabled={busy === o.id} className="bg-accent px-3 py-1.5 text-paper disabled:opacity-50" onClick={() => void markShipped(o)}>
                          Mark shipped
                        </button>
                        <button type="button" className="text-accent underline" onClick={() => setSlips([o.id])}>
                          Packing slip
                        </button>
                      </div>
                    </li>
                  );
                })}
                {!open.length && <p className="text-muted">Nothing to ship right now.</p>}
              </ul>
            </section>
            {done.length > 0 && (
              <section className="mt-10">
                <h2 className="font-display text-xl">Shipped and closed</h2>
                <ul className="mt-2 divide-y divide-line border-y border-line text-xs">
                  {done.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <span className="text-ink">{o.title}</span> · {o.buyerName || "a reader"}
                      </span>
                      <span className="text-muted">
                        {o.status !== "paid" ? "Refunded" : `Shipped ${new Date(o.shippedAt!).toLocaleDateString()}`}
                        {o.tracking?.startsWith("http") ? (
                          <>
                            {" · "}
                            <a href={o.tracking} target="_blank" rel="noopener noreferrer" className="underline">
                              tracking
                            </a>
                          </>
                        ) : o.tracking ? (
                          ` · ${o.tracking}`
                        ) : (
                          ""
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
        {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-accent" : "text-danger"}`}>{msg.text}</p>}
      </div>

      {/* Packing slips: only these print */}
      <div className="hidden print:block">
        {printing.map((o) => (
          <div key={o.id} className="mb-8 break-after-page border border-black p-6 text-sm text-black">
            <p className="text-lg font-bold">Packing slip</p>
            <p className="mt-2">Ordered {new Date(o.orderedAt).toLocaleDateString()}</p>
            {o.address && (
              <p className="mt-3 whitespace-pre-line">
                {[o.address.name, o.address.street1, o.address.street2, `${o.address.city}, ${o.address.state} ${o.address.postcode}`].filter(Boolean).join("\n")}
              </p>
            )}
            <p className="mt-4">
              {o.title}
              {o.quantity > 1 ? ` (${o.quantity})` : ""}
            </p>
            {o.personalization && <p className="mt-1">Dedication: “{o.personalization}”</p>}
            <p className="mt-6 text-xs">Thank you for ordering direct from the author. Questions? Reply to your order email.</p>
          </div>
        ))}
      </div>
    </div>
  );
}
