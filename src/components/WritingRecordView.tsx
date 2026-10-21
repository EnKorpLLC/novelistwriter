export type WritingRecordData = {
  currentWords: number;
  beforeRecordsWords: number;
  importedWords: number;
  recordedWords: number;
  typedWords: number;
  pastedWords: number;
  typedShare: number;
  sessions: number;
  activeDays: number;
  firstAt: string | null;
  lastAt: string | null;
  spanDays: number;
  revisions: number;
  weekly: { weekStart: string; words: number }[];
  badge: "written_here" | "before_records" | null;
  needed: string[];
};

function shortDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function RecordBadge({ badge, href }: { badge: WritingRecordData["badge"]; href?: string }) {
  if (!badge) return null;
  const label = badge === "written_here" ? "Written in Novelist Writer" : "Before records";
  const title =
    badge === "written_here"
      ? "Typed in the Novelist Writer editor across many sessions and weeks."
      : "Written before Novelist Writer kept records.";
  const cls = "border border-accent px-2 py-0.5 text-[11px] text-accent";
  return href ? (
    <a href={href} className={`font-ui ${cls} hover:bg-accent hover:text-paper`} title={title}>
      {label}
    </a>
  ) : (
    <span className={`font-ui ${cls}`} title={title}>
      {label}
    </span>
  );
}

const SLICES = [
  { key: "typedWords", label: "Typed here", cls: "bg-accent" },
  { key: "pastedWords", label: "Pasted in", cls: "bg-warn" },
  { key: "importedWords", label: "Imported", cls: "bg-muted" },
  { key: "beforeRecordsWords", label: "Before records", cls: "bg-line" },
] as const;

/** Process numbers only: no manuscript text is ever shown. */
export function WritingRecordView({ record, showNeeded = false }: { record: WritingRecordData; showNeeded?: boolean }) {
  const total = Math.max(1, record.currentWords);
  const maxWeek = Math.max(1, ...record.weekly.map((w) => w.words));
  const stats = [
    ["Words now", record.currentWords.toLocaleString()],
    ["Writing sessions", record.sessions.toLocaleString()],
    ["Days written", record.activeDays.toLocaleString()],
    ["Saved revisions", record.revisions.toLocaleString()],
    ["First session", shortDate(record.firstAt)],
    ["Latest session", shortDate(record.lastAt)],
  ];

  return (
    <div className="font-ui space-y-6">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <li key={label} className="border border-line px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
            <p className="font-display text-xl text-ink">{value}</p>
          </li>
        ))}
      </ul>

      <div>
        <p className="text-sm text-ink">How the words got here</p>
        <div className="mt-2 flex h-4 w-full overflow-hidden border border-line" role="img" aria-label="Share of words by source">
          {SLICES.map((s) => {
            const n = record[s.key];
            return n > 0 ? <div key={s.key} className={s.cls} style={{ width: `${(n / total) * 100}%` }} /> : null;
          })}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {SLICES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 ${s.cls}`} />
              {s.label}: {record[s.key].toLocaleString()} ({Math.round((record[s.key] / total) * 100)}%)
            </li>
          ))}
        </ul>
      </div>

      {record.weekly.length > 0 && (
        <div>
          <p className="text-sm text-ink">Words typed per week</p>
          <div className="mt-2 flex h-24 items-end gap-1 border-b border-line">
            {record.weekly.map((w) => (
              <div
                key={w.weekStart}
                className="min-w-[6px] flex-1 bg-accent"
                style={{ height: `${Math.max(3, (w.words / maxWeek) * 100)}%` }}
                title={`Week of ${w.weekStart}: about ${w.words.toLocaleString()} words`}
              />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {shortDate(record.weekly[0].weekStart)} to {shortDate(record.weekly[record.weekly.length - 1].weekStart)}
          </p>
        </div>
      )}

      {showNeeded && record.needed.length > 0 && (
        <div className="border border-line bg-paper-deep/40 px-3 py-2 text-xs text-muted">
          <p className="text-ink">Still needed for the &ldquo;Written in Novelist Writer&rdquo; badge:</p>
          <ul className="mt-1 list-disc pl-5">
            {record.needed.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted">
        This record shows how the text arrived in the Novelist Writer editor: typed, pasted, or
        imported, and when. It never shows the writing itself. It&apos;s strong evidence of a human
        writing process, not a guarantee about anything done outside this editor.
      </p>
    </div>
  );
}
