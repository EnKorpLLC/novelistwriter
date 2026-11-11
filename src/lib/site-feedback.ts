/** "Tell Us What You Think!" feedback types, shared by the dashboard popup, the API, and the admin inbox. */
export const FEEDBACK_KINDS = [
  { id: "bug", label: "Report Bug" },
  { id: "feature_request", label: "Feature Request" },
  { id: "feature_improvement", label: "Feature Improvement" },
  { id: "amazing", label: "This Platform Is Amazing" },
  { id: "other", label: "General/Other" },
] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["id"];

export const feedbackLabel = (id: string | null | undefined) => FEEDBACK_KINDS.find((k) => k.id === id)?.label || null;

export const FEEDBACK_MAX_FILES = 4;
export const FEEDBACK_MAX_BYTES = 5 * 1024 * 1024;
export const FEEDBACK_BUCKET = "site-feedback";
