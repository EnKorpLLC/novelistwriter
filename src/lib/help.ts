import { HELP_ARTICLES, type HelpArticle } from "@/lib/help-articles";

export { HELP_ARTICLES, HELP_AUDIENCES, type HelpArticle, type HelpAudience } from "@/lib/help-articles";
export { PAGE_HELP, TAB_HELP, helpForPath, helpPath } from "@/lib/help-routes";

export const HELP_BY_SLUG = new Map<string, HelpArticle>(HELP_ARTICLES.map((a) => [a.slug, a]));
