"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";
import { useEffect, useCallback, useRef, useState } from "react";
import {
  countWords,
  htmlToText,
  saveDraftLocal,
  loadDraftLocal,
  clearDraftLocal,
} from "@/lib/draft-cache";
import { FontSize } from "@/lib/tiptap-font-size";
import { EditorToolbar } from "@/components/EditorToolbar";

type Props = {
  chapterId: string;
  initialHtml: string;
  /** ISO timestamp from server — used so local cache doesn't override newer cloud content */
  serverUpdatedAt?: string | null;
  onSave: (payload: { html: string; text: string; wordCount: number }) => Promise<boolean>;
  onSelectionText?: (text: string) => void;
  focusMode?: boolean;
};

/** Blocks ProseMirror’s scroll-into-view while the chapter is first loading */
function createSuppressScrollExtension(suppressRef: { current: boolean }) {
  return Extension.create({
    name: "suppressInitialScroll",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            handleScrollToSelection: () => suppressRef.current,
          },
        }),
      ];
    },
  });
}

function selectionAtStart(editor: NonNullable<ReturnType<typeof useEditor>>) {
  const { state, view } = editor;
  const sel = TextSelection.atStart(state.doc);
  view.dispatch(state.tr.setSelection(sel));
}

export function ManuscriptEditor({
  chapterId,
  initialHtml,
  serverUpdatedAt,
  onSave,
  onSelectionText,
  focusMode,
}: Props) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSynced = useRef(initialHtml);
  const scrollRef = useRef<HTMLDivElement>(null);
  const suppressScrollRef = useRef(true);
  const [saveHint, setSaveHint] = useState("All changes saved");
  const [, setTick] = useState(0);

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: false,
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Write your chapter…" }),
      CharacterCount,
      createSuppressScrollExtension(suppressScrollRef),
    ],
    content: initialHtml || "<p></p>",
    editorProps: {
      attributes: {
        class: "ProseMirror max-w-3xl mx-auto px-4 py-8",
        spellcheck: "true",
        "data-gramm": "false",
        "data-gramm_editor": "false",
        "data-enable-grammarly": "false",
        autocapitalize: "sentences",
        autocorrect: "on",
        lang: "en-US",
      },
      handleDOMEvents: {
        mouseup: (view) => {
          const sel = view.state.selection;
          if (!sel.empty && onSelectionText) {
            const text = view.state.doc.textBetween(sel.from, sel.to, " ");
            onSelectionText(text);
          }
          return false;
        },
      },
    },
    onCreate: ({ editor: ed }) => {
      const dom = ed.view.dom as HTMLElement;
      dom.setAttribute("spellcheck", "true");
      dom.spellcheck = true;
      dom.setAttribute("lang", "en-US");
      selectionAtStart(ed);
      scrollRef.current?.scrollTo(0, 0);
      window.scrollTo(0, 0);
    },
    onTransaction: () => setTick((t) => t + 1),
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const text = ed.getText();
      const wordCount = countWords(text);
      saveDraftLocal(chapterId, { html, text, wordCount, pendingSync: true });
      setSaveHint("Saving…");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void (async () => {
          // Read latest content at flush time (not the stale onUpdate closure)
          const latestHtml = ed.getHTML();
          const latestText = ed.getText();
          const latestWords = countWords(latestText);
          if (latestHtml === lastSynced.current) {
            setSaveHint("All changes saved");
            return;
          }
          const ok = await onSave({
            html: latestHtml,
            text: latestText,
            wordCount: latestWords,
          });
          if (ok) {
            lastSynced.current = latestHtml;
            clearDraftLocal(chapterId);
            setSaveHint("All changes saved");
          } else {
            setSaveHint("Save failed — kept locally; will retry");
          }
        })();
      }, 800);
    },
  });

  // Chapter open only (component remounts via key={chapterId}). Do NOT re-run when
  // parent updates initialHtml/serverUpdatedAt after autosave — that was jumping the caret.
  useEffect(() => {
    if (!editor) return;

    suppressScrollRef.current = true;
    scrollRef.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);

    const serverMs = serverUpdatedAt ? Date.parse(serverUpdatedAt) : 0;
    const cached = loadDraftLocal(chapterId);

    // Only use local cache if it is newer than the server AND still pending sync
    const useCache =
      cached?.pendingSync &&
      cached.html &&
      cached.html !== initialHtml &&
      (!serverMs || cached.savedAt > serverMs);

    if (useCache && cached!.html !== editor.getHTML()) {
      editor.commands.setContent(cached!.html, false);
      selectionAtStart(editor);
      scrollRef.current?.scrollTo(0, 0);
    }

    lastSynced.current = useCache ? cached!.html : initialHtml || "<p></p>";

    const t = window.setTimeout(() => {
      suppressScrollRef.current = false;
    }, 400);
    return () => window.clearTimeout(t);
    // intentionally: chapter open only (key remount) — not on every autosave prop churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const forceSave = useCallback(async () => {
    if (!editor) return;
    const html = editor.getHTML();
    const text = htmlToText(html);
    setSaveHint("Saving…");
    const ok = await onSave({ html, text, wordCount: countWords(text) });
    if (ok) {
      lastSynced.current = html;
      clearDraftLocal(chapterId);
      setSaveHint("All changes saved");
    } else {
      setSaveHint("Save failed — kept locally");
    }
  }, [editor, onSave, chapterId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void forceSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [forceSave]);

  const words = editor?.storage.characterCount?.words?.() ?? countWords(editor?.getText() || "");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <EditorToolbar editor={editor} />
      <div className="font-ui flex shrink-0 items-center justify-between border-b border-line px-4 py-2 text-xs text-muted">
        <span>{words} words</span>
        <span>
          {saveHint}
          {focusMode ? " · focus" : ""} · browser spellcheck · Ctrl/Cmd+S
        </span>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
