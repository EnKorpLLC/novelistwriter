function monthYear(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function TrustBadges({
  aiOffSince,
  noAiOnBook,
  className = "",
}: {
  aiOffSince?: string | null;
  noAiOnBook?: boolean;
  className?: string;
}) {
  if (!aiOffSince && !noAiOnBook) return null;
  return (
    <ul className={`font-ui flex flex-wrap gap-2 text-[11px] ${className}`}>
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
  );
}
