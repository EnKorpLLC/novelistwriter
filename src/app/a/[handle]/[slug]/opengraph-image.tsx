import { bookShareImage } from "@/lib/book-share-image";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Book cover and title";

export default async function Image({ params }: { params: Promise<{ handle: string; slug: string }> }) {
  const { handle, slug } = await params;
  return bookShareImage(handle, slug, size);
}
