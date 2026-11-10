"use client";

import { useEffect, useState } from "react";
import { EmbedSnippets } from "@/components/EmbedSnippets";
import { EMBED_BUTTONS, buttonImageSize, buttonLink, embedButton, type EmbedButtonId } from "@/lib/embed-buttons";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Copy-paste buttons for the author's own site and newsletter, each linking to this book's launch page. */
export function EmbedButtonsPanel({ launchPath }: { launchPath: string }) {
  const [origin, setOrigin] = useState("");
  const [kind, setKind] = useState<EmbedButtonId>("buy");
  const [dark, setDark] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  if (!origin) return null;

  const b = embedButton(kind)!;
  const launchUrl = `${origin}${launchPath}`;
  const site = buttonLink(launchUrl, kind, "website");
  const mail = buttonLink(launchUrl, kind, "newsletter");
  const img = `${origin}/embed/button/${kind}.png${dark ? "?theme=dark" : ""}`;
  const w = buttonImageSize(b.label).width / 2;
  const bg = dark ? "#f7f2e9" : "#2c5f4a";
  const fg = dark ? "#1a1612" : "#ffffff";

  return (
    <section className="border border-line p-4">
      <h3 className="font-display text-lg">Buttons for your website and newsletter</h3>
      <p className="mt-1 text-sm text-muted">
        Paste a button anywhere you have readers. It always goes to this book&apos;s launch page, which shows what&apos;s open right now, and clicks
        show up in Marketing results under “Your website” or “Newsletter”.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <select value={kind} onChange={(e) => setKind(e.target.value as EmbedButtonId)} className="border border-line bg-paper px-2 py-1.5">
          {EMBED_BUTTONS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-muted">
          <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} /> For dark backgrounds
        </label>
      </div>
      <p className="mt-1 text-xs text-muted">Best used: {b.when}.</p>
      <div className={`mt-3 inline-block p-3 ${dark ? "bg-ink" : "bg-paper-deep/40"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt={b.label} width={w} height={44} />
      </div>
      <div className="mt-3">
        <EmbedSnippets
          key={`${kind}-${dark}`}
          snippets={[
            {
              id: "site",
              label: "Website (HTML)",
              hint: "For WordPress, Squarespace, Wix, or any site with an HTML or embed block. A real button, so it stays sharp and screen readers can read it.",
              code: `<a href="${esc(site)}" style="display:inline-block;padding:12px 22px;border-radius:6px;background:${bg};color:${fg};font:600 15px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;text-decoration:none">${esc(b.label)}</a>`,
            },
            {
              id: "email",
              label: "Newsletter (HTML)",
              hint: "For MailerLite, Kit, Mailchimp, or any newsletter with an HTML block. Uses an image so it looks the same in every email app.",
              code: `<a href="${esc(mail)}"><img src="${esc(img)}" alt="${esc(b.label)}" width="${w}" height="44" style="border:0"></a>`,
            },
            {
              id: "parts",
              label: "Image and link",
              hint: "For Substack and editors without HTML: add the image, then set its link to the second line.",
              code: `${img}\n${mail}`,
            },
            { id: "md", label: "Markdown", code: `[![${b.label}](${img})](${site})` },
          ]}
        />
      </div>
    </section>
  );
}
