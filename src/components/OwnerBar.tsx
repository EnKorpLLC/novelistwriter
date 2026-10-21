"use client";

import Link from "next/link";
import { useState } from "react";
import { ShareKit, type SharePost } from "@/components/ShareKit";

/** Shown only to the page's author: edit, preview as a visitor, and share tools. */
export function OwnerBar({
  label,
  editHref,
  previewHref,
  sharePath,
  title,
  posts,
  newsletter,
  squareImagePath,
}: {
  label: string;
  editHref: string;
  previewHref: string;
  sharePath: string;
  title: string;
  posts?: SharePost[];
  newsletter?: { heading: string; body: string; buttonLabel: string };
  squareImagePath?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="font-ui border-b border-line bg-paper-deep/60 px-6 py-3 text-sm md:px-10">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <span className="text-muted">{label}</span>
        <span className="flex flex-wrap gap-3">
          <Link href={editHref} className="text-accent hover:underline">
            Edit
          </Link>
          <Link href={previewHref} className="text-accent hover:underline">
            Preview as visitor
          </Link>
          <button type="button" className="text-accent hover:underline" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide share tools" : "Share"}
          </button>
        </span>
      </div>
      {open && (
        <div className="mx-auto mt-3 max-w-5xl">
          <ShareKit
            path={sharePath}
            title={title}
            posts={posts}
            newsletter={newsletter}
            squareImagePath={squareImagePath}
          />
        </div>
      )}
    </div>
  );
}

export function PreviewBar({ backHref }: { backHref: string }) {
  return (
    <div className="font-ui border-b border-accent bg-paper-deep/60 px-6 py-2 text-xs md:px-10">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <span className="text-ink">Previewing as a visitor. This is exactly what people see.</span>
        <Link href={backHref} className="text-accent underline">
          Back to your view
        </Link>
      </div>
    </div>
  );
}
