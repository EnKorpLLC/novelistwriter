"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CritiqueItem, JobType } from "@/lib/types";
import {
  AI_MODEL_TIERS,
  AI_SCOPE_MULT,
  BOOK_DEFAULT_JOBS,
  computeCritiqueCost,
  defaultScopeForJob,
  type AiModelTier,
  type AiScope,
} from "@/lib/ai/pricing";
import { estimateArcsCost } from "@/lib/ai/arcs-multipass";
import { JOB_META } from "@/lib/ai/jobs";
import { CritiqueReportModal, type CritiqueReportData } from "@/components/CritiqueReportModal";
import Link from "next/link";

type Props = {
  projectId: string;
  chapterId?: string;
  chapterCount?: number;
  selectionText?: string;
  challengeLevel: number;
  onChallengeChange: (n: number) => void;
  onCreditsChange?: (n: number) => void;
};

type HistoryJob = {
  id: string;
  job_type: string;
  status: string;
  credit_cost: number;
  created_at: string;
  input?: { scope?: string; model?: string };
  result?: { summary?: string; items?: CritiqueItem[]; extras?: Record<string, unknown> };
};

const JOBS: { type: JobType; mode?: string }[] = [
  { type: "line_edit", mode: "line" },
  { type: "developmental", mode: "developmental" },
  { type: "structural", mode: "structural" },
  { type: "voice_pass", mode: "voice" },
  { type: "continuity" },
  { type: "plotholes" },
  { type: "lore_lock" },
  { type: "arcs" },
  { type: "promises" },
  { type: "dialogue_fingerprint" },
  { type: "pacing" },
  { type: "voice_analysis" },
  { type: "discover_comps" },
  { type: "targeted_compare" },
  { type: "reading_list" },
  { type: "sensitivity" },
  { type: "blurb_critique" },
  { type: "custom_persona" },
];

