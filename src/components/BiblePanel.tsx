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
    setExtracting(true);
    setExtractMsg("Planning scan…");
    try {
      const planRes = await fetch("/api/ai/critique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobType: "bible_extract",
          projectId,
          scope: "book",
          model: extractModel,
          planOnly: true,
        }),
      });
      const plan = await planRes.json();
      if (!planRes.ok) {
        throw new Error(plan.error || "Could not plan bible extract");
      }
      if (typeof plan.creditsRemaining === "number") {
        onCreditsChange?.(plan.creditsRemaining);
      }

      const batches = Math.max(1, plan.batches || estimate.batches);
      const calls = Math.max(1, plan.calls || estimate.calls);
      const cost = plan.cost ?? estimate.cost;
      const passes = BIBLE_PASSES;

      if (
        !confirm(
          `Thorough story-bible scan of ${plan.chapterCount ?? chapterCount} chapter(s)?\n\n` +
            `Passes: ${passes.map((p) => p.label).join(", ")}\n` +
            `${batches} batch(es) of up to ${BIBLE_CHAPTERS_PER_BATCH} full chapters × ${passes.length} categories = ${calls} separate AI requests\n` +
            `Model: ${AI_MODEL_TIERS[extractModel].label}\n` +
            `Estimated cost: ${cost} credits (${plan.perCall ?? "?"} each)\n\n` +
            `Each request is small so it won’t false-timeout. Existing entries are kept.`
        )
      ) {
        setExtractMsg(null);
        return;
      }

      const allAdded: BibleEntry[] = [];
      let charged = 0;
      let done = 0;
      let batchCount = batches;

      for (const pass of passes) {
        for (let bi = 0; bi < batchCount; bi++) {
          done += 1;
          setExtractMsg(
            `Scanning ${pass.label} · batch ${bi + 1}/${batchCount} (${done}/${calls})…`
          );
          const res = await fetch("/api/ai/critique", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobType: "bible_extract",
              projectId,
              scope: "book",
              model: extractModel,
              passId: pass.id,
              batchIndex: bi,
            }),
          });
          let data: {
            error?: string;
            code?: string;
            creditsRemaining?: number;
            extras?: { added?: BibleEntry[] };
            summary?: string;
            cost?: number;
            empty?: boolean;
            batchCount?: number;
            refunded?: number;
          };
          try {
            data = await res.json();
          } catch {
            throw new Error(
              res.status === 504 || res.status === 408
                ? `Request timed out on ${pass.label} batch ${bi + 1}. Partial results were kept.`
                : `Server error (${res.status}) on ${pass.label} batch ${bi + 1}.`
            );
          }
          if (typeof data.creditsRemaining === "number") {
            onCreditsChange?.(data.creditsRemaining);
          }
          if (typeof data.batchCount === "number" && data.batchCount > 0) {
            batchCount = data.batchCount;
          }
          if (!res.ok) {
            if (data.code === "insufficient_credits") {
              throw new Error(
                `${data.error || "Need more credits."} Added ${allAdded.length} so far (${charged} credits used).`
              );
            }
            throw new Error(
              data.error ||
                `Extract failed on ${pass.label} batch ${bi + 1}. Added ${allAdded.length} so far.`
            );
          }
          if (data.empty) {
            // No more batches for this packing — stop this pass early
            break;
          }
          charged += data.cost || 0;
          const added = (data.extras?.added as BibleEntry[]) || [];
          if (added.length) {
            allAdded.push(...added);
            onChange([...entries, ...allAdded]);
          }
        }
      }

      setExtractMsg(
        allAdded.length
          ? `Added ${allAdded.length} entr${allAdded.length === 1 ? "y" : "ies"} (${charged} credits across ${done} requests).`
          : `Scan finished (${charged} credits). No new entries — everything found was already in your bible or nothing clear to add.`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Extract failed";
      // Show the real error — do not collapse everything into "timed out"
      setExtractMsg(msg);
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
            {chapterCount} chapters · up to {BIBLE_CHAPTERS_PER_BATCH}/batch · ~{estimate.batches}{" "}
            batches × {BIBLE_PASSES.length} categories = {estimate.calls} separate requests.
            Standard recommended.
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
