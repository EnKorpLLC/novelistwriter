import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { TIMEZONE_COOKIE, isValidDayString, resolveWritingDay } from "@/lib/local-day";

/** GET ?day=YYYY-MM-DD — words written for that local calendar day. */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const dayParam = url.searchParams.get("day");
  if (dayParam && !isValidDayString(dayParam)) {
    return NextResponse.json({ error: "Invalid day" }, { status: 400 });
  }

  const jar = await cookies();
  const tzRaw = jar.get(TIMEZONE_COOKIE)?.value;
  const day = resolveWritingDay({
    writingDay: dayParam,
    timeZone: tzRaw ? decodeURIComponent(tzRaw) : null,
  });

  const { data } = await supabase
    .from("writing_days")
    .select("words_written")
    .eq("user_id", user.id)
    .eq("day", day)
    .maybeSingle();

  return NextResponse.json({
    day,
    wordsWritten: data?.words_written ?? 0,
  });
}
