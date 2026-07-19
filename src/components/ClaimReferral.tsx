"use client";

import { useEffect } from "react";

/** Silently attributes a pending referral cookie to the signed-in user. */
export function ClaimReferral() {
  useEffect(() => {
    void fetch("/api/referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {
      /* ignore */
    });
  }, []);
  return null;
}
