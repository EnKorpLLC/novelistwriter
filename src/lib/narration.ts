/**
 * Narrator agreements (audiobook studio A4): the terms an author proposes and a narrator accepts, the cost,
 * and the agreement in plain words. Client-safe, no dependencies. Not legal advice.
 */

/** Our fee on narrator jobs, added on top for the author so the narrator gets their full rate. */
export const NARRATION_FEE_PCT = 10;
/** Industry rule of thumb: about 9,300 words make one finished hour of audio. */
export const WORDS_PER_FINISHED_HOUR = 9300;

export type NarrationPay = "per_finished_hour" | "royalty_share";

export type NarrationTerms = {
  pay: NarrationPay;
  /** Per finished hour, in cents */
  rateCents: number;
  /** Royalty share: percent of the author's earnings from audiobook sales on Novelist Writer */
  sharePct: number;
  shareYears: number;
  estimatedHours: number;
  revisionRounds: number;
  /** YYYY-MM-DD */
  deadline: string | null;
  /** First 15 minutes approved before full production */
  checkpoint: boolean;
  /** Of the fee for finished work, if the author cancels after the checkpoint */
  cancellationPct: number;
  notes: string;
};

export const DEFAULT_TERMS: NarrationTerms = {
  pay: "per_finished_hour",
  rateCents: 0,
  sharePct: 50,
  shareYears: 7,
  estimatedHours: 0,
  revisionRounds: 2,
  deadline: null,
  checkpoint: true,
  cancellationPct: 25,
  notes: "",
};

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export function normalizeTerms(raw: unknown): NarrationTerms {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const deadline = typeof r.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.deadline) ? r.deadline : null;
  return {
    pay: r.pay === "royalty_share" ? "royalty_share" : "per_finished_hour",
    rateCents: Math.round(clamp(r.rateCents, 0, 500_000, 0)),
    sharePct: Math.round(clamp(r.sharePct, 1, 90, DEFAULT_TERMS.sharePct)),
    shareYears: Math.round(clamp(r.shareYears, 1, 15, DEFAULT_TERMS.shareYears)),
    estimatedHours: Math.round(clamp(r.estimatedHours, 0, 100, 0) * 10) / 10,
    revisionRounds: Math.round(clamp(r.revisionRounds, 0, 10, DEFAULT_TERMS.revisionRounds)),
    deadline,
    checkpoint: r.checkpoint !== false,
    cancellationPct: Math.round(clamp(r.cancellationPct, 0, 100, DEFAULT_TERMS.cancellationPct)),
    notes: typeof r.notes === "string" ? r.notes.slice(0, 2000) : "",
  };
}

/** What a terms set can't be sent without. */
export function termsProblem(t: NarrationTerms): string | null {
  if (t.pay === "per_finished_hour" && t.rateCents < 100) return "Set the rate per finished hour.";
  if (t.estimatedHours <= 0) return "Estimate the finished length in hours.";
  return null;
}

export const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** The estimated narrator fee, our fee on top, and what the author pays. Royalty share has no up-front fee. */
export function estimateCost(t: NarrationTerms) {
  const fee = t.pay === "per_finished_hour" ? Math.round(t.rateCents * t.estimatedHours) : 0;
  const platform = Math.round((fee * NARRATION_FEE_PCT) / 100);
  return { fee, platform, total: fee + platform, deposit: Math.round((fee + platform) / 2) };
}

export const estimateHours = (words: number) => Math.max(0.1, Math.round((words / WORDS_PER_FINISHED_HOUR) * 10) / 10);

/** The agreement in plain words, shown to both sides before they accept. */
export function agreementText(t: NarrationTerms, names: { book: string; author: string; narrator: string }): { heading: string; body: string }[] {
  const cost = estimateCost(t);
  const pay =
    t.pay === "per_finished_hour"
      ? `${names.author} pays ${names.narrator} ${dollars(t.rateCents)} per finished hour of audio (the length of the final, approved files). At about ${t.estimatedHours} finished hours, that's about ${dollars(cost.fee)}. The final fee is based on the actual finished length. Novelist Writer's ${NARRATION_FEE_PCT}% fee (about ${dollars(cost.platform)}) is paid by ${names.author} on top, so ${names.narrator} receives the full rate.`
      : `Instead of an up-front fee, ${names.narrator} receives ${t.sharePct}% of what ${names.author} earns from sales of this audiobook on Novelist Writer, for ${t.shareYears} years from release, paid through Novelist Writer after each sale's 14-day refund window. Sales on other stores (Audible, Spotify, and so on) pay ${names.author} directly, so they can't be shared here and aren't part of this agreement.`;
  const out = [
    { heading: "The work", body: `${names.narrator} narrates the complete text of "${names.book}" as supplied by ${names.author}, chapter by chapter in the Novelist Writer studio, to the audio standards the studio checks (ACX's specifications).` },
    { heading: "Pay", body: pay },
    {
      heading: "Checkpoint",
      body: t.checkpoint
        ? `${names.narrator} first records about 15 minutes. ${names.author} approves it, or asks for changes, before full production starts. ${t.pay === "per_finished_hour" ? `When the checkpoint is approved, ${names.author} pays a deposit of half the estimated total, held by Novelist Writer until delivery.` : ""}`
        : `There's no 15-minute checkpoint; production starts once both sides accept.${t.pay === "per_finished_hour" ? ` ${names.author} pays a deposit of half the estimated total when production starts, held by Novelist Writer until delivery.` : ""}`,
    },
    {
      heading: "Review and revisions",
      body: `${names.author} reviews each chapter and pins notes to the exact lines to fix. Up to ${t.revisionRounds} round${t.revisionRounds === 1 ? "" : "s"} of fixes per chapter are included. Fixing ${names.narrator}'s own mistakes (misreadings, noise, missed words) is always included; changes to the text after recording, or extra rounds, need ${names.narrator}'s agreement and may cost extra. If ${names.author} doesn't respond to a delivered chapter for 14 days, it counts as approved.`,
    },
    { heading: "Deadline", body: t.deadline ? `All chapters delivered by ${t.deadline}, unless both sides agree to change it.` : "No fixed deadline; both sides agree on timing as they go." },
    {
      heading: "Payment and files",
      body:
        t.pay === "per_finished_hour"
          ? `When ${names.author} approves the final chapter, the rest of the fee is charged and ${names.narrator} is paid through Novelist Writer. The finished files are released to ${names.author} once that payment clears.`
          : `The finished files are released to ${names.author} when the final chapter is approved.`,
    },
    {
      heading: "Cancelling",
      body: `Either side can cancel before the checkpoint at no cost. If ${names.author} cancels after the checkpoint, ${names.narrator} is paid for the finished, approved audio so far plus ${t.cancellationPct}% of the remaining estimated fee. If ${names.narrator} stops, any unused deposit is refunded to ${names.author}.`,
    },
    {
      heading: "Rights and credit",
      body: `${names.author} owns the finished audiobook and may sell it anywhere once paid. ${names.narrator} is credited as narrator in the opening and closing credits and on the book's pages, and may use short excerpts in a portfolio. The recording is human narration; ${names.narrator} won't use AI voice generation or cloning.`,
    },
  ];
  if (t.notes.trim()) out.push({ heading: "Also agreed", body: t.notes.trim() });
  return out;
}

export const AGREEMENT_DISCLAIMER =
  "This plain-language agreement is a template to help both sides agree on the job. It isn't legal advice. Novelist Writer holds payments and follows these terms when there's a disagreement.";

export type NarratorJobStatus = "invited" | "active" | "declined" | "cancelled" | "completed";
