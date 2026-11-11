/**
 * A reader's reading preferences: genres they want, genres they don't, and content warnings they'd rather not
 * see. Authors type genres and warnings freely, so each choice carries the words it matches. Client-safe.
 */

export type Choice = { id: string; label: string; terms: string[] };

export const GENRE_CHOICES: Choice[] = [
  { id: "fantasy", label: "Fantasy", terms: ["fantasy"] },
  { id: "romantasy", label: "Romantasy", terms: ["romantasy", "fantasy romance", "romantic fantasy"] },
  { id: "science-fiction", label: "Science fiction", terms: ["science fiction", "sci-fi", "scifi", "sf", "space opera"] },
  { id: "romance", label: "Romance", terms: ["romance", "romantic"] },
  { id: "mystery", label: "Mystery", terms: ["mystery", "mysteries", "whodunit"] },
  { id: "cozy", label: "Cozy mystery", terms: ["cozy", "cosy"] },
  { id: "thriller", label: "Thriller and suspense", terms: ["thriller", "suspense"] },
  { id: "crime", label: "Crime", terms: ["crime", "noir", "detective"] },
  { id: "horror", label: "Horror", terms: ["horror"] },
  { id: "paranormal", label: "Paranormal", terms: ["paranormal", "supernatural", "urban fantasy"] },
  { id: "dystopian", label: "Dystopian and post-apocalyptic", terms: ["dystopian", "dystopia", "post-apocalyptic", "apocalyptic"] },
  { id: "historical", label: "Historical", terms: ["historical"] },
  { id: "literary", label: "Literary fiction", terms: ["literary"] },
  { id: "contemporary", label: "Contemporary", terms: ["contemporary"] },
  { id: "womens", label: "Women's fiction", terms: ["women's fiction", "womens fiction"] },
  { id: "young-adult", label: "Young adult", terms: ["young adult", "ya", "teen"] },
  { id: "middle-grade", label: "Middle grade", terms: ["middle grade", "children's", "childrens"] },
  { id: "litrpg", label: "LitRPG and progression", terms: ["litrpg", "gamelit", "progression fantasy", "cultivation"] },
  { id: "adventure", label: "Action and adventure", terms: ["adventure", "action"] },
  { id: "humor", label: "Humor", terms: ["humor", "humour", "comedy", "comedic"] },
  { id: "western", label: "Western", terms: ["western"] },
  { id: "christian", label: "Christian and inspirational", terms: ["christian", "inspirational"] },
  { id: "erotica", label: "Erotica", terms: ["erotica", "erotic"] },
  { id: "poetry", label: "Poetry", terms: ["poetry", "poems"] },
  { id: "memoir", label: "Memoir", terms: ["memoir", "autobiography"] },
  { id: "nonfiction", label: "Nonfiction", terms: ["nonfiction", "non-fiction"] },
];

export const WARNING_CHOICES: Choice[] = [
  { id: "sexual-content", label: "Sexual content", terms: ["sexual content", "explicit", "spicy", "sex scenes", "open door", "smut", "on-page sex"] },
  { id: "sexual-assault", label: "Sexual assault", terms: ["sexual assault", "rape", "sexual violence", "non-con", "noncon", "dubcon", "dub-con"] },
  { id: "violence", label: "Graphic violence", terms: ["graphic violence", "violence", "violent"] },
  { id: "gore", label: "Gore", terms: ["gore", "gory", "body horror", "graphic injury"] },
  { id: "torture", label: "Torture", terms: ["torture"] },
  { id: "abuse", label: "Abuse", terms: ["abuse", "abusive", "domestic violence"] },
  { id: "child-abuse", label: "Child abuse", terms: ["child abuse", "child sexual abuse", "csa"] },
  { id: "self-harm", label: "Self-harm", terms: ["self-harm", "self harm"] },
  { id: "suicide", label: "Suicide", terms: ["suicide", "suicidal"] },
  { id: "eating-disorders", label: "Eating disorders", terms: ["eating disorder", "eating disorders", "anorexia", "bulimia", "disordered eating"] },
  { id: "drugs", label: "Drug use and addiction", terms: ["drug use", "drugs", "addiction", "overdose", "substance abuse"] },
  { id: "alcohol", label: "Alcohol abuse", terms: ["alcohol abuse", "alcoholism", "alcoholic", "drunk driving"] },
  { id: "child-death", label: "Death of a child", terms: ["death of a child", "child death", "infant death"] },
  { id: "pregnancy-loss", label: "Pregnancy loss", terms: ["miscarriage", "pregnancy loss", "stillbirth", "infertility"] },
  { id: "grief", label: "Grief and death of a loved one", terms: ["grief", "death of a parent", "parental death", "death of a loved one", "death of a spouse"] },
  { id: "animal-harm", label: "Animal harm or death", terms: ["animal death", "animal cruelty", "animal abuse", "pet death", "death of a pet"] },
  { id: "bigotry", label: "Racism and bigotry", terms: ["racism", "racist", "homophobia", "transphobia", "bigotry", "hate crime", "slurs"] },
  { id: "war", label: "War and genocide", terms: ["war", "genocide"] },
  { id: "kidnapping", label: "Kidnapping and captivity", terms: ["kidnapping", "abduction", "captivity"] },
  { id: "illness", label: "Terminal or chronic illness", terms: ["terminal illness", "cancer", "chronic illness"] },
  { id: "mental-illness", label: "Mental illness", terms: ["mental illness", "psychosis", "depression", "anxiety"] },
  { id: "infidelity", label: "Infidelity", terms: ["infidelity", "cheating", "affair"] },
  { id: "profanity", label: "Strong language", terms: ["profanity", "strong language", "swearing", "cursing"] },
];

