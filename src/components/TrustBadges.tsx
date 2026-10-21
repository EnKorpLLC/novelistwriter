type AiActionCount = { label: string; count: number };

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
