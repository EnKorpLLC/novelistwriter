import { addDays } from "@/lib/launch-plan";

/** A book as the year-round plan sees it. */
export type PlanBook = {
  id: string;
  title: string;
  genre: string;
  published: boolean;
  releaseDate: string | null;
  seriesKey: string | null;
  seriesName: string;
  seriesNumber: number | null;
};

export type PlanKind = "newsletter" | "backlist" | "anniversary" | "seasonal" | "series" | "deal";
export type PlanCard = "none" | "quote" | "review" | "progress" | "cover";

export type PlanIdea = {
  /** Stable id so an idea added to the calendar is recognized next time */
  key: string;
  day: string;
  kind: PlanKind;
  title: string;
  why: string;
  bookId: string | null;
  card: PlanCard;
  studio: boolean;
  /** Filter for the where-readers-are directory, when the idea pairs with a place to post or promote */
  placesGoal?: PlaceGoal;
};

export type PlaceGoal = "deal" | "launch" | "list" | "reviews" | "everyday";

export const PLAN_KIND_LABEL: Record<PlanKind, string> = {
  newsletter: "Newsletter",
  backlist: "Backlist",
  anniversary: "Anniversary",
  seasonal: "Seasonal",
  series: "Series",
  deal: "Price promotion",
};

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The nth weekday (0 = Sunday) of a month; n = -1 is the last one. */
function nthWeekday(y: number, m: number, weekday: number, n: number) {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return ymd(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay();
  return ymd(y, m, lastDay - ((last - weekday + 7) % 7));
}

type Season = {
  id: string;
  /** When to post: usually a few days before the moment itself */
  day: (y: number) => string;
  title: string;
  why: string;
  /** Matches the book's genre; omitted means every genre */
  genres?: RegExp;
  card: PlanCard;
  studio?: boolean;
  placesGoal?: PlaceGoal;
};

const SEASONS: Season[] = [
  { id: "new-year", day: (y) => ymd(y, 1, 2), title: "New year reading goals", why: "Readers are setting reading goals and filling their lists. A quote card and “add it to your list” does well this week.", card: "quote" },
  { id: "library-lovers", day: (y) => ymd(y, 2, 1), title: "Library Lovers Month", why: "February celebrates libraries. Ask readers to request your book at their library through Libby or their library's website.", card: "cover" },
  { id: "valentines", day: (y) => ymd(y, 2, 7), title: "Valentine's week", why: "Romance readers shop for their next swoon the week before Valentine's Day.", genres: /romance|love|romcom|rom-com/, card: "quote" },
  { id: "world-book-day", day: (y) => ymd(y, 4, 21), title: "World Book Day (April 23)", why: "A day readers celebrate books worldwide. Share what the book means to you, or a favorite line.", card: "quote" },
  { id: "indie-bookstore", day: (y) => addDays(nthWeekday(y, 4, 6, -1), -3), title: "Independent Bookstore Day", why: "Last Saturday of April. Thank your local bookshop, or tell readers which indie stores can order your book.", card: "cover" },
  { id: "summer-reads", day: (y) => ymd(y, 6, 1), title: "Summer reading lists", why: "Readers plan beach and vacation reads in early June. Pitch the book as a summer read.", genres: /romance|thriller|mystery|suspense|fantasy|contemporary|women|beach|romcom/, card: "review" },
  { id: "pride", day: (y) => ymd(y, 6, 1), title: "Pride Month", why: "Readers seek out queer stories in June.", genres: /lgbt|queer|gay|lesbian|trans|sapphic|mm\b|ff\b/, card: "quote" },
  { id: "book-lovers-day", day: (y) => ymd(y, 8, 7), title: "Book Lovers Day (August 9)", why: "A light, shareable reading day. Ask readers what they're reading and share your own line.", card: "quote" },
  { id: "spooky", day: (y) => ymd(y, 10, 1), title: "Spooky season", why: "October readers want chills: horror, thrillers, mysteries, and anything with ghosts or magic.", genres: /horror|thriller|mystery|suspense|paranormal|gothic|fantasy|supernatural|witch|dark/, card: "quote" },
  { id: "writing-month", day: (y) => ymd(y, 11, 1), title: "November writing month", why: "Writers everywhere draft in November. Share verified progress cards as you go; readers love watching a book get made.", card: "progress" },
  { id: "black-friday", day: (y) => addDays(nthWeekday(y, 11, 4, 4), -6), title: "Black Friday and Cyber Monday deals", why: "Deal hunters are out in force. A limited-time discount, announced a week ahead, reaches readers who never pay full price.", card: "cover", studio: true, placesGoal: "deal" },
  { id: "gift-guide", day: (y) => ymd(y, 12, 1), title: "Holiday gift guide", why: "Signed paperbacks and gifted ebooks make easy presents. Tell readers how to gift the book.", card: "cover" },
  { id: "new-ereaders", day: (y) => ymd(y, 12, 26), title: "New e-reader week", why: "Thousands of readers unwrap a new e-reader and go looking for books. A discount or a free first-in-series lands well.", card: "cover", studio: true, placesGoal: "deal" },
];

/** First Tuesday of each month: a good, quiet day for a newsletter. */
function newsletterDays(from: string, to: string) {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  for (let i = 0; i < 14; i++) {
    const d = nthWeekday(y, m, 2, 1);
    if (d >= from && d <= to) out.push(d);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Twelve months of marketing ideas from the author's own books: newsletters, backlist spotlights, release
 * anniversaries, and seasonal reader moments (Pro), plus series read-through pushes and price promotions (Studio).
 * Every idea is a prompt; the author writes the post.
 */
export function buildYearPlan(books: PlanBook[], today: string, months = 12): PlanIdea[] {
  const end = addDays(today, Math.round(months * 30.5));
  const ideas: PlanIdea[] = [];
  const out = books.filter((b) => b.published || (b.releaseDate && b.releaseDate <= today));
  const lead = out[0] || books[0] || null;

  for (const day of newsletterDays(today, end)) {
    ideas.push({
      key: `newsletter:${day.slice(0, 7)}`,
      day,
      kind: "newsletter",
      title: "Monthly newsletter",
      why: "A short, regular letter keeps readers close between books: what you're writing, a line you love, and one link.",
      bookId: null,
      card: "progress",
      studio: false,
      placesGoal: "list",
    });
  }

  // Backlist: one published book each month, rotating, mid-month so it doesn't collide with the newsletter
  if (out.length) {
    const order = [...out].sort((a, b) => (a.releaseDate || "").localeCompare(b.releaseDate || ""));
    let i = 0;
    for (let d = ymd(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 15); d <= end; ) {
      if (d >= today) {
        const b = order[i++ % order.length];
        ideas.push({
          key: `backlist:${b.id}:${d.slice(0, 7)}`,
          day: d,
          kind: "backlist",
          title: `Backlist spotlight: ${b.title}`,
          why: "Readers who found you recently haven't read it yet. Share a favorite line and the buy link.",
          bookId: b.id,
          card: "quote",
          studio: false,
          placesGoal: "everyday",
        });
      }
      const [y, m] = [Number(d.slice(0, 4)), Number(d.slice(5, 7))];
      d = m === 12 ? ymd(y + 1, 1, 15) : ymd(y, m + 1, 15);
    }
  }

  for (const b of out) {
    if (!b.releaseDate) continue;
    for (const y of [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1]) {
      const years = y - Number(b.releaseDate.slice(0, 4));
      const day = `${y}${b.releaseDate.slice(4)}`;
      if (years < 1 || day < today || day > end) continue;
      ideas.push({
        key: `anniversary:${b.id}:${y}`,
        day,
        kind: "anniversary",
        title: `${years === 1 ? "One year" : `${years} years`} since ${b.title} came out`,
        why: "A book birthday is a warm, easy reason to post. Thank readers and share a review.",
        bookId: b.id,
        card: "review",
        studio: false,
      });
    }
  }

  for (const s of SEASONS) {
    const match = s.genres ? books.filter((b) => s.genres!.test(b.genre.toLowerCase())) : lead ? [lead] : [];
    if (!match.length) continue;
    for (const y of [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1]) {
      const day = s.day(y);
      if (day < today || day > end) continue;
      const b = match.find((x) => x.published) || match[0];
      ideas.push({
        key: `season:${s.id}:${y}`,
        day,
        kind: s.studio ? "deal" : "seasonal",
        title: s.title,
        why: s.why,
        bookId: b.id,
        card: s.card,
        studio: Boolean(s.studio),
        placesGoal: s.placesGoal,
      });
    }
  }

  // Series: book one sells the rest. Push it before each new book and every four months
  const series = new Map<string, PlanBook[]>();
  for (const b of books) if (b.seriesKey) series.set(b.seriesKey, [...(series.get(b.seriesKey) || []), b]);
  for (const [key, list] of series) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => (a.seriesNumber ?? 99) - (b.seriesNumber ?? 99) || (a.releaseDate || "").localeCompare(b.releaseDate || ""));
    const first = sorted[0];
    const name = first.seriesName || "your series";
    for (const b of sorted.slice(1)) {
      if (!b.releaseDate || b.releaseDate <= today) continue;
      const day = addDays(b.releaseDate, -14);
      if (day < today || day > end) continue;
      ideas.push({
        key: `series-next:${b.id}`,
        day,
        kind: "series",
        title: `Get readers into ${first.title} before ${b.title}`,
        why: `New readers need book one first. A discount or free week for ${first.title} two weeks out means they finish in time for the new release.`,
        bookId: first.id,
        card: "cover",
        studio: true,
        placesGoal: "deal",
      });
    }
    if (sorted.filter((b) => b.published).length >= 2) {
      for (let d = addDays(today, 21); d <= end; d = addDays(d, 122)) {
        ideas.push({
          key: `series-readthrough:${key}:${d.slice(0, 7)}`,
          day: d,
          kind: "series",
          title: `Series spotlight: ${name}`,
          why: "Remind readers there's a whole series waiting. Post the covers together and say where to start.",
          bookId: first.id,
          card: "cover",
          studio: true,
          placesGoal: "everyday",
        });
      }
    }
  }

  // Price promotions: each published book about once a quarter, staggered, and never within three weeks of another deal
  const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) < 21 * 86_400_000;
  out.forEach((b, i) => {
    for (let d = addDays(today, 30 + i * 21); d <= end; d = addDays(d, 91)) {
      if (ideas.some((x) => x.placesGoal === "deal" && near(x.day, d))) continue;
      ideas.push({
        key: `deal:${b.id}:${d.slice(0, 7)}`,
        day: d,
        kind: "deal",
        title: `Price promotion: ${b.title}`,
        why: "A short discount, booked on a deal newsletter or two, finds readers who'd never pay full price, and lifts the whole backlist.",
        bookId: b.id,
        card: "cover",
        studio: true,
        placesGoal: "deal",
      });
    }
  });

  return ideas.sort((a, b) => a.day.localeCompare(b.day) || Number(a.studio) - Number(b.studio));
}
