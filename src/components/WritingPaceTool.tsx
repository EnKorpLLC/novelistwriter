"use client";

import { useMemo, useState } from "react";
import { clientLocalDay } from "@/lib/local-day";

function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Words a day to hit a date, or the finish date at a daily pace. */
export function WritingPaceTool() {
  const today = useMemo(() => clientLocalDay(), []);
  const [goal, setGoal] = useState("80000");
  const [done, setDone] = useState("0");
  const [deadline, setDeadline] = useState(() => addDays(clientLocalDay(), 90));
  const [daysPerWeek, setDaysPerWeek] = useState("5");
  const [pace, setPace] = useState("1000");

  const left = Math.max(0, Number(goal) - Number(done));
  const calendarDays = Math.max(1, Math.round((Date.parse(`${deadline}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000));
  const writingDays = Math.max(1, Math.floor((calendarDays * Math.min(7, Math.max(1, Number(daysPerWeek)))) / 7));
  const perDay = Math.ceil(left / writingDays);
  const daysNeeded = Number(pace) > 0 ? Math.ceil(left / Number(pace)) : 0;
  const finish = addDays(today, Math.ceil((daysNeeded * 7) / Math.min(7, Math.max(1, Number(daysPerWeek)))));
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const input = "mt-1 block w-full border border-line bg-paper px-3 py-2 text-ink";

  return (
    <div className="font-ui space-y-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-muted">
          Book length goal (words)
          <input type="number" min={1000} step={1000} value={goal} onChange={(e) => setGoal(e.target.value)} className={input} />
        </label>
        <label className="text-xs text-muted">
          Written so far
          <input type="number" min={0} step={500} value={done} onChange={(e) => setDone(e.target.value)} className={input} />
        </label>
        <label className="text-xs text-muted">
          Writing days per week
          <input type="number" min={1} max={7} value={daysPerWeek} onChange={(e) => setDaysPerWeek(e.target.value)} className={input} />
        </label>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="border border-line p-5">
          <h2 className="font-display text-xl">Finish by a date</h2>
          <label className="mt-3 block text-xs text-muted">
            Deadline
            <input type="date" value={deadline} min={addDays(today, 1)} onChange={(e) => setDeadline(e.target.value)} className={input} />
          </label>
          <p className="mt-4 text-3xl text-ink">{perDay.toLocaleString()} words</p>
          <p className="text-sm text-muted">
            per writing day, over {writingDays} writing day{writingDays === 1 ? "" : "s"} to finish {left.toLocaleString()} words.
          </p>
        </section>
        <section className="border border-line p-5">
          <h2 className="font-display text-xl">Finish at your pace</h2>
          <label className="mt-3 block text-xs text-muted">
            Words per writing day
            <input type="number" min={50} step={50} value={pace} onChange={(e) => setPace(e.target.value)} className={input} />
          </label>
          <p className="mt-4 text-3xl text-ink">{left === 0 ? "Done!" : fmt(finish)}</p>
          <p className="text-sm text-muted">
            {daysNeeded} writing day{daysNeeded === 1 ? "" : "s"} at {Number(pace).toLocaleString()} words a day.
          </p>
        </section>
      </div>
    </div>
  );
}
