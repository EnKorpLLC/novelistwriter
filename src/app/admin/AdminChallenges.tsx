"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  slug: string;
  title: string;
  description: string;
  goal_words: number;
  starts_on: string;
  ends_on: string;
  status: "upcoming" | "active" | "ended";
  participants: number;
  finished: number;
};

const EMPTY = { title: "", description: "", goal_words: 50000, starts_on: "", ends_on: "" };

export function AdminChallenges({ onNote }: { onNote: (n: string | null) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [groups, setGroups] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/challenges");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      onNote(json.error || "Could not load challenges");
      return;
    }
    setRows(json.challenges);
    setGroups(json.groupChallenges);
  }, [onNote]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onNote(null);
    try {
      const res = await fetch("/api/admin/challenges", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing, ...form } : form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not save");
      onNote(editing ? "Challenge updated." : "Challenge created. It's listed on /challenges now.");
      setForm(EMPTY);
      setEditing(null);
      await load();
    } catch (err) {
      onNote(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: Row) {
    if (!window.confirm(`Delete "${r.title}" and its ${r.participants} participant records? Writing isn't affected.`)) return;
    await fetch(`/api/admin/challenges?id=${r.id}`, { method: "DELETE" });
    await load();
  }

  const input = "mt-1 block w-full border border-line bg-paper px-3 py-2 text-sm text-ink";

  return (
    <section className="mt-6 space-y-8">
      <form onSubmit={(e) => void save(e)} className="max-w-2xl space-y-3 border border-line p-4">
        <h2 className="font-display text-xl">{editing ? "Edit challenge" : "New platform challenge"}</h2>
        <p className="text-xs text-muted">
          Pick any dates. Writers count days in their own time zone. Changing the dates recomputes everyone&apos;s numbers.
        </p>
        <label className="block text-xs text-muted">
          Name
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Write 50k in January" className={input} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs text-muted">
            Starts
            <input type="date" required value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} className={input} />
          </label>
          <label className="block text-xs text-muted">
            Ends
            <input type="date" required value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} className={input} />
          </label>
          <label className="block text-xs text-muted">
            Word goal
            <input type="number" min={100} step={100} required value={form.goal_words} onChange={(e) => setForm({ ...form, goal_words: Number(e.target.value) })} className={input} />
          </label>
        </div>
        <label className="block text-xs text-muted">
          Description
          <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={input} />
        </label>
        <div className="flex gap-3">
          <button type="submit" disabled={busy} className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50">
            {busy ? "Saving…" : editing ? "Save changes" : "Create challenge"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setForm(EMPTY);
              }}
              className="text-sm text-muted underline"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div>
        <h2 className="font-display text-xl">Platform challenges</h2>
        <p className="mt-1 text-xs text-muted">Plus {groups} group challenge{groups === 1 ? "" : "s"} started by writers.</p>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">None yet.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1">Challenge</th>
                <th>Dates</th>
                <th>Goal</th>
                <th>Writers</th>
                <th>Winners</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-2">
                    <Link href={`/challenges/${r.slug}`} className="text-ink hover:text-accent">
                      {r.title}
                    </Link>
                    <span className="ml-2 text-xs text-muted">{r.status}</span>
                  </td>
                  <td className="text-xs text-muted">
                    {r.starts_on} → {r.ends_on}
                  </td>
                  <td>{r.goal_words.toLocaleString()}</td>
                  <td>{r.participants}</td>
                  <td>{r.finished}</td>
                  <td className="space-x-3 text-right text-xs">
                    <button
                      type="button"
                      className="text-accent underline"
                      onClick={() => {
                        setEditing(r.id);
                        setForm({ title: r.title, description: r.description, goal_words: r.goal_words, starts_on: r.starts_on, ends_on: r.ends_on });
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" className="text-danger underline" onClick={() => void remove(r)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
