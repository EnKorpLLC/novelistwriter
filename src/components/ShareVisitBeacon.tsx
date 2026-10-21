"use client";

import { useEffect } from "react";

/** Counts an arrival through someone's share link (?ref=). Runs in the browser, so link previews and prefetches don't count. */
export function ShareVisitBeacon() {
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (!ref) return;
    void fetch("/api/share/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref, path: window.location.pathname }),
      keepalive: true,
    }).catch(() => null);
  }, []);
  return null;
}
