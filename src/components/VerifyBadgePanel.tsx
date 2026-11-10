"use client";

import { useEffect, useState } from "react";
import { EmbedSnippets } from "@/components/EmbedSnippets";
import { buttonImageSize } from "@/lib/embed-buttons";

type State = { on: boolean; code: string | null; url: string | null; badgeUrl: string | null; lookupUrl: string; label: string | null; migrationNeeded?: boolean; error?: string };

/** Turn on a "verified human-written" badge for this book and get the code for other sites. Every plan. */
export function VerifyBadgePanel({ projectId, title }: { projectId: string; title: string }) {
  const [state, setState] = useState<State | null>(null);
  const [dark, setDark] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/projects/${projectId}/verify`)
      .then(async (r) => (r.ok ? setState(await r.json()) : null))
      .catch(() => null);
  }, [projectId]);

  async function toggle(on: boolean) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/verify`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      setState(json);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;
  const badge = state.badgeUrl ? `${state.badgeUrl}${dark ? "?theme=dark" : ""}` : "";
  const alt = `${title}: ${state.label || "writing record"}, verified by Novelist Writer`;
  const lookup = state.lookupUrl.replace(/^https?:\/\//, "");

  return (
    <section className="border border-line p-4">
      <h3 className="font-display text-lg">Verification badge for other sites</h3>
      <p className="mt-1 text-sm text-muted">
        A badge and a public page anyone can check, showing the numbers from this book&apos;s writing record (typed versus pasted, sessions, dates,
        and whether AI was used). Never your text. Put it on Royal Road, Wattpad, Substack, your Amazon description, or your own site.
      </p>
      {state.migrationNeeded ? (
        <p className="mt-2 text-sm text-danger">{state.error}</p>
      ) : (
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={state.on} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
          <span>
            Turn on verification for this book
            <span className="block text-xs text-muted">Free on every plan. Turn it off anytime and the badge shows “Not verified” everywhere it&apos;s posted.</span>
          </span>
        </label>
      )}
      {note && <p className="mt-2 text-sm text-danger">{note}</p>}

      {state.on && state.code && state.url && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <a href={state.url} target="_blank" rel="noopener noreferrer" className={dark ? "bg-ink p-2" : ""}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={badge} alt={alt} height={22} />
            </a>
            <span>
              Code <strong className="font-mono">{state.code}</strong>
            </span>
            <label className="flex items-center gap-1 text-xs text-muted">
              <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} /> Dark version
            </label>
            <a href={state.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent underline">
              View the page
            </a>
          </div>
          {state.label && (
            <p className="text-xs text-muted">
              It says “{state.label}” right now and updates as you write. “Verified human-written” needs the Written in Novelist Writer badge and no AI
              tools run on the book.
            </p>
          )}
          <EmbedSnippets
            snippets={[
              { id: "html", label: "Website or Substack (HTML)", code: `<a href="${state.url}"><img src="${badge}" alt="${alt.replace(/"/g, "&quot;")}" height="22"></a>` },
              {
                id: "email",
                label: "Newsletter (image)",
                hint: "Email apps like Gmail don't show the badge above, so newsletters get this image version.",
                code: `<a href="${state.url}"><img src="${badge.replace("/badge.svg", "/badge.png")}" alt="${alt.replace(/"/g, "&quot;")}" width="${buttonImageSize(state.label || "", true).width / 2}" height="44"></a>`,
              },
              { id: "md", label: "Markdown", hint: "For sites that use Markdown, like many forums and GitHub-style editors.", code: `[![${alt}](${badge})](${state.url})` },
              { id: "bb", label: "BBCode (forums)", code: `[url=${state.url}][img]${badge}[/img][/url]` },
              {
                id: "text",
                label: "Plain text (Amazon, paperback)",
                hint: "For places that don't allow links or images, like Amazon descriptions or your book's copyright page.",
                code: `Verify how this book was written at ${lookup} with code ${state.code}.`,
              },
              { id: "link", label: "Just the link", hint: "For Royal Road, Wattpad, and others: paste the badge image link in their image button, or this link in your author's note.", code: state.url },
            ]}
          />
        </div>
      )}
    </section>
  );
}
