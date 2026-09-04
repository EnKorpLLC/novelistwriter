export type BetaFormFieldType = "short" | "long" | "yesno";

export type BetaFormField = {
  id: string;
  label: string;
  type: BetaFormFieldType;
  required?: boolean;
};

export type BetaApplicationAnswers = Record<string, string>;

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
    out.push({
      id,
      label: label.slice(0, 200),
      type,
      required: Boolean(o.required),
    });
  }
  return out.slice(0, 30);
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
      out[field.id] = lower === "yes" || lower === "no" ? lower : "";
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
  return fields
    .filter((f) => f.required && !(answers[f.id] || "").trim())
    .map((f) => f.label);
}

export function newFormFieldId() {
  return `q_${Math.random().toString(36).slice(2, 10)}`;
}
