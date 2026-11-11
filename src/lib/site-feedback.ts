/** "Tell Us What You Think!" feedback types, shared by the dashboard popup, the API, and the admin inbox. */
export const FEEDBACK_KINDS = [
  { id: "bug", label: "Report Bug" },
  { id: "feature_request", label: "Feature Request" },
  { id: "feature_improvement", label: "Feature Improvement" },
  { id: "amazing", label: "This Platform Is Amazing" },
  { id: "other", label: "General/Other" },
] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["id"];

/** What the Contact us form asks about: the feedback types plus a few that are only for contacting us. */
export const CONTACT_REASONS = [
  { id: "question", label: "A question" },
  { id: "account", label: "Help with my account or password" },
  { id: "billing", label: "Billing or payments" },
  { id: "bug", label: "Report Bug" },
  { id: "feature_request", label: "Feature Request" },
  { id: "feature_improvement", label: "Feature Improvement" },
  { id: "amazing", label: "This Platform Is Amazing" },
  { id: "partnership", label: "Partnership or press" },
  { id: "other", label: "General/Other" },
] as const;

/** Every type a message can have, in the order the admin inbox lists them. */
export const MESSAGE_TYPES = [
  { id: "bug", label: "Bug reports" },
  { id: "feature_request", label: "Feature requests" },
  { id: "feature_improvement", label: "Feature improvements" },
  { id: "amazing", label: "Praise" },
  { id: "question", label: "Questions" },
  { id: "account", label: "Account help" },
  { id: "billing", label: "Billing" },
  { id: "partnership", label: "Partnerships" },
  { id: "other", label: "General/Other" },
] as const;

export const isMessageType = (v: unknown): v is (typeof MESSAGE_TYPES)[number]["id"] => MESSAGE_TYPES.some((t) => t.id === v);

/** The label for a message's type (contact form or dashboard feedback), or null for older messages without one. */
export const feedbackLabel = (id: string | null | undefined) => CONTACT_REASONS.find((k) => k.id === id)?.label || null;

export const FEEDBACK_MAX_FILES = 4;
export const FEEDBACK_MAX_BYTES = 5 * 1024 * 1024;
export const FEEDBACK_BUCKET = "site-feedback";
