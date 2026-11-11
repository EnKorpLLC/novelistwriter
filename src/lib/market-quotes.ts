/** Quotes, fees, and the agreement for marketplace jobs. Client-safe. */
import { HUMAN_PROMISE, marketType } from "@/lib/market-types";

/** One fee, paid by the author on top; the pro gets their full price. Same as narrator jobs. */
export const MARKET_FEE_PCT = 10;
export const MIN_JOB_CENTS = 5000;
export const MIN_MILESTONE_CENTS = 2500;
export const MAX_JOB_CENTS = 5_000_000;
export const MAX_MILESTONES = 6;
export const AUTO_APPROVE_DAYS = 14;
export const MAX_REQUEST_PROS = 5;

export const withFee = (proCents: number) => proCents + Math.round((proCents * MARKET_FEE_PCT) / 100);
export const dollars = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

export type Rights = "license" | "license_merch" | "buyout";
export const RIGHTS: { id: Rights; label: string }[] = [
  { id: "license", label: "Exclusive use for this book and its marketing (artist keeps copyright)" },
  { id: "license_merch", label: "Exclusive use, plus selling the art itself (prints, extras, merchandise)" },
  { id: "buyout", label: "Full buyout: all rights transfer to the author" },
];

export type QuoteMilestone = { title: string; cents: number; dueOn: string | null };
export type Quote = { scope: string; deliverables: string; revisions: number; milestones: QuoteMilestone[]; rights: Rights | null; note: string };

const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function normalizeQuote(raw: unknown, marketTypeId: string): Quote {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const art = marketType(marketTypeId)?.group === "art";
  const ms = (Array.isArray(o.milestones) ? o.milestones : [])
    .slice(0, MAX_MILESTONES)
    .map((m) => {
      const x = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
      return { title: String(x.title || "").trim().slice(0, 120), cents: Math.max(0, Math.round(Number(x.cents) || 0)), dueOn: day(x.dueOn) };
    });
  const rights = o.rights === "license_merch" || o.rights === "buyout" ? o.rights : "license";
  return {
    scope: String(o.scope || "").trim().slice(0, 4000),
    deliverables: String(o.deliverables || "").trim().slice(0, 2000),
    revisions: Math.min(10, Math.max(0, Math.round(Number(o.revisions) || 0))),
    milestones: ms,
    rights: art ? rights : null,
    note: String(o.note || "").trim().slice(0, 2000),
  };
}

export const quoteTotal = (q: Quote) => q.milestones.reduce((n, m) => n + m.cents, 0);

/** What's wrong with a quote before it can be sent, or null. */
export function quoteProblem(q: Quote): string | null {
  if (!q.scope) return "Describe the scope: what you'll do.";
  if (!q.deliverables) return "List what the author will receive.";
  if (!q.milestones.length) return "Add at least one milestone.";
  if (q.milestones.some((m) => !m.title)) return "Name every milestone.";
  if (q.milestones.some((m) => m.cents < MIN_MILESTONE_CENTS)) return `Each milestone needs to be at least ${dollars(MIN_MILESTONE_CENTS)}.`;
  const total = quoteTotal(q);
  if (total < MIN_JOB_CENTS) return `Jobs start at ${dollars(MIN_JOB_CENTS)}.`;
  if (total > MAX_JOB_CENTS) return "That's more than one job can hold. Split it into two jobs.";
  return null;
}

/** Default milestones when a pro starts a quote: art in two halves (sketch, final), editing half at start and half on delivery. */
export function defaultMilestones(marketTypeId: string): QuoteMilestone[] {
  return marketType(marketTypeId)?.group === "art"
    ? [
        { title: "Sketch and concept", cents: 0, dueOn: null },
        { title: "Final art", cents: 0, dueOn: null },
      ]
    : [
        { title: "Start", cents: 0, dueOn: null },
        { title: "Delivery", cents: 0, dueOn: null },
      ];
}

export const AGREEMENT_NOTE =
  "This agreement is between the author and the pro. Novelist Writer takes the payments, holds them, and pays the pro, but isn't a party to the work itself. It's written in plain words and isn't legal advice.";

/** The agreement both sides see before the author accepts the quote. */
export function agreementText(job: { title: string; marketType: string; book: string | null }, q: Quote, names: { author: string; pro: string }): string {
  const t = marketType(job.marketType);
  const group = t?.group || "editing";
  const total = quoteTotal(q);
  const lines = [
    `${names.author} hires ${names.pro} as a ${(t?.label || "pro").toLowerCase()} for "${job.title}"${job.book ? `, for the book "${job.book}"` : ""}.`,
    `Scope: ${q.scope}`,
    `Deliverables: ${q.deliverables}`,
    `Price: ${dollars(total)} to ${names.pro}, in ${q.milestones.length} ${q.milestones.length === 1 ? "milestone" : "milestones"}: ${q.milestones
      .map((m, i) => `${i + 1}. ${m.title}, ${dollars(m.cents)}${m.dueOn ? `, due ${m.dueOn}` : ""}`)
      .join("; ")}. ${names.author} also pays Novelist Writer's ${MARKET_FEE_PCT}% fee on top, so ${names.pro} receives the full price.`,
    `Payment: ${names.author} pays each milestone when it starts. Novelist Writer holds it until ${names.author} approves that milestone's delivery, then pays ${names.pro}. A delivery ${names.author} doesn't answer within ${AUTO_APPROVE_DAYS} days counts as approved.`,
    `Revisions: ${q.revisions} ${q.revisions === 1 ? "round" : "rounds"} of changes per milestone ${q.revisions ? "are" : "is"} included. Work outside the scope needs a new quote.`,
    `Cancelling: either side can cancel before a milestone is paid. Once a milestone is paid and work has started, ${names.pro} can cancel and ${names.author} is refunded that milestone in full; ${names.author} can cancel that milestone only with ${names.pro}'s agreement or through a dispute. Approved milestones are final. If ${names.author} cancels after a milestone has been delivered, ${names.pro} is paid for it.`,
    group === "art"
      ? q.rights === "buyout"
        ? `Rights: ${names.pro} transfers all rights in the delivered art to ${names.author} once it's paid for. Where the law doesn't allow a transfer, ${names.pro} grants an exclusive, permanent, worldwide, unlimited license instead. ${names.pro} may show the work in their portfolio once it's public.`
        : `Rights: once it's paid for, ${names.author} gets exclusive, permanent, worldwide use of the delivered art for this book and its series, in every edition and format, and in its marketing.${
            q.rights === "license_merch" ? ` ${names.author} may also sell the art itself, as digital extras, prints, and other merchandise.` : " Selling the art itself (prints, merchandise, extras) isn't included."
          } ${names.pro} keeps the copyright, may show the work in their portfolio once it's public, and won't sell or reuse it.`
      : `Rights: ${names.author} keeps every right to their writing. Edits, notes, and reports are ${names.author}'s to use however they like.`,
    `Human-made: ${names.pro} has promised: “${HUMAN_PROMISE[group]}” If the work isn't human-made, ${names.author} is refunded in full.`,
    `Disputes: either side can ask Novelist Writer to step in on a milestone. We'll read the brief, this agreement, the messages, and the deliveries, then release the payment, refund part of it, or refund all of it.`,
    q.note ? `Also: ${q.note}` : "",
  ];
  return lines.filter(Boolean).join("\n\n");
}
