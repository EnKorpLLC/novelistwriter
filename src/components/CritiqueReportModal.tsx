"use client";

import type { CritiqueItem, JobType } from "@/lib/types";
import { JOB_META } from "@/lib/ai/jobs";

export type CritiqueReportData = {
  jobId?: string;
  jobType: string;
  summary: string;
  items: CritiqueItem[];
  extras?: Record<string, unknown> | null;
  createdAt?: string;
  scope?: string;
  model?: string;
  cost?: number;
};

const RENDERED_EXTRA_KEYS = new Set([
  "plotholes",
  "promises",
  "comps",
  "reading_list",
  "arcs",
  "heatmap",
  "voice_profile",
  "comparison",
  "entries",
  "added",
  "skipped",
  "demo",
]);

function formatExtraItem(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (!v || typeof v !== "object") return "";
  const o = v as Record<string, unknown>;
  const title = String(o.title || o.name || "").trim();
  const author = String(o.author || "").trim();
  const why = String(o.why || o.description || "").trim();
  const type = String(o.type || "").trim();
  const head = title && author ? `${title} — ${author}` : title || author;
  return [head, type, why].filter(Boolean).join(" — ");
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(formatExtraItem).filter(Boolean);
}

function extrasToMarkdown(extras: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const holes = stringList(extras.plotholes);
  if (holes.length) {
    lines.push("## Plotholes", "");
    holes.forEach((h, i) => lines.push(`${i + 1}. ${h}`, ""));
  }
  const promises = stringList(extras.promises);
  if (promises.length) {
    lines.push("## Story promises", "");
    promises.forEach((p, i) => lines.push(`${i + 1}. ${p}`, ""));
  }
  const comps = stringList(extras.comps);
  if (comps.length) {
    lines.push("## Comparable titles / authors", "");
    comps.forEach((c, i) => lines.push(`${i + 1}. ${c}`, ""));
  }
  const reading = stringList(extras.reading_list);
  if (reading.length) {
    lines.push("## Reading list", "");
    reading.forEach((r, i) => lines.push(`${i + 1}. ${r}`, ""));
  }
  if (Array.isArray(extras.arcs) && extras.arcs.length) {
    lines.push("## Arcs", "");
    for (const a of extras.arcs as Array<Record<string, unknown>>) {
      lines.push(`### ${String(a.subject || "Arc")} (${String(a.arc_type || "story")})`);
      lines.push("");
      if (a.notes) lines.push(String(a.notes), "");
      if (Array.isArray(a.beats)) {
        a.beats.forEach((b, i) => lines.push(`${i + 1}. ${typeof b === "string" ? b : JSON.stringify(b)}`));
        lines.push("");
      }
    }
  }
  if (extras.voice_profile && typeof extras.voice_profile === "object") {
    lines.push("## Voice profile", "", "```json", JSON.stringify(extras.voice_profile, null, 2), "```", "");
  }
  if (extras.comparison && typeof extras.comparison === "object") {
    lines.push("## Comparison", "", "```json", JSON.stringify(extras.comparison, null, 2), "```", "");
  }
  if (Array.isArray(extras.heatmap) && extras.heatmap.length) {
    lines.push("## Pacing heatmap", "");
    for (const row of extras.heatmap as Array<Record<string, unknown>>) {
      lines.push(
        `- **${String(row.chapter || "Chapter")}**: action ${row.action ?? "?"} · reflection ${row.reflection ?? "?"} · exposition ${row.exposition ?? "?"}`
      );
    }
    lines.push("");
  }
  return lines;
}

