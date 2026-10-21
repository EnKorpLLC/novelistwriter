import type { Transaction } from "@tiptap/pm/state";
import { ReplaceAroundStep, ReplaceStep } from "@tiptap/pm/transform";

/** A session ends after this much idle time; the next keystroke starts a new one. */
const IDLE_MS = 30 * 60 * 1000;

type SessionState = {
  key: string;
  startedAt: number;
  lastAt: number;
  typed: number;
  pasted: number;
  deleted: number;
  dirty: boolean;
};

export type SessionPayload = {
  projectId: string;
  chapterId: string;
  sessionKey: string;
  startedAt: string;
  endedAt: string;
  typed: number;
  pasted: number;
  deleted: number;
};

function newSession(now: number): SessionState {
  return {
    key: crypto.randomUUID(),
    startedAt: now,
    lastAt: now,
    typed: 0,
    pasted: 0,
    deleted: 0,
    dirty: false,
  };
}

function toPayload(projectId: string, chapterId: string, s: SessionState): SessionPayload {
  return {
    projectId,
    chapterId,
    sessionKey: s.key,
    startedAt: new Date(s.startedAt).toISOString(),
    endedAt: new Date(s.lastAt).toISOString(),
    typed: s.typed,
    pasted: s.pasted,
    deleted: s.deleted,
  };
}

/**
 * Counts typed vs pasted vs deleted characters for one chapter from editor transactions.
 * Totals are cumulative per session, so resending is harmless.
 */
export function createWritingSessionTracker(projectId: string, chapterId: string) {
  let session = newSession(Date.now());

  function send(payload: SessionPayload, beacon: boolean) {
    const body = JSON.stringify(payload);
    if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/proof/events", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/proof/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => null);
  }

  function flush(opts: { beacon?: boolean } = {}) {
    if (!session.dirty) return;
    session.dirty = false;
    send(toPayload(projectId, chapterId, session), Boolean(opts.beacon));
  }

  function record(tr: Transaction) {
    if (!tr.docChanged) return;
    // Loading a chapter or restoring the local draft isn't writing
    if (tr.getMeta("preventUpdate")) return;

    const now = Date.now();
    if (now - session.lastAt > IDLE_MS && session.dirty) {
      flush();
      session = newSession(now);
    } else if (now - session.lastAt > IDLE_MS) {
      session = newSession(now);
    }

    const uiEvent = tr.getMeta("uiEvent") as string | undefined;
    const fromHistory = Boolean(tr.getMeta("history$"));
    let inserted = 0;
    let removed = 0;
    tr.steps.forEach((step, i) => {
      if (!(step instanceof ReplaceStep) && !(step instanceof ReplaceAroundStep)) return;
      const { from, to, slice } = step as unknown as {
        from: number;
        to: number;
        slice: { content: { size: number; textBetween: (a: number, b: number, s?: string, l?: string) => string } };
      };
      const before = tr.docs[i];
      if (before && to > from) removed += before.textBetween(from, to, "\n", "\n").length;
      inserted += slice.content.textBetween(0, slice.content.size, "\n", "\n").length;
    });

    if (uiEvent === "paste" || uiEvent === "drop") session.pasted += inserted;
    // Undo/redo re-inserts earlier text; it isn't new typing
    else if (!fromHistory) session.typed += inserted;
    session.deleted += removed;
    session.lastAt = now;
    if (inserted || removed) session.dirty = true;
  }

  return { record, flush };
}
