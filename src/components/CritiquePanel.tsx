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
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
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

  const jobsByCost = useMemo(() => {
    return [...JOBS].sort((a, b) => {
      const costA =
        a.type === "arcs" && scope === "book"
          ? estimateArcsCost({ chapterCount: Math.max(1, chapterCount), model }).cost
          : computeCritiqueCost({ jobType: a.type, scope, model });
      const costB =
        b.type === "arcs" && scope === "book"
          ? estimateArcsCost({ chapterCount: Math.max(1, chapterCount), model }).cost
          : computeCritiqueCost({ jobType: b.type, scope, model });
      if (costA !== costB) return costA - costB;
      return (JOB_META[a.type]?.label || a.type).localeCompare(
        JOB_META[b.type]?.label || b.type
      );
    });
  }, [scope, model, chapterCount]);

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
      setSelectedReports((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
      if (report?.jobId === jobId) setReport(null);
    } finally {
      setDeletingId(null);
    }
  }

  function toggleReportSelect(id: string) {
    setSelectedReports((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllReports() {
    if (selectedReports.size === completedJobs.length) {
      setSelectedReports(new Set());
    } else {
      setSelectedReports(new Set(completedJobs.map((j) => j.id)));
    }
  }

  async function deleteSelectedReports() {
    const ids = [...selectedReports];
    if (!ids.length) return;
    if (
      !confirm(
        `Delete ${ids.length} selected report${ids.length === 1 ? "" : "s"}? This cannot be undone.`
      )
    ) {
      return;
    }
    setBatchDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || `Delete failed (${res.status})`);
        return;
      }
      const gone = new Set(ids);
      setHistory((prev) => prev.filter((j) => !gone.has(j.id)));
      setSelectedReports(new Set());
      if (report?.jobId && gone.has(report.jobId)) setReport(null);
    } finally {
      setBatchDeleting(false);
    }
  }

  async function deleteAllReports() {
    if (!completedJobs.length) return;
    if (
      !confirm(
        `Delete ALL ${completedJobs.length} saved reports for this project? This cannot be undone.`
      )
    ) {
      return;
    }
    setBatchDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", deleteAll: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || `Delete failed (${res.status})`);
        return;
      }
      setHistory([]);
      setSelectedReports(new Set());
      setReport(null);
    } finally {
      setBatchDeleting(false);
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
      if (jobType === "arcs" && effectiveScope === "book") {
        const planRes = await fetch("/api/ai/critique", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobType: "arcs",
            projectId,
            scope: "book",
            model,
            planOnly: true,
          }),
        });
        const plan = await planRes.json();
        if (!planRes.ok) throw new Error(plan.error || "Could not plan arcs scan");
        if (typeof plan.creditsRemaining === "number") {
          onCreditsChange?.(plan.creditsRemaining);
        }

        let batchCount = Math.max(1, plan.batches || arcsEstimate?.batches || 1);
        const allArcs: Array<Record<string, unknown>> = [];
        const allItems: CritiqueItem[] = [];
        let charged = 0;
        let lastJobId: string | undefined;
        const subjects: string[] = [];

        for (let bi = 0; bi < batchCount; bi++) {
          setError(`Scanning arcs · batch ${bi + 1}/${batchCount}…`);
          const res = await fetch("/api/ai/critique", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobType: "arcs",
              projectId,
              scope: "book",
              model,
              challengeLevel,
              batchIndex: bi,
              priorSubjects: subjects.slice(0, 40).join("; ") || undefined,
            }),
          });
          const data = await res.json();
          if (typeof data.creditsRemaining === "number") {
            onCreditsChange?.(data.creditsRemaining);
          }
          if (typeof data.batchCount === "number" && data.batchCount > 0) {
            batchCount = data.batchCount;
          }
          if (!res.ok) {
            throw new Error(
              data.error ||
                `Arcs failed on batch ${bi + 1}. Partial results may be saved.`
            );
          }
          if (data.empty) break;
          charged += data.cost || 0;
          lastJobId = data.jobId || lastJobId;
          const batchArcs = (data.extras?.arcs as Array<Record<string, unknown>>) || [];
          allArcs.push(...batchArcs);
          for (const a of batchArcs) {
            const sub = String(a.subject || "");
            const typ = String(a.arc_type || "story");
            if (sub) subjects.push(`${typ}:${sub}`);
          }
          if (Array.isArray(data.items)) {
            allItems.push(
              ...(data.items as CritiqueItem[]).filter(
                (i) => i.title !== "Parse error" && i.category !== "system"
              )
            );
          }
        }

        // Deduplicate arcs by type+subject (keep richest beats)
        const arcMap = new Map<string, Record<string, unknown>>();
        for (const a of allArcs) {
          const key = `${String(a.arc_type)}:${String(a.subject).toLowerCase()}`;
          const prev = arcMap.get(key);
          if (!prev) {
            arcMap.set(key, a);
            continue;
          }
          const prevBeats = Array.isArray(prev.beats) ? prev.beats : [];
          const nextBeats = Array.isArray(a.beats) ? a.beats : [];
          arcMap.set(key, {
            ...prev,
            ...a,
            beats: [...prevBeats, ...nextBeats],
            notes: [prev.notes, a.notes].filter(Boolean).join(" "),
          });
        }
        const mergedArcs = [...arcMap.values()];
        const summary = `Arc scan complete (${batchCount} batches, ${charged} credits). Tracked ${mergedArcs.length} arc(s).`;

        const fin = await fetch("/api/ai/critique", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobType: "arcs",
            projectId,
            scope: "book",
            model,
            finalize: true,
            finalizePayload: {
              summary,
              items: allItems,
              extras: { arcs: mergedArcs, calls: batchCount, batches: batchCount },
              cost: charged,
            },
          }),
        });
        const finData = await fin.json().catch(() => ({}));

        setError(null);
        setReport({
          jobId: finData.jobId || lastJobId || "arcs-multipass",
          jobType,
          summary,
          items: allItems,
          extras: { arcs: mergedArcs, calls: batchCount, batches: batchCount },
          createdAt: new Date().toISOString(),
          scope: "book",
          model,
          cost: charged,
        });
        setPanelTab("reports");
        void loadHistory();
        return;
      }

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
                {jobsByCost.map((j) => {
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
              <>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <label className="flex items-center gap-1.5 text-muted">
                    <input
                      type="checkbox"
                      checked={
                        completedJobs.length > 0 &&
                        selectedReports.size === completedJobs.length
                      }
                      onChange={toggleSelectAllReports}
                    />
                    Select all
                  </label>
                  <button
                    type="button"
                    disabled={!selectedReports.size || batchDeleting}
                    onClick={() => void deleteSelectedReports()}
                    className="border border-danger px-1.5 py-0.5 text-danger disabled:opacity-40"
                  >
                    Delete selected ({selectedReports.size})
                  </button>
                  <button
                    type="button"
                    disabled={batchDeleting}
                    onClick={() => void deleteAllReports()}
                    className="border border-line px-1.5 py-0.5 text-muted disabled:opacity-40"
                  >
                    Delete all
                  </button>
                </div>
                <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                  {completedJobs.map((j) => (
                    <li
                      key={j.id}
                      className="flex items-stretch gap-1 rounded-sm border border-line bg-paper"
                    >
                      <label className="flex items-center px-2">
                        <input
                          type="checkbox"
                          checked={selectedReports.has(j.id)}
                          onChange={() => toggleReportSelect(j.id)}
                        />
                      </label>
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
                        disabled={deletingId === j.id || batchDeleting}
                        onClick={() => void deleteJob(j.id)}
                        className="shrink-0 border-l border-line px-2 text-xs text-danger hover:bg-paper-deep disabled:opacity-50"
                      >
                        {deletingId === j.id ? "…" : "×"}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </aside>

      {report && <CritiqueReportModal report={report} onClose={() => setReport(null)} />}
    </>
  );
}
