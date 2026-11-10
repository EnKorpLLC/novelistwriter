"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Chapter } from "@/lib/types";
import { SERIAL_PLATFORMS, exportSerialChapter, serialPlatform } from "@/lib/serial-export";
import { WEEKDAYS, normalizeSerialSettings, type SerialSettings } from "@/lib/serial-settings";

type Post = { chapterId: string; platform: string; url: string; postedOn: string };

/** Post the book as a serial anywhere: paste-ready chapters (free), plus a posting log and release-day reminders (Pro). */
export function SerialPanel({ projectId, chapters }: { projectId: string; chapters: Chapter[] }) {
  const [pro, setPro] = useState(false);
  const [settings, setSettings] = useState<SerialSettings>(normalizeSerialSettings(null));
  const [posts, setPosts] = useState<Post[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [platformId, setPlatformId] = useState("royalroad");
  const [copied, setCopied] = useState<string | null>(null);
  const [logging, setLogging] = useState<{ chapterId: string; url: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/serial`).catch(() => null);
    if (!res?.ok) return;
    const d = await res.json();
    setPro(Boolean(d.pro));
    // Free plans keep the author's note in this browser; Pro saves it with the schedule
    const localNote = d.pro ? "" : window.localStorage.getItem(`serial-note:${projectId}`) || "";
    setSettings({ ...d.settings, noteAfter: d.settings?.noteAfter || localNote });
    setPosts(d.posts || []);
    setHint(d.migrationNeeded ? d.error : null);
    if (d.settings?.platforms?.[0]) setPlatformId((p) => (p === "royalroad" ? d.settings.platforms[0] : p));
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  const platform = serialPlatform(platformId) || SERIAL_PLATFORMS[0];
  const ordered = useMemo(() => [...chapters].sort((a, b) => a.sort_order - b.sort_order).filter((c) => c.word_count > 0 || c.content_text?.trim()), [chapters]);
  const postedOn = (chapterId: string, pid = platform.id) => posts.find((p) => p.chapterId === chapterId && p.platform === pid);

  async function post(body: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${projectId}/serial`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNote(json.error || "Could not save");
      return false;
    }
    setNote(null);
    return true;
  }

  async function copyChapter(c: Chapter) {
    const out = exportSerialChapter(c, platform, settings.noteAfter);
    try {
      if (platform.format === "rich" && out.html && typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ "text/html": new Blob([out.html], { type: "text/html" }), "text/plain": new Blob([out.text], { type: "text/plain" }) }),
        ]);
      } else {
        await navigator.clipboard.writeText(platform.format === "html" ? out.html || out.text : out.text);
      }
      setCopied(`${c.id}:body`);
    } catch {
      setNote("Your browser blocked copying. Try again, or use a different browser.");
    }
  }

  async function copyTitle(c: Chapter) {
    await navigator.clipboard.writeText(c.title || "").catch(() => null);
    setCopied(`${c.id}:title`);
  }

  const buffer = (pid: string) => ordered.filter((c) => !postedOn(c.id, pid)).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="font-ui mx-auto max-w-3xl space-y-8">
          <div>
            <h2 className="font-display text-2xl">Serial</h2>
            <p className="mt-1 text-sm text-muted">
              Posting this book chapter by chapter on Royal Road, Wattpad, Substack, or elsewhere? Copy each chapter ready to paste, with italics,
              bold, and scene breaks kept. We never post anything for you, and you can post the same story on as many sites as you like. When the
              serial is done, the same chapters become a finished ebook and paperback in{" "}
              <a href={`/project/${projectId}?tab=format`} className="text-accent underline">
                Format
              </a>
              .
            </p>
          </div>

          {note && <p className="text-sm text-danger">{note}</p>}
          {hint && <p className="text-sm text-danger">{hint}</p>}

          <section className="border border-line p-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                Posting to
                <select value={platform.id} onChange={(e) => setPlatformId(e.target.value)} className="border border-line bg-paper px-2 py-1.5">
                  {SERIAL_PLATFORMS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              {pro && settings.platforms.includes(platform.id) && (
                <span className="text-xs text-muted">
                  {buffer(platform.id)} chapter{buffer(platform.id) === 1 ? "" : "s"} written ahead here
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">{platform.howTo}</p>
            <label className="mt-3 block text-sm">
              Author&apos;s note at the end of every chapter (optional)
              <textarea
                value={settings.noteAfter}
                onChange={(e) => {
                  setSettings((s) => ({ ...s, noteAfter: e.target.value }));
                  if (!pro) window.localStorage.setItem(`serial-note:${projectId}`, e.target.value);
                }}
                onBlur={() => pro && void post({ action: "settings", settings })}
                rows={2}
                placeholder="Thanks for reading! New chapters every Tuesday and Friday."
                className="mt-1 w-full border border-line bg-paper px-2 py-1.5 text-sm"
              />
            </label>

            {ordered.length === 0 ? (
              <p className="mt-4 text-sm text-muted">Write a chapter first, and it shows up here ready to copy.</p>
            ) : (
              <ol className="mt-4 divide-y divide-line border-y border-line">
                {ordered.map((c, i) => {
                  const done = postedOn(c.id);
                  return (
                    <li key={c.id} className="py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="w-6 text-xs text-muted">{i + 1}.</span>
                        <span className="min-w-0 flex-1 truncate">{c.title || "Untitled chapter"}</span>
                        <span className="text-xs text-muted">{c.word_count.toLocaleString()} words</span>
                        <button type="button" className="text-xs text-accent underline" onClick={() => void copyTitle(c)}>
                          {copied === `${c.id}:title` ? "Title copied" : "Copy title"}
                        </button>
                        <button type="button" className="border border-accent px-2 py-1 text-xs text-accent" onClick={() => void copyChapter(c)}>
                          {copied === `${c.id}:body` ? "Copied" : "Copy chapter"}
                        </button>
                        {pro &&
                          (done ? (
                            <span className="text-xs">
                              {done.url ? (
                                <a href={done.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                                  ✓ Posted {done.postedOn}
                                </a>
                              ) : (
                                <>✓ Posted {done.postedOn}</>
                              )}{" "}
                              <button
                                type="button"
                                className="text-muted underline"
                                onClick={async () => {
                                  if (await post({ action: "unlog", chapterId: c.id, platform: platform.id })) void load();
                                }}
                              >
                                Undo
                              </button>
                            </span>
                          ) : (
                            <button type="button" className="text-xs text-muted underline" onClick={() => setLogging({ chapterId: c.id, url: "" })}>
                              Mark posted
                            </button>
                          ))}
                      </div>
                      {logging?.chapterId === c.id && (
                        <form
                          className="mt-2 flex flex-wrap gap-2 pl-9"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (await post({ action: "log", chapterId: c.id, platform: platform.id, url: logging.url })) {
                              setLogging(null);
                              void load();
                            }
                          }}
                        >
                          <input
                            autoFocus
                            value={logging.url}
                            onChange={(e) => setLogging({ ...logging, url: e.target.value })}
                            placeholder={`Link to the chapter on ${platform.label} (optional)`}
                            className="min-w-64 flex-1 border border-line bg-paper px-2 py-1 text-xs"
                          />
                          <button type="submit" className="bg-accent px-3 py-1 text-xs text-paper">
                            Save
                          </button>
                          <button type="button" className="text-xs text-muted underline" onClick={() => setLogging(null)}>
                            Cancel
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="border border-line p-4 text-sm">
            <h3 className="font-display text-lg">Release schedule</h3>
            {!pro ? (
              <p className="mt-1 text-muted">
                With Pro, keep a log of where each chapter is posted, see how many chapters you have written ahead on each site, and get a reminder on
                release days with the next chapter for each site.{" "}
                <a href="/billing" className="text-accent underline">
                  See Pro
                </a>
              </p>
            ) : (
              <>
                <p className="mt-1 text-muted">On release days you get a reminder with the next chapter for each site, or a heads-up when you&apos;ve run out.</p>
                <p className="mt-3">Sites I post to</p>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  {SERIAL_PLATFORMS.filter((p) => p.id !== "text").map((p) => (
                    <label key={p.id} className={`flex items-center gap-1 border px-2 py-1 ${settings.platforms.includes(p.id) ? "border-accent" : "border-line"}`}>
                      <input
                        type="checkbox"
                        checked={settings.platforms.includes(p.id)}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, platforms: e.target.checked ? [...s.platforms, p.id] : s.platforms.filter((x) => x !== p.id) }))
                        }
                      />
                      {p.label}
                      {settings.platforms.includes(p.id) && <span className="text-muted">· {buffer(p.id)} ahead</span>}
                    </label>
                  ))}
                </div>
                <p className="mt-3">Release days</p>
                <div className="mt-1 flex flex-wrap gap-1 text-xs">
                  {WEEKDAYS.map((d, n) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSettings((s) => ({ ...s, weekdays: s.weekdays.includes(n) ? s.weekdays.filter((x) => x !== n) : [...s.weekdays, n].sort() }))}
                      className={`border px-2 py-1 ${settings.weekdays.includes(n) ? "border-accent bg-accent text-paper" : "border-line"}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <label className="mt-3 flex items-center gap-2">
                  <input type="checkbox" checked={settings.remind} onChange={(e) => setSettings((s) => ({ ...s, remind: e.target.checked }))} />
                  Remind me on release days (in the app, and by email if you get notification emails)
                </label>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    className="bg-accent px-4 py-2 text-xs text-paper"
                    onClick={async () => {
                      setSaved(false);
                      if (await post({ action: "settings", settings })) setSaved(true);
                    }}
                  >
                    Save schedule
                  </button>
                  {saved && <span className="text-xs text-accent">Saved.</span>}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
