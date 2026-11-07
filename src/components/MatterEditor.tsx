"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { useState } from "react";

/** Small rich-text editor for front and back matter pages (keeps italics, bold, and centering). */
export function MatterEditor({
  initialHtml,
  onSave,
  onCancel,
}: {
  initialHtml: string;
  onSave: (html: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ codeBlock: false, horizontalRule: false }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: initialHtml || "<p></p>",
    editorProps: { attributes: { class: "manuscript-prose min-h-[8rem] px-3 py-2 focus:outline-none" } },
  });

  const btn = (active: boolean) =>
    `px-2 py-1 text-xs border ${active ? "border-accent text-accent" : "border-line text-muted hover:text-ink"}`;

  return (
    <div className="border border-line bg-paper">
      <div className="font-ui flex flex-wrap gap-1 border-b border-line px-2 py-1.5">
        <button type="button" className={btn(Boolean(editor?.isActive("bold")))} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <strong>B</strong>
        </button>
        <button type="button" className={btn(Boolean(editor?.isActive("italic")))} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <em>I</em>
        </button>
        <button type="button" className={btn(Boolean(editor?.isActive("underline")))} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
          <span className="underline">U</span>
        </button>
        <button
          type="button"
          className={btn(Boolean(editor?.isActive({ textAlign: "center" })))}
          onClick={() =>
            editor?.isActive({ textAlign: "center" })
              ? editor.chain().focus().setTextAlign("left").run()
              : editor?.chain().focus().setTextAlign("center").run()
          }
        >
          Center
        </button>
        <button type="button" className={btn(Boolean(editor?.isActive("blockquote")))} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          Quote
        </button>
        <button type="button" className={btn(Boolean(editor?.isActive("bulletList")))} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          List
        </button>
      </div>
      <EditorContent editor={editor} />
      <div className="font-ui flex gap-2 border-t border-line px-2 py-1.5">
        <button
          type="button"
          disabled={saving || !editor}
          className="bg-accent px-3 py-1 text-xs text-paper disabled:opacity-50"
          onClick={async () => {
            if (!editor) return;
            setSaving(true);
            try {
              await onSave(editor.getHTML());
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save page"}
        </button>
        <button type="button" className="text-xs text-muted hover:underline" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
