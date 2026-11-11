"use client";

import { usePathname } from "next/navigation";
import { helpForPath, helpPath } from "@/lib/help-routes";

/** A small Help button on app pages that opens the article for the page you're on. */
export function HelpButton() {
  const slug = helpForPath(usePathname() || "/");
  if (!slug) return null;
  return (
    <a
      href={helpPath(slug)}
      target="_blank"
      rel="noopener"
      className="font-ui fixed bottom-4 left-4 z-40 flex items-center gap-1.5 rounded-full border border-line bg-paper/95 px-3 py-1.5 text-sm text-muted shadow-md backdrop-blur hover:border-accent hover:text-accent print:hidden"
      title="How this page works"
    >
      <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/10 text-xs text-accent">
        ?
      </span>
      Help
    </a>
  );
}
