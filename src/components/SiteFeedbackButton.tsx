"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FEEDBACK_KINDS, FEEDBACK_MAX_BYTES, FEEDBACK_MAX_FILES, type FeedbackKind } from "@/lib/site-feedback";

const IMAGE = /^image\/(png|jpeg|webp|gif)$/;

/** "Tell Us What You Think!": a popup on the dashboards that sends feedback and screenshots to the admin inbox. */
export function SiteFeedbackButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function add(list: File[]) {
    setMsg(null);
    const ok = list.filter((f) => IMAGE.test(f.type));
    if (ok.length < list.length) setMsg("Screenshots must be PNG, JPG, WebP, or GIF.");
    const small = ok.filter((f) => f.size <= FEEDBACK_MAX_BYTES);
    if (small.length < ok.length) setMsg("Each screenshot must be under 5 MB.");
    setFiles((cur) => {
      const next = [...cur, ...small.map((file) => ({ file, url: URL.createObjectURL(file) }))];
      if (next.length > FEEDBACK_MAX_FILES) setMsg(`Up to ${FEEDBACK_MAX_FILES} screenshots.`);
      next.slice(FEEDBACK_MAX_FILES).forEach((f) => URL.revokeObjectURL(f.url));
      return next.slice(0, FEEDBACK_MAX_FILES);
    });
  }

  function reset() {
    files.forEach((f) => URL.revokeObjectURL(f.url));
    setKind("bug");
    setMessage("");
    setFiles([]);
    setMsg(null);
    setDone(false);
  }

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("message", message);
      fd.set("page", window.location.pathname);
      for (const f of files) fd.append("files", f.file, f.file.name || "screenshot.png");
      const res = await fetch("/api/site-feedback", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't send");
      setDone(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className={`font-ui border border-accent px-3 py-1.5 text-sm text-accent hover:bg-accent hover:text-paper ${className}`}
      >
        Tell Us What You Think!
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[130] flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Tell us what you think"
              className="font-ui max-h-[90vh] w-full max-w-lg overflow-y-auto border border-line bg-paper p-5 shadow-lg"
              onClick={(e) => e.stopPropagation()}
              onPaste={(e) => {
                const pasted = [...e.clipboardData.files];
                if (pasted.length) {
                  e.preventDefault();
                  add(pasted);
                }
              }}
            >
              {done ? (
                <>
                  <h3 className="font-display text-xl">Thank you!</h3>
                  <p className="mt-2 text-sm text-muted">We read every message. If we need more detail, we&apos;ll reply to your account email.</p>
                  <button type="button" className="mt-4 border border-line px-4 py-2 text-sm" onClick={() => setOpen(false)}>
                    Close
                  </button>
                </>
              ) : (
                <>
                  <h3 className="font-display text-xl">Tell Us What You Think!</h3>
                  <p className="mt-1 text-xs text-muted">Bugs, ideas, or a kind word: it all goes straight to the people building Novelist Writer.</p>

                  <label className="mt-4 block text-sm">
                    <span className="text-muted">What is this about?</span>
                    <select value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind)} className="mt-1 w-full border border-line bg-paper px-2 py-2 text-sm">
                      {FEEDBACK_KINDS.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="mt-3 block text-sm">
                    <span className="text-muted">Your message</span>
                    <textarea
                      rows={8}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      maxLength={8000}
                      placeholder={
                        kind === "bug"
                          ? "What happened, and what did you expect? Steps to make it happen again help a lot."
                          : kind === "feature_request" || kind === "feature_improvement"
                            ? "What would you like, and what would it help you do?"
                            : "Tell us anything."
                      }
                      className="mt-1 w-full resize-y border border-line bg-paper p-2 text-sm"
                    />
                  </label>

                  <div className="mt-3 text-sm">
                    <span className="text-muted">Screenshots (optional, up to {FEEDBACK_MAX_FILES})</span>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {files.map((f, i) => (
                        <span key={f.url} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={f.url} alt={`Screenshot ${i + 1}`} className="h-16 w-16 border border-line object-cover" />
                          <button
                            type="button"
                            aria-label={`Remove screenshot ${i + 1}`}
                            className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-ink text-[11px] leading-5 text-paper"
                            onClick={() => {
                              URL.revokeObjectURL(f.url);
                              setFiles((cur) => cur.filter((x) => x.url !== f.url));
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {files.length < FEEDBACK_MAX_FILES && (
                        <label className="cursor-pointer border border-dashed border-line px-3 py-2 text-xs text-muted hover:border-accent hover:text-accent">
                          Add screenshots
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            multiple
                            className="sr-only"
                            onChange={(e) => {
                              add([...(e.target.files || [])]);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted">Tip: copy a screenshot and paste it here with Ctrl+V (Cmd+V on a Mac).</p>
                  </div>

                  {msg && <p className="mt-2 text-xs text-danger">{msg}</p>}
                  <div className="mt-4 flex justify-end gap-2">
                    <button type="button" className="border border-line px-3 py-2 text-sm" onClick={() => setOpen(false)}>
                      Cancel
                    </button>
                    <button type="button" disabled={busy || !message.trim()} className="bg-accent px-3 py-2 text-sm text-paper disabled:opacity-50" onClick={() => void send()}>
                      {busy ? "Sending…" : "Send"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
