import { createServiceClient } from "@/lib/supabase/admin";
import { listLaunchBooks, resolveAuthor } from "@/lib/public-site";
import { imageAsDataUrl, renderShareImage } from "@/lib/og-image";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Author page";

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const admin = createServiceClient();
  const author = await resolveAuthor(admin, handle);
  if (!author) {
    return renderShareImage({ ...size, title: "Novelist Writer", subtitle: "Write it yourself. Prove it.", kicker: "", image: null });
  }
  const books = await listLaunchBooks(admin, author.userId);
  const photo = await imageAsDataUrl(author.avatarUrl);
  const cover = photo ? null : await imageAsDataUrl(books.find((b) => b.coverUrl)?.coverUrl || null);
  return renderShareImage({
    ...size,
    title: author.name,
    subtitle: books.length ? `${books.length} book${books.length === 1 ? "" : "s"} on Novelist Writer` : "Author on Novelist Writer",
    kicker: "Author",
    image: photo || cover,
    round: Boolean(photo),
  });
}
