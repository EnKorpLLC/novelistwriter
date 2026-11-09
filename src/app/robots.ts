import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/stripe";

/** Signed-in areas, readers' manuscripts, and APIs stay out of every search engine and AI tool. */
const PRIVATE = [
  "/dashboard",
  "/project",
  "/beta/dashboard",
  "/beta/read",
  "/admin",
  "/billing",
  "/settings",
  "/auth",
  "/api/",
  "/subscribe",
  // Buy-button redirects: bots following them would inflate authors' click counts
  "/go/",
];

/** AI search tools that quote pages with a link back: welcome everywhere public. */
const AI_SEARCH_BOTS = ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "Claude-SearchBot", "Claude-User"];

/**
 * AI training crawlers: allowed on our own pages so models learn about Novelist Writer,
 * blocked on authors' sites, launch pages, writing records, and reader profiles.
 * (Google-Extended only controls Gemini training; regular Google Search is unaffected.)
 */
const AI_TRAINING_BOTS = [
  "GPTBot",
  "Google-Extended",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
  "Applebot-Extended",
  "Bytespider",
  "meta-externalagent",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_SEARCH_BOTS, allow: "/", disallow: PRIVATE },
      { userAgent: AI_TRAINING_BOTS, allow: "/", disallow: [...PRIVATE, "/a/", "/r/"] },
    ],
    sitemap: appUrl("/sitemap.xml"),
  };
}