function toMarkdown(report: CritiqueReportData): string {
  const label =
    JOB_META[report.jobType as JobType]?.label ||
    report.jobType.replace(/_/g, " ");
  const lines: string[] = [
    `# Critique: ${label}`,
    "",
    report.createdAt ? `Date: ${new Date(report.createdAt).toLocaleString()}` : "",
    report.scope ? `Scope: ${report.scope}` : "",
    report.model ? `Model: ${report.model}` : "",
    report.cost != null ? `Credits: ${report.cost}` : "",
    "",
    "## Summary",
    "",
    report.summary || "(No summary)",
    "",
    "## Notes",
    "",
  ].filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));

  report.items.forEach((item, i) => {
    lines.push(`### ${i + 1}. ${item.title}`);
    lines.push("");
    lines.push(
      `*${item.severity.replace("_", " ")}* · ${Math.round(item.confidence * 100)}% · ${item.category}`
    );
    lines.push("");
    lines.push(item.body);
    if (item.citation_excerpt) {
      lines.push("");
      lines.push(`> “${item.citation_excerpt}”`);
    }
    if (item.example_text) {
      lines.push("");
      lines.push(`Example (not your prose): ${item.example_text}`);
    }
    lines.push("");
  });

  if (report.extras) {
    lines.push(...extrasToMarkdown(report.extras));
  }

  return lines.join("\n");
}

