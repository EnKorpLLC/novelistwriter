import { AGREEMENT_DISCLAIMER, agreementText, dollars, estimateCost, NARRATION_FEE_PCT, normalizeTerms, type NarrationTerms } from "@/lib/narration";

/** The narration agreement in plain words, as both sides see it before accepting. */
export function NarrationAgreement({ terms: raw, book, author, narrator, viewer }: { terms: NarrationTerms; book: string; author: string; narrator: string; viewer: "author" | "narrator" }) {
  const terms = normalizeTerms(raw);
  const cost = estimateCost(terms);
  return (
    <div className="font-ui text-sm">
      {terms.pay === "per_finished_hour" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Fact label="Rate" value={`${dollars(terms.rateCents)}/hr`} hint="per finished hour" />
          <Fact label="Estimated length" value={`${terms.estimatedHours} hr`} />
          <Fact label={viewer === "narrator" ? "You'd earn about" : "Narrator fee"} value={dollars(cost.fee)} />
          {viewer === "author" ? (
            <Fact label="You pay about" value={dollars(cost.total)} hint={`includes our ${NARRATION_FEE_PCT}% (${dollars(cost.platform)})`} />
          ) : (
            <Fact label="Revision rounds" value={String(terms.revisionRounds)} hint="per chapter" />
          )}
        </div>
      )}
      <ol className="mt-4 space-y-3">
        {agreementText(terms, { book, author, narrator }).map((s, i) => (
          <li key={s.heading}>
            <p className="font-medium text-ink">
              {i + 1}. {s.heading}
            </p>
            <p className="mt-0.5 text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[11px] text-muted">{AGREEMENT_DISCLAIMER}</p>
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-line px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="font-display text-xl text-ink">{value}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
