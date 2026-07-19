"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ManuscriptEditor } from "@/components/ManuscriptEditor";
import { CritiquePanel } from "@/components/CritiquePanel";
import { BiblePanel } from "@/components/BiblePanel";
import { ProjectTools } from "@/components/ProjectTools";
import type { BibleEntry, Chapter, Project } from "@/lib/types";

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
  bible: BibleEntry[];
  matter: Matter[];
  challengeLevel: number;
  promises: { id: string; description: string; status: string }[];
  arcs: { id: string; arc_type: string; subject: string; notes: string }[];
  initialCredits: number;
};

export function ProjectWorkspace({
  project,
  chapters: initialChapters,
  bible: initialBible,
  matter,
  challengeLevel: initialChallenge,
  promises,
  arcs: initialArcs,
  initialCredits,
}: Props) {
  const [chapters, setChapters] = useState(initialChapters);
  const [bible, setBible] = useState(initialBible);
  const [arcs, setArcs] = useState(initialArcs);
  const [projectTitle, setProjectTitle] = useState(project.title);
  const [activeId, setActiveId] = useState(chapters[0]?.id || "");
  const [tab, setTab] = useState<"write" | "bible" | "tools">("write");
  const [focusMode, setFocusMode] = useState(false);
  const [selectionText, setSelectionText] = useState("");
  const [challengeLevel, setChallengeLevel] = useState(initialChallenge);
  const [saveState, setSaveState] = useState("Saved");
  const [credits, setCredits] = useState(initialCredits);

  const active = useMemo(
    () => chapters.find((c) => c.id === activeId) || chapters[0],
    [chapters, activeId]
  );

  const onSave = useCallback(
    async (payload: { html: string; text: string; wordCount: number }) => {
      if (!active) return false;
      setSaveState("Saving…");
      const res = await fetch(`/api/chapters/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_html: payload.html,
          content_text: payload.text,
          word_count: payload.wordCount,
        }),
      });
      if (res.ok) {
        const now = new Date().toISOString();
        setChapters((prev) =>
          prev.map((c) =>
            c.id === active.id
              ? {
                  ...c,
                  content_html: payload.html,
                  content_text: payload.text,
                  word_count: payload.wordCount,
                  updated_at: now,
                }
              : c
          )
        );
        setSaveState("Saved");
        return true;
      }
      setSaveState("Save failed");
      return false;
    },
    [active]
  );

  async function addChapter() {
    const res = await fetch(`/api/projects/${project.id}/chapters`, { method: "POST" });
    const data = await res.json();
    if (res.ok && data.chapter) {
      setChapters((prev) => [...prev, data.chapter]);
      setActiveId(data.chapter.id);
    }
  }

  async function updateChapterMeta(fields: Partial<Chapter>) {
    if (!active) return;
    const res = await fetch(`/api/chapters/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      setChapters((prev) =>
        prev.map((c) => (c.id === active.id ? { ...c, ...fields } : c))
      );
    }
  }

  async function deleteChapter() {
    if (!active) return;
    if (chapters.length <= 1) {
      alert("Cannot delete the only chapter. Add another first.");
      return;
    }
    if (!confirm(`Delete “${active.title}”? This cannot be undone.`)) return;
    const res = await fetch(`/api/chapters/${active.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || "Delete failed");
      return;
    }
    const next = chapters.filter((c) => c.id !== active.id);
    setChapters(next);
    setActiveId(next[0]?.id || "");
  }

  async function reorder(dir: -1 | 1) {
    if (!active) return;
    const idx = chapters.findIndex((c) => c.id === active.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= chapters.length) return;
    const next = [...chapters];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    const withOrder = next.map((c, i) => ({ ...c, sort_order: i }));
    setChapters(withOrder);
    await fetch(`/api/projects/${project.id}/chapters/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: withOrder.map((c) => c.id) }),
    });
  }

  async function saveProjectTitle() {
    const title = projectTitle.trim() || "Untitled Novel";
    if (title === project.title) return;
    setProjectTitle(title);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) setSaveState("Title save failed");
  }

  return (
    <div className={`flex h-dvh max-h-dvh flex-col overflow-hidden ${focusMode ? "focus-mode" : ""}`}>
      {!focusMode && (
        <header className="font-ui flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Link href="/dashboard" className="shrink-0 text-muted hover:text-ink">
              ←
            </Link>
            <div className="min-w-0 flex-1">
              <input
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                onBlur={() => void saveProjectTitle()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                className="font-display w-full max-w-xl border-b border-transparent bg-transparent text-lg text-ink outline-none hover:border-line focus:border-accent"
                aria-label="Project title"
                placeholder="Untitled Novel"
              />
              <p className="text-[11px] text-muted">{saveState}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href="/billing"
              className="border border-line px-3 py-1 text-muted hover:border-accent hover:text-ink"
              title="Buy credits or manage billing"
            >
              Credits: <strong className="text-ink">{credits}</strong>
            </Link>
            {(["write", "bible", "tools"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-1 capitalize ${tab === t ? "bg-accent text-paper" : "text-muted hover:text-ink"}`}
              >
                {t}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFocusMode(true)}
              className="border border-line px-3 py-1 text-muted hover:text-ink"
            >
              Focus
            </button>
          </div>
        </header>
      )}

      {focusMode && (
        <button
          type="button"
          onClick={() => setFocusMode(false)}
          className="font-ui fixed right-4 top-4 z-50 rounded-sm bg-ink px-3 py-2 text-xs text-paper shadow-md"
        >
          Exit focus
        </button>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {tab === "write" && (
          <>
            {!focusMode && (
            <nav className="w-52 shrink-0 overflow-y-auto border-r border-line bg-paper-deep/30 p-2">
              <p className="font-ui px-2 text-[10px] uppercase tracking-wide text-muted">Chapters</p>
              <ul className="mt-2 space-y-1">
                {chapters.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(c.id)}
                      className={`w-full truncate px-2 py-1.5 text-left text-sm ${
                        c.id === active?.id ? "bg-accent/15 text-ink" : "text-muted hover:bg-paper"
                      }`}
                    >
                      {c.title}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={addChapter}
                className="font-ui mt-3 w-full px-2 py-1 text-left text-xs text-accent"
              >
                + Chapter
              </button>
              <button
                type="button"
                onClick={deleteChapter}
                className="font-ui w-full px-2 py-1 text-left text-xs text-danger"
              >
                Delete chapter
              </button>
              <div className="mt-2 flex gap-1 px-2">
                <button type="button" className="text-xs text-muted" onClick={() => reorder(-1)}>
                  ↑
                </button>
                <button type="button" className="text-xs text-muted" onClick={() => reorder(1)}>
                  ↓
                </button>
              </div>
            </nav>
            )}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {active && (
                <>
                  {!focusMode && (
                  <div className="grid gap-2 border-b border-line p-3 md:grid-cols-3">
                    <input
                      className="border border-line bg-paper px-2 py-1 text-sm"
                      value={active.title}
                      onChange={(e) =>
                        setChapters((prev) =>
                          prev.map((c) =>
                            c.id === active.id ? { ...c, title: e.target.value } : c
                          )
                        )
                      }
                      onBlur={(e) => updateChapterMeta({ title: e.target.value })}
                    />
                    <input
                      placeholder="Scene goal"
                      className="border border-line bg-paper px-2 py-1 text-sm"
                      value={active.goal || ""}
                      onChange={(e) =>
                        setChapters((prev) =>
                          prev.map((c) =>
                            c.id === active.id ? { ...c, goal: e.target.value } : c
                          )
                        )
                      }
                      onBlur={(e) => updateChapterMeta({ goal: e.target.value })}
                    />
                    <input
                      placeholder="Conflict"
                      className="border border-line bg-paper px-2 py-1 text-sm"
                      value={active.conflict || ""}
                      onChange={(e) =>
                        setChapters((prev) =>
                          prev.map((c) =>
                            c.id === active.id ? { ...c, conflict: e.target.value } : c
                          )
                        )
                      }
                      onBlur={(e) => updateChapterMeta({ conflict: e.target.value })}
                    />
                    <input
                      placeholder="Outcome"
                      className="border border-line bg-paper px-2 py-1 text-sm"
                      value={active.outcome || ""}
                      onChange={(e) =>
                        setChapters((prev) =>
                          prev.map((c) =>
                            c.id === active.id ? { ...c, outcome: e.target.value } : c
                          )
                        )
                      }
                      onBlur={(e) => updateChapterMeta({ outcome: e.target.value })}
                    />
                    <input
                      placeholder="POV"
                      className="border border-line bg-paper px-2 py-1 text-sm"
                      value={active.pov || ""}
                      onChange={(e) =>
                        setChapters((prev) =>
                          prev.map((c) =>
                            c.id === active.id ? { ...c, pov: e.target.value } : c
                          )
                        )
                      }
                      onBlur={(e) => updateChapterMeta({ pov: e.target.value })}
                    />
                    <input
                      placeholder="Timeline"
                      className="border border-line bg-paper px-2 py-1 text-sm"
                      value={active.timeline_position || ""}
                      onChange={(e) =>
                        setChapters((prev) =>
                          prev.map((c) =>
                            c.id === active.id
                              ? { ...c, timeline_position: e.target.value }
                              : c
                          )
                        )
                      }
                      onBlur={(e) => updateChapterMeta({ timeline_position: e.target.value })}
                    />
                  </div>
                  )}
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <ManuscriptEditor
                      key={active.id}
                      chapterId={active.id}
                      initialHtml={active.content_html}
                      serverUpdatedAt={active.updated_at}
                      onSave={onSave}
                      onSelectionText={setSelectionText}
                      focusMode={focusMode}
                    />
                  </div>
                </>
              )}
            </div>

            {!focusMode && (
            <div className="hidden w-[360px] shrink-0 lg:block">
              <CritiquePanel
                projectId={project.id}
                chapterId={active?.id}
                chapterCount={chapters.length}
                selectionText={selectionText}
                challengeLevel={challengeLevel}
                onChallengeChange={setChallengeLevel}
                onCreditsChange={setCredits}
              />
            </div>
            )}
          </>
        )}

        {tab === "bible" && (
          <BiblePanel
            projectId={project.id}
            chapterCount={chapters.length}
            entries={bible}
            onChange={setBible}
            promises={promises}
            arcs={arcs}
            onArcsChange={setArcs}
            onCreditsChange={setCredits}
          />
        )}

        {tab === "tools" && (
          <ProjectTools project={project} chapters={chapters} matter={matter} />
        )}
      </div>
    </div>
  );
}
