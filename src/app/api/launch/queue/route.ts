import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";
import { dailyEmailCap, processEmailQueue } from "@/lib/email-queue";

export const maxDuration = 60;

/** While an author watches their launch, their open tab sends the next batch every few seconds (within the day's budget). */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await userHasStudio(user.id))) return NextResponse.json({ error: "Studio only" }, { status: 403 });
  const result = await processEmailQueue(createServiceClient(), { timeBudgetMs: 20_000 });
  return NextResponse.json({ ...result, dailyCap: dailyEmailCap() });
}
