import { focusLabel, stageInfo, type FeedbackBrief } from "@/lib/feedback-brief";

/** What the author wants from beta readers, shown before readers apply. */
export function FeedbackBriefCard({ brief, compact = false, className = "" }: { brief?: FeedbackBrief | null; compact?: boolean; className?: string }) {
  if (!brief) return null;
  const stage = stageInfo(brief.stage);
  if (compact) {
    const bits = [stage?.label, brief.focus.length ? `wants notes on ${brief.focus.map((f) => focusLabel(f).split(":")[0].toLowerCase()).join(", ")}` : "", brief.time].filter(Boolean);
    return bits.length ? <p className={`font-ui text-xs text-muted ${className}`}>{bits.join(" · ")}</p> : null;
  }
  return (
    <div className={`font-ui border border-line bg-paper-deep/40 p-3 text-sm ${className}`}>
      <p className="text-[10px] uppercase tracking-wide text-accent">What the author is asking for</p>
      {brief.focus.length > 0 && (
        <p className="mt-1">
          <span className="text-muted">Feedback on: </span>
          {brief.focus.map(focusLabel).join("; ")}
        </p>
      )}
      {stage && (
        <p className="mt-1">
          <span className="text-muted">Draft: </span>
          {stage.label}. <span className="text-muted">{stage.note}</span>
        </p>
      )}
      {brief.time && (
        <p className="mt-1">
          <span className="text-muted">Time: </span>
          {brief.time}
        </p>
      )}
    </div>
  );
}
