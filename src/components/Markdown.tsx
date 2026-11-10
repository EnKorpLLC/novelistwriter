import Link from "next/link";
import type { ReactNode } from "react";
import { slugify } from "@/lib/handles";

/** Inline Markdown: **bold**, *italic*, `code`, and [links](/path or https://...). */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const key = `${keyBase}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={key}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={key} className="bg-paper-deep/60 px-1 text-[0.95em]">{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const label = t.slice(1, t.indexOf("]("));
      const href = t.slice(t.indexOf("](") + 2, -1);
      if (href.startsWith("/")) out.push(<Link key={key} href={href} className="text-accent underline">{label}</Link>);
      else if (/^https?:\/\//.test(href)) out.push(<a key={key} href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline">{label}</a>);
      else out.push(label);
    } else out.push(<em key={key}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** One line of editable site text: [links](/page), **bold**, and *italic*, nothing else. */
export function InlineText({ text }: { text: string }) {
  return <>{inline(text, "t")}</>;
}

/** A heading where each line you typed starts a new line. */
export function Lines({ text }: { text: string }) {
  const parts = text.split("\n");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {p}
        </span>
      ))}
    </>
  );
}

/**
 * A small, safe Markdown renderer for guides and reports edited in admin. It builds React elements
 * (never raw HTML), so nothing typed into a guide can inject markup or scripts.
 */
export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let n = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${n++}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const text = h[2].trim();
      const id = slugify(text);
      blocks.push(
        h[1].length === 3 ? (
          <h3 key={key} id={id} className="font-display mt-8 text-xl text-ink">{inline(text, key)}</h3>
        ) : (
          <h2 key={key} id={id} className="font-display mt-10 text-2xl text-ink">{inline(text, key)}</h2>
        )
      );
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/).test(lines[i])) {
        items.push(lines[i].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/, ""));
        i++;
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={key} className={`mt-4 space-y-1.5 pl-6 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((it, j) => (
            <li key={j} className={/^\[[ x]\]\s/i.test(it) ? "list-none -ml-6" : ""}>
              {/^\[[ x]\]\s/i.test(it) ? (/^\[x\]/i.test(it) ? "☑ " : "☐ ") : null}
              {inline(it.replace(/^\[[ x]\]\s/i, ""), `${key}-${j}`)}
            </li>
          ))}
        </Tag>
      );
      continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) quote.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(
        <blockquote key={key} className="mt-4 border-l-2 border-accent pl-4 text-muted">
          {inline(quote.join(" "), key)}
        </blockquote>
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|\s*[-*]\s+|\s*\d+[.)]\s+)/.test(lines[i])) para.push(lines[i++].trim());
    blocks.push(
      <p key={key} className="mt-4 leading-relaxed">
        {inline(para.join(" "), key)}
      </p>
    );
  }
  return <div className={className}>{blocks}</div>;
}
