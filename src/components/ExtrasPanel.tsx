"use client";

import { useCallback, useEffect, useState } from "react";
import { EXTRA_ACCEPT, EXTRA_KINDS, EXTRA_MAX_BYTES, EXTRA_MAX_FILES, dollars, extraFileType, type BookExtra, type ExtraKind } from "@/lib/direct-sale-rules";

const toCents = (v: string) => (v.trim() ? Math.round(Number(v.replace(/[^0-9.]/g, "")) * 100) : null);
const mb = (b: number) => `${Math.max(0.1, b / 1024 / 1024).toFixed(1)} MB`;

/** Sell tab: character art, maps, and bonus writing, sold on their own or free with the ebook bought here. */
export function ExtrasPanel({ projectId }: { projectId: string }) {
  const [extras, setExtras] = useState<BookExtra[]>([]);
  const [storageReady, setStorageReady] = useState(true);
  const [hint, setHint] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", kind: "art" as ExtraKind, price: "", withEbook: true, rights: false });

  const load = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/extras`).catch(() => null);
    const d = r?.ok ? await r.json() : null;
    if (!d) return;
    setExtras(d.extras || []);
    setStorageReady(d.storageReady !== false);
    setHint(d.migrationNeeded ? d.error : null);
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const r = await fetch(`/api/projects/${projectId}/extras`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Something went wrong");
    return d as Record<string, unknown>;
  }

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
      await load();
    }
  }

  async function upload(extra: BookExtra, files: File[]) {
    await run("upload", async () => {
      for (const [i, f] of files.entries()) {
        if (!extraFileType(f.name)) throw new Error(`${f.name}: images, PDF, EPUB, MP3, or ZIP files only.`);
        if (f.size > EXTRA_MAX_BYTES) throw new Error(`${f.name} is over ${EXTRA_MAX_BYTES / 1024 / 1024} MB.`);
        setBusy(`Uploading ${i + 1} of ${files.length}: ${f.name}`);
        const up = await post({ action: "upload_url", extraId: extra.id, name: f.name });
        const put = await fetch(String(up.url), { method: "PUT", body: f, headers: { "Content-Type": String(up.contentType || "application/octet-stream") } });
        if (!put.ok) throw new Error(`${f.name} didn't upload (${put.status}). Try again.`);
        await post({ action: "uploaded", extraId: extra.id, name: f.name });
      }
    });
  }

  return (
    <div className="mt-5 border-t border-line pt-3">
      <p className="text-ink">Extras</p>
      <p className="text-xs text-muted">
        Character art, maps, a bonus chapter or short story. Sell them on their own, include them free with the ebook bought here (a reason to buy direct), or both.
        Readers download the files to keep.
      </p>
      {hint && <p className="mt-1 text-xs text-danger">{hint}</p>}
      {!hint && !storageReady && <p className="mt-1 text-xs text-danger">File storage isn&apos;t set up yet, so extras can&apos;t be uploaded.</p>}

      {extras.length > 0 && (
        <ul className="mt-3 space-y-3 text-xs">
          {extras.map((e) => (
            <li key={e.id} className="border border-line p-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <strong className={e.active ? "" : "text-muted line-through"}>{e.title}</strong>
                <span className="text-muted">
                  {e.priceCents != null ? dollars(e.priceCents) : "Not sold on its own"}
                  {e.withEbook ? " · free with the ebook" : ""}
                  {!e.files.length ? " · add a file to show it" : ""}
                </span>
                <button type="button" className="text-muted underline" disabled={Boolean(busy)} onClick={() => void run("toggle", () => post({ action: "update", extraId: e.id, active: !e.active }))}>
                  {e.active ? "Turn off" : "Turn on"}
                </button>
                <button
                  type="button"
                  className="text-muted underline"
                  disabled={Boolean(busy)}
                  onClick={() => void run("with", () => post({ action: "update", extraId: e.id, withEbook: !e.withEbook }))}
                >
                  {e.withEbook ? "Stop including with the ebook" : "Include free with the ebook"}
                </button>
                <button
                  type="button"
                  className="text-danger underline"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    if (!window.confirm(`Delete "${e.title}"? If readers already have it, it's turned off instead and they keep it.`)) return;
                    void run("delete", async () => {
                      const d = await post({ action: "delete", extraId: e.id });
                      if (d.note) setMsg(String(d.note));
                    });
                  }}
                >
                  Delete
                </button>
              </div>
              {e.description && <p className="mt-1 text-muted">{e.description}</p>}
              <ul className="mt-1 space-y-0.5">
                {e.files.map((f) => (
                  <li key={f.name} className="flex flex-wrap items-center gap-2">
                    <span>{f.name}</span>
                    <span className="text-muted">{mb(f.bytes)}</span>
                    <button type="button" className="text-danger underline" disabled={Boolean(busy)} onClick={() => void run("remove", () => post({ action: "remove_file", extraId: e.id, name: f.name }))}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              {storageReady && e.files.length < EXTRA_MAX_FILES && (
                <label className="mt-1 inline-block cursor-pointer text-accent underline">
                  Add files
                  <input
                    type="file"
                    multiple
                    accept={EXTRA_ACCEPT}
                    className="hidden"
                    disabled={Boolean(busy)}
                    onChange={(ev) => {
                      const files = [...(ev.target.files || [])].slice(0, EXTRA_MAX_FILES - e.files.length);
                      ev.target.value = "";
                      if (files.length) void upload(e, files);
                    }}
                  />
                </label>
              )}
            </li>
          ))}
        </ul>
      )}

      {!hint && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-accent">Add an extra</summary>
          <form
            className="mt-2 space-y-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              void run("create", async () => {
                await post({
                  action: "create",
                  title: form.title,
                  description: form.description,
                  kind: form.kind,
                  priceCents: toCents(form.price),
                  withEbook: form.withEbook,
                  rights: form.rights,
                });
                setForm({ title: "", description: "", kind: "art", price: "", withEbook: true, rights: false });
                setMsg("Added. Now add its files.");
              });
            }}
          >
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Map of the Ember Coast" className="block w-full max-w-sm border border-line bg-paper px-2 py-1" />
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What readers get (optional)"
              rows={2}
              className="block w-full max-w-sm border border-line bg-paper px-2 py-1"
            />
            <div className="flex flex-wrap items-center gap-3">
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ExtraKind })} className="border border-line bg-paper px-1 py-1">
                {EXTRA_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
              <label>
                Price on its own{" "}
                <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} inputMode="decimal" placeholder="Not sold alone" className="w-28 border border-line bg-paper px-2 py-1" />
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={form.withEbook} onChange={(e) => setForm({ ...form, withEbook: e.target.checked })} /> Free with the ebook bought here
              </label>
            </div>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={form.rights} onChange={(e) => setForm({ ...form, rights: e.target.checked })} />
              <span>
                I made this, or I have the right to sell it. <span className="text-muted">Art someone else made for your book often only covers using it in and around the book; selling it needs their permission.</span>
              </span>
            </label>
            <button type="submit" disabled={Boolean(busy) || !form.title.trim() || !form.rights} className="bg-accent px-3 py-1.5 text-paper disabled:opacity-50">
              Add extra
            </button>
          </form>
        </details>
      )}
      {busy && busy.startsWith("Uploading") && <p className="mt-1 text-xs text-muted">{busy}</p>}
      {msg && <p className={`mt-1 text-xs ${/^(Added|Readers already)/.test(msg) ? "text-accent" : "text-danger"}`}>{msg}</p>}
    </div>
  );
}
