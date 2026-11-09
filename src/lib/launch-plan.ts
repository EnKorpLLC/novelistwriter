/** L1: the launch countdown, built from the release date. Client-safe. */

export type LaunchSignals = {
  launchVisible: boolean;
  hasCover: boolean;
  hasBlurb: boolean;
  arcOpened: boolean;
  arcReaders: number;
  arcReviews: number;
  preorderLinks: number;
  buyLinks: number;
  listSize: number;
  published: boolean;
};

export type LaunchPlanState = {
  done: Record<string, string>;
  arcTarget: number;
  /** L6: a sample chapter on the launch page; off until the author turns it on */
  sample: { on: boolean; chapterId: string | null };
  /** L2: when the "We're live" push went out (it only goes once) */
  liveSentAt: string | null;
  liveStats: { emails: number; followers: number; arcReaders: number } | null;
  /** L3: opted in to the "Launching this week" spotlight */
  spotlight: boolean;
};

export function normalizeLaunchPlan(raw: unknown): LaunchPlanState {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const done: Record<string, string> = {};
  if (o.done && typeof o.done === "object") {
    for (const [k, v] of Object.entries(o.done as Record<string, unknown>)) if (typeof v === "string" && LAUNCH_STEPS.some((s) => s.id === k)) done[k] = v;
  }
  const target = Math.round(Number(o.arcTarget));
  const sample = (o.sample && typeof o.sample === "object" ? o.sample : {}) as Record<string, unknown>;
  return {
    done,
    arcTarget: Number.isFinite(target) && target >= 1 && target <= 500 ? target : DEFAULT_ARC_TARGET,
    sample: { on: sample.on === true, chapterId: typeof sample.chapterId === "string" ? sample.chapterId : null },
    liveSentAt: typeof o.liveSentAt === "string" ? o.liveSentAt : null,
    liveStats:
      o.liveStats && typeof o.liveStats === "object"
        ? {
            emails: Number((o.liveStats as Record<string, unknown>).emails) || 0,
            followers: Number((o.liveStats as Record<string, unknown>).followers) || 0,
            arcReaders: Number((o.liveStats as Record<string, unknown>).arcReaders) || 0,
          }
        : null,
    spotlight: o.spotlight === true,
  };
}

type Tab = "publish" | "arc" | "beta" | "format" | "cover";
export type StepAction = { label: string; tab?: Tab; countdown?: number };

export type LaunchStep = {
  id: string;
  offset: number;
  title: string;
  detail: string;
  action?: StepAction;
  /** Ready-to-post copy we wrote; the author edits it before posting */
  template?: string;
  /** Marks the step done on its own when the book already shows it */
  auto?: (s: LaunchSignals) => boolean;
};

export const DEFAULT_ARC_TARGET = 15;