export function CritiquePanel({
  projectId,
  chapterId,
  chapterCount = 1,
  selectionText,
  challengeLevel,
  onChallengeChange,
  onCreditsChange,
}: Props) {
  const [panelTab, setPanelTab] = useState<"run" | "reports">("run");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetAuthor, setTargetAuthor] = useState("");
  const [targetBook, setTargetBook] = useState("");
  const [persona, setPersona] = useState("");
  const [disagreeNote, setDisagreeNote] = useState("");
  const [model, setModel] = useState<AiModelTier>("standard");
  const [scope, setScope] = useState<AiScope>("chapter");
  const [history, setHistory] = useState<HistoryJob[]>([]);
  const [report, setReport] = useState<CritiqueReportData | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const hasSelection = Boolean(selectionText?.trim());

  const completedJobs = useMemo(
    () => history.filter((j) => j.status === "complete" || j.status === "failed"),
    [history]
  );

  const loadHistory = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/ai-jobs`);
    if (!res.ok) return;
    const data = await res.json();
    setHistory(data.jobs || []);
  }, [projectId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const scopeOptions = useMemo(() => {
    return [
      {
        id: "selection" as const,
        label: "Selection",
        disabled: !hasSelection,
        tip: hasSelection ? undefined : "Highlight text in the chapter first",
      },
      { id: "chapter" as const, label: "Chapter" },
      { id: "book" as const, label: "Whole book" },
    ];
  }, [hasSelection]);

  function costFor(jobType: JobType) {
    if (jobType === "arcs" && scope === "book") {
      return estimateArcsCost({ chapterCount: Math.max(1, chapterCount), model }).cost;
    }
    return computeCritiqueCost({ jobType, scope, model });
  }

  function openFromJob(job: HistoryJob) {
    const result = job.result || {};
    setReport({
      jobId: job.id,
      jobType: job.job_type,
      summary: result.summary || "",
      items: (result.items as CritiqueItem[]) || [],
      extras: result.extras || null,
      createdAt: job.created_at,
      scope: job.input?.scope,
      model: job.input?.model,
      cost: job.credit_cost,
    });
  }

  async function openJobDetail(jobId: string) {
    const res = await fetch(`/api/ai/jobs/${jobId}`);
    if (!res.ok) return;
    const data = await res.json();
    const job = data.job;
    const items =
      (data.items as CritiqueItem[])?.length > 0
        ? data.items
        : (job.result?.items as CritiqueItem[]) || [];
    setReport({
      jobId: job.id,
      jobType: job.job_type,
      summary: job.result?.summary || "",
      items,
      extras: job.result?.extras || null,
      createdAt: job.created_at,
      scope: job.input?.scope,
      model: job.input?.model,
      cost: job.credit_cost,
    });
  }

  async function deleteJob(jobId: string) {
    if (!confirm("Delete this saved critique report? This cannot be undone.")) return;
    setDeletingId(jobId);
    try {
      const res = await fetch(`/api/ai/jobs/${jobId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Could not delete report");
        return;
      }
      setHistory((prev) => prev.filter((j) => j.id !== jobId));
      if (report?.jobId === jobId) setReport(null);
    } finally {
      setDeletingId(null);
    }
  }

  async function run(jobType: JobType, mode?: string) {
    let effectiveScope = scope;
    if (jobType === "bible_extract") effectiveScope = "book";
    if (effectiveScope === "selection" && !hasSelection) {
      setError("Highlight a passage in the editor, or choose Chapter / Whole book.");
      return;
    }
    if (!hasSelection && effectiveScope === "selection") {
      effectiveScope = defaultScopeForJob(jobType);
    }

    const cost =
      jobType === "arcs" && effectiveScope === "book"
        ? estimateArcsCost({ chapterCount: Math.max(1, chapterCount), model }).cost
        : computeCritiqueCost({ jobType, scope: effectiveScope, model });
    const arcsEstimate =
      jobType === "arcs" && effectiveScope === "book"
        ? estimateArcsCost({ chapterCount: Math.max(1, chapterCount), model })
        : null;
    const meta = JOB_META[jobType];
    const scopeLabel =
      effectiveScope === "selection"
        ? "selection"
        : effectiveScope === "book"
          ? "whole book"
          : "this chapter";
    const costNote = arcsEstimate
      ? `Cost: ~${arcsEstimate.cost} credits (${arcsEstimate.calls} full-chapter batch passes · exact text, no sampling)`
      : `Cost: ${cost} credits`;
    if (
      !confirm(
        `Run ${meta.label} on ${scopeLabel} with ${AI_MODEL_TIERS[model].label} model?\n\n${meta.description}\n\n${costNote}`
      )
    ) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/critique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobType,
          projectId,
          chapterId,
          text: selectionText || undefined,
          mode,
          challengeLevel,
          targetAuthor: targetAuthor || undefined,
          targetBook: targetBook || undefined,
          persona: persona || undefined,
          scope: effectiveScope,
          model,
        }),
      });
      const data = await res.json();
      if (typeof data.creditsRemaining === "number") {
        onCreditsChange?.(data.creditsRemaining);
      }
      if (!res.ok) {
        if (data.code === "insufficient_credits") {
          setError(`${data.error} `);
          return;
        }
        throw new Error(data.error || "Critique failed");
      }
      const nextReport: CritiqueReportData = {
        jobId: data.jobId,
        jobType,
        summary: data.summary || "",
        items: data.items || [],
        extras: data.extras || null,
        createdAt: new Date().toISOString(),
        scope: data.scope || effectiveScope,
        model: data.model || model,
        cost: data.cost,
      };
      setReport(nextReport);
      setPanelTab("reports");
      void loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function rememberPreference() {
    if (!disagreeNote.trim()) return;
    await fetch("/api/profile/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disagree: disagreeNote }),
    });
    setDisagreeNote("");
    alert("Preference saved — future critiques will respect this.");
  }

  return (
    <>
      <aside className="font-ui flex h-full min-h-0 flex-col border-l border-line bg-paper-deep/40">
        <div className="shrink-0 border-b border-line px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg text-critique">Critique</h2>
            <div className="flex rounded-sm border border-line text-[11px]">
              <button
                type="button"
                onClick={() => setPanelTab("run")}
                className={`px-2.5 py-1 ${panelTab === "run" ? "bg-critique text-paper" : "text-muted"}`}
              >
                Run
              </button>
              <button
                type="button"
                onClick={() => setPanelTab("reports")}
                className={`px-2.5 py-1 ${panelTab === "reports" ? "bg-critique text-paper" : "text-muted"}`}
              >
                Reports{completedJobs.length ? ` (${completedJobs.length})` : ""}
              </button>
            </div>
          </div>
        </div>

        {panelTab === "run" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 space-y-2 border-b border-line px-3 py-2">
              <div className="flex flex-wrap gap-1">
                {scopeOptions.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    disabled={o.disabled}
                    title={o.tip}
                    onClick={() => setScope(o.id)}
                    className={`px-2 py-0.5 text-[11px] ${
                      scope === o.id ? "bg-critique text-paper" : "border border-line text-muted"
                    } disabled:opacity-40`}
                  >
                    {o.label} ×{AI_SCOPE_MULT[o.id]}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(AI_MODEL_TIERS) as AiModelTier[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setModel(id)}
                    title={AI_MODEL_TIERS[id].blurb}
                    className={`px-2 py-0.5 text-[11px] ${
                      model === id ? "bg-accent text-paper" : "border border-line text-muted"
                    }`}
                  >
                    {AI_MODEL_TIERS[id].label} ×{AI_MODEL_TIERS[id].creditMult}
                  </button>
                ))}
              </div>
              <label className="block text-[11px] text-muted">
                Challenge {challengeLevel}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={challengeLevel}
                  onChange={(e) => onChallengeChange(Number(e.target.value))}
                  className="mt-0.5 w-full"
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loading && <p className="mb-2 px-1 text-xs text-muted">Running critique…</p>}
              {error && (
                <p className="mb-2 px-1 text-xs text-danger">
                  {error}{" "}
                  <Link href="/billing" className="underline">
                    Buy credits
                  </Link>
                </p>
              )}
              <ul className="space-y-0.5">
                {JOBS.map((j) => {
                  const meta = JOB_META[j.type];
                  return (
                    <li key={j.type}>
                      <button
                        type="button"
                        disabled={loading}
                        title={meta.description}
                        onClick={() => {
                          if (
                            BOOK_DEFAULT_JOBS.includes(j.type) &&
                            scope === "selection" &&
                            !hasSelection
                          ) {
                            setScope("book");
                          }
                          void run(j.type, j.mode);
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-paper disabled:opacity-50"
                      >
                        <span className="truncate font-medium text-ink">{meta.label}</span>
                        <span className="shrink-0 text-muted">{costFor(j.type)} cr</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <details className="shrink-0 border-t border-line px-3 py-2 text-xs">
              <summary className="cursor-pointer text-muted">Compare / persona / preferences</summary>
              <div className="mt-2 space-y-2">
                <input
                  placeholder="Compare author…"
                  value={targetAuthor}
                  onChange={(e) => setTargetAuthor(e.target.value)}
                  className="w-full border border-line bg-paper px-2 py-1"
                />
                <input
                  placeholder="Compare book…"
                  value={targetBook}
                  onChange={(e) => setTargetBook(e.target.value)}
                  className="w-full border border-line bg-paper px-2 py-1"
                />
                <input
                  placeholder="Custom persona…"
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  className="w-full border border-line bg-paper px-2 py-1"
                />
                <label className="block text-muted">
                  I disagree — remember this
                  <textarea
                    value={disagreeNote}
                    onChange={(e) => setDisagreeNote(e.target.value)}
                    className="mt-1 w-full border border-line bg-paper p-2 text-xs"
                    rows={2}
                    placeholder="e.g. I intentionally use sentence fragments in dialogue."
                  />
                </label>
                <button
                  type="button"
                  onClick={rememberPreference}
                  className="text-accent hover:underline"
                >
                  Save preference
                </button>
              </div>
            </details>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <p className="mb-2 shrink-0 text-[10px] uppercase tracking-wide text-muted">
              Saved reports — open to read, print, or save
            </p>
            {completedJobs.length === 0 ? (
              <p className="text-xs text-muted">
                No critiques yet. Switch to{" "}
                <button type="button" className="text-accent underline" onClick={() => setPanelTab("run")}>
                  Run
                </button>{" "}
                to start one.
              </p>
            ) : (
              <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                {completedJobs.map((j) => (
                  <li
                    key={j.id}
                    className="flex items-stretch gap-1 rounded-sm border border-line bg-paper"
                  >
                    <button
                      type="button"
                      disabled={j.status !== "complete"}
                      onClick={() => {
                        if (j.result?.items || j.result?.summary) openFromJob(j);
                        else void openJobDetail(j.id);
                      }}
                      className="min-w-0 flex-1 px-2.5 py-2 text-left text-xs hover:bg-paper-deep disabled:opacity-50"
                    >
                      <span className="block truncate font-medium text-ink">
                        {JOB_META[j.job_type as JobType]?.label || j.job_type}
                      </span>
                      <span className="block text-[10px] text-muted">
                        {new Date(j.created_at).toLocaleString()} · {j.credit_cost} cr
                        {j.input?.scope ? ` · ${j.input.scope}` : ""}
                        {j.status === "failed" ? " · failed" : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      title="Delete report"
                      disabled={deletingId === j.id}
                      onClick={() => void deleteJob(j.id)}
                      className="shrink-0 border-l border-line px-2 text-xs text-danger hover:bg-paper-deep disabled:opacity-50"
                    >
                      {deletingId === j.id ? "…" : "×"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>

      {report && <CritiqueReportModal report={report} onClose={() => setReport(null)} />}
    </>
  );
}
