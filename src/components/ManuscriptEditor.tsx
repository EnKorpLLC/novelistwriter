"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { useEffect, useCallback, useRef } from "react";
import { countWords, htmlToText, saveDraftLocal, loadDraftLocal } from "@/lib/draft-cache";

type Props = {
  chapterId: string;
  initialHtml: string;
  onSave: (payload: { html: string; text: string; wordCount: number }) => Promise<void>;
  onSelectionText?: (text: string) => void;
  focusMode?: boolean;
};

export function ManuscriptEditor({
  chapterId,
  initialHtml,
  onSave,
  onSelectionText,
  focusMode,
}: Props) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(initialHtml);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Write your chapter…" }),
      CharacterCount,
    ],
    content: initialHtml || "<p></p>",
    editorProps: {
      attributes: {
        class: "ProseMirror max-w-3xl mx-auto px-4 py-8",
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
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const text = ed.getText();
      const wordCount = countWords(text);
      saveDraftLocal(chapterId, { html, text, wordCount });
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (html !== lastSaved.current) {
          lastSaved.current = html;
          void onSave({ html, text, wordCount });
        }
      }, 1200);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const cached = loadDraftLocal(chapterId);
    const serverTime = 0;
    if (cached && cached.savedAt > serverTime && cached.html !== initialHtml) {
      // Prefer fresher local cache after refresh
      if (cached.html && cached.html !== editor.getHTML()) {
        editor.commands.setContent(cached.html);
      }
    } else if (initialHtml !== editor.getHTML()) {
      editor.commands.setContent(initialHtml || "<p></p>");
    }
    lastSaved.current = editor.getHTML();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, editor]);

  const forceSave = useCallback(async () => {
    if (!editor) return;
    const html = editor.getHTML();
    const text = htmlToText(html);
    await onSave({ html, text, wordCount: countWords(text) });
    lastSaved.current = html;
  }, [editor, onSave]);

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
    <div className={focusMode ? "focus-mode" : ""}>
      <div className="app-chrome font-ui flex items-center justify-between border-b border-line px-4 py-2 text-xs text-muted">
        <span>{words} words</span>
        <span>Autosave on · Ctrl/Cmd+S</span>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
