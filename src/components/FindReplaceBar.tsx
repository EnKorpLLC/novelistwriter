"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { getSearchState } from "@/lib/tiptap-search-highlight";

type Props = {
  editor: Editor | null;
  open: boolean;
  onClose: () => void;
  /** Seed find field (e.g. from Look up) */
  initialQuery?: string;
  showReplace?: boolean;
};

export function FindReplaceBar({
  editor,
  open,
  onClose,
  initialQuery = "",
  showReplace = false,
}: Props) {
  const [find, setFind] = useState(initialQuery);
  const [replace, setReplace] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [replaceMode, setReplaceMode] = useState(showReplace);
  const [matchInfo, setMatchInfo] = useState({ index: 0, total: 0 });

  useEffect(() => {
    if (open && initialQuery) setFind(initialQuery);
  }, [open, initialQuery]);

  useEffect(() => {
    if (open) setReplaceMode(showReplace);
  }, [open, showReplace]);

  useEffect(() => {
    if (!editor || !open) return;
    editor.commands.setSearchHighlight(find, { caseSensitive, currentIndex: 0 });
    const st = getSearchState(editor);
    setMatchInfo({
      index: st?.matches.length ? (st.currentIndex ?? 0) + 1 : 0,
      total: st?.matches.length ?? 0,
    });
  }, [editor, open, find, caseSensitive]);

  useEffect(() => {
    if (!open && editor) {
      editor.commands.clearSearchHighlight();
    }
  }, [open, editor]);

  function refreshInfo(editorInst: Editor, preferredIndex?: number) {
    const st = getSearchState(editorInst);
    const total = st?.matches.length ?? 0;
    const idx =
      preferredIndex != null && total
        ? ((preferredIndex % total) + total) % total
        : st?.currentIndex ?? 0;
    setMatchInfo({ index: total ? idx + 1 : 0, total });
  }

  function goToMatch(index: number) {
    if (!editor) return;
    editor.commands.setSearchMatchIndex(index);
    const st = getSearchState(editor);
    const m = st?.matches[st.currentIndex];
    if (m) {
      const sel = TextSelection.create(editor.state.doc, m.from, m.to);
      editor.view.dispatch(editor.state.tr.setSelection(sel).scrollIntoView());
      editor.view.focus();
    }
    refreshInfo(editor);
  }

  function next() {
    if (!editor) return;
    const st = getSearchState(editor);
    if (!st?.matches.length) return;
    goToMatch(st.currentIndex + 1);
  }

  function prev() {
    if (!editor) return;
    const st = getSearchState(editor);
    if (!st?.matches.length) return;
    goToMatch(st.currentIndex - 1);
  }

  function replaceOne() {
    if (!editor) return;
    const st = getSearchState(editor);
    if (!st?.matches.length) return;
    const m = st.matches[st.currentIndex];
    if (!m) return;
    const keepIndex = st.currentIndex;
    editor
      .chain()
      .focus()
      .command(({ tr, dispatch }) => {
        if (dispatch) tr.insertText(replace, m.from, m.to);
        return true;
      })
      .setSearchHighlight(find, { caseSensitive, currentIndex: keepIndex })
      .run();
    refreshInfo(editor, keepIndex);
    const after = getSearchState(editor);
    if (after?.matches.length) goToMatch(Math.min(keepIndex, after.matches.length - 1));
  }

  function replaceAll() {
    if (!editor || !find) return;
    const st = getSearchState(editor);
    if (!st?.matches.length) return;
    // Replace from end so positions stay valid
    const matches = [...st.matches].reverse();
    editor
      .chain()
      .focus()
      .command(({ tr, dispatch }) => {
        if (!dispatch) return true;
        for (const m of matches) {
          tr.insertText(replace, m.from, m.to);
        }
        return true;
      })
      .setSearchHighlight(find, { caseSensitive, currentIndex: 0 })
      .run();
    refreshInfo(editor, 0);
  }

  if (!open) return null;

  return (
    <div className="font-ui shrink-0 border-b border-line bg-paper-deep/50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={find}
          onChange={(e) => setFind(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) prev();
              else next();
            }
            if (e.key === "Escape") onClose();
          }}
          placeholder="Find in chapter…"
          className="min-w-[10rem] flex-1 border border-line bg-paper px-2 py-1 text-sm outline-none focus:border-accent"
          autoFocus
        />
        <span className="shrink-0 text-[11px] text-muted">
          {matchInfo.total ? `${matchInfo.index} / ${matchInfo.total}` : "No matches"}
        </span>
        <button
          type="button"
          onClick={prev}
          className="border border-line px-2 py-1 text-xs hover:border-accent"
          title="Previous (Shift+Enter)"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={next}
          className="border border-line px-2 py-1 text-xs hover:border-accent"
          title="Next (Enter)"
        >
          ↓
        </button>
        <label className="flex items-center gap-1 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
          />
          Aa
        </label>
        <button
          type="button"
          onClick={() => setReplaceMode((v) => !v)}
          className="border border-line px-2 py-1 text-xs hover:border-accent"
        >
          Replace
        </button>
        <button
          type="button"
          onClick={onClose}
          className="border border-line px-2 py-1 text-xs text-muted hover:text-ink"
        >
          Close
        </button>
      </div>
      {replaceMode && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                replaceOne();
              }
            }}
            placeholder="Replace with…"
            className="min-w-[10rem] flex-1 border border-line bg-paper px-2 py-1 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={replaceOne}
            disabled={!matchInfo.total}
            className="border border-line px-2 py-1 text-xs hover:border-accent disabled:opacity-40"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={replaceAll}
            disabled={!matchInfo.total}
            className="border border-line px-2 py-1 text-xs hover:border-accent disabled:opacity-40"
          >
            Replace all
          </button>
        </div>
      )}
      <p className="mt-1 text-[10px] text-muted">Chapter only · Ctrl/Cmd+F find · Ctrl/Cmd+H replace</p>
    </div>
  );
}
