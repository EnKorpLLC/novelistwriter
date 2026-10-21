import { bookShareImage } from "@/lib/book-share-image";

/** 1080 square image for Instagram and other square feeds; downloaded from the share kit. */
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string; slug: string }> }) {
  const { handle, slug } = await params;
  const image = await bookShareImage(handle, slug, { width: 1080, height: 1080 });
  image.headers.set("Content-Disposition", `attachment; filename="${slug}-square.png"`);
  return image;
}
