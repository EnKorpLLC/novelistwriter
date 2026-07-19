"use client";

import { useState } from "react";
import type { BibleEntry } from "@/lib/types";
import {
  BIBLE_CHAPTERS_PER_BATCH,
  BIBLE_PASSES,
  estimateBibleExtractCost,
} from "@/lib/ai/bible-extract";
import type { AiModelTier } from "@/lib/ai/pricing";
import { AI_MODEL_TIERS } from "@/lib/ai/pricing";
import Link from "next/link";

type Props = {
  projectId: string;
  chapterCount: number;
  entries: BibleEntry[];
  onChange: (entries: BibleEntry[]) => void;
  promises: { id: string; description: string; status: string }[];
  arcs: { id: string; arc_type: string; subject: string; notes: string }[];
  onCreditsChange?: (n: number) => void;
};

const TYPES: BibleEntry["entry_type"][] = [
  "character",
  "place",
  "note",
  "lore",
  "rule",
  "timeline",
];

export function BiblePanel({
  projectId,
  chapterCount,
  entries,
  onChange,
  promises,
  arcs,
  onCreditsChange,
}: Props) {
  const [type, setType] = useState<BibleEntry["entry_type"]>("character");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [speech, setSpeech] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState<string | null>(null);
  const [extractModel, setExtractModel] = useState<AiModelTier>("standard");

  const estimate = estimateBibleExtractCost({
    chapterCount: Math.max(1, chapterCount),
    model: extractModel,
  });

  async function add() {
    if (!name.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/bible`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_type: type,
        name,
        summary,
        speech_notes: speech,
      }),
    });
    const data = await res.json();
    if (res.ok && data.entry) {
      onChange([...entries, data.entry]);
      setName("");
      setSummary("");
      setSpeech("");
    }
  }

  async function remove(id: string) {
    await fetch(`/api/bible/${id}`, { method: "DELETE" });
    onChange(entries.filter((e) => e.id !== id));
  }

  async function extractFromManuscript() {
    const est = estimateBibleExtractCost({
      chapterCount: Math.max(1, chapterCount),
      model: extractModel,
    });
    if (
      !confirm(
        `Thorough story-bible scan of ${chapterCount} chapter(s)?\n\n` +
          `Passes: ${BIBLE_PASSES.map((p) => p.label).join(", ")}\n` +
          `Full chapters in batches of ${BIBLE_CHAPTERS_PER_BATCH} (${est.batches} batch(es) × ${BIBLE_PASSES.length} passes = ${est.calls} AI calls)\n` +
          `Model: ${AI_MODEL_TIERS[extractModel].label}\n` +
          `Estimated cost: ${est.cost} credits\n\n` +
          `Existing entries are kept; new names are added. This can take several minutes on a long novel.`
      )
    ) {
      return;
    }
    setExtracting(true);
    setExtractMsg("Scanning… this may take a few minutes on a long book.");
    try {
      const res = await fetch("/api/ai/critique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobType: "bible_extract",
          projectId,
          scope: "book",
          model: extractModel,
        }),
      });
      let data: {
        error?: string;
        code?: string;
        creditsRemaining?: number;
        extras?: { added?: BibleEntry[]; calls?: number };
        summary?: string;
        cost?: number;
        refunded?: number;
      };
      try {
        data = await res.json();
      } catch {
        throw new Error(
          res.status === 504 || res.status === 408
            ? "Request timed out — try again, or use Fast model."
            : `Server error (${res.status}). Try again.`
        );
      }
      if (typeof data.creditsRemaining === "number") {
        onCreditsChange?.(data.creditsRemaining);
      }
      if (!res.ok) {
        if (data.code === "insufficient_credits") {
          setExtractMsg(
            `${data.error || "Need more credits."} Estimated ${est.cost} credits for this scan.`
          );
          return;
        }
        throw new Error(data.error || "Extract failed");
      }
      const added = (data.extras?.added as BibleEntry[]) || [];
      if (added.length) {
        onChange([...entries, ...added]);
      }
      setExtractMsg(
        data.summary ||
          `Added ${added.length} entr${added.length === 1 ? "y" : "ies"} (${data.cost} credits` +
            (data.extras?.calls ? `, ${data.extras.calls} AI calls` : "") +
            `).`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Extract failed";
      setExtractMsg(
        /connection error|timed out|dropped/i.test(msg)
          ? "AI connection timed out. Credits were refunded if charged — try Fast model, or run again."
          : msg
      );
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl">Story bible</h2>
          <p className="mt-1 text-sm text-muted">
            Characters, places, lore, rules, timeline — used by lore lock and other critiques.
          </p>
        </div>
        <div className="font-ui flex shrink-0 flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-1">
            {(Object.keys(AI_MODEL_TIERS) as AiModelTier[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setExtractModel(id)}
                title={AI_MODEL_TIERS[id].blurb}
                className={`px-2 py-0.5 text-[11px] ${
                  extractModel === id ? "bg-accent text-paper" : "border border-line text-muted"
                }`}
              >
                {AI_MODEL_TIERS[id].label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={extracting || chapterCount < 1}
            onClick={extractFromManuscript}
            className="border border-accent bg-paper px-4 py-2 text-sm text-accent hover:bg-accent hover:text-paper disabled:opacity-50"
          >
            {extracting
              ? "Scanning manuscript…"
              : `AI: extract (~${estimate.cost} cr · ${estimate.calls} passes)`}
          </button>
          <p className="max-w-xs text-right text-[10px] text-muted">
            {chapterCount} chapters · batches of {BIBLE_CHAPTERS_PER_BATCH} ·{" "}
            {BIBLE_PASSES.length} categories (characters, places, lore/rules, timeline/notes).
            Standard is recommended; Deep costs more.
          </p>
        </div>
      </div>
      {extractMsg && (
        <p className="font-ui mt-3 text-sm text-muted">
          {extractMsg}{" "}
          {extractMsg.toLowerCase().includes("credit") && (
            <Link href="/billing" className="text-accent underline">
              Billing
            </Link>
          )}
        </p>
      )}
      <p className="font-ui mt-2 text-xs text-muted">
        Optional AI scan reads your chapters and suggests bible entries. It does not write prose for
        you — you can edit or delete anything it adds.
      </p>

      <div className="font-ui mt-6 grid gap-2 border border-line bg-paper p-4 md:grid-cols-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as BibleEntry["entry_type"])}
          className="border border-line px-2 py-1"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border border-line px-2 py-1"
        />
        <textarea
          placeholder="Summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="border border-line px-2 py-1 md:col-span-2"
          rows={2}
        />
        {type === "character" && (
          <textarea
            placeholder="Speech / voice notes"
            value={speech}
            onChange={(e) => setSpeech(e.target.value)}
            className="border border-line px-2 py-1 md:col-span-2"
            rows={2}
          />
        )}
        <button
          type="button"
          onClick={add}
          className="bg-accent px-3 py-2 text-sm text-paper md:col-span-2"
        >
          Add entry
        </button>
      </div>

      <ul className="mt-8 space-y-3">
        {entries.map((e) => (
          <li key={e.id} className="border border-line p-4">
            <div className="flex justify-between">
              <div>
                <span className="font-ui text-[10px] uppercase text-muted">{e.entry_type}</span>
                <h3 className="font-display text-lg">{e.name}</h3>
                <p className="text-sm text-muted">{e.summary}</p>
                {e.speech_notes && (
                  <p className="mt-1 text-xs italic text-muted">Speech: {e.speech_notes}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(e.id)}
                className="font-ui text-xs text-danger"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      <section className="mt-12">
        <h3 className="font-display text-xl">Open promises</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {promises.length === 0 && <li className="text-muted">None yet — run Promises AI.</li>}
          {promises.map((p) => (
            <li key={p.id} className="border-l-2 border-warn pl-3">
              {p.description}{" "}
              <span className="text-xs text-muted">({p.status})</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h3 className="font-display text-xl">Arc tracks</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {arcs.length === 0 && <li className="text-muted">None yet — run Arcs AI.</li>}
          {arcs.map((a) => (
            <li key={a.id} className="border border-line p-3">
              <span className="text-xs uppercase text-muted">{a.arc_type}</span>
              <div className="font-display">{a.subject}</div>
              <p className="text-muted">{a.notes}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
