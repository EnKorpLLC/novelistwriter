"use client";

import type { RefObject } from "react";

type Action = "h2" | "h3" | "bold" | "italic" | "link" | "ul" | "ol" | "quote" | "check";

const BLOCK: Action[] = ["h2", "h3", "ul", "ol", "quote", "check"];
const BUTTONS: { a: Action; label: string; title: string; cls?: string }[] = [
  { a: "h2", label: "Heading", title: "Section heading" },
  { a: "h3", label: "Subheading", title: "Smaller heading" },
  { a: "bold", label: "B", title: "Bold (Ctrl+B)", cls: "font-bold" },
  { a: "italic", label: "I", title: "Italic (Ctrl+I)", cls: "italic" },
  { a: "link", label: "Link", title: "Link to a page" },
  { a: "ul", label: "• List", title: "Bulleted list" },
  { a: "ol", label: "1. List", title: "Numbered list" },
  { a: "quote", label: "Quote", title: "Quote" },
  { a: "check", label: "☐ Checklist", title: "Checklist" },
];

const PREFIX: Partial<Record<Action, string>> = { h2: "## ", h3: "### ", ul: "- ", quote: "> ", check: "- [ ] " };
const ANY_PREFIX = /^(#{1,3}\s|>\s?|-\s\[[ x]\]\s|[-*]\s|\d+[.)]\s)/i;

/** Applies a formatting action to the selection and returns the new text plus where the selection should land. */
export function applyMarkdown(text: string, start: number, end: number, action: Action, url?: string): { text: string; start: number; end: number } {
  if (BLOCK.includes(action)) {
    // Whole lines: swap any existing line format for the new one, or remove it if it's already that format
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const after = text.indexOf("\n", end);
    const lineEnd = after === -1 ? text.length : after;
    const lines = text.slice(lineStart, lineEnd).split("\n");
    const already = lines.every((l) => (action === "ol" ? /^\d+[.)]\s/.test(l) : l.startsWith(PREFIX[action]!)));
    const next = lines
      .map((l, i) => {
        const bare = l.replace(ANY_PREFIX, "");
        if (already) return bare;
        return `${action === "ol" ? `${i + 1}. ` : PREFIX[action]}${bare}`;
      })
      .join("\n");
    return { text: text.slice(0, lineStart) + next + text.slice(lineEnd), start: lineStart, end: lineStart + next.length };
  }
  const selected = text.slice(start, end);
  if (action === "link") {
    const label = selected || "link text";
    const insert = `[${label}](${url || "/"})`;
    return { text: text.slice(0, start) + insert + text.slice(end), start: start + 1, end: start + 1 + label.length };
  }
  const mark = action === "bold" ? "**" : "*";
  // Already wrapped: unwrap
  if (text.slice(start - mark.length, start) === mark && text.slice(end, end + mark.length) === mark && selected) {
    return { text: text.slice(0, start - mark.length) + selected + text.slice(end + mark.length), start: start - mark.length, end: end - mark.length };
  }
  const inner = selected || (action === "bold" ? "bold text" : "italic text");
  return { text: text.slice(0, start) + mark + inner + mark + text.slice(end), start: start + mark.length, end: start + mark.length + inner.length };
}

/**
 * Formatting buttons for plain-text boxes that use our simple Markdown (guides, reports, site text).
 * `inline` shows only bold, italic, and link, for short fields where headings and lists don't apply.
 */
export function MarkdownToolbar({
  target,
  value,
  onChange,
  inline = false,
}: {
  target: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  inline?: boolean;
}) {
  function run(action: Action) {
    const el = target.current;
    if (!el) return;
    let url: string | undefined;
    if (action === "link") {
      const entered = window.prompt("Link to (a page here like /pricing, or a full https:// address):", "/");
      if (!entered) return;
      url = entered.trim();
    }
    const r = applyMarkdown(value, el.selectionStart, el.selectionEnd, action, url);
    onChange(r.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.start, r.end);
    });
  }

  return (
    <div className="flex flex-wrap gap-1 border border-b-0 border-line bg-paper-deep/40 px-1.5 py-1">
      {BUTTONS.filter((b) => !inline || ["bold", "italic", "link"].includes(b.a)).map((b) => (
        <button
          key={b.a}
          type="button"
          title={b.title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run(b.a)}
          className={`rounded-sm px-2 py-1 text-xs text-ink hover:bg-paper-deep ${b.cls || ""}`}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}

/** Ctrl+B / Ctrl+I inside a text box. */
export function markdownShortcut(e: React.KeyboardEvent<HTMLTextAreaElement>, value: string, onChange: (next: string) => void) {
  if (!(e.ctrlKey || e.metaKey) || (e.key !== "b" && e.key !== "i")) return;
  e.preventDefault();
  const el = e.currentTarget;
  const r = applyMarkdown(value, el.selectionStart, el.selectionEnd, e.key === "b" ? "bold" : "italic");
  onChange(r.text);
  requestAnimationFrame(() => el.setSelectionRange(r.start, r.end));
}
