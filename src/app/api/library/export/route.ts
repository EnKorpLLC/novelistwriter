import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { libraryCsv } from "@/lib/library-import";
import { loadLibrary } from "@/lib/reader-library";

/** Your whole library as a CSV that Goodreads and StoryGraph can import. Yours, anytime. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const lib = await loadLibrary(createServiceClient(), user.id);
  if ("error" in lib) return NextResponse.json({ error: lib.error }, { status: 500 });
  const csv = libraryCsv(lib.books.map((b) => ({ title: b.title, author: b.author, isbn: b.isbn, shelf: b.shelf, rating: b.rating, finishedOn: b.finishedOn, customShelves: b.customShelves })));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="novelist-writer-library-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
