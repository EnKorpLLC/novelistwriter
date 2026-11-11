"use client";

import { useState } from "react";
import { QUOTE_LIMIT, encodeTrace, watermarkBackground } from "@/lib/copy-guard";

export type ReaderMark = { label: string; code: string };

/**
 * Wraps a beta or advance copy's text: a faint mark with the reader's name behind it, copying limited to a short
 * quote (carrying the reader's hidden code), no right-click menu with a mouse, and nothing to print. Selecting
 * text still works, since comments start from a selection.
 */
export function GuardedText({ mark, children }: { mark: ReaderMark | null | undefined; children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="relative">
      <div
        className="print:hidden"
        style={mark ? { backgroundImage: watermarkBackground(mark.label), backgroundRepeat: "repeat" } : undefined}
        onCopy={(e) => {
          const text = window.getSelection()?.toString() || "";
          e.preventDefault();
          if (text.length > QUOTE_LIMIT) {
            setMsg(`Advance and beta copies can only be copied a short quote at a time (${QUOTE_LIMIT} characters), out of respect for the author.`);
            return;
          }
          e.clipboardData.setData("text/plain", mark ? text + encodeTrace(mark.code) : text);
          setMsg(null);
        }}
        onCut={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => {
          // Phones open the selection menu this way, which readers need to comment
          if (window.matchMedia("(pointer: fine)").matches) e.preventDefault();
        }}
      >
        {children}
      </div>
      <p className="font-ui hidden text-sm print:block">Printing is turned off for advance and beta copies.</p>
      {mark && <p className="font-ui mt-3 text-[11px] text-muted print:hidden">This copy is just for {mark.label}. Please don&apos;t share it.</p>}
      {msg && (
        <p role="status" className="font-ui mt-2 border border-line bg-paper-deep/40 px-3 py-2 text-xs text-muted print:hidden">
          {msg}
        </p>
      )}
    </div>
  );
}
