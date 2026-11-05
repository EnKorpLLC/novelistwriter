import type { BetaApplicationAnswers, BetaFormField } from "@/lib/beta-form";

export const BETA_PERIOD_ENDED_REASON = "The beta read time period ended.";
export const BETA_CLOSED_REASON = "This book is no longer open for beta reading.";

export type BetaAutoApproveMode = "off" | "all" | "rules";

export type BetaAutoApproveRule = {
  fieldId: string;
  answer: "yes" | "no";
};

export type BetaAutoApproveSettings = {
  mode: BetaAutoApproveMode;
  /** When mode is "rules": "all" = AND, "any" = OR */
  match: "all" | "any";
  rules: BetaAutoApproveRule[];
};

export function normalizeBetaAutoApprove(raw: unknown): BetaAutoApproveSettings {
  if (!raw || typeof raw !== "object") return { mode: "off", match: "all", rules: [] };
  const o = raw as Record<string, unknown>;
  const mode =
    o.mode === "all" || o.mode === "rules" || o.mode === "off" ? o.mode : "off";
  const match = o.match === "any" ? "any" : "all";
  const rules: BetaAutoApproveRule[] = [];
  if (Array.isArray(o.rules)) {
    for (const item of o.rules) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      const fieldId = typeof r.fieldId === "string" ? r.fieldId.trim() : "";
      const answer = r.answer === "yes" || r.answer === "no" ? r.answer : null;
      if (!fieldId || !answer) continue;
      rules.push({ fieldId, answer });
    }
  }
  return { mode, match, rules: rules.slice(0, 20) };
}

export function shouldAutoApprove(
  settings: BetaAutoApproveSettings,
  fields: BetaFormField[],
  answers: BetaApplicationAnswers
): boolean {
  if (settings.mode === "all") return true;
  if (settings.mode !== "rules" || !settings.rules.length) return false;
  const yesNoIds = new Set(fields.filter((f) => f.type === "yesno").map((f) => f.id));

  const ruleMatches = (rule: BetaAutoApproveRule) => {
    if (!yesNoIds.has(rule.fieldId)) return false;
    const ans = (answers[rule.fieldId] || "").toLowerCase();
    return ans === rule.answer;
  };

  if (settings.match === "any") {
    return settings.rules.some(ruleMatches);
  }
  return settings.rules.every(ruleMatches);
}

/**
 * A reader's name for anyone other than the author or an admin: never their email, and never the
 * part before the @ (which signup uses as a default display name).
 */
export function publicReaderName(
  name: string | null | undefined,
  email: string | null | undefined,
  fallback = "Beta reader"
): string {
  const n = String(name || "").trim();
  if (!n || n.includes("@")) return fallback;
  const local = String(email || "").split("@")[0].trim().toLowerCase();
  if (local && n.toLowerCase() === local) return fallback;
  return n;
}

export function sanitizeDisplayName(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
  return text.slice(0, 80);
}

/** Days current readers keep access after the beta read ends, to finish and leave their final review. */
export const BETA_REVIEW_GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export type BetaEndState = "open" | "grace" | "ended";

/** open: before the end date. grace: ended, readers still finishing. ended: access closes. */
export function betaEndState(expiresAt: string | null | undefined, now = new Date()): BetaEndState {
  if (!expiresAt) return "open";
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t) || t > now.getTime()) return "open";
  return now.getTime() < t + BETA_REVIEW_GRACE_DAYS * DAY_MS ? "grace" : "ended";
}

export function betaGraceEndsAt(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const t = new Date(expiresAt).getTime();
  return Number.isNaN(t) ? null : new Date(t + BETA_REVIEW_GRACE_DAYS * DAY_MS).toISOString();
}

/** No new listings or applications once the end date passes (readers may still be in grace). */
export function isBetaClosedToNew(expiresAt: string | null | undefined, now = new Date()): boolean {
  return betaEndState(expiresAt, now) !== "open";
}

/** End dates are saved as the last moment of the chosen day (UTC), so show them in UTC too. */
export function formatBetaEndDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** What readers see about the end date, or null when the author set none. */
export function betaEndLabel(expiresAt: string | null | undefined, now = new Date()): string | null {
  if (!expiresAt) return null;
  const state = betaEndState(expiresAt, now);
  if (state === "open") return `Beta read ends ${formatBetaEndDate(expiresAt)}`;
  if (state === "grace") {
    return `Beta read ended · finish and send your final review by ${formatBetaEndDate(betaGraceEndsAt(expiresAt)!)}`;
  }
  return "Beta read ended";
}

/** Reader access closes: the end date plus the review grace period has passed. */
export function isBetaExpired(expiresAt: string | null | undefined, now = new Date()): boolean {
  return betaEndState(expiresAt, now) === "ended";
}

export type BetaAccessCode =
  | "ok"
  | "pending_review"
  | "backup"
  | "denied"
  | "removed"
  | "unknown"
  | "expired";

export function accessMessageForStatus(
  status: string,
  reason: string | null | undefined
): { code: BetaAccessCode; message: string; reason?: string } {
  if (status === "requested") {
    return {
      code: "pending_review",
      message: "Your application has not been processed yet. Please check back later.",
    };
  }
  if (status === "backup") {
    return {
      code: "backup",
      message:
        "You're on the author's backup list. They'll reach out if a spot opens — you don't have manuscript access yet.",
      reason: reason || undefined,
    };
  }
  if (status === "denied") {
    return {
      code: "denied",
      message: "Your application was denied.",
      reason: reason || undefined,
    };
  }
  if (status === "revoked") {
    return {
      code: "removed",
      message: "Your beta reader access was removed.",
      reason: reason || undefined,
    };
  }
  return {
    code: "unknown",
    message: "This reading link is not available.",
  };
}
