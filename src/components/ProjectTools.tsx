"use client";

import { useState } from "react";
import type { Chapter, Project } from "@/lib/types";
import { KDP_CHECKLIST } from "@/lib/export";
import { saveAs } from "file-saver";

type Matter = {
  id: string;
  matter_type: string;
  title: string;
  content_html: string;
  enabled: boolean;
  sort_order: number;
};

type Props = {
  project: Project;
  chapters: Chapter[];
  matter: Matter[];
};

export function ProjectTools({ project, chapters, matter: initialMatter }: Props) {
  const [matter, setMatter] = useState(initialMatter);
  const [title, setTitle] = useState(project.title);
  const [blurb, setBlurb] = useState(project.blurb || "");
  const [trim, setTrim] = useState(project.kdp_settings?.trim || "6x9");
  const [font, setFont] = useState(project.kdp_settings?.font || "Garamond");
  const [margins, setMargins] = useState(project.kdp_settings?.margins || "standard");
  const [categories, setCategories] = useState(
    String((project.metadata as { categories?: string })?.categories || "")
  );
  const [keywords, setKeywords] = useState(
    String((project.metadata as { keywords?: string })?.keywords || "")
  );
  const [validation, setValidation] = useState<string[]>([]);
  const [versions, setVersions] = useState<
    { id: string; label: string; created_at: string; word_count: number }[]
  >([]);
  const [betaEmail, setBetaEmail] = useState("");
  const [seriesTitle, setSeriesTitle] = useState("");
  const [byokNote, setByokNote] = useState("");

  async function saveMeta() {
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        blurb,
        kdp_settings: { trim, font, margins },
        metadata: { categories, keywords },
      }),
    });
  }

  async function toggleMatter(id: string, enabled: boolean) {
    setMatter((prev) => prev.map((m) => (m.id === id ? { ...m, enabled } : m)));
    await fetch(`/api/matter/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  }

  async function exportFile(format: "docx" | "epub") {
    const res = await fetch(`/api/projects/${project.id}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Export failed");
      return;
    }
    const blob = await res.blob();
    saveAs(blob, `${title || "manuscript"}.${format}`);
  }

  async function validate() {
    const res = await fetch(`/api/projects/${project.id}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "validate" }),
    });
    const data = await res.json();
    setValidation(data.issues || []);
  }

  async function importDocx(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/projects/${project.id}/import`, { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) alert(data.error || "Import failed");
    else {
      alert(`Imported ${data.chapters || 0} chapters. Refreshing…`);
      window.location.reload();
    }
  }

  async function importScrivenerFountain(file: File, kind: "scrivener" | "fountain") {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    const res = await fetch(`/api/projects/${project.id}/import`, { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) alert(data.error || "Import failed");
    else {
      alert("Import complete. Refreshing…");
      window.location.reload();
    }
  }

  async function snapshot() {
    const res = await fetch(`/api/projects/${project.id}/versions`, { method: "POST" });
    const data = await res.json();
    if (res.ok) alert(`Snapshot saved (${data.count} chapters).`);
  }

  async function loadVersions() {
    const res = await fetch(`/api/projects/${project.id}/versions`);
    const data = await res.json();
    setVersions(data.versions || []);
  }

  async function inviteBeta() {
    const res = await fetch(`/api/projects/${project.id}/beta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: betaEmail }),
    });
    const data = await res.json();
    if (!res.ok) alert(data.error || "Invite failed");
    else {
      alert(`Invite created. Share link: ${data.link}`);
      setBetaEmail("");
    }
  }

  async function createSeries() {
    const res = await fetch("/api/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: seriesTitle, projectId: project.id }),
    });
    if (res.ok) alert("Series created and project linked.");
    else {
      const data = await res.json();
      alert(data.error || "Failed");
    }
  }

  async function saveByok(keys: { anthropic?: string; openai?: string }) {
    const res = await fetch("/api/profile/byok", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(keys),
    });
    if (res.ok) setByokNote("BYOK keys saved (Studio feature).");
    else setByokNote("Failed to save keys.");
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-10 overflow-y-auto px-6 py-8">
      <section>
        <h2 className="font-display text-2xl">Project & KDP</h2>
        <div className="font-ui mt-4 grid gap-3">
          <input
            className="border border-line px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
          />
          <textarea
            className="border border-line px-3 py-2"
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            placeholder="Blurb (critique only — we won't write it for you)"
            rows={4}
          />
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs">
              Trim
              <select
                className="mt-1 w-full border border-line px-2 py-1"
                value={trim}
                onChange={(e) => setTrim(e.target.value)}
              >
                <option value="5x8">5×8</option>
                <option value="6x9">6×9</option>
                <option value="5.5x8.5">5.5×8.5</option>
              </select>
            </label>
            <label className="text-xs">
              Font
              <select
                className="mt-1 w-full border border-line px-2 py-1"
                value={font}
                onChange={(e) => setFont(e.target.value)}
              >
                <option>Garamond</option>
                <option>Times New Roman</option>
                <option>Palatino</option>
              </select>
            </label>
            <label className="text-xs">
              Margins
              <select
                className="mt-1 w-full border border-line px-2 py-1"
                value={margins}
                onChange={(e) => setMargins(e.target.value)}
              >
                <option value="standard">Standard</option>
                <option value="wide">Wide</option>
              </select>
            </label>
          </div>
          <input
            className="border border-line px-3 py-2"
            value={categories}
            onChange={(e) => setCategories(e.target.value)}
            placeholder="BISAC categories"
          />
          <input
            className="border border-line px-3 py-2"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Keywords (up to 7)"
          />
          <button type="button" onClick={saveMeta} className="bg-accent px-4 py-2 text-paper">
            Save metadata
          </button>
        </div>
      </section>

      <section>
        <h3 className="font-display text-xl">KDP checklist</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {KDP_CHECKLIST.map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              <span className="text-accent">○</span>
              {item.label}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-display text-xl">Front / back matter</h3>
        <ul className="mt-3 space-y-2">
          {matter.map((m) => (
            <li key={m.id} className="font-ui flex items-center justify-between border border-line px-3 py-2 text-sm">
              <span>
                {m.title || m.matter_type}
              </span>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={m.enabled}
                  onChange={(e) => toggleMatter(m.id, e.target.checked)}
                />
                Include
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-display text-xl">Export</h3>
        <div className="font-ui mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => exportFile("docx")} className="border border-line px-4 py-2">
            Export DOCX
          </button>
          <button type="button" onClick={() => exportFile("epub")} className="border border-line px-4 py-2">
            Export EPUB
          </button>
          <button type="button" onClick={validate} className="border border-line px-4 py-2">
            Validate EPUB structure
          </button>
        </div>
        {validation.length > 0 && (
          <ul className="mt-2 text-sm text-danger">
            {validation.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        )}
        {validation.length === 0 && (
          <p className="mt-2 text-xs text-muted">Run validate after drafting chapters.</p>
        )}
      </section>

      <section>
        <h3 className="font-display text-xl">Import</h3>
        <div className="font-ui mt-3 space-y-2 text-sm">
          <label className="block">
            DOCX
            <input
              type="file"
              accept=".docx"
              className="mt-1 block"
              onChange={(e) => e.target.files?.[0] && importDocx(e.target.files[0])}
            />
          </label>
          <label className="block">
            Fountain
            <input
              type="file"
              accept=".fountain,.txt"
              className="mt-1 block"
              onChange={(e) =>
                e.target.files?.[0] && importScrivenerFountain(e.target.files[0], "fountain")
              }
            />
          </label>
          <label className="block">
            Scrivener (ZIP / RTF text export)
            <input
              type="file"
              accept=".zip,.rtf,.txt"
              className="mt-1 block"
              onChange={(e) =>
                e.target.files?.[0] && importScrivenerFountain(e.target.files[0], "scrivener")
              }
            />
          </label>
        </div>
      </section>

      <section>
        <h3 className="font-display text-xl">Version history</h3>
        <div className="font-ui mt-3 flex gap-2">
          <button type="button" onClick={snapshot} className="border border-line px-3 py-2 text-sm">
            Snapshot all chapters
          </button>
          <button type="button" onClick={loadVersions} className="border border-line px-3 py-2 text-sm">
            Load versions
          </button>
        </div>
        <ul className="mt-3 space-y-1 text-sm text-muted">
          {versions.map((v) => (
            <li key={v.id}>
              {v.label || "Snapshot"} · {v.word_count} words ·{" "}
              {new Date(v.created_at).toLocaleString()}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Compare: open two snapshots from chapter versions after AI review to see what changed.
        </p>
      </section>

      <section>
        <h3 className="font-display text-xl">Series bible</h3>
        <div className="font-ui mt-3 flex gap-2">
          <input
            className="flex-1 border border-line px-3 py-2"
            placeholder="Series title"
            value={seriesTitle}
            onChange={(e) => setSeriesTitle(e.target.value)}
          />
          <button type="button" onClick={createSeries} className="bg-accent px-4 py-2 text-paper">
            Link series
          </button>
        </div>
      </section>

      <section>
        <h3 className="font-display text-xl">Beta readers</h3>
        <div className="font-ui mt-3 flex gap-2">
          <input
            className="flex-1 border border-line px-3 py-2"
            placeholder="reader@email.com"
            value={betaEmail}
            onChange={(e) => setBetaEmail(e.target.value)}
          />
          <button type="button" onClick={inviteBeta} className="border border-line px-4 py-2">
            Invite
          </button>
        </div>
      </section>

      <section>
        <h3 className="font-display text-xl">BYOK / local models</h3>
        <p className="mt-1 text-sm text-muted">
          Studio users can bring Anthropic or OpenAI keys. Requests use your key when set.
        </p>
        <div className="font-ui mt-3 grid gap-2">
          <input
            type="password"
            placeholder="Anthropic API key"
            id="byok-anthropic"
            className="border border-line px-3 py-2"
          />
          <input
            type="password"
            placeholder="OpenAI API key"
            id="byok-openai"
            className="border border-line px-3 py-2"
          />
          <button
            type="button"
            className="border border-line px-4 py-2"
            onClick={() => {
              const a = (document.getElementById("byok-anthropic") as HTMLInputElement)?.value;
              const o = (document.getElementById("byok-openai") as HTMLInputElement)?.value;
              void saveByok({ anthropic: a, openai: o });
            }}
          >
            Save BYOK keys
          </button>
          {byokNote && <p className="text-xs text-accent">{byokNote}</p>}
        </div>
      </section>

      <p className="text-xs text-muted">
        {chapters.length} chapters ·{" "}
        {chapters.reduce((s, c) => s + (c.word_count || 0), 0)} total words
      </p>
    </div>
  );
}
