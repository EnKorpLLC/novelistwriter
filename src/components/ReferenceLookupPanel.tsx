"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { BibleEntry, Chapter, CritiqueItem, JobType } from "@/lib/types";
import { JOB_META } from "@/lib/ai/jobs";

type JobRow = {
  id: string;
  job_type: string;
  status: string;
  created_at: string;
  result?: {
    summary?: string;
    items?: CritiqueItem[];
    extras?: Record<string, unknown> | null;
  } | null;
};

type SourceKind = "chapter" | "bible" | "report";

type Hit = {
  id: string;
  kind: SourceKind;
  title: string;
  subtitle: string;
  snippet: string;
  body: string;
  score: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  chapters: Chapter[];
  bible: BibleEntry[];
};

type Filter = "all" | SourceKind;

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function snippetAround(text: string, query: string, radius = 90): string {
  const t = normalize(text);
  if (!t) return "";
  const q = query.trim().toLowerCase();
  if (!q) return t.slice(0, radius * 2) + (t.length > radius * 2 ? "…" : "");
  const i = t.toLowerCase().indexOf(q);
  if (i < 0) return t.slice(0, radius * 2) + (t.length > radius * 2 ? "…" : "");
  const start = Math.max(0, i - radius);
  const end = Math.min(t.length, i + q.length + radius);
  return `${start > 0 ? "…" : ""}${t.slice(start, end)}${end < t.length ? "…" : ""}`;
}

function extrasPlain(extras: Record<string, unknown> | null | undefined): string {
  if (!extras) return "";
  const parts: string[] = [];
  for (const [key, val] of Object.entries(extras)) {
    if (val == null) continue;
    if (typeof val === "string") {
      parts.push(`${key}: ${val}`);
      continue;
    }
    if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string") parts.push(item);
        else if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          parts.push(
            [o.name, o.subject, o.title, o.description, o.summary, o.notes, o.why]
              .filter((x) => typeof x === "string" && x.trim())
              .join(" — ")
          );
        }
      }
      continue;
    }
    if (typeof val === "object") {
      try {
        parts.push(`${key}: ${JSON.stringify(val)}`);
      } catch {
        /* ignore */
      }
    }
  }
  return parts.filter(Boolean).join("\n");
}

function reportBody(job: JobRow): string {
  const r = job.result || {};
  const lines: string[] = [];
  if (r.summary) lines.push(r.summary, "");
  for (const item of r.items || []) {
    const head = [item.category, item.title].filter(Boolean).join(" — ");
    lines.push(head || "Note");
    if (item.body) lines.push(item.body);
    if (item.citation_excerpt) lines.push(`“${item.citation_excerpt}”`);
    if (item.example_text) lines.push(item.example_text);
    lines.push("");
  }
  const ex = extrasPlain(r.extras);
  if (ex) lines.push(ex);
  return lines.join("\n").trim();
}

function chapterBody(ch: Chapter): string {
  const meta = [
    ch.goal && `Scene goal: ${ch.goal}`,
    ch.conflict && `Conflict: ${ch.conflict}`,
    ch.outcome && `Outcome: ${ch.outcome}`,
    ch.pov && `POV: ${ch.pov}`,
    ch.timeline_position && `Timeline: ${ch.timeline_position}`,
  ].filter(Boolean);
  const prose = ch.content_text || normalize((ch.content_html || "").replace(/<[^>]+>/g, " "));
  return [...meta, "", prose].filter(Boolean).join("\n");
}

