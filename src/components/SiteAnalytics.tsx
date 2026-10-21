"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { captureFirstTouch, externalReferrerHost, utmFromUrl } from "@/lib/first-touch";

/** First-party page view counter for the admin Metrics tab. No cookies, nothing sent to third parties. */
export function SiteAnalytics() {
  const pathname = usePathname();
  const firstLoad = useRef(true);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin") || pathname.startsWith("/api")) return;
    const isFirst = firstLoad.current;
    firstLoad.current = false;
    if (isFirst) captureFirstTouch();
    void fetch("/api/metrics/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: pathname,
        // Referrer and campaign only describe how someone arrived, so only the first page counts them
        ...(isFirst ? { referrerHost: externalReferrerHost(), ...utmFromUrl() } : {}),
      }),
      keepalive: true,
    }).catch(() => null);
  }, [pathname]);

  return null;
}
