import { normalizeTropes } from "@/lib/arc";
import { normalizeBetaApplicationForm } from "@/lib/beta-form";
import { catalogLabelsForProject } from "@/lib/book-keywords";
import { normalizeWarningIds, warningLabels } from "@/lib/reading-prefs";

/** What a reader should know before agreeing to read a book: its genres, tropes, and content warnings. Client-safe. */
export type BookFacts = { genres: string[]; tropes: string[]; warnings: string[]; writtenWarnings: string };

export function bookFactsFor(p: {
  genre?: string | null;
  metadata?: Record<string, unknown> | null;
  tropes?: unknown;
  content_warnings?: unknown;
  beta_application_form?: unknown;
}): BookFacts {
  return {
    genres: catalogLabelsForProject(p).filter((g) => g !== "Uncategorized"),
    tropes: normalizeTropes(p.tropes),
    warnings: warningLabels(normalizeWarningIds(p.content_warnings)),
    writtenWarnings: normalizeBetaApplicationForm(p.beta_application_form).contentWarnings,
  };
}
