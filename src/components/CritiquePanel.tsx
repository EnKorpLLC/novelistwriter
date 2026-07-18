"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CritiqueItem, JobType } from "@/lib/types";
import { CREDIT_COSTS } from "@/lib/types";
import {
  AI_MODEL_TIERS,
  AI_SCOPE_MULT,
  BOOK_DEFAULT_JOBS,
  computeCritiqueCost,
  defaultScopeForJob,
  type AiModelTier,
  type AiScope,
} from "@/lib/ai/pricing";
import { JOB_META } from "@/lib/ai/jobs";
import { CritiqueReportModal, type CritiqueReportData } from "@/components/CritiqueReportModal";
import Link from "next/link";

type Props = {
  projectId: string;
  chapterId?: string;
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
  selectionText,
  challengeLevel,
  onChallengeChange,
  onCreditsChange,
}: Props) {
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
  const hasSelection = Boolean(selectionText?.trim());

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

    const cost = computeCritiqueCost({ jobType, scope: effectiveScope, model });
    const meta = JOB_META[jobType];
    const scopeLabel =
      effectiveScope === "selection"
        ? "selection"
        : effectiveScope === "book"
          ? "whole book"
          : "this chapter";
    if (
      !confirm(
        `Run ${meta.label} on ${scopeLabel} with ${AI_MODEL_TIERS[model].label} model?\n\n${meta.description}\n\nCost: ${cost} credits`
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
      <aside className="font-ui flex h-full flex-col border-l border-line bg-paper-deep/40">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-display text-lg text-critique">Critique</h2>
          <p className="mt-1 text-xs text-muted">
            Results open in a full reader — saved to this project so you can return later.
          </p>

          <div className="mt-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-muted">Scope</p>
            <div className="flex flex-wrap gap-1">
              {scopeOptions.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  disabled={o.disabled}
                  title={o.tip}
                  onClick={() => setScope(o.id)}
                  className={`px-2 py-1 text-[11px] ${
                    scope === o.id ? "bg-critique text-paper" : "border border-line text-muted"
                  } disabled:opacity-40`}
                >
                  {o.label}
                  <span className="ml-1 opacity-70">×{AI_SCOPE_MULT[o.id]}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Model</p>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(AI_MODEL_TIERS) as AiModelTier[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setModel(id)}
                  title={AI_MODEL_TIERS[id].blurb}
                  className={`px-2 py-1 text-[11px] ${
                    model === id ? "bg-accent text-paper" : "border border-line text-muted"
                  }`}
                >
                  {AI_MODEL_TIERS[id].label}
                  <span className="ml-1 opacity-70">×{AI_MODEL_TIERS[id].creditMult}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="mt-3 block text-xs text-muted">
            Challenge me: {challengeLevel}
            <input
              type="range"
              min={0}
              max={100}
              value={challengeLevel}
              onChange={(e) => onChallengeChange(Number(e.target.value))}
              className="mt-1 w-full"
            />
            <span className="flex justify-between text-[10px]">
              <span>Soft coach</span>
              <span>Ruthless</span>
            </span>
          </label>
        </div>

        <div className="max-h-48 space-y-1 overflow-y-auto border-b border-line p-2">
          {JOBS.map((j) => {
            const meta = JOB_META[j.type];
            return (
              <button
                key={j.type}
                type="button"
                disabled={loading}
                title={meta.description}
                onClick={() => {
                  if (BOOK_DEFAULT_JOBS.includes(j.type) && scope === "selection" && !hasSelection) {
                    setScope("book");
                  }
                  void run(j.type, j.mode);
                }}
                className="flex w-full items-start justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-paper disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="font-medium text-ink">{meta.label}</span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-muted line-clamp-2">
                    {meta.description}
                  </span>
                </span>
                <span className="shrink-0 text-muted">{costFor(j.type)} cr</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2 border-b border-line p-3 text-xs">
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
          <p className="text-[10px] text-muted">
            Cost = base × scope × model. Hover (or long-press) an action for details. Developmental
            chapter · Standard = {CREDIT_COSTS.developmental} × {AI_SCOPE_MULT[scope]} ×{" "}
            {AI_MODEL_TIERS[model].creditMult} → {costFor("developmental")} cr.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading && <p className="text-sm text-muted">Running critique…</p>}
          {error && (
            <p className="text-sm text-danger">
              {error}{" "}
              <Link href="/billing" className="underline">
                Buy credits
              </Link>
            </p>
          )}

          <p className="mb-2 text-[10px] uppercase tracking-wide text-muted">Saved reports</p>
          {history.length === 0 && !loading && (
            <p className="text-xs text-muted">No critiques yet. Run one above — it will stay here.</p>
          )}
          <ul className="space-y-1">
            {history
              .filter((j) => j.status === "complete" || j.status === "failed")
              .map((j) => (
                <li key={j.id}>
                  <button
                    type="button"
                    disabled={j.status !== "complete"}
                    onClick={() => {
                      if (j.result?.items || j.result?.summary) openFromJob(j);
                      else void openJobDetail(j.id);
                    }}
                    className="flex w-full flex-col rounded-sm border border-line px-2 py-1.5 text-left text-xs hover:border-accent disabled:opacity-50"
                  >
                    <span className="font-medium text-ink">
                      {JOB_META[j.job_type as JobType]?.label || j.job_type}
                    </span>
                    <span className="text-[10px] text-muted">
                      {new Date(j.created_at).toLocaleString()} · {j.credit_cost} cr · {j.status}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </div>

        <div className="border-t border-line p-3">
          <label className="text-xs text-muted">
            I disagree — remember this preference
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
            className="mt-2 text-xs text-accent hover:underline"
          >
            Save preference
          </button>
        </div>
      </aside>

      {report && <CritiqueReportModal report={report} onClose={() => setReport(null)} />}
    </>
  );
}
