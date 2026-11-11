"use client";

import { useCallback, useEffect, useState } from "react";

type MonthRow = {
  month: string;
  subscriptions: number;
  oneTime: number;
  refunds: number;
  stripeFees: number;
  bills: number;
  ai: number;
  gross: number;
  net: number;
};

type Cost = {
  id: string;
  service: string;
  amount_cents: number;
  cadence: "monthly" | "yearly" | "one_time";
  started_on: string;
  ended_on: string | null;
  notes: string;
};

type Usage = { label: string; used: number | null; limit: number; unit: "bytes" | "count"; pct: number | null; note: string | null };

type Money = {
  migrationNeeded: boolean;
  months?: MonthRow[];
  mrr?: { cents: number; subscribers: number; byTier: Record<string, number>; at: string | null };
  monthlyCosts?: number;
  aiCostPerCredit?: number;
  breakEvenSubscribers?: number;
  upgrades?: { id: string; label: string; monthlyCents: number; ratio: number | null; affordable: boolean }[];
  firstSale?: { happened: boolean; vercelUpgraded: boolean };
  lastSync?: { at?: string; invoices?: number; checkouts?: number; refunds?: number };
  costs?: Cost[];
  usage: Usage[];
  sales?: { sales: number; grossCents: number; taxCents: number; feeCents: number; owedCents: number } | null;
  stripeTax?: "active" | "pending" | "unknown";
  storage?: { state: "not_set_up" } | { state: "connected"; bytes: number; files: number; partial: boolean } | { state: "error"; error: string };
  lulu?: ({ state: "not_set_up" } | { state: "connected"; sandbox: boolean; webhook: "active" | "inactive" | "missing" } | { state: "error"; error: string }) & {
    inFlight: number | null;
    problems: number | null;
  };
};

const R2_FREE_BYTES = 10 * 1024 ** 3;

const usd = (cents: number) =>
  (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 });

function size(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  return `${Math.round(n / 1024 ** 2)} MB`;
}

