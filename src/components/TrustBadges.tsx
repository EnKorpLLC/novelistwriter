import { RecordBadge } from "@/components/WritingRecordView";

type AiActionCount = { label: string; count: number };

type RecordSummary = {
  badge: "written_here" | "before_records" | null;
  typedPercent: number;
  sessions: number;
  activeDays: number;
  recordHref: string | null;
};

type TrustData = { aiOffSince?: string | null; noAiOnBook?: boolean; aiActions?: AiActionCount[] | null };

/** Writing record numbers the author chose to show readers: never any manuscript text. */
export function RecordSummaryLine({ record, className = "" }: { record?: RecordSummary | null; className?: string }) {
  if (!record) return null;
  return (
    <div className={`font-ui text-xs text-muted ${className}`}>
      {record.badge && (
        <div className="mb-1">
          <RecordBadge badge={record.badge} href={record.recordHref || undefined} />
        </div>
      )}
      <p>
        <span className="text-ink">Writing record:</span> {record.typedPercent}% typed in the editor ·{" "}
        {record.sessions.toLocaleString()} writing session{record.sessions === 1 ? "" : "s"} over{" "}
        {record.activeDays.toLocaleString()} day{record.activeDays === 1 ? "" : "s"}
        {record.recordHref && (
          <>
            {" · "}
            <a href={record.recordHref} className="text-accent underline" target="_blank" rel="noopener noreferrer">
              Full record
            </a>
          </>
        )}
      </p>
    </div>
  );
}

/** Badges a reader has earned; hover (or showDetail) explains each one. */
export function ReaderBadgeList({
  badges,
  showDetail = false,
  className = "",
}: {
  badges?: { id: string; label: string; detail: string }[] | null;
  showDetail?: boolean;
  className?: string;
}) {
  if (!badges?.length) return null;
  if (showDetail) {
    return (
      <ul className={`font-ui space-y-1.5 ${className}`}>
        {badges.map((b) => (
          <li key={b.id} className="flex flex-wrap items-baseline gap-2 text-xs">
            <span className="border border-accent px-2 py-0.5 text-[11px] text-accent">{b.label}</span>
            <span className="text-muted">{b.detail}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className={`font-ui flex flex-wrap gap-1 ${className}`}>
      {badges.map((b) => (
        <li key={b.id} className="border border-accent px-1.5 py-px text-[10px] text-accent" title={b.detail}>
          {b.label}
        </li>
      ))}
    </ul>
  );
}

/** Small chips for book cards. */
export function CompactTrust({ trust, record }: { trust?: TrustData | null; record?: RecordSummary | null }) {
  const chips: { label: string; title: string }[] = [];
  if (trust?.noAiOnBook) {
    chips.push({ label: "No AI used", title: "Novelist Writer has no record of any AI tool being run on this book." });
  }
  if (trust?.aiOffSince) {
    chips.push({ label: "AI tools off", title: "This author has every AI tool switched off on Novelist Writer." });
  }
  if (record?.badge === "written_here") {
    chips.push({
      label: "Written here",
      title: `Typed in the Novelist Writer editor: ${record.typedPercent}% typed, ${record.sessions} sessions.`,
    });
  }
  if (!chips.length) return null;
  return (
    <ul className="font-ui flex flex-wrap gap-1">
      {chips.map((c) => (
        <li key={c.label} className="border border-accent px-1 py-px text-[9px] leading-tight text-accent" title={c.title}>
          {c.label}
        </li>
      ))}
    </ul>
  );
}

function monthYear(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function AiActionList({ actions, className = "" }: { actions: AiActionCount[]; className?: string }) {
  if (!actions.length) return null;
  return (
    <p className={`font-ui text-xs text-muted ${className}`}>
      <span className="text-ink">AI tools used on this book:</span>{" "}
      {actions.map((a, i) => (
        <span key={a.label}>
          {i > 0 ? ", " : ""}
          {a.label}
          {a.count > 1 ? ` (${a.count})` : ""}
        </span>
      ))}
      . These review or take notes on the writing; none of them write it.
    </p>
  );
}

export function TrustBadges({
  aiOffSince,
  noAiOnBook,
  aiActions,
  className = "",
}: {
  aiOffSince?: string | null;
  noAiOnBook?: boolean;
  aiActions?: AiActionCount[] | null;
  className?: string;
}) {
  if (!aiOffSince && !noAiOnBook && !aiActions?.length) return null;
  return (
    <div className={className}>
      {(noAiOnBook || aiOffSince) && (
        <ul className="font-ui flex flex-wrap gap-2 text-[11px]">
          {noAiOnBook && (
            <li
              className="border border-accent px-2 py-0.5 text-accent"
              title="Novelist Writer has no record of any AI tool being run on this book."
            >
              No AI used on this book
            </li>
          )}
          {aiOffSince && (
            <li
              className="border border-accent px-2 py-0.5 text-accent"
              title="This author has every AI tool switched off on Novelist Writer."
            >
              AI tools off since {monthYear(aiOffSince)}
            </li>
          )}
        </ul>
      )}
      {aiActions && aiActions.length > 0 && (
        <AiActionList actions={aiActions} className={noAiOnBook || aiOffSince ? "mt-2" : ""} />
      )}
    </div>
  );
}
