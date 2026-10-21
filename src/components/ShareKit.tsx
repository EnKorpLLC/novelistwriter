"use client";

import { useEffect, useMemo, useState } from "react";

export type SharePost = { label: string; text: string };

type Props = {
  /** Site-relative path to share, e.g. /a/jane/my-book */
  path: string;
  title: string;
  /** Ready-to-paste posts; the link is appended automatically */
  posts?: SharePost[];
  /** Block an author can paste into their own newsletter */
  newsletter?: { heading: string; body: string; buttonLabel: string };
  /** Site-relative path of a square image for Instagram and similar */
  squareImagePath?: string;
  heading?: string;
};

function withRef(origin: string, path: string, code: string | null) {
  const url = new URL(path, origin);
  if (code) url.searchParams.set("ref", code);
  return url.toString();
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Full share tools for the author: every link carries their referral code. */
export function ShareKit({ path, title, posts = [], newsletter, squareImagePath, heading = "Share" }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    void fetch("/api/referral")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCode(d?.code || null));
  }, []);

  const url = useMemo(() => (origin ? withRef(origin, path, code) : ""), [origin, path, code]);
  const firstPost = posts[0]?.text || title;

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      setCopied(null);
    }
  }

  async function copyRich(key: string, html: string, plain: string) {
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(html);
      }
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      setCopied(null);
    }
  }

  if (!url) return null;
  const enc = encodeURIComponent;
  const networks = [
    { label: "X", href: `https://twitter.com/intent/tweet?text=${enc(firstPost)}&url=${enc(url)}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { label: "Threads", href: `https://www.threads.net/intent/post?text=${enc(`${firstPost} ${url}`)}` },
    { label: "Bluesky", href: `https://bsky.app/intent/compose?text=${enc(`${firstPost} ${url}`)}` },
    { label: "Reddit", href: `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(title)}` },
    { label: "Email", href: `mailto:?subject=${enc(title)}&body=${enc(`${firstPost}\n\n${url}`)}` },
  ];

  const newsletterHtml = newsletter
    ? `<h2>${escapeHtml(newsletter.heading)}</h2><p>${escapeHtml(newsletter.body)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(newsletter.buttonLabel)}</a></p>`
    : "";
  const newsletterPlain = newsletter
    ? `${newsletter.heading}\n\n${newsletter.body}\n\n${newsletter.buttonLabel}: ${url}`
    : "";

  return (
    <div className="font-ui space-y-4 text-sm">
      <p className="text-[10px] uppercase tracking-wide text-muted">{heading}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="min-w-[14rem] flex-1 border border-line bg-paper px-2 py-1.5 text-xs"
          aria-label="Share link"
        />
        <button type="button" className="bg-accent px-3 py-1.5 text-xs text-paper" onClick={() => void copy("link", url)}>
          {copied === "link" ? "Copied" : "Copy link"}
        </button>
        {canNativeShare && (
          <button
            type="button"
            className="border border-line px-3 py-1.5 text-xs text-accent"
            onClick={() => void navigator.share({ title, text: firstPost, url }).catch(() => null)}
          >
            Share…
          </button>
        )}
      </div>
      {code && (
        <p className="text-xs text-muted">
          This link carries your referral code, so visits and signups from it count toward Studio
          rewards.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {networks.map((n) => (
          <a
            key={n.label}
            href={n.href}
            target="_blank"
            rel="noopener noreferrer"
            className="border border-line px-2.5 py-1 text-xs text-accent hover:border-accent"
          >
            {n.label}
          </a>
        ))}
        {squareImagePath && (
          <a
            href={squareImagePath}
            download
            className="border border-line px-2.5 py-1 text-xs text-accent hover:border-accent"
          >
            Download square image
          </a>
        )}
      </div>

      {posts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted">Ready-to-post text</p>
          {posts.map((p, i) => {
            const full = `${p.text} ${url}`;
            return (
              <div key={p.label} className="border border-line px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted">{p.label}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-ink">{full}</p>
                <button
                  type="button"
                  className="mt-1 text-xs text-accent underline"
                  onClick={() => void copy(`post-${i}`, full)}
                >
                  {copied === `post-${i}` ? "Copied" : "Copy"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {newsletter && (
        <div className="border border-line px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted">For your newsletter</p>
          <p className="mt-1 text-xs text-ink">{newsletter.heading}</p>
          <p className="text-xs text-muted">{newsletter.body}</p>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              className="text-xs text-accent underline"
              onClick={() => void copyRich("nl-html", newsletterHtml, newsletterPlain)}
            >
              {copied === "nl-html" ? "Copied" : "Copy formatted"}
            </button>
            <button
              type="button"
              className="text-xs text-accent underline"
              onClick={() => void copy("nl-plain", newsletterPlain)}
            >
              {copied === "nl-plain" ? "Copied" : "Copy plain text"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Small share button for visitors: native share sheet or copy, no referral code. */
export function VisitorShareButton({ path, title }: { path: string; title: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = new URL(path, window.location.origin).toString();
    if (typeof navigator.share === "function") {
      await navigator.share({ title, url }).catch(() => null);
      return;
    }
    await navigator.clipboard.writeText(url).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <button
      type="button"
      className="font-ui border border-line px-3 py-1 text-xs text-accent"
      onClick={() => void share()}
    >
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
