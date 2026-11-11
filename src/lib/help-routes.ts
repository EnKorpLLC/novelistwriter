import type { WorkspaceTab } from "@/lib/workspace-tabs";

/** Which help article each app screen opens. Kept apart from the articles so buttons don't ship their text. */

export const helpPath = (slug: string) => `/help/${slug}`;

/** The article for each tab of a book's workspace. */
export const TAB_HELP: Record<WorkspaceTab, string> = {
  write: "writing-studio",
  bible: "story-bible",
  beta: "beta-readers",
  arc: "advance-copies",
  publish: "launch-page",
  serial: "serial",
  sell: "sell-direct",
  format: "format-ebook",
  cover: "cover-builder",
  audio: "record-audiobook",
  tools: "project-tools",
};

/** Longest prefix wins. Only these app pages get the floating Help button; public pages link to /help in the footer. */
export const PAGE_HELP: [string, string][] = [
  ["/dashboard/sales", "payouts-and-refunds"],
  ["/dashboard/shop", "shop"],
  ["/dashboard/orders", "shop"],
  ["/dashboard/box-sets", "bundles-box-sets"],
  ["/dashboard/audience", "audience"],
  ["/dashboard/marketing", "marketing"],
  ["/dashboard/cross-promo", "cross-promo"],
  ["/dashboard/challenges", "challenges"],
  ["/dashboard/hire", "hire-help"],
  ["/dashboard/profile", "author-site"],
  ["/dashboard/affiliate", "share-and-earn"],
  ["/dashboard/share", "share-and-earn"],
  ["/dashboard", "getting-started-authors"],
  ["/settings", "account-settings"],
  ["/billing", "plans-and-credits"],
  ["/hire/job", "working-with-a-pro"],
  ["/hire/invite", "pro-jobs"],
  ["/beta/dashboard", "getting-started-readers"],
  ["/beta/book", "find-books"],
  ["/beta/apply", "find-books"],
  ["/library", "library"],
  ["/narrator", "getting-started-narrators"],
  ["/narrate", "getting-started-narrators"],
  ["/pro", "getting-started-pros"],
];

/** The help article for an app page, or null where the floating button shouldn't show. */
export function helpForPath(pathname: string): string | null {
  if (pathname.endsWith("/read")) return null;
  let best: [string, string] | null = null;
  for (const entry of PAGE_HELP) {
    const [prefix] = entry;
    if ((pathname === prefix || pathname.startsWith(`${prefix}/`)) && (!best || prefix.length > best[0].length)) best = entry;
  }
  return best ? best[1] : null;
}
