const PAGE = 1000;

/** Supabase returns at most 1,000 rows per request, so read in pages. */
export async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  maxRows = 50000
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error || !data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}
