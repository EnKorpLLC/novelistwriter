"use client";

import { useRef, useState } from "react";
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
  onArcsChange: (arcs: { id: string; arc_type: string; subject: string; notes: string }[]) => void;
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

function entryAliases(e: BibleEntry): string[] {
  const raw = e.details?.aliases;
  return Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
}

export function BiblePanel({
  projectId,
  chapterCount,
  entries,
  onChange,
  promises,
  arcs,
  onArcsChange,
  onCreditsChange,
}: Props) {
  const [type, setType] = useState<BibleEntry["entry_type"]>("character");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [speech, setSpeech] = useState("");
  const [aliases, setAliases] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState<string | null>(null);
  const [extractModel, setExtractModel] = useState<AiModelTier>("standard");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedArcs, setSelectedArcs] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    name: "",
    summary: "",
    speech_notes: "",
    aliases: "",
    entry_type: "character" as BibleEntry["entry_type"],
  });
  const abortRef = useRef(false);

  const estimate = estimateBibleExtractCost({
    chapterCount: Math.max(1, chapterCount),
    model: extractModel,
  });

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e.id)));
    }
  }

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
        aliases: aliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
      }),
    });
    const data = await res.json();
    if (res.ok && data.entry) {
      onChange([...entries, data.entry]);
      setName("");
      setSummary("");
      setSpeech("");
      setAliases("");
    }
  }

  async function remove(id: string) {
    await fetch(`/api/bible/${id}`, { method: "DELETE" });
    onChange(entries.filter((e) => e.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected entr${ids.length === 1 ? "y" : "ies"}?`)) return;
    const res = await fetch(`/api/projects/${projectId}/bible`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", ids }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || `Delete failed (${res.status})`);
      return;
    }
    onChange(entries.filter((e) => !selected.has(e.id)));
    setSelected(new Set());
  }

  async function deleteAll() {
    if (!entries.length) return;
    if (
      !confirm(
        `Delete ALL ${entries.length} story-bible entries for this project? This cannot be undone.`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/projects/${projectId}/bible`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", deleteAll: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || `Delete failed (${res.status})`);
      return;
    }
    onChange([]);
    setSelected(new Set());
  }

  function startEdit(e: BibleEntry) {
    setEditingId(e.id);
    setEditDraft({
      name: e.name,
      summary: e.summary || "",
      speech_notes: e.speech_notes || "",
      aliases: entryAliases(e).join(", "),
      entry_type: e.entry_type,
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    const res = await fetch(`/api/bible/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editDraft.name,
        summary: editDraft.summary,
        speech_notes: editDraft.speech_notes,
        entry_type: editDraft.entry_type,
        aliases: editDraft.aliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Save failed");
      return;
    }
    onChange(entries.map((e) => (e.id === editingId ? data.entry : e)));
    setEditingId(null);
  }

  function applyEntryPatch(list: BibleEntry[], added: BibleEntry[], updated: BibleEntry[]) {
    const byId = new Map(list.map((e) => [e.id, e]));
    for (const u of updated) byId.set(u.id, u);
    for (const a of added) byId.set(a.id, a);
    return [...byId.values()];
  }

  async function extractFromManuscript() {
    abortRef.current = false;
    setExtracting(true);
    setExtractMsg("Planning scan…");
    let working = [...entries];
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
            `${batches} batch(es) of up to ${BIBLE_CHAPTERS_PER_BATCH} full chapters × ${passes.length} categories = ${calls} requests\n` +
            `Model: ${AI_MODEL_TIERS[extractModel].label}\n` +
            `Estimated cost: ${cost} credits\n\n` +
            `Matching nicknames/titles update existing entries instead of duplicating.\nYou can Stop anytime.`
        )
      ) {
        setExtractMsg(null);
        return;
      }

      let addedCount = 0;
      let updatedCount = 0;
      let charged = 0;
      let done = 0;
      let batchCount = batches;

      outer: for (const pass of passes) {
        for (let bi = 0; bi < batchCount; bi++) {
          if (abortRef.current) {
            setExtractMsg(
              `Stopped. Added ${addedCount}, updated ${updatedCount} (${charged} credits).`
            );
            break outer;
          }
          done += 1;
          setExtractMsg(
            `Scanning ${pass.label} · batch ${bi + 1}/${batchCount} (${done}/${calls})… — Stop available`
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
            extras?: { added?: BibleEntry[]; updated?: BibleEntry[] };
            cost?: number;
            empty?: boolean;
            batchCount?: number;
          };
          try {
            data = await res.json();
          } catch {
            throw new Error(`Server error (${res.status}) on ${pass.label} batch ${bi + 1}.`);
          }
          if (typeof data.creditsRemaining === "number") {
            onCreditsChange?.(data.creditsRemaining);
          }
          if (typeof data.batchCount === "number" && data.batchCount > 0) {
            batchCount = data.batchCount;
          }
          if (!res.ok) {
            throw new Error(
              data.error ||
                `Extract failed on ${pass.label} batch ${bi + 1}. Partial results kept.`
            );
          }
          if (data.empty) break;
          charged += data.cost || 0;
          const added = data.extras?.added || [];
          const updated = data.extras?.updated || [];
          addedCount += added.length;
          updatedCount += updated.length;
          if (added.length || updated.length) {
            working = applyEntryPatch(working, added, updated);
            onChange(working);
          }
        }
      }

      if (!abortRef.current) {
        setExtractMsg(
          `Scan finished. Added ${addedCount}, updated ${updatedCount} (${charged} credits across ${done} requests).`
        );
      }
    } catch (e) {
      setExtractMsg(e instanceof Error ? e.message : "Extract failed");
    } finally {
      setExtracting(false);
    }
  }

  const busy = extracting;

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
          <div className="flex flex-wrap justify-end gap-2">
            {busy ? (
              <button
                type="button"
                onClick={() => {
                  abortRef.current = true;
                  setExtractMsg("Stopping after current request…");
                }}
                className="border border-danger px-3 py-2 text-sm text-danger"
              >
                Stop
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy || chapterCount < 1}
              onClick={extractFromManuscript}
              className="border border-accent bg-paper px-4 py-2 text-sm text-accent hover:bg-accent hover:text-paper disabled:opacity-50"
            >
              {extracting
                ? "Scanning…"
                : `AI: extract (~${estimate.cost} cr · ${estimate.calls} passes)`}
            </button>
          </div>
          <p className="max-w-xs text-right text-[10px] text-muted">
            {chapterCount} chapters · up to {BIBLE_CHAPTERS_PER_BATCH}/batch · nicknames update
            existing rows. Still chunked so you can Stop.
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
        <input
          placeholder="Aliases (comma-separated: Sera, Lady Beaufort)"
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          className="border border-line px-2 py-1 md:col-span-2"
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

      <div className="font-ui mt-6 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={entries.length > 0 && selected.size === entries.length}
            onChange={toggleSelectAll}
          />
          Select all ({entries.length})
        </label>
        <button
          type="button"
          disabled={!selected.size}
          onClick={deleteSelected}
          className="border border-danger px-2 py-1 text-xs text-danger disabled:opacity-40"
        >
          Delete selected ({selected.size})
        </button>
        <button
          type="button"
          disabled={!entries.length}
          onClick={deleteAll}
          className="border border-line px-2 py-1 text-xs text-muted disabled:opacity-40"
        >
          Delete all
        </button>
      </div>

      <ul className="mt-4 space-y-3">
        {entries.map((e) => (
          <li key={e.id} className="border border-line p-4">
            {editingId === e.id ? (
              <div className="font-ui grid gap-2 md:grid-cols-2">
                <select
                  value={editDraft.entry_type}
                  onChange={(ev) =>
                    setEditDraft((d) => ({
                      ...d,
                      entry_type: ev.target.value as BibleEntry["entry_type"],
                    }))
                  }
                  className="border border-line px-2 py-1"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  value={editDraft.name}
                  onChange={(ev) => setEditDraft((d) => ({ ...d, name: ev.target.value }))}
                  className="border border-line px-2 py-1"
                  placeholder="Name"
                />
                <input
                  value={editDraft.aliases}
                  onChange={(ev) => setEditDraft((d) => ({ ...d, aliases: ev.target.value }))}
                  className="border border-line px-2 py-1 md:col-span-2"
                  placeholder="Aliases (comma-separated)"
                />
                <textarea
                  value={editDraft.summary}
                  onChange={(ev) => setEditDraft((d) => ({ ...d, summary: ev.target.value }))}
                  className="border border-line px-2 py-1 md:col-span-2"
                  rows={3}
                  placeholder="Summary"
                />
                <textarea
                  value={editDraft.speech_notes}
                  onChange={(ev) =>
                    setEditDraft((d) => ({ ...d, speech_notes: ev.target.value }))
                  }
                  className="border border-line px-2 py-1 md:col-span-2"
                  rows={2}
                  placeholder="Speech / voice notes"
                />
                <div className="flex gap-2 md:col-span-2">
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="bg-accent px-3 py-1.5 text-sm text-paper"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="border border-line px-3 py-1.5 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(e.id)}
                  onChange={() => toggleSelect(e.id)}
                />
                <div className="min-w-0 flex-1">
                  <span className="font-ui text-[10px] uppercase text-muted">{e.entry_type}</span>
                  <h3 className="font-display text-lg">{e.name}</h3>
                  {entryAliases(e).length > 0 && (
                    <p className="font-ui text-xs text-muted">
                      Also: {entryAliases(e).join(" · ")}
                    </p>
                  )}
                  <p className="text-sm text-muted">{e.summary}</p>
                  {e.speech_notes && (
                    <p className="mt-1 text-xs italic text-muted">Speech: {e.speech_notes}</p>
                  )}
                </div>
                <div className="font-ui flex shrink-0 flex-col gap-1 text-xs">
                  <button type="button" onClick={() => startEdit(e)} className="text-accent">
                    Edit
                  </button>
                  <button type="button" onClick={() => remove(e.id)} className="text-danger">
                    Delete
                  </button>
                </div>
              </div>
            )}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xl">Arc tracks</h3>
          {arcs.length > 0 && (
            <div className="font-ui flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5 text-muted">
                <input
                  type="checkbox"
                  checked={arcs.length > 0 && selectedArcs.size === arcs.length}
                  onChange={() => {
                    if (selectedArcs.size === arcs.length) setSelectedArcs(new Set());
                    else setSelectedArcs(new Set(arcs.map((a) => a.id)));
                  }}
                />
                Select all
              </label>
              <button
                type="button"
                disabled={!selectedArcs.size}
                onClick={async () => {
                  const ids = [...selectedArcs];
                  if (!confirm(`Delete ${ids.length} arc track${ids.length === 1 ? "" : "s"}?`)) {
                    return;
                  }
                  const res = await fetch(`/api/projects/${projectId}/arcs`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "delete", ids }),
                  });
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    alert(data.error || "Delete failed");
                    return;
                  }
                  onArcsChange(arcs.filter((a) => !selectedArcs.has(a.id)));
                  setSelectedArcs(new Set());
                }}
                className="border border-danger px-2 py-0.5 text-danger disabled:opacity-40"
              >
                Delete selected ({selectedArcs.size})
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (
                    !confirm(
                      `Delete ALL ${arcs.length} arc tracks? This cannot be undone.`
                    )
                  ) {
                    return;
                  }
                  const res = await fetch(`/api/projects/${projectId}/arcs`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "delete", deleteAll: true }),
                  });
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    alert(data.error || "Delete failed");
                    return;
                  }
                  onArcsChange([]);
                  setSelectedArcs(new Set());
                }}
                className="border border-line px-2 py-0.5 text-muted"
              >
                Delete all
              </button>
            </div>
          )}
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {arcs.length === 0 && <li className="text-muted">None yet — run Arcs AI.</li>}
          {arcs.map((a) => (
            <li key={a.id} className="flex gap-3 border border-line p-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={selectedArcs.has(a.id)}
                onChange={() => {
                  setSelectedArcs((prev) => {
                    const next = new Set(prev);
                    if (next.has(a.id)) next.delete(a.id);
                    else next.add(a.id);
                    return next;
                  });
                }}
              />
              <div className="min-w-0 flex-1">
                <span className="text-xs uppercase text-muted">{a.arc_type}</span>
                <div className="font-display">{a.subject}</div>
                <p className="text-muted">{a.notes}</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await fetch(`/api/arcs/${a.id}`, { method: "DELETE" });
                  onArcsChange(arcs.filter((x) => x.id !== a.id));
                  setSelectedArcs((prev) => {
                    const next = new Set(prev);
                    next.delete(a.id);
                    return next;
                  });
                }}
                className="font-ui shrink-0 text-xs text-danger"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
