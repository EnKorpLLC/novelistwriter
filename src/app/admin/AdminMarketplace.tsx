"use client";

import { useCallback, useEffect, useState } from "react";
import { MARKET_TYPES, type MarketTypeStatus } from "@/lib/market-types";

type Pro = {
  userId: string;
  email: string;
  name: string;
  headline: string;
  bio: string;
  specialties: string[];
  genres: string[];
  rateNote: string;
  turnaroundNote: string;
  website: string;
  status: string;
  founding: boolean;
  adminNote: string;
  submittedAt: string | null;
  recruited: number;
  viaInvite: boolean;
  portfolio: { id: string; title: string; note: string; url?: string; imageUrl?: string | null; before?: string; after?: string }[];
  portfolioCount: number;
};
type Dispute = { jobId: string; title: string; note: string; openMilestone: { title: string; proCents: number; status: string } | null; updatedAt: string };
type Data = {
  hiringLive: boolean;
  types: MarketTypeStatus[];
  disputes?: Dispute[];
  pros: Pro[];
  invites: { email: string; type: string; skipQueue: boolean; accepted: boolean; createdAt: string }[];
  migrationNeeded?: boolean;
  error?: string;
};

const label = (id: string) => MARKET_TYPES.find((t) => t.id === id)?.label || id;

/** One dispute: refund some or all of the open milestone (the rest goes to the pro), then resume or close the job. */
function DisputeRow({ d, onResolve }: { d: Dispute; onResolve: (body: Record<string, unknown>, done: string) => void }) {
  const total = d.openMilestone ? d.openMilestone.proCents + Math.round(d.openMilestone.proCents * 0.1) : 0;
  const [refund, setRefund] = useState("0");
  const [note, setNote] = useState("");
  const [close, setClose] = useState(false);
  return (
    <li className="space-y-2">
      <p>
        <a href={`/hire/job/${d.jobId}`} className="text-ink underline">
          {d.title}
        </a>{" "}
        <span className="text-xs text-muted">· {new Date(d.updatedAt).toLocaleDateString()}</span>
      </p>
      <p className="whitespace-pre-wrap text-muted">{d.note}</p>
      {d.openMilestone ? (
        <p className="text-xs">
          Open milestone: {d.openMilestone.title} ({d.openMilestone.status}), ${(total / 100).toFixed(2)} paid by the author, ${(d.openMilestone.proCents / 100).toFixed(2)} of it the pro&apos;s.
        </p>
      ) : (
        <p className="text-xs text-muted">No paid milestone is open.</p>
      )}
      <div className="flex flex-wrap items-end gap-2 text-xs">
        {d.openMilestone && (
          <label>
            Refund to the author ($)
            <input value={refund} onChange={(e) => setRefund(e.target.value)} inputMode="decimal" className="mt-1 block w-24 border border-line bg-paper px-2 py-1" />
          </label>
        )}
        <label className="flex items-center gap-1 pb-1">
          <input type="checkbox" checked={close} onChange={(e) => setClose(e.target.checked)} /> Close the job
        </label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What we decided (both sides see this)" className="w-full max-w-md border border-line bg-paper px-2 py-1" />
        <button
          type="button"
          className="bg-accent px-3 py-1.5 text-paper"
          onClick={() => {
            const cents = Math.round(Number(refund.replace(/[^0-9.]/g, "")) * 100) || 0;
            if (window.confirm(cents ? `Refund $${(cents / 100).toFixed(2)} and pay the pro the rest?` : "Pay the pro in full?")) onResolve({ refundCents: cents, close, note }, "Settled.");
          }}
        >
          Settle
        </button>
      </div>
      {d.openMilestone && (
        <p className="text-[11px] text-muted">A refund under the full amount pays the pro the rest of their share. The full amount (${(total / 100).toFixed(2)}) refunds it all.</p>
      )}
    </li>
  );
}

