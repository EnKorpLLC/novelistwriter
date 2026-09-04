export type BetaFormFieldType = "short" | "long" | "yesno";

export type BetaFormFollowUp = {
  enabled: boolean;
  label: string;
  type: "short" | "long";
  required?: boolean;
};

export type BetaFormField = {
  id: string;
  label: string;
  type: BetaFormFieldType;
  required?: boolean;
  /** Shown only when the yes/no parent answer is "yes" */
  followUpYes?: BetaFormFollowUp;
  /** Shown only when the yes/no parent answer is "no" */
  followUpNo?: BetaFormFollowUp;
};

export type BetaApplicationForm = {
  intro: string;
  contentWarnings: string;
  fields: BetaFormField[];
};

export type BetaApplicationAnswers = Record<string, string>;

function normalizeFollowUp(raw: unknown): BetaFormFollowUp | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (!o.enabled) return undefined;
  const label = typeof o.label === "string" ? o.label.trim() : "";
  if (!label) return undefined;
  const type = o.type === "long" ? "long" : "short";
  return {
    enabled: true,
    label: label.slice(0, 200),
    type,
    required: Boolean(o.required),
  };
}

export function normalizeBetaFormFields(raw: unknown): BetaFormField[] {
  if (!Array.isArray(raw)) return [];
  const out: BetaFormField[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : "";
    const label = typeof o.label === "string" ? o.label.trim() : "";
    const type = o.type === "long" || o.type === "yesno" || o.type === "short" ? o.type : "short";
    if (!id || !label) continue;
    const field: BetaFormField = {
      id,
      label: label.slice(0, 200),
      type,
      required: Boolean(o.required),
    };
    if (type === "yesno") {
      const yes = normalizeFollowUp(o.followUpYes);
      const no = normalizeFollowUp(o.followUpNo);
      if (yes) field.followUpYes = yes;
      if (no) field.followUpNo = no;
    }
    out.push(field);
  }
  return out.slice(0, 30);
}

/** Accepts either the new `{ intro, contentWarnings, fields }` shape or a legacy fields array. */
export function normalizeBetaApplicationForm(raw: unknown): BetaApplicationForm {
  if (Array.isArray(raw)) {
    return { intro: "", contentWarnings: "", fields: normalizeBetaFormFields(raw) };
  }
  if (!raw || typeof raw !== "object") {
    return { intro: "", contentWarnings: "", fields: [] };
  }
  const o = raw as Record<string, unknown>;
  return {
    intro: typeof o.intro === "string" ? o.intro.trim().slice(0, 4000) : "",
    contentWarnings:
      typeof o.contentWarnings === "string" ? o.contentWarnings.trim().slice(0, 4000) : "",
    fields: normalizeBetaFormFields(o.fields),
  };
}

function followUpAnswerKey(parentId: string, branch: "yes" | "no") {
  return `${parentId}__fu_${branch}`;
}

export function sanitizeApplicationAnswers(
  fields: BetaFormField[],
  raw: unknown
): BetaApplicationAnswers {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: BetaApplicationAnswers = {};
  for (const field of fields) {
    const v = src[field.id];
    const text = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
    if (field.type === "yesno") {
      const lower = text.toLowerCase();
      const answer = lower === "yes" || lower === "no" ? lower : "";
      out[field.id] = answer;
      const follow =
        answer === "yes" ? field.followUpYes : answer === "no" ? field.followUpNo : undefined;
      if (follow?.enabled) {
        const key = followUpAnswerKey(field.id, answer as "yes" | "no");
        const fv = src[key];
        const ftext = typeof fv === "string" ? fv.trim() : fv == null ? "" : String(fv).trim();
        out[key] = ftext.slice(0, follow.type === "long" ? 4000 : 500);
      }
    } else {
      out[field.id] = text.slice(0, field.type === "long" ? 4000 : 500);
    }
  }
  return out;
}

export function missingRequiredAnswers(
  fields: BetaFormField[],
  answers: BetaApplicationAnswers
): string[] {
  const missing: string[] = [];
  for (const f of fields) {
    if (f.required && !(answers[f.id] || "").trim()) {
      missing.push(f.label);
      continue;
    }
    if (f.type !== "yesno") continue;
    const ans = (answers[f.id] || "").toLowerCase();
    if (ans === "yes" && f.followUpYes?.enabled && f.followUpYes.required) {
      if (!(answers[followUpAnswerKey(f.id, "yes")] || "").trim()) {
        missing.push(f.followUpYes.label);
      }
    }
    if (ans === "no" && f.followUpNo?.enabled && f.followUpNo.required) {
      if (!(answers[followUpAnswerKey(f.id, "no")] || "").trim()) {
        missing.push(f.followUpNo.label);
      }
    }
  }
  return missing;
}

export function applicationAnswerLines(
  form: BetaApplicationForm,
  answers: BetaApplicationAnswers
): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];
  for (const f of form.fields) {
    const v = answers[f.id];
    if (v) lines.push({ label: f.label, value: v });
    if (f.type !== "yesno") continue;
    const ans = (v || "").toLowerCase();
    if (ans === "yes" && f.followUpYes?.enabled) {
      const fv = answers[followUpAnswerKey(f.id, "yes")];
      if (fv) lines.push({ label: f.followUpYes.label, value: fv });
    }
    if (ans === "no" && f.followUpNo?.enabled) {
      const fv = answers[followUpAnswerKey(f.id, "no")];
      if (fv) lines.push({ label: f.followUpNo.label, value: fv });
    }
  }
  return lines;
}

export function newFormFieldId() {
  return `q_${Math.random().toString(36).slice(2, 10)}`;
}

export { followUpAnswerKey };
