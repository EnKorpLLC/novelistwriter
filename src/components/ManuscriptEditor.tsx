"use client";

import { useEditor, EditorContent } from "@tiptap/react";
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
  const [saveHint, setSaveHint] = useState("All changes saved");
  const [, setTick] = useState(0);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Write your chapter…" }),
      CharacterCount,
    ],
    content: initialHtml || "<p></p>",
    editorProps: {
      attributes: {
        class: "ProseMirror max-w-3xl mx-auto px-4 py-8",
        spellcheck: "true",
        autocapitalize: "sentences",
        autocorrect: "on",
        lang: "en",
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
          if (html === lastSynced.current) {
            setSaveHint("All changes saved");
            return;
          }
          const ok = await onSave({ html, text, wordCount });
          if (ok) {
            lastSynced.current = html;
            clearDraftLocal(chapterId);
            setSaveHint("All changes saved");
          } else {
            setSaveHint("Save failed — kept locally; will retry");
          }
        })();
      }, 800);
    },
  });

  useEffect(() => {
    if (!editor) return;

    const serverMs = serverUpdatedAt ? Date.parse(serverUpdatedAt) : 0;
    const cached = loadDraftLocal(chapterId);

    // Only use local cache if it is newer than the server AND still pending sync
    // (prevents one computer's old localStorage from overwriting cloud text)
    const useCache =
      cached?.pendingSync &&
      cached.html &&
      cached.html !== initialHtml &&
      (!serverMs || cached.savedAt > serverMs);

    const next = useCache ? cached!.html : initialHtml || "<p></p>";
    if (next !== editor.getHTML()) {
      editor.commands.setContent(next, false);
    }
    lastSynced.current = useCache ? lastSynced.current : next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, editor, initialHtml, serverUpdatedAt]);

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
    <div className="flex h-full flex-col">
      {!focusMode && <EditorToolbar editor={editor} />}
      <div className="font-ui flex items-center justify-between border-b border-line px-4 py-2 text-xs text-muted">
        <span>{words} words</span>
        <span>{saveHint} · spellcheck on · Ctrl/Cmd+S</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
