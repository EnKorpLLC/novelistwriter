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

  if (report.extras && Object.keys(report.extras).length) {
    lines.push("## Extra data");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(report.extras, null, 2));
    lines.push("```");
  }

  return lines.join("\n");
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

  function printReport() {
    window.print();
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
              onClick={printReport}
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
          {report.extras && Object.keys(report.extras).length > 0 && (
            <details className="mt-8 print:hidden">
              <summary className="font-ui cursor-pointer text-sm text-muted">
                Extra structured data
              </summary>
              <pre className="mt-2 overflow-x-auto bg-paper-deep p-3 text-[11px] text-muted">
                {JSON.stringify(report.extras, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
