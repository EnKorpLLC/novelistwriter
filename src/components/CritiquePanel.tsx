"use client";

import { useState } from "react";
import type { CritiqueItem } from "@/lib/types";
import { CREDIT_COSTS, type JobType } from "@/lib/types";
import Link from "next/link";

type Props = {
  projectId: string;
  chapterId?: string;
  selectionText?: string;
  challengeLevel: number;
  onChallengeChange: (n: number) => void;
};

const JOBS: { type: JobType; label: string; mode?: string }[] = [
  { type: "line_edit", label: "Line edit", mode: "line" },
  { type: "developmental", label: "Developmental", mode: "developmental" },
  { type: "structural", label: "Structural", mode: "structural" },
  { type: "voice_pass", label: "Voice pass", mode: "voice" },
  { type: "continuity", label: "Continuity" },
  { type: "plotholes", label: "Plotholes" },
  { type: "lore_lock", label: "Lore lock" },
  { type: "arcs", label: "Arcs" },
  { type: "promises", label: "Promises" },
  { type: "dialogue_fingerprint", label: "Dialogue fingerprint" },
  { type: "pacing", label: "Pacing heatmap" },
  { type: "voice_analysis", label: "Voice analysis" },
  { type: "discover_comps", label: "Discover comps" },
  { type: "targeted_compare", label: "Compare to…" },
  { type: "reading_list", label: "Reading list" },
  { type: "sensitivity", label: "Sensitivity flags" },
  { type: "blurb_critique", label: "Blurb critique" },
  { type: "custom_persona", label: "Custom persona" },
];

export function CritiquePanel({
  projectId,
  chapterId,
  selectionText,
  challengeLevel,
  onChallengeChange,
}: Props) {
  const [items, setItems] = useState<CritiqueItem[]>([]);
  const [summary, setSummary] = useState("");
  const [extras, setExtras] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [costHint, setCostHint] = useState<number | null>(null);
  const [targetAuthor, setTargetAuthor] = useState("");
  const [targetBook, setTargetBook] = useState("");
  const [persona, setPersona] = useState("");
  const [disagreeNote, setDisagreeNote] = useState("");

  async function run(jobType: JobType, mode?: string) {
    const cost = CREDIT_COSTS[jobType];
    setCostHint(cost);
    if (!confirm(`Run ${jobType.replace(/_/g, " ")} for ${cost} credits?`)) return;

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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "insufficient_credits") {
          setError(`${data.error} `);
          return;
        }
        throw new Error(data.error || "Critique failed");
      }
      setSummary(data.summary || "");
      setItems(data.items || []);
      setExtras(data.extras || null);
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
    <aside className="font-ui flex h-full flex-col border-l border-line bg-paper-deep/40">
      <div className="border-b border-line px-4 py-3">
        <h2 className="font-display text-lg text-critique">Critique</h2>
        <p className="mt-1 text-xs text-muted">AI coaches — never writes your prose.</p>
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

      <div className="max-h-40 space-y-1 overflow-y-auto border-b border-line p-2">
        {JOBS.map((j) => (
          <button
            key={j.type}
            type="button"
            disabled={loading}
            onClick={() => run(j.type, j.mode)}
            className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs hover:bg-paper disabled:opacity-50"
          >
            <span>{j.label}</span>
            <span className="text-muted">{CREDIT_COSTS[j.type]} cr</span>
          </button>
        ))}
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
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading && <p className="text-sm text-muted">Running critique…</p>}
        {error && (
          <p className="text-sm text-danger">
            {error}{" "}
            <Link href="/billing" className="underline">
              Buy credits
            </Link>
          </p>
        )}
        {costHint !== null && !loading && !error && !summary && (
          <p className="text-xs text-muted">Last quoted cost: {costHint} credits</p>
        )}
        {summary && <p className="mb-3 text-sm text-ink">{summary}</p>}
        <ul className="space-y-3">
          {items.map((item, i) => (
            <li key={i} className="border border-line bg-paper p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide">
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
                <span className="text-muted">{Math.round(item.confidence * 100)}% conf</span>
                <span className="text-muted">{item.category}</span>
              </div>
              <h3 className="mt-1 font-display text-base">{item.title}</h3>
              <p className="mt-1 text-muted">{item.body}</p>
              {item.citation_excerpt && (
                <blockquote className="mt-2 border-l-2 border-accent pl-2 text-xs italic text-ink/80">
                  “{item.citation_excerpt}”
                </blockquote>
              )}
              {item.example_text && (
                <div className="mt-2 bg-paper-deep p-2 text-xs text-muted">
                  <span className="font-semibold text-warn">Example — not your prose:</span>{" "}
                  {item.example_text}
                </div>
              )}
            </li>
          ))}
        </ul>
        {extras && (
          <pre className="mt-4 overflow-x-auto bg-paper p-2 text-[10px] text-muted">
            {JSON.stringify(extras, null, 2)}
          </pre>
        )}
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
  );
}
