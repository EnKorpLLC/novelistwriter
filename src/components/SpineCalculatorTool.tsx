"use client";

import { useMemo, useState } from "react";
import { TRIM_SIZES, type Paper, type Printer, type TrimSize } from "@/lib/book/format";
import { coverWrap } from "@/lib/book/cover-math";
import { WrapDiagram } from "@/components/CoverPanel";

/** The public spine and cover size calculator, using the same math as the Cover tab. */
export function SpineCalculatorTool() {
  const [pages, setPages] = useState("300");
  const [trim, setTrim] = useState<TrimSize>("6x9");
  const [paper, setPaper] = useState<Paper>("cream");
  const [printer, setPrinter] = useState<Printer>("kdp");
  const n = Number(pages);
  const wrap = useMemo(() => (n > 0 ? coverWrap({ trim, pages: n, paper, printer }) : null), [n, trim, paper, printer]);
  const input = "mt-1 block w-full border border-line bg-paper px-3 py-2 text-ink";

  return (
    <div className="font-ui">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-xs text-muted">
          Page count
          <input type="number" min={1} max={1000} value={pages} onChange={(e) => setPages(e.target.value)} className={input} />
        </label>
        <label className="text-xs text-muted">
          Trim size
          <select value={trim} onChange={(e) => setTrim(e.target.value as TrimSize)} className={input}>
            {TRIM_SIZES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Paper
          <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)} className={input}>
            <option value="cream">Cream</option>
            <option value="white">White</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Printer
          <select value={printer} onChange={(e) => setPrinter(e.target.value as Printer)} className={input}>
            <option value="kdp">Amazon KDP</option>
            <option value="ingram">IngramSpark</option>
          </select>
        </label>
      </div>
      {wrap && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <WrapDiagram wrap={wrap} />
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Spine width</dt>
              <dd className="text-2xl text-ink">{wrap.spine}&quot;</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Full cover with bleed</dt>
              <dd className="text-lg text-ink">
                {wrap.width}&quot; × {wrap.height}&quot;
              </dd>
              <dd className="text-xs text-muted">
                {Math.round(wrap.width * 300)} × {Math.round(wrap.height * 300)} px at 300 DPI
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Spine text</dt>
              <dd className="text-ink">{wrap.spineText ? "Allowed" : "Leave the spine blank"}</dd>
            </div>
            {wrap.warnings.map((w) => (
              <p key={w} className="text-xs text-danger">
                {w}
              </p>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
