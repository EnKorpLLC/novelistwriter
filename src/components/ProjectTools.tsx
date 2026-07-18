"use client";

import { useState } from "react";
import type { Chapter, Project } from "@/lib/types";
import { KDP_CHECKLIST } from "@/lib/export";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";
import { saveAs } from "file-saver";

function htmlToEditable(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function plainToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

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
  const [buildFormat, setBuildFormat] = useState<"docx" | "epub">("docx");
  const [includeIds, setIncludeIds] = useState<string[]>(() => chapters.map((c) => c.id));
  const [building, setBuilding] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(() =>
    coverPublicUrl(projectCoverPath(project))
  );
  const [coverBusy, setCoverBusy] = useState(false);

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

  async function saveMatter(
    id: string,
    patch: { enabled?: boolean; title?: string; content_html?: string }
  ) {
    setMatter((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    await fetch(`/api/matter/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function buildManuscript() {
    setBuilding(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: buildFormat,
          includeChapterIds: includeIds,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Build failed");
        return;
      }
      const blob = await res.blob();
      const ext = buildFormat === "docx" ? "docx" : "epub";
      saveAs(blob, `${title || "manuscript"}.${ext}`);
    } finally {
      setBuilding(false);
    }
  }

  async function validate() {
    const res = await fetch(`/api/projects/${project.id}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "validate", includeChapterIds: includeIds }),
    });
    const data = await res.json();
    setValidation(data.issues || (data.ok ? ["Looks good — no structural issues."] : []));
  }

  async function importFile(file: File, kind: string, replaceAll = false) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    if (replaceAll) fd.append("replaceAll", "1");
    const res = await fetch(`/api/projects/${project.id}/import`, { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) alert(data.error || "Import failed");
    else {
      const matterBits = [
        ...(data.frontMatter || []),
        ...(data.backMatter || []),
      ] as string[];
      const matterNote =
        matterBits.length > 0
          ? ` Matter updated: ${matterBits.join(", ")}.`
          : " No front/back matter headings found in the file (only Contents/chapters) — empty matter templates stay for you to fill.";
      alert(
        `Imported ${data.chapters || 0} chapters${data.title ? ` (“${data.title}”)` : ""}.${matterNote} Refreshing…`
      );
      window.location.reload();
    }
  }

  async function uploadCover(file: File) {
    setCoverBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/projects/${project.id}/cover`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Cover upload failed");
        return;
      }
      setCoverUrl(data.url || coverPublicUrl(data.path));
    } finally {
      setCoverBusy(false);
    }
  }

  async function removeCover() {
    if (!confirm("Remove this project’s cover image?")) return;
    setCoverBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/cover`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Could not remove cover");
        return;
      }
      setCoverUrl(null);
    } finally {
      setCoverBusy(false);
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
          <div className="flex flex-wrap items-start gap-4 border border-line p-3">
            <div className="relative h-28 w-20 shrink-0 overflow-hidden border border-line bg-paper-deep">
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl} alt="Cover" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-muted">
                  No cover
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              <p className="font-medium">Book cover</p>
              <p className="text-xs text-muted">
                Shows on the projects list and is embedded in DOCX/EPUB exports. JPG, PNG, or WebP
                under 5MB.
              </p>
              <label className="inline-block cursor-pointer border border-line px-3 py-1.5 text-xs hover:border-accent">
                {coverBusy ? "Working…" : coverUrl ? "Replace cover" : "Upload cover"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={coverBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void uploadCover(f);
                  }}
                />
              </label>
              {coverUrl && (
                <button
                  type="button"
                  disabled={coverBusy}
                  onClick={() => void removeCover()}
                  className="ml-2 border border-line px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
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
        <p className="mt-1 text-sm text-muted">
          Write your own copyright, dedication, about the author, etc. Toggle Include for export.
          New projects start with empty templates. DOCX import fills a section only when that
          heading exists in the file (e.g. Dedication, Copyright, About the Author).
        </p>
        <ul className="mt-3 space-y-4">
          {matter.map((m) => (
            <li key={m.id} className="font-ui border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <input
                  className="min-w-[12rem] flex-1 border border-line bg-paper px-2 py-1 text-sm"
                  value={m.title}
                  onChange={(e) =>
                    setMatter((prev) =>
                      prev.map((x) => (x.id === m.id ? { ...x, title: e.target.value } : x))
                    )
                  }
                  onBlur={(e) => void saveMatter(m.id, { title: e.target.value })}
                  placeholder="Section title"
                />
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    onChange={(e) => void saveMatter(m.id, { enabled: e.target.checked })}
                  />
                  Include in export
                </label>
              </div>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">
                {m.matter_type.replace(/_/g, " ")}
              </p>
              <textarea
                className="mt-2 w-full border border-line bg-paper px-3 py-2 text-sm"
                rows={5}
                value={htmlToEditable(m.content_html)}
                onChange={(e) =>
                  setMatter((prev) =>
                    prev.map((x) =>
                      x.id === m.id
                        ? { ...x, content_html: plainToHtml(e.target.value) }
                        : x
                    )
                  )
                }
                onBlur={(e) =>
                  void saveMatter(m.id, { content_html: plainToHtml(e.target.value) })
                }
                placeholder="Write this page’s text…"
              />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-display text-xl">Manuscript build</h3>
        <p className="mt-1 text-sm text-muted">
          Export like Novelist 2.0: DOCX with title, Contents, and “Chapter N: Title” sections.
          EPUB available for KDP ebook upload.
        </p>
        <div className="font-ui mt-4 grid gap-4 border border-line md:grid-cols-2">
          <div className="border-b border-line p-4 md:border-b-0 md:border-r">
            <p className="text-[10px] uppercase tracking-wide text-muted">Output format</p>
            <ul className="mt-2 space-y-1 text-sm">
              {(
                [
                  ["docx", "Microsoft Word (DOCX) — Novelist 2.0 style"],
                  ["epub", "EPUB — KDP ebook"],
                ] as const
              ).map(([id, label]) => (
                <li key={id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 hover:bg-paper-deep">
                    <input
                      type="radio"
                      name="buildFormat"
                      checked={buildFormat === id}
                      onChange={() => setBuildFormat(id)}
                      className="mt-1"
                    />
                    <span>{label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div className="p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">Include documents</p>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
              {chapters.map((c) => (
                <li key={c.id}>
                  <label className="flex items-center gap-2 px-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={includeIds.includes(c.id)}
                      onChange={(e) => {
                        setIncludeIds((prev) =>
                          e.target.checked
                            ? [...prev, c.id]
                            : prev.filter((id) => id !== c.id)
                        );
                      }}
                    />
                    {c.title}
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={building || !includeIds.length}
                onClick={buildManuscript}
                className="bg-accent px-4 py-2 text-paper disabled:opacity-50"
              >
                {building ? "Building…" : "Build"}
              </button>
              <button type="button" onClick={validate} className="border border-line px-4 py-2">
                Validate
              </button>
            </div>
            {validation.length > 0 && (
              <ul className="mt-2 text-xs text-muted">
                {validation.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section>
        <h3 className="font-display text-xl">Import project</h3>
        <p className="mt-1 text-sm text-muted">
          Import a Novelist 2.0 DOCX (title + Contents + “Chapter 1: …” headings). Front/back
          matter is imported when those headings are present; otherwise the empty templates stay
          for you to fill.
        </p>
        <div className="font-ui mt-3 space-y-3 text-sm">
          <label className="block border border-accent bg-paper p-3">
            <span className="font-medium text-accent">Novelist 2.0 / Word DOCX</span>
            <input
              type="file"
              accept=".docx"
              className="mt-2 block w-full"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const replace = confirm(
                  "Replace all chapters in this project with the imported ones?\n\nOK = replace\nCancel = append"
                );
                void importFile(f, "docx", replace);
              }}
            />
          </label>
          <label className="block">
            Fountain
            <input
              type="file"
              accept=".fountain,.txt"
              className="mt-1 block"
              onChange={(e) =>
                e.target.files?.[0] && importFile(e.target.files[0], "fountain")
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
