"use client";

import { useCallback, useEffect, useState } from "react";
import { NarrationAgreement } from "@/components/NarrationAgreement";
import { DEFAULT_TERMS, NARRATION_FEE_PCT, dollars, estimateCost, estimateHours, termsProblem, type NarrationTerms } from "@/lib/narration";

type Job = {
  id: string;
  status: "invited" | "active" | "declined" | "cancelled" | "completed";
  inviteEmail: string;
  narratorName: string;
  terms: NarrationTerms;
  narratorAcceptedAt: string | null;
  declinedReason: string | null;
  createdAt: string;
  checkpointStatus?: "pending" | "submitted" | "approved" | "changes";
  checkpointNote?: string | null;
};

/** Audio tab, author side: invite a narrator with proposed terms, then follow the job. */
export function NarratorPanel({ projectId, bookTitle, authorName, words, onChange }: { projectId: string; bookTitle: string; authorName: string; words: number; onChange: () => void }) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [studio, setStudio] = useState(true);
  const [form, setForm] = useState<{ editing: string | null; email: string; name: string; message: string; terms: NarrationTerms } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [checkNote, setCheckNote] = useState("");

  async function checkpoint(decision: "approve" | "changes") {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/audio`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "checkpoint", decision, note: checkNote }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Couldn't save that");
      setCheckNote("");
      setMsg(decision === "approve" ? "Checkpoint approved. We've told your narrator to start full production." : "Sent. Your narrator will record it again.");
      await load();
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save that");
    } finally {
      setBusy(false);
    }
  }

  const load = useCallback(async () => {
    const d = await fetch(`/api/projects/${projectId}/narrators`)
      .then((r) => r.json())
      .catch(() => ({ jobs: [] }));
    setHint(d.migrationNeeded ? d.error : null);
    setStudio(d.studio !== false);
    setJobs(d.jobs || []);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(body: Record<string, unknown>, done?: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/narrators`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Couldn't do that");
      if (done) setMsg(done);
      setForm(null);
      await load();
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't do that");
    } finally {
      setBusy(false);
    }
  }

  if (!jobs) return null;
  const open = jobs.find((j) => j.status === "invited" || j.status === "active");
  const past = jobs.filter((j) => j !== open).slice(0, 5);
  const setTerms = (patch: Partial<NarrationTerms>) => form && setForm({ ...form, terms: { ...form.terms, ...patch } });
  const cost = form ? estimateCost(form.terms) : null;
  const problem = form ? termsProblem(form.terms) : null;

  return (
    <section className="border border-line p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg">Narrator</h3>
        {!open && !form && !hint && (
          <button
            type="button"
            disabled={!studio}
            className="border border-accent px-3 py-1.5 text-xs text-accent disabled:opacity-50"
            onClick={() => setForm({ editing: null, email: "", name: "", message: "", terms: { ...DEFAULT_TERMS, estimatedHours: estimateHours(words) } })}
          >
            Invite a narrator
          </button>
        )}
      </div>
      {hint ? (
        <p className="mt-1 text-xs text-danger">{hint}</p>
      ) : !open && !form ? (
        <p className="mt-1 text-xs text-muted">
          Narrating it yourself? Use the studio below. Hiring someone? Invite them with your terms; they get a free narrator account that opens only this book&apos;s script and studio.
          {!studio && " Inviting a narrator is part of Studio."}
        </p>
      ) : null}

      {open && !form && (
        <div className="mt-2">
          <p>
            {open.status === "active" ? (
              <>
                <span className="text-accent">✓ </span>
                <b>{open.narratorName || open.inviteEmail}</b> is narrating
                {open.narratorAcceptedAt ? ` (accepted ${new Date(open.narratorAcceptedAt).toLocaleDateString()})` : ""}. Their takes stay on their computer; they send you a review copy of each chapter
                to hear in Review.
              </>
            ) : (
              <>
                Invite sent to <b>{open.narratorName ? `${open.narratorName} (${open.inviteEmail})` : open.inviteEmail}</b>, waiting for an answer.
              </>
            )}
          </p>
          {open.status === "active" && open.terms.checkpoint && (
            <div className={`mt-2 border px-3 py-2 text-xs ${open.checkpointStatus === "submitted" ? "border-accent" : "border-line"}`}>
              {open.checkpointStatus === "approved" ? (
                <p className="text-accent">✓ Checkpoint approved. Full production is under way.</p>
              ) : open.checkpointStatus === "submitted" ? (
                <>
                  <p className="text-ink">
                    <b>Checkpoint ready.</b> Your narrator sent their first recording: listen in Review below (it&apos;s the chapter marked &quot;Checkpoint copy&quot;), pin notes to any lines, then decide.
                  </p>
                  <textarea
                    rows={2}
                    value={checkNote}
                    onChange={(e) => setCheckNote(e.target.value)}
                    placeholder="If you're asking for changes: pace, tone, a voice, pronunciations…"
                    className="mt-2 w-full border border-line bg-paper p-2"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} className="bg-accent px-3 py-1.5 text-paper" onClick={() => void checkpoint("approve")}>
                      Approve: start full production
                    </button>
                    <button type="button" disabled={busy || !checkNote.trim()} className="border border-line px-3 py-1.5 disabled:opacity-50" onClick={() => void checkpoint("changes")}>
                      Ask for changes
                    </button>
                  </div>
                </>
              ) : open.checkpointStatus === "changes" ? (
                <p className="text-muted">You asked for changes to the checkpoint{open.checkpointNote ? `: “${open.checkpointNote}”` : ""}. Waiting for a new recording.</p>
              ) : (
                <p className="text-muted">Checkpoint: waiting for your narrator&apos;s first ~15 minutes.</p>
              )}
            </div>
          )}
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-accent">The agreement</summary>
            <div className="mt-2">
              <NarrationAgreement terms={open.terms} book={bookTitle} author={authorName || "The author"} narrator={open.narratorName || "The narrator"} viewer="author" />
            </div>
          </details>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {open.status === "invited" && (
              <>
                <button type="button" disabled={busy} className="border border-line px-2 py-1" onClick={() => void act({ action: "resend", id: open.id }, "Invite sent again.")}>
                  Resend
                </button>
                <button type="button" disabled={busy} className="border border-line px-2 py-1" onClick={() => setForm({ editing: open.id, email: open.inviteEmail, name: open.narratorName, message: "", terms: open.terms })}>
                  Change the terms
                </button>
              </>
            )}
            <button
              type="button"
              disabled={busy}
              className="text-danger underline"
              onClick={() => {
                const sure = open.status === "active" ? window.confirm("Cancel this narration job? After the checkpoint, the agreement pays the narrator for approved work plus the cancellation fee.") : true;
                if (sure) void act({ action: "cancel", id: open.id }, open.status === "active" ? "Job cancelled." : "Invite cancelled.");
              }}
            >
              {open.status === "active" ? "Cancel the job" : "Cancel the invite"}
            </button>
          </div>
        </div>
      )}

      {form && cost && (
        <div className="mt-3 space-y-3">
          {!form.editing && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-muted">Narrator&apos;s email</span>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full border border-line bg-paper px-2 py-1.5" />
              </label>
              <label className="block">
                <span className="text-xs text-muted">Their name</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full border border-line bg-paper px-2 py-1.5" />
              </label>
            </div>
          )}
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={form.terms.pay === "per_finished_hour"} onChange={() => setTerms({ pay: "per_finished_hour" })} /> Pay per finished hour
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={form.terms.pay === "royalty_share"} onChange={() => setTerms({ pay: "royalty_share" })} /> Royalty share (no up-front fee)
            </label>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            {form.terms.pay === "per_finished_hour" ? (
              <label className="block">
                <span className="text-xs text-muted">Rate per finished hour ($)</span>
                <input
                  type="number"
                  min={1}
                  step={5}
                  value={form.terms.rateCents ? form.terms.rateCents / 100 : ""}
                  onChange={(e) => setTerms({ rateCents: Math.round(Number(e.target.value) * 100) })}
                  placeholder="e.g. 250"
                  className="mt-1 w-full border border-line bg-paper px-2 py-1.5"
                />
              </label>
            ) : (
              <>
                <label className="block">
                  <span className="text-xs text-muted">Narrator&apos;s share (%)</span>
                  <input type="number" min={1} max={90} value={form.terms.sharePct} onChange={(e) => setTerms({ sharePct: Number(e.target.value) })} className="mt-1 w-full border border-line bg-paper px-2 py-1.5" />
                </label>
                <label className="block">
                  <span className="text-xs text-muted">For how many years</span>
                  <input type="number" min={1} max={15} value={form.terms.shareYears} onChange={(e) => setTerms({ shareYears: Number(e.target.value) })} className="mt-1 w-full border border-line bg-paper px-2 py-1.5" />
                </label>
              </>
            )}
            <label className="block">
              <span className="text-xs text-muted">Finished length (hours)</span>
              <input type="number" min={0.1} step={0.1} value={form.terms.estimatedHours || ""} onChange={(e) => setTerms({ estimatedHours: Number(e.target.value) })} className="mt-1 w-full border border-line bg-paper px-2 py-1.5" />
              <span className="text-[11px] text-muted">About {estimateHours(words)} hr for {words.toLocaleString()} words</span>
            </label>
            <label className="block">
              <span className="text-xs text-muted">Revision rounds per chapter</span>
              <input type="number" min={0} max={10} value={form.terms.revisionRounds} onChange={(e) => setTerms({ revisionRounds: Number(e.target.value) })} className="mt-1 w-full border border-line bg-paper px-2 py-1.5" />
            </label>
            <label className="block">
              <span className="text-xs text-muted">Deadline (optional)</span>
              <input type="date" value={form.terms.deadline || ""} onChange={(e) => setTerms({ deadline: e.target.value || null })} className="mt-1 w-full border border-line bg-paper px-2 py-1.5" />
            </label>
            <label className="block">
              <span className="text-xs text-muted">Cancellation fee after the checkpoint (%)</span>
              <input type="number" min={0} max={100} value={form.terms.cancellationPct} onChange={(e) => setTerms({ cancellationPct: Number(e.target.value) })} className="mt-1 w-full border border-line bg-paper px-2 py-1.5" />
            </label>
          </div>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={form.terms.checkpoint} onChange={(e) => setTerms({ checkpoint: e.target.checked })} />
            <span>
              15-minute checkpoint
              <span className="block text-xs text-muted">The narrator records about 15 minutes for you to approve before full production. Recommended unless you&apos;ve worked together before.</span>
            </span>
          </label>
          <label className="block">
            <span className="text-xs text-muted">Anything else agreed (optional, goes into the agreement)</span>
            <textarea rows={2} value={form.terms.notes} onChange={(e) => setTerms({ notes: e.target.value })} placeholder="Accents, pronunciations, style, how you'll stay in touch…" className="mt-1 w-full border border-line bg-paper p-2" />
          </label>
          {!form.editing && (
            <label className="block">
              <span className="text-xs text-muted">A note with the invite (optional)</span>
              <textarea rows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="mt-1 w-full border border-line bg-paper p-2" />
            </label>
          )}

          {form.terms.pay === "per_finished_hour" && cost.fee > 0 && (
            <p className="border border-line bg-paper-deep/40 px-3 py-2 text-xs">
              Narrator fee about <b>{dollars(cost.fee)}</b> + our {NARRATION_FEE_PCT}% ({dollars(cost.platform)}) = <b>{dollars(cost.total)}</b>. The narrator gets their full rate. Half ({dollars(cost.deposit)}) is paid as a held
              deposit when the checkpoint is approved; payments open in the next update.
            </p>
          )}
          {form.terms.pay === "royalty_share" && (
            <p className="border border-line bg-paper-deep/40 px-3 py-2 text-xs">
              Royalty share only covers audiobook sales made here on Novelist Writer. Sales on Audible, Spotify, and other stores pay you directly, so they can&apos;t be shared and aren&apos;t part of the deal. Say so plainly when you talk.
            </p>
          )}
          <details>
            <summary className="cursor-pointer text-xs text-accent">Preview the agreement</summary>
            <div className="mt-2">
              <NarrationAgreement terms={form.terms} book={bookTitle} author={authorName || "The author"} narrator={form.name || "The narrator"} viewer="author" />
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || Boolean(problem) || (!form.editing && !form.email.trim())}
              className="bg-accent px-4 py-2 text-xs text-paper disabled:opacity-50"
              onClick={() =>
                void act(
                  form.editing ? { action: "update_terms", id: form.editing, terms: form.terms } : { action: "invite", email: form.email, name: form.name, message: form.message, terms: form.terms },
                  form.editing ? "Terms updated. The narrator sees the new version." : "Invite sent."
                )
              }
            >
              {busy ? "Sending…" : form.editing ? "Save the new terms" : "Send the invite"}
            </button>
            <button type="button" className="text-xs underline" onClick={() => setForm(null)}>
              Cancel
            </button>
            {problem && <span className="text-xs text-muted">{problem}</span>}
          </div>
        </div>
      )}

      {msg && <p className="mt-2 text-xs text-ink">{msg}</p>}
      {past.length > 0 && !form && (
        <p className="mt-2 text-[11px] text-muted">
          Earlier: {past.map((j) => `${j.narratorName || j.inviteEmail} (${j.status}${j.declinedReason ? `: “${j.declinedReason}”` : ""})`).join(", ")}
        </p>
      )}
    </section>
  );
}