function ExtrasView({ extras }: { extras: Record<string, unknown> }) {
  const holes = stringList(extras.plotholes);
  const promises = stringList(extras.promises);
  const comps = stringList(extras.comps);
  const reading = stringList(extras.reading_list);
  const arcs = Array.isArray(extras.arcs) ? (extras.arcs as Array<Record<string, unknown>>) : [];
  const heatmap = Array.isArray(extras.heatmap)
    ? (extras.heatmap as Array<Record<string, unknown>>)
    : [];

  const leftover: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extras)) {
    if (!RENDERED_EXTRA_KEYS.has(k) && v != null) leftover[k] = v;
  }

  const hasFriendly =
    holes.length > 0 ||
    promises.length > 0 ||
    comps.length > 0 ||
    reading.length > 0 ||
    arcs.length > 0 ||
    heatmap.length > 0 ||
    (extras.voice_profile && typeof extras.voice_profile === "object") ||
    (extras.comparison && typeof extras.comparison === "object");

  if (!hasFriendly && Object.keys(leftover).length === 0) return null;

  return (
    <div className="mt-8 space-y-8">
      {holes.length > 0 && (
        <section>
          <h3 className="font-display text-lg text-critique">Plotholes</h3>
          <ol className="mt-3 list-decimal space-y-3 pl-5 text-muted">
            {holes.map((h, i) => (
              <li key={i} className="leading-relaxed pl-1">
                {h}
              </li>
            ))}
          </ol>
        </section>
      )}

      {promises.length > 0 && (
        <section>
          <h3 className="font-display text-lg text-critique">Story promises</h3>
          <ol className="mt-3 list-decimal space-y-3 pl-5 text-muted">
            {promises.map((p, i) => (
              <li key={i} className="leading-relaxed pl-1">
                {p}
              </li>
            ))}
          </ol>
        </section>
      )}

      {comps.length > 0 && (
        <section>
          <h3 className="font-display text-lg text-critique">Comparable titles</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            {comps.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {reading.length > 0 && (
        <section>
          <h3 className="font-display text-lg text-critique">Reading list</h3>
          <ol className="mt-3 list-decimal space-y-4 pl-5 text-muted">
            {reading.map((r, i) => (
              <li key={i} className="leading-relaxed pl-1">
                {r}
              </li>
            ))}
          </ol>
        </section>
      )}

      {arcs.length > 0 && (
        <section>
          <h3 className="font-display text-lg text-critique">Arcs</h3>
          <ul className="mt-3 space-y-4">
            {arcs.map((a, i) => (
              <li key={i} className="border-b border-line pb-4">
                <p className="font-display text-base text-ink">
                  {String(a.subject || "Arc")}
                  <span className="ml-2 font-ui text-xs uppercase text-muted">
                    {String(a.arc_type || "story")}
                  </span>
                </p>
                {a.notes ? <p className="mt-1 text-sm text-muted">{String(a.notes)}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {heatmap.length > 0 && (
        <section>
          <h3 className="font-display text-lg text-critique">Pacing heatmap</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {heatmap.map((row, i) => (
              <li key={i}>
                <strong className="text-ink">{String(row.chapter || `Beat ${i + 1}`)}</strong>
                {" — "}
                action {String(row.action ?? "—")} · reflection {String(row.reflection ?? "—")} ·
                exposition {String(row.exposition ?? "—")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {extras.voice_profile != null && typeof extras.voice_profile === "object" ? (
        <section>
          <h3 className="font-display text-lg text-critique">Voice profile</h3>
          <dl className="mt-3 space-y-2 text-sm text-muted">
            {Object.entries(extras.voice_profile as Record<string, unknown>).map(([k, v]) => (
              <div key={k}>
                <dt className="font-ui text-[10px] uppercase tracking-wide text-muted">{k}</dt>
                <dd className="text-ink">{typeof v === "string" ? v : JSON.stringify(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {extras.comparison != null && typeof extras.comparison === "object" ? (
        <section>
          <h3 className="font-display text-lg text-critique">Comparison</h3>
          <dl className="mt-3 space-y-3 text-sm text-muted">
            {Object.entries(extras.comparison as Record<string, unknown>).map(([k, v]) => (
              <div key={k}>
                <dt className="font-ui text-[10px] uppercase tracking-wide">{k.replace(/_/g, " ")}</dt>
                <dd className="mt-1 text-ink">
                  {Array.isArray(v)
                    ? v.map((x, i) => (
                        <p key={i} className="mb-1">
                          {typeof x === "string" ? x : JSON.stringify(x)}
                        </p>
                      ))
                    : typeof v === "string"
                      ? v
                      : JSON.stringify(v)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {Object.keys(leftover).length > 0 && (
        <details className="print:hidden">
          <summary className="font-ui cursor-pointer text-xs text-muted">
            Technical details
          </summary>
          <pre className="mt-2 overflow-x-auto bg-paper-deep p-3 text-[11px] text-muted">
            {JSON.stringify(leftover, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

type Props = {
  report: CritiqueReportData;
  onClose: () => void;
};

export function CritiqueReportModal({ report, onClose }: Props) {
  const label =
    JOB_META[report.jobType as JobType]?.label ||
    report.jobType.replace(/_/g, " ");

  function downloadMd() {
    const md = toMarkdown(report);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `critique-${report.jobType}-${(report.jobId || "draft").slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="critique-report-overlay fixed inset-0 z-[80] flex items-stretch justify-center bg-ink/50 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Critique report"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="critique-report-sheet flex max-h-full w-full max-w-3xl flex-col border border-line bg-paper shadow-lg">
        <header className="font-ui flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 print:border-0">
          <div className="min-w-0">
            <h2 className="font-display text-xl text-critique">{label}</h2>
            <p className="text-xs text-muted">
              {[
                report.createdAt && new Date(report.createdAt).toLocaleString(),
                report.scope,
                report.model,
                report.cost != null && `${report.cost} credits`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm print:hidden">
            <button
              type="button"
              onClick={downloadMd}
              className="border border-line px-3 py-1.5 hover:border-accent"
            >
              Save .md
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="border border-line px-3 py-1.5 hover:border-accent"
            >
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bg-ink px-3 py-1.5 text-paper"
            >
              Close
            </button>
          </div>
        </header>

        <div className="critique-report-body min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          {report.summary && (
            <p className="mb-6 text-base leading-relaxed text-ink">{report.summary}</p>
          )}
          {report.items.length > 0 && (
            <ul className="space-y-5">
              {report.items.map((item, i) => (
                <li key={i} className="border-b border-line pb-5 last:border-0">
                  <div className="font-ui flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide">
                    <span
                      className={
                        item.severity === "must_fix"
                          ? "text-danger"
                          : item.severity === "consider"
                            ? "text-warn"
                            : "text-muted"
                      }
                    >
                      {item.severity.replace("_", " ")}
                    </span>
                    <span className="text-muted">{Math.round(item.confidence * 100)}%</span>
                    <span className="text-muted">{item.category}</span>
                  </div>
                  <h3 className="font-display mt-1 text-lg">{item.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{item.body}</p>
                  {item.citation_excerpt && (
                    <blockquote className="mt-3 border-l-2 border-accent pl-3 text-sm italic text-ink/80">
                      “{item.citation_excerpt}”
                    </blockquote>
                  )}
                  {item.example_text && (
                    <div className="mt-3 bg-paper-deep p-3 text-sm text-muted">
                      <span className="font-semibold text-warn">Example — not your prose:</span>{" "}
                      {item.example_text}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {report.extras && <ExtrasView extras={report.extras} />}
        </div>
      </div>
    </div>
  );
}
