"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

const MENUS: { label: string; items: { href: string; label: string; hint: string }[] }[] = [
  {
    label: "Grow",
    items: [
      { href: "/dashboard/audience", label: "Audience", hint: "Your email list, beta and ARC readers" },
      { href: "/dashboard/marketing", label: "Marketing", hint: "Posts, calendar, your marketing year, results" },
      { href: "/dashboard/cross-promo", label: "Swaps and promos", hint: "Newsletter swaps and group promos" },
      { href: "/dashboard/challenges", label: "Challenges", hint: "Verified writing challenges" },
      { href: "/dashboard/hire", label: "Hire help", hint: "Editors, proofreaders, cover designers, artists" },
    ],
  },
  {
    label: "Sell",
    items: [
      { href: "/dashboard/sales", label: "Sales", hint: "Direct sales and payouts across all your books" },
      { href: "/dashboard/shop", label: "Shop", hint: "Signed books, bookmarks, and prints you ship" },
      { href: "/dashboard/orders", label: "Orders to ship", hint: "Packing slips and tracking for shop orders" },
      { href: "/dashboard/box-sets", label: "Box sets", hint: "Bundle books into one ebook or paperback" },
      { href: "/dashboard/affiliate", label: "Affiliate program", hint: "Earn cash for referrals" },
      { href: "/dashboard/share", label: "Share and earn", hint: "Free Studio days from your links" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/dashboard/profile", label: "Public profile", hint: "Author site, bio, and links" },
      { href: "/billing", label: "Billing", hint: "Plan, credits, and invoices" },
      { href: "/settings", label: "Settings", hint: "Email, AI, and preferences" },
      { href: "/help", label: "Help", hint: "How every feature works, step by step" },
    ],
  },
];

/** The author dashboard's header links, grouped so the header stays short on every screen. */
export function DashboardMenus({ admin }: { admin?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // One menu open at a time; a click elsewhere or Escape closes it
  useEffect(() => {
    const close = (except?: Element | null) =>
      ref.current?.querySelectorAll("details[open]").forEach((d) => {
        if (d !== except) d.removeAttribute("open");
      });
    const onClick = (e: MouseEvent) => {
      const inside = (e.target as Element)?.closest?.("details");
      if (!ref.current?.contains(e.target as Node)) close();
      else close(inside);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    // On phones the open menu spans the whole row, so it never runs off the screen edge
    <div ref={ref} className="relative flex flex-wrap items-center gap-1">
      {MENUS.map((m) => (
        <details key={m.label} className="sm:relative">
          <summary className="flex cursor-pointer list-none items-center gap-1 px-2 py-1 text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
            {m.label} <span aria-hidden="true" className="text-[10px]">▾</span>
          </summary>
          <ul className="absolute inset-x-0 top-full z-40 mt-1 border border-line bg-paper p-1 shadow-lg sm:inset-x-auto sm:right-0 sm:top-auto sm:w-64">
            {m.items.map((i) => (
              <li key={i.href}>
                <Link href={i.href} className="block px-3 py-2 hover:bg-paper-deep">
                  <span className="block text-ink">{i.label}</span>
                  <span className="block text-xs text-muted">{i.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ))}
      {admin && (
        <Link href="/admin" className="px-2 py-1 text-accent hover:underline">
          Admin
        </Link>
      )}
    </div>
  );
}
