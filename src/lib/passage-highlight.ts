/** Highlight a passage inside an HTML article (beta reader) and scroll it into view. */

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function wrapRangeWithMark(range: Range): HTMLElement | null {
  try {
    const mark = document.createElement("mark");
    mark.className = "passage-highlight passage-highlight-current";
    range.surroundContents(mark);
    return mark;
  } catch {
    // Cross-element ranges: extract + insert
    try {
      const mark = document.createElement("mark");
      mark.className = "passage-highlight passage-highlight-current";
      const frag = range.extractContents();
      mark.appendChild(frag);
      range.insertNode(mark);
      return mark;
    } catch {
      return null;
    }
  }
}

/**
 * Wrap the first fuzzy (whitespace-collapsed) match of `query` in <mark>,
 * then scroll the mark into view. Returns true if a match was found.
 */
export function highlightPassageInElement(root: HTMLElement, query: string): boolean {
  const q = normalizeWs(query);
  if (q.length < 2) return false;

  root.querySelectorAll("mark.passage-highlight").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (n.nodeType === Node.TEXT_NODE && (n.textContent || "").length) nodes.push(n as Text);
  }
  if (!nodes.length) return false;

  type MapEntry = { node: Text; offset: number };
  const map: MapEntry[] = [];
  let collapsed = "";

  for (const node of nodes) {
    const text = node.textContent || "";
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      if (/\s/.test(ch)) {
        if (!collapsed.length || collapsed.endsWith(" ")) continue;
        collapsed += " ";
        map.push({ node, offset: i });
      } else {
        collapsed += ch;
        map.push({ node, offset: i });
      }
    }
  }

  const needle = q.toLowerCase();
  const hay = collapsed.toLowerCase();
  const idx = hay.indexOf(needle);
  if (idx < 0 || idx + needle.length > map.length) return false;

  const start = map[idx]!;
  const end = map[idx + needle.length - 1]!;

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset + 1);

  const mark = wrapRangeWithMark(range);
  if (mark) {
    mark.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  }

  try {
    const rect = range.getBoundingClientRect();
    window.scrollBy({
      top: rect.top - window.innerHeight / 3,
      behavior: "smooth",
    });
  } catch {
    /* ignore */
  }
  return false;
}
