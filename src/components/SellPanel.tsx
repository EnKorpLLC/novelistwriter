"use client";

import { useEffect, useState } from "react";
import { DirectSalePanel } from "@/components/DirectSalePanel";

/** The Sell tab: selling this book direct, codes, bundles, and the reader magnet, in one place. */
export function SellPanel({ projectId }: { projectId: string }) {
  const [state, setState] = useState<{ published: boolean; launchPath: string | null } | null>(null);
  useEffect(() => {
    void fetch(`/api/projects/${projectId}/publish`)
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => setState({ published: Boolean(d?.published), launchPath: d?.launchPath || null }))
      .catch(() => setState({ published: false, launchPath: null }));
  }, [projectId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="font-ui mx-auto max-w-3xl space-y-6">
          <div>
            <h2 className="font-display text-2xl">Sell</h2>
            <p className="mt-1 text-sm text-muted">
              Sell this ebook straight from your launch page (or take pre-orders before release), run sales and discount codes, bundle it with your other
              books, sell extras like character art and maps, or give it free to readers who join your list. Store links (Amazon, Kobo, and others) live on
              the{" "}
              <a href={`/project/${projectId}?tab=publish`} className="text-accent underline">
                Launch page
              </a>{" "}
              tab.
            </p>
          </div>
          {state ? <DirectSalePanel projectId={projectId} published={state.published} launchPath={state.launchPath} /> : <p className="text-sm text-muted">Loading…</p>}
        </div>
      </div>
    </div>
  );
}
