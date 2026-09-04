import type { BetaApplicationAnswers, BetaFormField } from "@/lib/beta-form";

export const BETA_PERIOD_ENDED_REASON = "The beta read time period ended.";

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

export function sanitizeDisplayName(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
  return text.slice(0, 80);
}

export function isBetaExpired(expiresAt: string | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return false;
  return t <= now.getTime();
}

export type BetaAccessCode =
  | "ok"
  | "pending_review"
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
