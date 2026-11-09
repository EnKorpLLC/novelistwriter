import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasPro, userHasStudio } from "@/lib/credits";
import { isValidDayString } from "@/lib/local-day";
import { addDays } from "@/lib/launch-plan";
import { slugify } from "@/lib/handles";
import { CROSS_PROMO_MIGRATION_HINT, isMissingTable } from "@/lib/cross-promo";

/** Group promos you can join, the ones you host, and the ones your books are in. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const [pro, studio, { data: promos, error }, { data: mine }, { data: myProjects }] = await Promise.all([
    userHasPro(user.id),
    userHasStudio(user.id),
    admin.from("group_promos").select("*").eq("status", "open").gte("ends_on", today).order("starts_on").limit(200),
    admin.from("group_promo_books").select("promo_id, project_id, status, price_note").eq("user_id", user.id),
    admin.from("projects").select("id, title").eq("user_id", user.id).order("updated_at", { ascending: false }),
  ]);
  if (error && isMissingTable(error.message)) return NextResponse.json({ pro, studio, migrationNeeded: true });

  const hosted = await admin.from("group_promos").select("*").eq("host_user_id", user.id).order("starts_on", { ascending: false }).limit(50);
  const all = [...(promos || []), ...(hosted.data || [])];
  const ids = [...new Set(all.map((p) => p.id as string))];
  const [{ data: books }, { data: hosts }] = await Promise.all([
    ids.length ? admin.from("group_promo_books").select("promo_id, status").in("promo_id", ids) : Promise.resolve({ data: [] as { promo_id: string; status: string }[] }),
    admin.from("profiles").select("id, display_name").in("id", [...new Set(all.map((p) => p.host_user_id as string))]),
  ]);
  const approved = (id: string) => (books || []).filter((b) => b.promo_id === id && b.status === "approved").length;
  const waiting = (id: string) => (books || []).filter((b) => b.promo_id === id && b.status === "applied").length;
  const hostName = new Map((hosts || []).map((h) => [h.id as string, (h.display_name as string) || "An author"]));
  const shape = (p: Record<string, unknown>) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    genre: p.genre,
    description: p.description,
    startsOn: p.starts_on,
    endsOn: p.ends_on,
    applyBy: p.apply_by,
    maxBooks: p.max_books,
    status: p.status,
    hostName: hostName.get(p.host_user_id as string) || "An author",
    isHost: p.host_user_id === user.id,
    approved: approved(p.id as string),
    waiting: waiting(p.id as string),
    mine: (mine || []).filter((m) => m.promo_id === p.id).map((m) => ({ projectId: m.project_id, status: m.status, priceNote: m.price_note })),
  });

  return NextResponse.json({
    pro,
    studio,
    today,
    myBooks: (myProjects || []).map((p) => ({ id: p.id, title: p.title || "Untitled" })),
    open: (promos || []).filter((p) => p.apply_by >= today && p.host_user_id !== user.id).map(shape),
    hosting: (hosted.data || []).map(shape),
    joined: all.filter((p, i) => all.findIndex((x) => x.id === p.id) === i && (mine || []).some((m) => m.promo_id === p.id && m.status !== "withdrawn")).map(shape),
  });
}

/** Host a group promo (Studio). */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await userHasStudio(user.id))) return NextResponse.json({ error: "Hosting group promos is part of Studio.", code: "studio_required" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = String(body.title || "").trim().slice(0, 100);
  const startsOn = String(body.startsOn || "");
  const endsOn = String(body.endsOn || "");
  const applyBy = String(body.applyBy || "");
  const today = new Date().toISOString().slice(0, 10);
  if (title.length < 4) return NextResponse.json({ error: "Give the promo a title readers will understand." }, { status: 400 });
  if (![startsOn, endsOn, applyBy].every(isValidDayString)) return NextResponse.json({ error: "Pick the dates." }, { status: 400 });
  if (startsOn < today || endsOn < startsOn || addDays(startsOn, 31) < endsOn) return NextResponse.json({ error: "A promo runs between 1 and 31 days, starting today or later." }, { status: 400 });
  if (applyBy > startsOn || applyBy < today) return NextResponse.json({ error: "Applications should close on or before the start day." }, { status: 400 });

  const admin = createServiceClient();
  const slug = `${slugify(title, 48) || "promo"}-${randomBytes(3).toString("hex")}`;
  const { data, error } = await admin
    .from("group_promos")
    .insert({
      host_user_id: user.id,
      slug,
      title,
      genre: String(body.genre || "").slice(0, 60),
      description: String(body.description || "").slice(0, 1000),
      starts_on: startsOn,
      ends_on: endsOn,
      apply_by: applyBy,
      max_books: Math.min(100, Math.max(2, Number(body.maxBooks) || 30)),
    })
    .select("id, slug")
    .single();
  if (error) return NextResponse.json({ error: isMissingTable(error.message) ? CROSS_PROMO_MIGRATION_HINT : error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...data });
}