export const LAUNCH_STEPS: LaunchStep[] = [
  {
    id: "cover_reveal",
    offset: -90,
    title: "Cover reveal",
    detail: "Make your launch page live and share the cover. Readers can start following the book from here.",
    action: { label: "Open the share kit", tab: "publish" },
    template: "It's here: the cover for {title}! Coming {date}. Follow along for early chapters and advance copies: {link}",
    auto: (s) => s.launchVisible && s.hasCover,
  },
  {
    id: "open_arcs",
    offset: -60,
    title: "Open advance copies",
    detail: "Open the ARC desk with a read-by date about two weeks before release, so reviews are ready on launch day.",
    action: { label: "Open the ARC desk", tab: "arc" },
    template: "Advance copies of {title} are open. Read it before anyone else and leave an honest review by launch day: {link}",
    auto: (s) => s.arcOpened,
  },
  {
    id: "preorders",
    offset: -45,
    title: "Preorders and release alerts",
    detail: "Add preorder links on the launch page. Readers who join your list hear the moment the book is out.",
    action: { label: "Add preorder links", tab: "publish" },
    template: "{title} is up for preorder! It arrives {date}. Preorder or get a reminder on release day: {link}",
    auto: (s) => s.preorderLinks > 0 || s.published,
  },
  {
    id: "arc_checkin",
    offset: -30,
    title: "ARC check-in",
    detail: "See who's reading and who's stalled in Reader insights. A friendly nudge now saves launch-day gaps.",
    action: { label: "Open Reader insights", tab: "arc" },
  },
  {
    id: "countdown_14",
    offset: -14,
    title: "Two weeks to go",
    detail: "Post a countdown image and send your list a teaser: a favorite line, a character, or the opening.",
    action: { label: "Countdown image", countdown: 14 },
    template: "Two weeks until {title}! Here's a taste of what's coming. Preorder: {link}",
  },
  {
    id: "countdown_7",
    offset: -7,
    title: "One week to go",
    detail: "Another countdown post, and remind ARC readers their review link opens on launch day.",
    action: { label: "Countdown image", countdown: 7 },
    template: "7 days until {title} is out in the world. Have you preordered yet? {link}",
  },
  {
    id: "launch_day",
    offset: 0,
    title: "Launch day",
    detail: "Turn on \"Out now\", add your buy links, and tell everyone. Ask ARC readers to post their reviews today.",
    action: { label: "Go live", tab: "publish" },
    template: "{title} is out today! Thank you for being here. Get your copy: {link}",
    auto: (s) => s.published && s.buyLinks > 0,
  },
  {
    id: "reviews_7",
    offset: 7,
    title: "Ask for reviews",
    detail: "A week in, readers are finishing. Ask for an honest review; it helps other readers find the book.",
    action: { label: "Open the ARC desk", tab: "arc" },
    template: "If you've finished {title}, an honest review helps more than you know. Thank you! {link}",
  },
  {
    id: "momentum_30",
    offset: 30,
    title: "Keep the momentum",
    detail: "Add this book to \"Also by\" in your other books and tell readers what's next.",
    action: { label: "Open Format", tab: "format" },
    template: "A month since {title} came out. Thank you for every read and review! Here's what I'm writing next: {link}",
  },
];

export type StepStatus = "done" | "late" | "now" | "soon" | "later";

export type TimelineStep = LaunchStep & { due: string; status: StepStatus; doneAt: string | null; autoDone: boolean };

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysUntil(day: string, today: string): number {
  return Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
}

/** Each step's due date and status. Moving the release date moves every step; missed steps show as late, never vanish. */
export function buildTimeline(releaseDate: string, today: string, state: LaunchPlanState, signals: LaunchSignals): TimelineStep[] {
  return LAUNCH_STEPS.map((s) => {
    const due = addDays(releaseDate, s.offset);
    const autoDone = Boolean(s.auto?.(signals));
    const doneAt = state.done[s.id] || null;
    const left = daysUntil(due, today);
    const status: StepStatus = doneAt || autoDone ? "done" : left < 0 ? "late" : left <= 3 ? "now" : left <= 14 ? "soon" : "later";
    return { ...s, due, status, doneAt, autoDone };
  });
}

export type ReadinessItem = { label: string; ok: boolean; detail?: string };

export function readiness(signals: LaunchSignals, state: LaunchPlanState): { items: ReadinessItem[]; score: number } {
  const target = state.arcTarget || DEFAULT_ARC_TARGET;
  const items: ReadinessItem[] = [
    { label: "Launch page live", ok: signals.launchVisible },
    { label: "Cover uploaded", ok: signals.hasCover },
    { label: "Book description written", ok: signals.hasBlurb },
    { label: "ARC readers committed", ok: signals.arcReaders >= target, detail: `${signals.arcReaders} of ${target}` },
    { label: "ARC reviews posted", ok: signals.arcReviews >= Math.ceil(target / 2), detail: `${signals.arcReviews} so far` },
    { label: "Preorder or buy links", ok: signals.preorderLinks + signals.buyLinks > 0 },
    { label: "Readers on your list", ok: signals.listSize >= 25, detail: `${signals.listSize}` },
  ];
  return { items, score: Math.round((items.filter((i) => i.ok).length / items.length) * 100) };
}

export function fillTemplate(text: string, v: { title: string; date: string; link: string }) {
  return text.replace(/\{title\}/g, v.title).replace(/\{date\}/g, v.date).replace(/\{link\}/g, v.link);
}
