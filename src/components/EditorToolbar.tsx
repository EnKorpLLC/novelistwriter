"use client";

import type { Editor } from "@tiptap/react";

type Props = {
  editor: Editor | null;
};

const FONTS = [
  { label: "Serif", value: "Georgia, 'Source Serif 4', serif" },
  { label: "Garamond", value: "Garamond, Georgia, serif" },
  { label: "Sans", value: "'DM Sans', system-ui, sans-serif" },
  { label: "Mono", value: "ui-monospace, Consolas, monospace" },
];

const SIZES = ["14px", "16px", "18px", "20px", "24px", "28px"];

function Btn({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded-sm px-2 py-1 text-xs ${
        active ? "bg-accent text-paper" : "text-ink hover:bg-paper-deep"
      }`}
    >
      {children}
    </button>
  );
}

export function EditorToolbar({ editor }: Props) {
  if (!editor) return null;

  return (
    <div className="font-ui flex flex-wrap items-center gap-1 border-b border-line bg-paper px-3 py-2">
      <select
        className="border border-line bg-paper px-1 py-1 text-xs"
        title="Font"
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          if (!v) editor.chain().focus().unsetFontFamily().run();
          else editor.chain().focus().setFontFamily(v).run();
        }}
      >
        <option value="">Font</option>
        {FONTS.map((f) => (
          <option key={f.label} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <select
        className="border border-line bg-paper px-1 py-1 text-xs"
        title="Size"
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          if (!v) editor.chain().focus().unsetFontSize().run();
          else editor.chain().focus().setFontSize(v).run();
        }}
      >
        <option value="">Size</option>
        {SIZES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <span className="mx-1 h-4 w-px bg-line" />

      <Btn
        title="Bold (Ctrl+B)"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </Btn>
      <Btn
        title="Italic (Ctrl+I)"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </Btn>
      <Btn
        title="Underline (Ctrl+U)"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span className="underline">U</span>
      </Btn>
      <Btn
        title="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <span className="line-through">S</span>
      </Btn>

      <span className="mx-1 h-4 w-px bg-line" />

      <Btn
        title="Heading"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H
      </Btn>
      <Btn
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • List
      </Btn>
      <Btn
        title="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1. List
      </Btn>
      <Btn
        title="Block quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        “ ”
      </Btn>
      <Btn
        title="Scene break (fleuron)"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertContent([
              {
                type: "paragraph",
                attrs: { textAlign: "center" },
                content: [{ type: "text", text: "⁂" }],
              },
              { type: "paragraph" },
            ])
            .run()
        }
      >
        ⁂
      </Btn>

      <span className="mx-1 h-4 w-px bg-line" />

      <Btn
        title="Align left"
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        Left
      </Btn>
      <Btn
        title="Align center"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        Center
      </Btn>
      <Btn
        title="Align right"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        Right
      </Btn>

      <span className="mx-1 h-4 w-px bg-line" />

      <Btn title="Undo" onClick={() => editor.chain().focus().undo().run()}>
        Undo
      </Btn>
      <Btn title="Redo" onClick={() => editor.chain().focus().redo().run()}>
        Redo
      </Btn>
    </div>
  );
}
