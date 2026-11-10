"use client";

import { useEffect, useState } from "react";

/** Authors this reader has blocked, with a way to unblock. Hidden when there are none. */
export function BlockedAuthors() {
  const [blocks, setBlocks] = useState<{ authorUserId: string; name: string }[] | null>(null);

  useEffect(() => {
    void fetch("/api/reader/blocks")
      .then((r) => (r.ok ? r.json() : { blocks: [] }))
      .then((d) => setBlocks(d.blocks || []))
      .catch(() => setBlocks([]));
  }, []);

  async function unblock(id: string) {
    await fetch(`/api/reader/blocks?authorUserId=${id}`, { method: "DELETE" });
    setBlocks((b) => (b || []).filter((x) => x.authorUserId !== id));
  }

  if (!blocks?.length) return null;
  return (
    <section className="font-ui mt-12 space-y-3">
      <h2 className="font-display text-2xl">Blocked authors</h2>
      <p className="text-sm text-muted">Their books don&apos;t appear in your catalog, and they can&apos;t invite or message you.</p>
      <ul className="divide-y divide-line border-y border-line text-sm">
        {blocks.map((b) => (
          <li key={b.authorUserId} className="flex items-center justify-between py-2">
            <span>{b.name}</span>
            <button type="button" className="text-xs text-accent underline" onClick={() => void unblock(b.authorUserId)}>
              Unblock
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