export type ReadingPrefs = { likeGenres: string[]; avoidGenres: string[]; avoidWarnings: string[] };
export const NO_PREFS: ReadingPrefs = { likeGenres: [], avoidGenres: [], avoidWarnings: [] };

const ids = (raw: unknown, from: Choice[]) => {
  const known = new Set(from.map((c) => c.id));
  return [...new Set((Array.isArray(raw) ? raw : []).map(String).filter((v) => known.has(v)))];
};

export function normalizePrefs(raw: unknown): ReadingPrefs {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const avoidGenres = ids(o.avoidGenres, GENRE_CHOICES);
  return {
    likeGenres: ids(o.likeGenres, GENRE_CHOICES).filter((g) => !avoidGenres.includes(g)),
    avoidGenres,
    avoidWarnings: ids(o.avoidWarnings, WARNING_CHOICES),
  };
}

/** A book's ticked content warnings, as known ids in list order. */
export function normalizeWarningIds(raw: unknown): string[] {
  const picked = new Set((Array.isArray(raw) ? raw : []).map(String));
  return WARNING_CHOICES.filter((c) => picked.has(c.id)).map((c) => c.id);
}

export const warningLabels = (ids: string[]) => WARNING_CHOICES.filter((c) => ids.includes(c.id)).map((c) => c.label);

/** The beta brief's written warnings with the ticked ones listed first, for the warnings box readers see. */
export function withTickedWarnings<T extends { contentWarnings: string }>(form: T, ticked: unknown): T {
  const labels = warningLabels(normalizeWarningIds(ticked));
  if (!labels.length) return form;
  return { ...form, contentWarnings: [labels.join(" · "), form.contentWarnings].filter(Boolean).join("\n\n") };
}

export const hasPrefs = (p: ReadingPrefs) => p.likeGenres.length + p.avoidGenres.length + p.avoidWarnings.length > 0;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (text: string, terms: string[]) => {
  const hay = text.toLowerCase();
  return terms.some((t) => new RegExp(`(^|[^a-z0-9])${escape(t)}([^a-z0-9]|$)`).test(hay));
};
const choose = (list: Choice[], picked: string[]) => list.filter((c) => picked.includes(c.id));

/**
 * Why a book is left out for this reader, or null to show it. `genre` is the book's genre and keywords; `about`
 * is its tropes and written content warnings; `warningIds` are the warnings the author ticked. A book with no
 * genre isn't held back by "genres I want".
 */
export function prefsHide(book: { genre: string; about: string; warningIds?: string[] }, prefs: ReadingPrefs): string | null {
  const genre = book.genre.trim();
  const avoided = choose(GENRE_CHOICES, prefs.avoidGenres).find((c) => mentions(genre, c.terms));
  if (avoided) return `Genre: ${avoided.label}`;
  const wanted = choose(GENRE_CHOICES, prefs.likeGenres);
  if (wanted.length && genre && !/^uncategorized$/i.test(genre) && !wanted.some((c) => mentions(genre, c.terms))) return "Not a genre you picked";
  const warning = choose(WARNING_CHOICES, prefs.avoidWarnings).find((c) => book.warningIds?.includes(c.id) || mentions(book.about, c.terms));
  return warning ? `Content warning: ${warning.label}` : null;
}
