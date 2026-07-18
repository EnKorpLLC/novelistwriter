import JSZip from "jszip";
import type { Chapter } from "@/lib/types";

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function handleFromId(id: string, fallbackIndex: number): string {
  const hex = id.replace(/-/g, "").slice(0, 13);
  if (hex.length >= 10) return hex;
  return (fallbackIndex + 1).toString(16).padStart(13, "0");
}

function textToNwd(title: string, text: string, handle: string): string {
  const body = text.trim()
    ? text.trim()
    : "";
  return `%%~name: ${title}
%%~path: ${handle}/0000000000000/0000000000000
%%~kind: NOVEL/DOCUMENT

# ${title}

${body}
`;
}

/** Build a novelWriter-style project ZIP (nwProject.nwx + content/*.nwd) */
export async function exportNovelWriterProject(opts: {
  title: string;
  authorName?: string;
  chapters: Chapter[];
}): Promise<Blob> {
  const zip = new JSZip();
  const ordered = [...opts.chapters].sort((a, b) => a.sort_order - b.sort_order);
  const novelRoot = "a0000000000001";
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, "");

  const itemXml: string[] = [
    `    <item handle="${novelRoot}" order="0" type="ROOT" class="NOVEL">`,
    `      <name>Novel</name>`,
    `    </item>`,
  ];

  const tocLines = ["Table of Contents", "=================", ""];

  ordered.forEach((ch, i) => {
    const handle = handleFromId(ch.id, i);
    itemXml.push(
      `    <item handle="${handle}" parent="${novelRoot}" root="${novelRoot}" order="${i}" type="FILE" class="NOVEL" layout="DOCUMENT">`,
      `      <name>${escapeXml(ch.title || `Chapter ${i + 1}`)}</name>`,
      `    </item>`
    );
    zip.file(
      `content/${handle}.nwd`,
      textToNwd(ch.title || `Chapter ${i + 1}`, ch.content_text || "", handle)
    );
    tocLines.push(`${ch.title || `Chapter ${i + 1}`}\tcontent/${handle}.nwd`);
  });

  const nwx = `<?xml version='1.0' encoding='utf-8'?>
<novelWriterXML appVersion="2.0" hexVersion="0x020000f0" fileVersion="1.5" timeStamp="${stamp}">
  <project id="nw-export">
    <name>${escapeXml(opts.title)}</name>
    <title>${escapeXml(opts.title)}</title>
    <author>${escapeXml(opts.authorName || "Author")}</author>
  </project>
  <settings>
    <status>
      <entry key="s000001" red="182" green="182" blue="182" count="0">New</entry>
    </status>
    <importance>
      <entry key="i000001" red="182" green="182" blue="182" count="0">None</entry>
    </importance>
  </settings>
  <content items="${ordered.length + 1}" firstHandle="${ordered[0] ? handleFromId(ordered[0].id, 0) : novelRoot}">
${itemXml.join("\n")}
  </content>
</novelWriterXML>
`;

  zip.file("nwProject.nwx", nwx);
  zip.file("ToC.txt", tocLines.join("\n") + "\n");
  zip.folder("meta");

  return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
}

/** Concatenated novelWriter Markup (.txt) for re-import / archive */
export function exportNovelWriterMarkup(opts: {
  title: string;
  chapters: Chapter[];
}): string {
  const ordered = [...opts.chapters].sort((a, b) => a.sort_order - b.sort_order);
  const parts = [`# ${opts.title}`, ""];
  for (const ch of ordered) {
    parts.push(`# ${ch.title}`, "", ch.content_text || "", "");
  }
  return parts.join("\n");
}

export type ParsedNwChapter = { title: string; body: string };

/** Parse novelWriter project ZIP or Markup TXT into chapters */
export async function parseNovelWriterImport(
  buf: Buffer,
  filename: string
): Promise<{ title?: string; chapters: ParsedNwChapter[] }> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".zip") || lower.endsWith(".nwx")) {
    const zip = await JSZip.loadAsync(buf);
    const nwxFile =
      zip.file("nwProject.nwx") ||
      Object.values(zip.files).find((f) => f.name.endsWith("nwProject.nwx") && !f.dir);

    let title: string | undefined;
    const handleOrder: { handle: string; name: string; order: number }[] = [];

    if (nwxFile) {
      const xml = await nwxFile.async("string");
      const titleMatch = xml.match(/<title>([^<]*)<\/title>/i) || xml.match(/<name>([^<]*)<\/name>/i);
      title = titleMatch?.[1];

      const itemRe =
        /<item\b([^>]*)>[\s\S]*?<name>([^<]*)<\/name>[\s\S]*?<\/item>/gi;
      let m: RegExpExecArray | null;
      while ((m = itemRe.exec(xml))) {
        const attrs = m[1];
        const name = m[2];
        if (!/type\s*=\s*["']FILE["']/i.test(attrs)) continue;
        const handle = attrs.match(/handle\s*=\s*["']([^"']+)["']/i)?.[1];
        const order = Number(attrs.match(/order\s*=\s*["'](\d+)["']/i)?.[1] || 0);
        if (handle) handleOrder.push({ handle, name, order });
      }
      handleOrder.sort((a, b) => a.order - b.order);
    }

    const chapters: ParsedNwChapter[] = [];

    if (handleOrder.length) {
      for (const item of handleOrder) {
        const doc =
          zip.file(`content/${item.handle}.nwd`) ||
          Object.values(zip.files).find(
            (f) => f.name.endsWith(`${item.handle}.nwd`) && !f.dir
          );
        if (!doc) continue;
        const raw = await doc.async("string");
        chapters.push(parseNwd(raw, item.name));
      }
    } else {
      // Fallback: any .nwd files
      const nwdFiles = Object.values(zip.files).filter(
        (f) => f.name.endsWith(".nwd") && !f.dir
      );
      for (const f of nwdFiles) {
        const raw = await f.async("string");
        chapters.push(parseNwd(raw, f.name.replace(/\.nwd$/i, "")));
      }
    }

    if (chapters.length) return { title, chapters };
  }

  // Markup / plain text with # headings
  const text = buf.toString("utf8");
  return { chapters: splitMarkupChapters(text) };
}

function parseNwd(raw: string, fallbackTitle: string): ParsedNwChapter {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let title = fallbackTitle;
  const bodyLines: string[] = [];
  let pastMeta = false;
  for (const line of lines) {
    if (!pastMeta && line.startsWith("%%~")) {
      if (line.startsWith("%%~name:")) title = line.slice(8).trim() || title;
      continue;
    }
    pastMeta = true;
    bodyLines.push(line);
  }
  let body = bodyLines.join("\n").trim();
  // Drop leading markdown heading if it duplicates title
  body = body.replace(new RegExp(`^#\\s*${escapeReg(title)}\\s*\\n+`, "i"), "");
  return { title, body };
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitMarkupChapters(text: string): ParsedNwChapter[] {
  const parts = text.split(/\n(?=#\s+)/);
  if (parts.length <= 1) {
    return [{ title: "Chapter 1", body: text.trim() }];
  }
  return parts
    .map((p, i) => {
      const lines = p.trim().split("\n");
      const title = lines[0]?.replace(/^#\s*/, "").trim() || `Chapter ${i + 1}`;
      const body = lines.slice(1).join("\n").trim();
      return { title, body };
    })
    .filter((c) => c.body || c.title);
}