/** Recruiting for the marketplace: how each type is filling up, applications to review, and invites. */
export function AdminMarketplace({ onNote }: { onNote: (msg: string | null) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [invite, setInvite] = useState({ email: "", type: "cover", skipQueue: true, note: "" });

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/marketplace");
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return onNote(d.error || "Could not load the marketplace");
    setData(d);
  }, [onNote]);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>, done: string) {
    const r = await fetch("/api/admin/marketplace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    onNote(r.ok ? done : d.error || "Could not save");
    await load();
    return r.ok;
  }

  if (!data) return <p className="mt-6 text-sm text-muted">Loading…</p>;
  if (data.migrationNeeded) return <p className="mt-6 text-sm text-danger">{data.error}</p>;
  const queue = data.pros.filter((p) => p.status === "applied");
  const others = data.pros.filter((p) => p.status !== "applied");

  return (
    <div className="mt-6 space-y-10 text-sm">
      {(data.disputes || []).length > 0 && (
        <section className="border border-danger/40 p-4">
          <h2 className="font-display text-xl">Disputes ({data.disputes!.length})</h2>
          <ul className="mt-3 space-y-4">
            {data.disputes!.map((d) => (
              <DisputeRow key={d.jobId} d={d} onResolve={(body, done) => void post({ action: "resolve", jobId: d.jobId, ...body }, done)} />
            ))}
          </ul>
        </section>
      )}
      <section>
        <h2 className="font-display text-xl">Types</h2>
        <p className="mt-1 text-xs text-muted">
          A type opens to authors when it has enough approved pros{data.hiringLive ? "" : " and hiring is built (not yet: types with enough pros show as \u201copening soon\u201d)"}. Opening emails
          its waitlist.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-1 pr-3 font-normal">Type</th>
                <th className="py-1 pr-3 font-normal">Approved</th>
                <th className="py-1 pr-3 font-normal">To review</th>
                <th className="py-1 pr-3 font-normal">Authors waiting</th>
                <th className="py-1 pr-3 font-normal">Opens at</th>
                <th className="py-1 pr-3 font-normal">Mode</th>
                <th className="py-1 font-normal">State</th>
              </tr>
            </thead>
            <tbody>
              {data.types.map((t) => (
                <tr key={t.id} className="border-t border-line">
                  <td className="py-1.5 pr-3 text-ink">{t.plural}</td>
                  <td className="py-1.5 pr-3">{t.approved}</td>
                  <td className="py-1.5 pr-3">{t.applied}</td>
                  <td className="py-1.5 pr-3">{t.waiting}</td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      defaultValue={t.threshold}
                      className="w-14 border border-line bg-paper px-1"
                      onBlur={(e) => Number(e.target.value) !== t.threshold && void post({ action: "setting", type: t.id, threshold: Number(e.target.value) }, "Saved.")}
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <select value={t.override} className="border border-line bg-paper px-1" onChange={(e) => void post({ action: "setting", type: t.id, override: e.target.value }, "Saved.")}>
                      <option value="auto">Automatic</option>
                      <option value="open">Force open</option>
                      <option value="closed">Keep closed</option>
                    </select>
                  </td>
                  <td className="py-1.5">{t.state === "open" ? "Open" : t.state === "ready" ? "Opening soon" : "Recruiting"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl">Applications ({queue.length})</h2>
        {!queue.length && <p className="mt-2 text-muted">Nothing waiting.</p>}
        <ul className="mt-3 space-y-4">
          {queue.map((p) => (
            <li key={p.userId} className="border border-line p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-lg">{p.name || "(no name)"}</p>
                <span className="text-xs text-muted">
                  {p.email} · {p.submittedAt ? new Date(p.submittedAt).toLocaleDateString() : ""}
                </span>
              </div>
              <p className="text-ink">{p.headline}</p>
              <p className="mt-1 text-xs text-muted">
                {p.specialties.map(label).join(", ")}
                {p.genres.length ? ` · ${p.genres.join(", ")}` : ""}
                {p.rateNote ? ` · ${p.rateNote}` : ""}
                {p.turnaroundNote ? ` · ${p.turnaroundNote}` : ""}
              </p>
              <p className="mt-2 whitespace-pre-wrap">{p.bio}</p>
              {p.website && (
                <a href={p.website} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-accent underline">
                  {p.website}
                </a>
              )}
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {p.portfolio.map((i) => (
                  <li key={i.id} className="border border-line p-2 text-xs">
                    {i.imageUrl && (
                      <a href={i.imageUrl} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={i.imageUrl} alt="" className="mb-1 max-h-48 w-full object-contain" />
                      </a>
                    )}
                    <p className="text-ink">{i.title}</p>
                    {i.note && <p className="text-muted">{i.note}</p>}
                    {i.url && (
                      <a href={i.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                        {i.url}
                      </a>
                    )}
                    {i.before && (
                      <div className="mt-1 grid gap-1">
                        <p className="whitespace-pre-wrap text-muted">Before: {i.before}</p>
                        <p className="whitespace-pre-wrap">After: {i.after}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <textarea
                value={notes[p.userId] || ""}
                onChange={(e) => setNotes({ ...notes, [p.userId]: e.target.value })}
                rows={2}
                placeholder="Note to them (sent with changes or a decline)"
                className="mt-3 block w-full border border-line bg-paper px-2 py-1 text-xs"
              />
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button type="button" className="bg-accent px-3 py-1.5 text-paper" onClick={() => void post({ action: "review", userId: p.userId, decision: "approve", note: notes[p.userId] || "" }, "Approved.")}>
                  Approve
                </button>
                <button type="button" className="border border-line px-3 py-1.5" onClick={() => void post({ action: "review", userId: p.userId, decision: "changes", note: notes[p.userId] || "" }, "Asked for changes.")}>
                  Ask for changes
                </button>
                <button type="button" className="border border-line px-3 py-1.5 text-danger" onClick={() => void post({ action: "review", userId: p.userId, decision: "decline", note: notes[p.userId] || "" }, "Declined.")}>
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-xl">Invite someone</h2>
        <p className="mt-1 text-xs text-muted">They get an email with a link to join. With &ldquo;skip the queue&rdquo;, their profile is approved the moment they send it.</p>
        <form
          className="mt-2 flex flex-wrap items-end gap-2 text-xs"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await post({ action: "invite", ...invite }, `Invite sent to ${invite.email}.`)) setInvite({ ...invite, email: "", note: "" });
          }}
        >
          <label>
            Email
            <input type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} className="mt-1 block w-56 border border-line bg-paper px-2 py-1" />
          </label>
          <label>
            As
            <select value={invite.type} onChange={(e) => setInvite({ ...invite, type: e.target.value })} className="mt-1 block border border-line bg-paper px-1 py-1">
              {MARKET_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 pb-1">
            <input type="checkbox" checked={invite.skipQueue} onChange={(e) => setInvite({ ...invite, skipQueue: e.target.checked })} /> Skip the queue
          </label>
          <input
            value={invite.note}
            onChange={(e) => setInvite({ ...invite, note: e.target.value })}
            placeholder="Personal note (optional)"
            className="w-full max-w-md border border-line bg-paper px-2 py-1"
          />
          <button type="submit" className="bg-accent px-3 py-1.5 text-paper">
            Send invite
          </button>
        </form>
        {data.invites.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {data.invites.map((i) => (
              <li key={`${i.email}-${i.createdAt}`}>
                {i.email} · {label(i.type)} · {i.accepted ? "joined" : "not yet"} · {new Date(i.createdAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl">Pros ({others.length})</h2>
        <ul className="mt-2 divide-y divide-line border-y border-line text-xs">
          {others.map((p) => (
            <li key={p.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="text-ink">{p.name || p.email}</span> · {p.specialties.map(label).join(", ")} · {p.status}
                {p.founding ? " · founding" : ""}
                {p.recruited ? ` · recruited ${p.recruited}` : ""}
                {p.viaInvite ? " · invited" : ""}
              </span>
              {p.status !== "removed" && (
                <button
                  type="button"
                  className="text-danger underline"
                  onClick={() => {
                    const note = window.prompt(`Remove ${p.name || p.email} from the marketplace? Add a note for them (optional).`);
                    if (note !== null) void post({ action: "remove", userId: p.userId, note }, "Removed.");
                  }}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
