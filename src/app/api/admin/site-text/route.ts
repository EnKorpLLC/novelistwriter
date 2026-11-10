import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { SITE_TEXT, SITE_TEXT_BY_KEY, cleanBlock, mergeBlock, type TextBlock } from "@/lib/site-text-registry";

const HINT = "Database needs an update. Run supabase/migration_site_text.sql in the Supabase SQL editor.";

/** Every editable block: its built-in wording, your saved edit (if any), and what the site shows. */
export async function GET() {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { data, error } = await auth.admin.from("site_text").select("key, value, updated_at");
  if (error) return NextResponse.json({ error: /site_text/.test(error.message) ? HINT : error.message }, { status: 500 });
  const saved = new Map((data || []).map((r) => [r.key as string, r]));
  return NextResponse.json({
    blocks: SITE_TEXT.map((e) => {
      const row = saved.get(e.key);
      return {
        key: e.key,
        page: e.page,
        label: e.label,
        fields: e.fields,
        defaults: e.default,
        edited: Boolean(row),
        updatedAt: row?.updated_at || null,
        value: mergeBlock(e, (row?.value as TextBlock) || null),
      };
    }),
  });
}

/** Save a block. Fields left exactly as the built-in wording aren't stored, so later default changes still flow through. */
export async function PUT(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => ({}))) as { key?: string; value?: unknown };
  const entry = SITE_TEXT_BY_KEY.get(String(body.key || ""));
  if (!entry) return NextResponse.json({ error: "Unknown block" }, { status: 400 });
  const clean = cleanBlock(entry, body.value);
  const changed: TextBlock = {};
  for (const f of entry.fields) {
    if (clean[f] === undefined) continue;
    if (JSON.stringify(clean[f]) !== JSON.stringify(entry.default[f])) (changed as Record<string, unknown>)[f] = clean[f];
  }
  const now = new Date().toISOString();
  const { error } = Object.keys(changed).length
    ? await auth.admin.from("site_text").upsert({ key: entry.key, value: changed, updated_by: auth.user.id, updated_at: now })
    : await auth.admin.from("site_text").delete().eq("key", entry.key);
  if (error) return NextResponse.json({ error: /site_text/.test(error.message) ? HINT : error.message }, { status: 500 });
  for (const p of entry.paths) revalidatePath(p);
  return NextResponse.json({ ok: true, edited: Object.keys(changed).length > 0, value: mergeBlock(entry, changed) });
}

/** Put a block back to its built-in wording. */
export async function DELETE(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const entry = SITE_TEXT_BY_KEY.get(new URL(req.url).searchParams.get("key") || "");
  if (!entry) return NextResponse.json({ error: "Unknown block" }, { status: 400 });
  await auth.admin.from("site_text").delete().eq("key", entry.key);
  for (const p of entry.paths) revalidatePath(p);
  return NextResponse.json({ ok: true, value: entry.default });
}
