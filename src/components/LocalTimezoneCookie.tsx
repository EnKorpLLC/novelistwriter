"use client";

import { useEffect } from "react";
import { TIMEZONE_COOKIE, TIMEZONE_COOKIE_MAX_AGE } from "@/lib/local-day";

/** Keeps an IANA timezone cookie so SSR can compute the user's local writing day. */
export function LocalTimezoneCookie() {
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${TIMEZONE_COOKIE}=${encodeURIComponent(tz)}; Path=/; Max-Age=${TIMEZONE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
