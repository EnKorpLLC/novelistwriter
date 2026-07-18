"use client";

import { useState } from "react";
import type { BibleEntry } from "@/lib/types";

type Props = {
  projectId: string;
  entries: BibleEntry[];
  onChange: (entries: BibleEntry[]) => void;
  promises: { id: string; description: string; status: string }[];
  arcs: { id: string; arc_type: string; subject: string; notes: string }[];
};

const TYPES: BibleEntry["entry_type"][] = [
  "character",
  "place",
  "note",
  "lore",
  "rule",
  "timeline",
];

export function BiblePanel({ projectId, entries, onChange, promises, arcs }: Props) {
  const [type, setType] = useState<BibleEntry["entry_type"]>("character");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [speech, setSpeech] = useState("");

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

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-6 py-8">
      <h2 className="font-display text-2xl">Story bible</h2>
      <p className="mt-1 text-sm text-muted">
        Characters, places, lore — used by lore lock and dialogue fingerprint.
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