function monthLabel(m: string) {
  return new Date(`${m}-15T12:00:00Z`).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

function Stat({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: "good" | "bad" }) {
  return (
    <div className="border border-line px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`font-display text-2xl ${tone === "bad" ? "text-danger" : tone === "good" ? "text-accent" : "text-ink"}`}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function AdminMoney({ onNote }: { onNote: (msg: string | null) => void }) {
  const [data, setData] = useState<Money | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cost, setCost] = useState({ service: "", amount: "", cadence: "monthly", startedOn: "" });
  const [aiCost, setAiCost] = useState("");
  const [egress, setEgress] = useState("");
  const [browserTest, setBrowserTest] = useState<"idle" | "busy" | "ok" | "failed">("idle");

  async function testBrowserUpload() {
    setBrowserTest("busy");
    try {
      const start = await fetch("/api/admin/money", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "storageBrowserTest" }) }).then((r) => r.json());
      if (!start.url) throw new Error(start.error || "No upload link");
      const put = await fetch(start.url, { method: "PUT", body: "ok", headers: { "Content-Type": "text/plain" } });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      const done = await fetch("/api/admin/money", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "storageBrowserTestDone", key: start.key }) }).then((r) => r.json());
      setBrowserTest(done.ok ? "ok" : "failed");
    } catch {
      setBrowserTest("failed");
    }
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/money");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load money");
      setData(json);
      if (json.aiCostPerCredit != null) setAiCost(String(json.aiCostPerCredit || ""));
    } catch (err) {
      onNote(err instanceof Error ? err.message : "Could not load money");
    }
  }, [onNote]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: string, payload: Record<string, unknown> = {}, done?: string) {
    setBusy(action);
    onNote(null);
    try {
      const res = await fetch("/api/admin/money", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      if (done) onNote(done);
      await load();
      return json;
    } catch (err) {
      onNote(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <p className="mt-6 text-sm text-muted">Loading…</p>;
  if (data.migrationNeeded) {
    return (
      <p className="mt-6 text-sm text-danger">
        Database needs an update. Run supabase/migration_money.sql in the Supabase SQL editor, then reload.
      </p>
    );
  }

  const months = data.months || [];
  const current = months[months.length - 1];
  const out = current ? current.stripeFees + current.bills + current.ai : 0;
  const maxBar = Math.max(1, ...months.map((m) => Math.max(m.gross, m.stripeFees + m.bills + m.ai)));

  return (
    <section className="mt-6 space-y-10">
      {data.firstSale?.happened && !data.firstSale.vercelUpgraded && (
        <div className="border border-danger bg-danger/10 px-4 py-3 text-sm">
          <p className="text-ink">
            <strong>First sale is in.</strong> Vercel&apos;s free Hobby plan doesn&apos;t allow sites that take
            payments, so upgrade the project to Vercel Pro ($20/month) today.
          </p>
          <button
            type="button"
            disabled={busy === "vercelUpgraded"}
            className="mt-2 bg-accent px-3 py-1.5 text-xs text-paper disabled:opacity-50"
            onClick={() => void act("vercelUpgraded", {}, "Marked done. Nice.")}
          >
            I&apos;ve upgraded Vercel
          </button>
        </div>
      )}

      {data.lulu && (
        <div>
          <h2 className="font-display text-xl">Paperback printing (Lulu)</h2>
          {data.lulu.state === "not_set_up" ? (
            <p className="mt-1 text-sm text-muted">
              Not connected. Make a Lulu developer account (and a sandbox one for testing), put a card on file, then add LULU_CLIENT_KEY and LULU_CLIENT_SECRET in Vercel
              (and LULU_SANDBOX=true while testing). Authors can&apos;t sell paperbacks until then.
            </p>
          ) : data.lulu.state === "error" ? (
            <p className="mt-1 text-sm text-danger">Lulu: {data.lulu.error}</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-accent">✓ Lulu: connected{data.lulu.sandbox ? " (sandbox: test orders, never printed)" : ""}</p>
              {data.lulu.webhook === "active" ? (
                <p className="mt-1 text-xs text-muted">Status updates (printing, shipping, tracking) come in automatically.</p>
              ) : (
                <div className="mt-2 text-xs">
                  <p className="text-danger">{data.lulu.webhook === "inactive" ? "Lulu switched off status updates after failed deliveries." : "Status updates from Lulu aren't connected yet."}</p>
                  <button type="button" disabled={busy === "luluWebhook"} className="mt-1 border border-line px-3 py-1.5 disabled:opacity-50" onClick={() => void act("luluWebhook", {}, "Connected.")}>
                    Connect status updates
                  </button>
                </div>
              )}
            </>
          )}
          {data.lulu.inFlight != null && data.lulu.inFlight > 0 && (
            <p className="mt-1 text-xs text-muted">
              {data.lulu.inFlight} paperback {data.lulu.inFlight === 1 ? "order" : "orders"} not shipped yet
              {data.lulu.problems ? <span className="text-danger"> · {data.lulu.problems} with a problem (retried daily, refunded after 3 days)</span> : ""}.
            </p>
          )}
        </div>
      )}

      {data.storage && (
        <div>
          <h2 className="font-display text-xl">Audio storage (Cloudflare R2)</h2>
          {data.storage.state === "connected" ? (
            <>
              <p className="mt-1 text-sm text-accent">✓ Audio storage: connected</p>
              <p className="mt-1 text-xs text-muted">
                {size(data.storage.bytes)} in {data.storage.files} file{data.storage.files === 1 ? "" : "s"}
                {data.storage.partial ? " (first 10,000 files counted)" : ""} of the 10 GB free each month ({Math.round((data.storage.bytes / R2_FREE_BYTES) * 100)}%). Downloads are free.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <button type="button" disabled={browserTest === "busy"} className="border border-line px-3 py-1.5 disabled:opacity-50" onClick={() => void testBrowserUpload()}>
                  {browserTest === "busy" ? "Testing…" : "Test an upload from this browser"}
                </button>
                {browserTest === "ok" && <span className="text-accent">✓ Browsers can upload. The CORS policy is right.</span>}
                {browserTest === "failed" && (
                  <span className="text-danger">
                    The upload was blocked. In Cloudflare, open the bucket, then Settings, then CORS Policy, and check it lists this site&apos;s address ({typeof window !== "undefined" ? window.location.origin : "your site"}).
                  </span>
                )}
              </div>
            </>
          ) : data.storage.state === "error" ? (
            <p className="mt-1 text-sm text-danger">Audio storage isn&apos;t working: {data.storage.error}</p>
          ) : (
            <p className="mt-1 text-sm text-muted">Not set up yet. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET in Vercel, then redeploy.</p>
          )}
        </div>
      )}

      {(data.sales || data.stripeTax) && (
        <div>
          <h2 className="font-display text-xl">Direct ebook sales</h2>
          <p className="mt-1 text-xs text-muted">
            Stripe Tax:{" "}
            {data.stripeTax === "active" ? (
              <span className="text-accent">active, so sales tax is calculated at checkout</span>
            ) : data.stripeTax === "pending" ? (
              <span className="text-danger">not finished. In Stripe, open Settings → Tax and complete the setup before books go on sale.</span>
            ) : (
              <span>couldn&apos;t check (is the Stripe key set?)</span>
            )}
          </p>
          {data.sales && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Stat label="Copies sold" value={data.sales.sales} />
              <Stat label="Readers paid" value={usd(data.sales.grossCents)} hint="Before tax" />
              <Stat label="Sales tax collected" value={usd(data.sales.taxCents)} hint="Owed to states where registered" />
              <Stat label="Our fees" value={usd(data.sales.feeCents)} tone="good" />
              <Stat label="Owed to authors" value={usd(data.sales.owedCents)} hint="Paid on the 1st once $50+" />
            </div>
          )}
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl">Money in and out</h2>
          <div className="flex items-center gap-3 text-xs text-muted">
            {data.lastSync?.at && <span>Synced {new Date(data.lastSync.at).toLocaleString()}</span>}
            <button
              type="button"
              disabled={busy === "sync"}
              className="border border-line px-3 py-1.5 text-accent disabled:opacity-50"
              onClick={() => void act("sync", {}, "Synced with Stripe.")}
            >
              {busy === "sync" ? "Syncing…" : "Sync from Stripe"}
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">
          Payments are recorded automatically from Stripe. Use Sync to pull in anything from before this tab existed,
          and refunds. Stripe fees are estimated at 2.9% + 30¢; AI cost uses your per-credit estimate below.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat
            label="Monthly recurring"
            value={usd(data.mrr?.cents || 0)}
            hint={`${data.mrr?.subscribers || 0} active subscriptions`}
          />
          <Stat label="In this month" value={usd(current?.gross || 0)} />
          <Stat label="Out this month" value={usd(out)} hint="bills, Stripe fees, AI" />
          <Stat
            label="Net this month"
            value={usd(current?.net || 0)}
            tone={(current?.net || 0) >= 0 ? "good" : "bad"}
          />
          <Stat
            label="Break-even"
            value={`${data.breakEvenSubscribers || 0} subs`}
            hint={`to cover ${usd((data.monthlyCosts || 0) + (current?.ai || 0))}/mo`}
          />
        </div>
        {data.mrr && Object.keys(data.mrr.byTier).length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Subscriptions by plan:{" "}
            {Object.entries(data.mrr.byTier)
              .map(([tier, n]) => `${tier} ${n}`)
              .join(" · ")}
          </p>
        )}

        <div className="mt-6">
          <div className="flex h-36 items-end gap-2 border-b border-line">
            {months.map((m) => {
              const spent = m.stripeFees + m.bills + m.ai;
              return (
                <div key={m.month} className="flex flex-1 items-end gap-0.5" title={`${monthLabel(m.month)}: in ${usd(m.gross)}, out ${usd(spent)}, net ${usd(m.net)}`}>
                  <div className="flex-1 bg-accent/80" style={{ height: `${Math.max(1, (Math.max(0, m.gross) / maxBar) * 100)}%` }} />
                  <div className="flex-1 bg-danger/60" style={{ height: `${Math.max(1, (spent / maxBar) * 100)}%` }} />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted">
            <span>{months[0] && monthLabel(months[0].month)}</span>
            <span className="flex gap-3">
              <span><span className="inline-block h-2 w-2 bg-accent/80" /> In</span>
              <span><span className="inline-block h-2 w-2 bg-danger/60" /> Out</span>
            </span>
            <span>{current && monthLabel(current.month)}</span>
          </div>
        </div>

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-wide text-muted">
              {["Month", "Subscriptions", "One-time", "Refunds", "Stripe fees", "Bills", "AI", "Net"].map((h, i) => (
                <th key={h} className={`py-1.5 ${i ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...months].reverse().map((m) => (
              <tr key={m.month} className="border-b border-line/60">
                <td className="py-1.5 text-ink">{monthLabel(m.month)}</td>
                {[m.subscriptions, m.oneTime, m.refunds, -m.stripeFees, -m.bills, -m.ai, m.net].map((v, i) => (
                  <td key={i} className={`py-1.5 text-right tabular-nums ${v < 0 ? "text-danger" : ""}`}>
                    {v ? usd(v) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="font-display text-xl">Can we afford the next upgrade?</h2>
        <p className="mt-1 text-xs text-muted">
          The rule: only add a paid service when monthly income is at least 2× all monthly costs after adding it.
          Income here is the higher of monthly recurring revenue and this month&apos;s money in.
        </p>
        <ul className="mt-3 space-y-1.5 text-sm">
          {(data.upgrades || []).map((u) => (
            <li key={u.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/60 pb-1.5">
              <span className="text-ink">
                {u.label} <span className="text-xs text-muted">({usd(u.monthlyCents)}/mo)</span>
              </span>
              <span className={u.affordable ? "text-accent" : "text-muted"}>
                {u.affordable ? "Affordable" : "Not yet"}
                {u.ratio != null && ` · income is ${u.ratio.toFixed(1)}× costs`}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Vercel Pro is the exception: upgrade it on the first sale regardless.</p>
      </div>

      <div>
        <h2 className="font-display text-xl">Free plan usage</h2>
        <p className="mt-1 text-xs text-muted">Yellow at 80%, red at 95%. You get an email once a day if anything is red.</p>
        <ul className="mt-3 space-y-3 text-sm">
          {data.usage.map((u) => {
            const pctVal = u.pct == null ? null : Math.min(1, u.pct);
            const tone = u.pct == null ? "bg-line" : u.pct >= 0.95 ? "bg-danger" : u.pct >= 0.8 ? "bg-warn" : "bg-accent/70";
            return (
              <li key={u.label}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-ink">{u.label}</span>
                  <span className="text-xs tabular-nums text-muted">
                    {u.used == null
                      ? "Not available"
                      : u.unit === "bytes"
                        ? `${size(u.used)} of ${size(u.limit)}`
                        : `${u.used} of ${u.limit}`}
                    {pctVal != null && ` · ${Math.round((u.pct || 0) * 100)}%`}
                  </span>
                </div>
                <div className="mt-1 h-2 bg-line/30">
                  <div className={`h-2 ${tone}`} style={{ width: `${(pctVal || 0) * 100}%` }} />
                </div>
                {u.note && <p className="mt-0.5 text-[11px] text-muted">{u.note}</p>}
              </li>
            );
          })}
        </ul>
        <form
          className="mt-3 flex flex-wrap items-center gap-2 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            void act("setEgress", { gb: Number(egress) }, "Saved.").then(() => setEgress(""));
          }}
        >
          <label className="text-muted" htmlFor="egress">Supabase downloads this month (GB)</label>
          <input
            id="egress"
            inputMode="decimal"
            value={egress}
            onChange={(e) => setEgress(e.target.value)}
            className="w-24 border border-line bg-paper px-2 py-1"
            placeholder="e.g. 1.2"
          />
          <button type="submit" disabled={!egress || busy === "setEgress"} className="border border-line px-2 py-1 text-accent disabled:opacity-40">
            Save
          </button>
        </form>
      </div>

      <div>
        <h2 className="font-display text-xl">Bills</h2>
        <p className="mt-1 text-xs text-muted">
          What you pay to run Novelist Writer. Yearly bills are spread over 12 months; one-time costs count in their month.
        </p>
        {(data.costs || []).length === 0 ? (
          <p className="mt-2 text-sm text-muted">No bills yet. Add your domain and anything else you pay for.</p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-sm">
            {(data.costs || []).map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/60 pb-1.5">
                <span className={c.ended_on ? "text-muted line-through" : "text-ink"}>
                  {c.service}{" "}
                  <span className="text-xs text-muted">
                    {usd(c.amount_cents)} {c.cadence === "one_time" ? "once" : `/${c.cadence === "monthly" ? "mo" : "yr"}`} · since{" "}
                    {c.started_on}
                    {c.ended_on ? ` · ended ${c.ended_on}` : ""}
                  </span>
                </span>
                <span className="flex gap-3 text-xs">
                  {!c.ended_on && c.cadence !== "one_time" && (
                    <button type="button" className="text-accent hover:underline" onClick={() => void act("endCost", { id: c.id }, "Bill ended.")}>
                      Stopped paying
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-danger hover:underline"
                    onClick={() => {
                      if (window.confirm(`Delete ${c.service}?`)) void act("deleteCost", { id: c.id }, "Deleted.");
                    }}
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-3 flex flex-wrap items-end gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void act(
              "addCost",
              {
                service: cost.service,
                amountCents: Math.round(Number(cost.amount) * 100),
                cadence: cost.cadence,
                startedOn: cost.startedOn || undefined,
              },
              "Bill added."
            ).then((ok) => {
              if (ok) setCost({ service: "", amount: "", cadence: "monthly", startedOn: "" });
            });
          }}
        >
          <label className="text-xs text-muted">
            Service
            <input
              value={cost.service}
              onChange={(e) => setCost((c) => ({ ...c, service: e.target.value }))}
              className="mt-1 block w-40 border border-line bg-paper px-2 py-1.5 text-sm text-ink"
              placeholder="Domain"
            />
          </label>
          <label className="text-xs text-muted">
            Amount ($)
            <input
              inputMode="decimal"
              value={cost.amount}
              onChange={(e) => setCost((c) => ({ ...c, amount: e.target.value }))}
              className="mt-1 block w-24 border border-line bg-paper px-2 py-1.5 text-sm text-ink"
              placeholder="15"
            />
          </label>
          <label className="text-xs text-muted">
            How often
            <select
              value={cost.cadence}
              onChange={(e) => setCost((c) => ({ ...c, cadence: e.target.value }))}
              className="mt-1 block border border-line bg-paper px-2 py-1.5 text-sm text-ink"
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="one_time">One time</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            Since
            <input
              type="date"
              value={cost.startedOn}
              onChange={(e) => setCost((c) => ({ ...c, startedOn: e.target.value }))}
              className="mt-1 block border border-line bg-paper px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <button
            type="submit"
            disabled={!cost.service.trim() || !cost.amount || busy === "addCost"}
            className="bg-accent px-3 py-2 text-xs text-paper disabled:opacity-40"
          >
            Add bill
          </button>
        </form>
      </div>

      <div>
        <h2 className="font-display text-xl">AI cost estimate</h2>
        <p className="mt-1 text-xs text-muted">
          What one credit costs you at your AI provider, in dollars. Check a month of your provider bill against credits
          used and adjust. AI spending in the table above uses this number; credit prices should stay well above it.
        </p>
        <form
          className="mt-2 flex flex-wrap items-center gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void act("setAiCost", { usdPerCredit: Number(aiCost) }, "AI cost saved.");
          }}
        >
          <span className="text-xs text-muted">$</span>
          <input
            inputMode="decimal"
            value={aiCost}
            onChange={(e) => setAiCost(e.target.value)}
            className="w-28 border border-line bg-paper px-2 py-1.5"
            placeholder="0.002"
          />
          <span className="text-xs text-muted">per credit</span>
          <button type="submit" disabled={aiCost === "" || busy === "setAiCost"} className="border border-line px-3 py-1.5 text-xs text-accent disabled:opacity-40">
            Save
          </button>
          {!data.aiCostPerCredit && <span className="text-xs text-danger">Not set, so AI spending shows as $0.</span>}
        </form>
      </div>
    </section>
  );
}
