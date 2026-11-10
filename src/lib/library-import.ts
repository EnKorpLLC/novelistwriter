/** Goodreads and StoryGraph CSV exports, turned into library rows. Pure, so it runs anywhere and is easy to test. */

export type Shelf = "want" | "reading" | "finished" | "dnf";
export type ImportedBook = {
  title: string;
  author: string;
  isbn: string;
  shelf: Shelf;
  rating: number | null;
  finishedOn: string | null;
  customShelves: string[];
};

/** RFC 4180-style CSV: quoted fields, doubled quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const clean = (v: string | undefined) => String(v || "").replace(/^="?|"$/g, "").trim();
const day = (v: string | undefined) => {
  const m = /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(String(v || ""));
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
};

function shelfFrom(status: string): Shelf {
  const s = status.toLowerCase().replace(/[\s_]+/g, "-");
  if (s === "read") return "finished";
  if (s === "currently-reading") return "reading";
  if (s.includes("did-not-finish") || s === "dnf" || s.includes("abandon")) return "dnf";
  return "want";
}

export type ImportSource = "goodreads" | "storygraph";

/** Which app the file came from, from its header row. */
export function detectSource(header: string[]): ImportSource | null {
  const h = header.map((x) => x.trim().toLowerCase());
  if (h.includes("exclusive shelf") || h.includes("my rating")) return "goodreads";
  if (h.includes("read status") || h.includes("star rating")) return "storygraph";
  return null;
}

export function parseLibraryCsv(text: string): { source: ImportSource | null; books: ImportedBook[] } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { source: null, books: [] };
  const header = rows[0].map((x) => x.trim().toLowerCase());
  const source = detectSource(rows[0]);
  if (!source) return { source: null, books: [] };
  const col = (name: string) => header.indexOf(name);
  const get = (r: string[], name: string) => (col(name) >= 0 ? r[col(name)] : "");

  const books = rows.slice(1).map((r): ImportedBook => {
    if (source === "goodreads") {
      const exclusive = clean(get(r, "exclusive shelf"));
      const rating = Number(clean(get(r, "my rating")));
      const shelves = clean(get(r, "bookshelves"))
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x && !["read", "to-read", "currently-reading", exclusive].includes(x));
      return {
        title: clean(get(r, "title")),
        author: clean(get(r, "author")),
        isbn: clean(get(r, "isbn13")) || clean(get(r, "isbn")),
        shelf: shelfFrom(exclusive),
        rating: rating >= 1 && rating <= 5 ? Math.round(rating) : null,
        finishedOn: day(get(r, "date read")),
        customShelves: shelves.slice(0, 10),
      };
    }
    const rating = Number(clean(get(r, "star rating")));
    return {
      title: clean(get(r, "title")),
      author: clean(get(r, "authors")).split(",")[0].trim(),
      isbn: /^\d{10,13}$/.test(clean(get(r, "isbn/uid"))) ? clean(get(r, "isbn/uid")) : "",
      shelf: shelfFrom(clean(get(r, "read status"))),
      rating: rating >= 1 && rating <= 5 ? Math.round(rating) : null,
      finishedOn: day(get(r, "last date read")),
      customShelves: clean(get(r, "tags"))
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 10),
    };
  });
  return { source, books: books.filter((b) => b.title) };
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** A library as CSV, in a shape Goodreads and StoryGraph can import back. */
export function libraryCsv(rows: { title: string; author: string; isbn: string; shelf: Shelf; rating: number | null; finishedOn: string | null; customShelves: string[] }[]) {
  const status: Record<Shelf, string> = { want: "to-read", reading: "currently-reading", finished: "read", dnf: "did-not-finish" };
  const lines = [["Title", "Author", "ISBN", "My Rating", "Exclusive Shelf", "Date Read", "Bookshelves"].join(",")];
  for (const r of rows) {
    lines.push([r.title, r.author, r.isbn, r.rating ?? "", status[r.shelf], r.finishedOn ? r.finishedOn.replace(/-/g, "/") : "", r.customShelves.join(", ")].map(csvCell).join(","));
  }
  return lines.join("\r\n");
}