function bibleBody(e: BibleEntry): string {
  const aliases = Array.isArray((e.details as { aliases?: unknown })?.aliases)
    ? ((e.details as { aliases: string[] }).aliases || []).join(", ")
    : "";
  return [
    `${e.entry_type}: ${e.name}`,
    aliases && `Aliases: ${aliases}`,
    e.summary,
    e.speech_notes && `Speech: ${e.speech_notes}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function scoreMatch(haystack: string, query: string): number {
  const h = haystack.toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  if (!h.includes(q)) {
    const words = q.split(/\s+/).filter((w) => w.length > 1);
    if (!words.length) return 0;
    const hits = words.filter((w) => h.includes(w)).length;
    if (hits === 0) return 0;
    return hits / words.length;
  }
  const idx = h.indexOf(q);
  // Prefer earlier / title-ish matches slightly
  return 10 + Math.max(0, 5 - idx / 200);
}

export function ReferenceLookupPanel({
  open,
  onClose,
  projectId,
  chapters,
  bible,
}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [active, setActive] = useState<Hit | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 72 });
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const placedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (!placedRef.current) {
      const w = typeof window !== "undefined" ? window.innerWidth : 1200;
      setPos({ x: Math.max(16, w - 440), y: 72 });
      placedRef.current = true;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingJobs(true);
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/ai-jobs`);
        const data = await res.json();
        if (!cancelled) {
          setJobs(
            ((data.jobs || []) as JobRow[]).filter(
              (j) => j.status === "completed" && (j.result?.summary || j.result?.items?.length)
            )
          );
        }
      } catch {
        if (!cancelled) setJobs([]);
      } finally {
        if (!cancelled) setLoadingJobs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  const hits = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [] as Hit[];

    const out: Hit[] = [];

    if (filter === "all" || filter === "chapter") {
      for (const ch of chapters) {
        const body = chapterBody(ch);
        const sc = scoreMatch(`${ch.title}\n${body}`, q);
        if (sc <= 0) continue;
        out.push({
          id: `chapter:${ch.id}`,
          kind: "chapter",
          title: ch.title || "Untitled chapter",
          subtitle: "Chapter",
          snippet: snippetAround(body, q),
          body,
          score: sc,
        });
      }
    }

    if (filter === "all" || filter === "bible") {
      for (const e of bible) {
        const body = bibleBody(e);
        const sc = scoreMatch(body, q);
        if (sc <= 0) continue;
        out.push({
          id: `bible:${e.id}`,
          kind: "bible",
          title: e.name || "Untitled",
          subtitle: e.entry_type,
          snippet: snippetAround(body, q),
          body,
          score: sc + (e.name.toLowerCase().includes(q.toLowerCase()) ? 3 : 0),
        });
      }
    }

    if (filter === "all" || filter === "report") {
      for (const job of jobs) {
        const body = reportBody(job);
        const label =
          JOB_META[job.job_type as JobType]?.label || job.job_type.replace(/_/g, " ");
        const sc = scoreMatch(`${label}\n${body}`, q);
        if (sc <= 0) continue;
        out.push({
          id: `report:${job.id}`,
          kind: "report",
          title: label,
          subtitle: new Date(job.created_at).toLocaleString(),
          snippet: snippetAround(body, q),
          body,
          score: sc,
        });
      }
    }

    return out.sort((a, b) => b.score - a.score).slice(0, 60);
  }, [query, filter, chapters, bible, jobs]);

  const onPointerDownDrag = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, input, a")) return;
    e.preventDefault();
    dragRef.current = { ox: e.clientX, oy: e.clientY, px: pos.x, py: pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos.x, pos.y]);

  const onPointerMoveDrag = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const nx = d.px + (e.clientX - d.ox);
    const ny = d.py + (e.clientY - d.oy);
    const maxX = Math.max(0, window.innerWidth - 320);
    const maxY = Math.max(0, window.innerHeight - 80);
    setPos({
      x: Math.min(maxX, Math.max(0, nx)),
      y: Math.min(maxY, Math.max(0, ny)),
    });
  }, []);

  const onPointerUpDrag = useCallback((e: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="font-ui fixed z-[60] flex w-[min(420px,calc(100vw-1rem))] flex-col border border-line bg-paper shadow-lg"
      style={{
        left: pos.x,
        top: pos.y,
        height: "min(70vh, 560px)",
        maxHeight: "calc(100vh - 1.5rem)",
      }}
      role="dialog"
      aria-label="Look up reference"
    >
      <div
        className="flex shrink-0 cursor-grab items-center justify-between gap-2 border-b border-line bg-paper-deep/40 px-3 py-2 active:cursor-grabbing"
        onPointerDown={onPointerDownDrag}
        onPointerMove={onPointerMoveDrag}
        onPointerUp={onPointerUpDrag}
        onPointerCancel={onPointerUpDrag}
      >
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink">Look up</p>
          <p className="truncate text-[10px] text-muted">
            Drag to move · stays open while you write
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 border border-line px-2 py-1 text-xs text-muted hover:border-ink hover:text-ink"
          aria-label="Close look up"
        >
          Close
        </button>
      </div>

      {!active ? (
        <>
          <div className="shrink-0 space-y-2 border-b border-line p-3">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chapters, bible, reports…"
              className="w-full border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
            <div className="flex flex-wrap gap-1 text-[10px]">
              {(
                [
                  ["all", "All"],
                  ["chapter", "Chapters"],
                  ["bible", "Bible"],
                  ["report", "Reports"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`px-2 py-0.5 ${
                    filter === id ? "bg-accent text-paper" : "text-muted hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {query.trim().length < 2 ? (
              <p className="p-4 text-sm text-muted">
                Type at least 2 characters. Results open here — your editor stays put.
              </p>
            ) : hits.length === 0 ? (
              <p className="p-4 text-sm text-muted">
                No matches{loadingJobs ? " (loading reports…)" : ""}.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {hits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2.5 text-left hover:bg-paper-deep/50"
                      onClick={() => setActive(hit)}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm text-ink">{hit.title}</span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
                          {hit.kind}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted">{hit.subtitle}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted">{hit.snippet}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
            <button
              type="button"
              onClick={() => setActive(null)}
              className="text-xs text-accent hover:underline"
            >
              ← Results
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{active.title}</p>
              <p className="truncate text-[10px] capitalize text-muted">
                {active.kind}
                {active.subtitle ? ` · ${active.subtitle}` : ""}
              </p>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <pre className="font-ui whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
              {active.body || "(Empty)"}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
