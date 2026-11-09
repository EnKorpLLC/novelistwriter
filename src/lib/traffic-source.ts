/** Turns a visit's campaign tag or referrer into a source a person can read: "Instagram", "Search", "ChatGPT". */

export const AI_SEARCH_HOSTS: [RegExp, string][] = [
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, "ChatGPT"],
  [/(^|\.)perplexity\.ai$/, "Perplexity"],
  [/(^|\.)gemini\.google\.com$|(^|\.)bard\.google\.com$/, "Gemini"],
  [/(^|\.)copilot\.microsoft\.com$/, "Copilot"],
  [/(^|\.)claude\.ai$/, "Claude"],
  [/(^|\.)you\.com$/, "You.com"],
  [/(^|\.)phind\.com$/, "Phind"],
  [/(^|\.)meta\.ai$/, "Meta AI"],
  [/(^|\.)deepseek\.com$/, "DeepSeek"],
];

export function aiSearchTool(host: string | null | undefined): string | null {
  const h = String(host || "").toLowerCase();
  if (!h) return null;
  return AI_SEARCH_HOSTS.find(([re]) => re.test(h))?.[1] || null;
}

const HOSTS: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)facebook\.com$|(^|\.)fb\.me$|(^|\.)fb\.com$/, "Facebook"],
  [/^t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/, "X"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)threads\.net$|(^|\.)threads\.com$/, "Threads"],
  [/(^|\.)bsky\.app$/, "Bluesky"],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, "LinkedIn"],
  [/(^|\.)pinterest\.[a-z.]+$|^pin\.it$/, "Pinterest"],
  [/(^|\.)reddit\.com$/, "Reddit"],
  [/(^|\.)goodreads\.com$/, "Goodreads"],
  [/(^|\.)bookbub\.com$/, "BookBub"],
  [/(^|\.)amazon\.[a-z.]+$/, "Amazon"],
  [/(^|\.)youtube\.com$|^youtu\.be$/, "YouTube"],
  [/^mail\.|(^|\.)outlook\.(live|office)\.com$|(^|\.)mail\.yahoo\.com$|(^|\.)proton\.me$/, "Email"],
  [/(^|\.)google\.[a-z.]+$|(^|\.)bing\.com$|(^|\.)duckduckgo\.com$|(^|\.)search\.yahoo\.com$|(^|\.)ecosia\.org$|(^|\.)search\.brave\.com$/, "Search"],
];

/** Network ids used by tracked links and the posting calendar. */
export const NETWORK_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  x: "X",
  threads: "Threads",
  bluesky: "Bluesky",
  linkedin: "LinkedIn",
  newsletter: "Newsletter",
  email: "Email",
  pinterest: "Pinterest",
  bookbub: "BookBub",
  ads: "Ads",
  any: "Other",
};

export function sourceLabel(v: { utm_source?: string | null; referrer_host?: string | null }): string | null {
  const utm = String(v.utm_source || "").trim().toLowerCase();
  if (utm) return NETWORK_LABEL[utm] || utm.charAt(0).toUpperCase() + utm.slice(1);
  const host = String(v.referrer_host || "").trim().toLowerCase().replace(/^www\./, "");
  if (!host) return null;
  const ai = aiSearchTool(host);
  if (ai) return ai;
  return HOSTS.find(([re]) => re.test(host))?.[1] || host;
}

/** Campaign tag for a calendar post, so the dashboard can say which posts brought readers. */
export function postCampaign(postId: string) {
  return `p-${postId.replace(/-/g, "").slice(0, 10)}`;
}

/** A link that tells the dashboard where the visit came from. */
export function trackedUrl(base: string, source: string, campaign?: string | null) {
  const u = new URL(base);
  u.searchParams.set("utm_source", source || "other");
  u.searchParams.set("utm_medium", source === "newsletter" || source === "email" ? "email" : "social");
  if (campaign) u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}
