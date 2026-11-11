import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { audiobookFiles, audiobookKey } from "@/lib/audiobook-sales";
import { signedDownloadUrl } from "@/lib/r2";
import { existingTagLength, id3Tag } from "@/lib/audio/id3";

export const maxDuration = 300;

/**
 * One chapter of a bought audiobook, with a tag saying whose copy it is (title, author, book, track, and
 * "This copy belongs to…"). The audio streams from storage behind the tag; any tag already in the file is skipped.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; n: string }> }) {
  const { token, n } = await params;
  if (!/^[\w-]{20,64}$/.test(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createServiceClient();
  const { data: p } = await admin.from("book_purchases").select("*").eq("download_token", token).maybeSingle();
  if (!p || p.format !== "audiobook" || !p.project_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (p.status !== "paid") return NextResponse.json({ error: "This purchase was refunded." }, { status: 410 });
  const files = ((await audiobookFiles(admin, p.project_id)) || []).filter((f) => !f.isSample);
  const i = Number(n) - 1;
  const file = files[i];
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: project } = await admin.from("projects").select("title, user_id").eq("id", p.project_id).maybeSingle();
  const { data: author } = project ? await admin.from("profiles").select("display_name").eq("id", project.user_id).maybeSingle() : { data: null };
  const owner = (p.buyer_name as string) || (p.buyer_email as string);
  const tag = id3Tag({
    title: file.title,
    artist: (author?.display_name as string) || "",
    album: (project?.title as string) || String(p.title).replace(/ \(audiobook\)$/, ""),
    track: i + 1,
    trackCount: files.length,
    comment: `This copy belongs to ${owner}${p.buyer_name && p.buyer_email ? ` (${p.buyer_email})` : ""}. Bought direct from the author on Novelist Writer. Please don't share or resell it.`,
    copyright: author?.display_name ? `© ${new Date(p.created_at as string).getFullYear()} ${author.display_name}` : undefined,
  });

  const url = await signedDownloadUrl(audiobookKey(p.project_id, file.fileName), 600);
  // Skip a tag the file already carries, so the buyer's tag is the only one players read
  const head = await fetch(url, { headers: { Range: "bytes=0-9" } }).then((r) => r.arrayBuffer()).catch(() => null);
  const skip = head ? existingTagLength(new Uint8Array(head)) : 0;
  const audio = await fetch(url, skip ? { headers: { Range: `bytes=${skip}-` } } : undefined);
  if (!audio.ok || !audio.body) return NextResponse.json({ error: "That file isn't available right now. Try again in a moment." }, { status: 502 });
  const length = Number(audio.headers.get("content-length") || 0);

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(tag);
      const reader = audio.body!.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.enqueue(value);
      }
      controller.close();
    },
  });
  await admin.from("book_purchases").update({ downloads: (p.downloads || 0) + 1 }).eq("id", p.id);
  return new Response(body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `attachment; filename="${file.fileName.replace(/"/g, "")}"`,
      ...(length ? { "Content-Length": String(tag.length + length) } : {}),
      "Cache-Control": "private, no-store",
    },
  });
}
