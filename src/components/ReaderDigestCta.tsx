"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** "New books every Thursday" box: one click for signed-in readers, a free signup for everyone else. */
export function ReaderDigestCta() {
  const [state, setState] = useState<"loading" | "guest" | "off" | "on" | "error">("loading");

  useEffect(() => {
    void fetch("/api/profile/settings")
      .then(async (r) => {
        if (r.status === 401) return setState("guest");
        const s = await r.json().catch(() => null);
        setState(s?.readerDigest ? "on" : "off");
      })
      .catch(() => setState("guest"));
  }, []);

  async function turnOn() {
    const res = await fetch("/api/profile/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ readerDigest: true }) });
    setState(res.ok ? "on" : "error");
  }

  if (state === "loading") return null;
  return (
    <div className="font-ui mt-12 flex flex-wrap items-center justify-between gap-4 border border-line bg-paper-deep/40 p-5">
      <div>
        <p className="font-display text-xl text-ink">New books in your inbox every Thursday</p>
        <p className="mt-1 text-sm text-muted">Launches, new releases, free advance copies, and promotions. Every book written by its author, never by AI.</p>
      </div>
      {state === "guest" && (
        <Link href="/beta/signup?next=/books" className="bg-accent px-4 py-2 text-sm text-paper">
          Sign up free
        </Link>
      )}
      {state === "off" && (
        <button type="button" onClick={() => void turnOn()} className="bg-accent px-4 py-2 text-sm text-paper">
          Send me the digest
        </button>
      )}
      {state === "on" && (
        <p className="text-sm text-muted">
          You&apos;re getting it.{" "}
          <Link href="/settings" className="text-accent underline">
            Pick genres
          </Link>
        </p>
      )}
      {state === "error" && <p className="text-sm text-danger">Couldn&apos;t turn it on. Try again from Settings.</p>}
    </div>
  );
}
