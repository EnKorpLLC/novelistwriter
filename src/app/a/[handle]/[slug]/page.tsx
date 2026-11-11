import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getLaunchBook, resolveAuthor } from "@/lib/public-site";
import { readerTrustForBooks, trustBadgesForBook } from "@/lib/trust-badges";
import { userHasStudio } from "@/lib/credits";
import { authorPath, bookPath } from "@/lib/handles";
import { normalizeWarningIds, warningLabels } from "@/lib/reading-prefs";
import { themeStyle } from "@/lib/site-themes";
import { PublicHeader } from "@/components/PublicHeader";
import { AuthorLinks } from "@/components/AuthorConnect";
import { RecordSummaryLine, TrustBadges } from "@/components/TrustBadges";
import { ReportConcern } from "@/components/ReportConcern";
import { LibraryButton } from "@/components/LibraryButton";
import { BuyDirectButton } from "@/components/BuyDirectButton";
import { buyerCountryAllowed, bundlesForBook, saleReadiness, sellerStatus } from "@/lib/direct-sales";
import { BuyBundleButton } from "@/components/BuyBundleButton";
import { audiobookBadges, audiobookReadiness, signedFiles } from "@/lib/audiobook-sales";
import { currentPrice, longDay, normalizeDirectSale } from "@/lib/direct-sale-rules";
import { listExtras } from "@/lib/digital-extras";
import { paperbackReadiness } from "@/lib/print-sales";
import { BuyPaperbackButton } from "@/components/BuyPaperbackButton";
import { itemsForBook } from "@/lib/shop";
import { reviewsFor } from "@/lib/book-reviews";
import { BookReviews } from "@/components/BookReviews";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { BuyItemButton } from "@/components/BuyItemButton";
import { MagnetForm } from "@/components/MagnetForm";
import { GuestListSignup } from "@/components/GuestListSignup";
import { LaunchTeamCard } from "@/components/LaunchTeamCard";
import { thanksReaders } from "@/lib/author-thanks";
import { PublicFooter } from "@/components/PublicFooter";
import { OwnerBar, PreviewBar, SitePrivateBar } from "@/components/OwnerBar";
import { SiteHolding } from "@/components/SiteHolding";
import { JsonLd } from "@/components/JsonLd";
import { bookJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { VisitorShareButton } from "@/components/ShareKit";
import { ShareVisitBeacon } from "@/components/ShareVisitBeacon";
import { RecordBadge } from "@/components/WritingRecordView";
import { computeWritingRecord } from "@/lib/writing-record";
import { normalizeDetails } from "@/lib/book/format";
import { normalizeLaunchPlan } from "@/lib/launch-plan";

export const dynamic = "force-dynamic";

type Params = { handle: string; slug: string };

function longDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { handle, slug } = await params;
  const admin = createServiceClient();
  const author = await resolveAuthor(admin, handle);
  const book = author ? await getLaunchBook(admin, author.userId, slug) : null;
  if (!author || !book) return { title: "Book not found" };
  if (!author.sitePublic) return { title: "Novelist Writer", robots: { index: false } };
  const title = `${book.title} by ${author.name}`;
  const description = (book.tagline || book.blurb).slice(0, 200) || `A novel by ${author.name}.`;
  return {
    title,
    description,
    alternates: { canonical: bookPath(author.handle, book.slug) },
    openGraph: { title, description, type: "book" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function LaunchPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { handle, slug } = await params;
  const { preview } = await searchParams;
  const admin = createServiceClient();
  const author = await resolveAuthor(admin, handle);
  if (!author) notFound();
  const book = await getLaunchBook(admin, author.userId, slug);
  if (!book) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = user?.id === author.userId;
  const previewing = isOwner && preview === "visitor";
  if (!author.sitePublic && (!isOwner || previewing)) {
    return (
      <SiteHolding
        authorName={author.name}
        previewBackHref={previewing ? bookPath(author.handle, book.slug) : null}
      />
    );
  }
  const [trust, studio, { data: recordFlag }, thanks, readerTrust] = await Promise.all([
    trustBadgesForBook(admin, author.userId, book.id),
    userHasStudio(author.userId),
    admin.from("projects").select("*").eq("id", book.id).maybeSingle(),
    thanksReaders(admin, author.userId),
    readerTrustForBooks(admin, [{ id: book.id, user_id: author.userId }]).then((m) => m.get(book.id) || null).catch(() => null),
  ]);
  const path = bookPath(author.handle, book.slug);
  const recordPublic = Boolean(recordFlag?.record_public);
  const isbn = normalizeDetails(recordFlag?.book_details).isbnEbook || null;
  const sampleOn = studio && normalizeLaunchPlan(recordFlag?.launch_plan).sample.on;
  const record = recordPublic ? await computeWritingRecord(admin, book.id) : null;
  // Selling direct: once it's out (or open for pre-orders), set up, and for US visitors (others see the store links)
  const saleReady = recordFlag ? await saleReadiness(admin, recordFlag, { preorder: true }).catch(() => null) : null;
  const direct = saleReady?.ok
    ? { price: currentPrice(saleReady.sale), canBuy: await buyerCountryAllowed(), preorderRelease: saleReady.preorder ? String(recordFlag?.release_date || "").slice(0, 10) : null }
    : null;
  // Reader reviews: buyers here, plus advance and beta readers who chose to show theirs
  const [reviewData, viewerIsAdmin] = await Promise.all([reviewsFor(admin, book.id, user?.id).catch(() => null), user ? isPlatformAdmin(supabase, user).catch(() => false) : Promise.resolve(false)]);
  // The paperback, printed and shipped by Lulu for each order
  const paperbackReady = recordFlag && book.stage === "published" ? await paperbackReadiness(admin, recordFlag).catch(() => null) : null;
  const paperback = paperbackReady?.ok ? { priceCents: paperbackReady.edition.price_cents, freeEbook: paperbackReady.edition.free_ebook, canBuy: direct?.canBuy ?? (await buyerCountryAllowed()) } : null;
  // The author's shop: signed copies of this book and their general merchandise, shipped by the author
  const shop = recordFlag ? await itemsForBook(admin, author.userId, book.id).catch(() => null) : null;
  const shopItems = shop?.items || [];
  const shopCanBuy = shopItems.length ? (direct?.canBuy ?? (await buyerCountryAllowed())) : false;
  // Extras: art, maps, and bonus writing, sold on their own or free with the ebook bought here
  const extras = recordFlag ? ((await listExtras(admin, book.id).catch(() => null)) || []).filter((e) => e.active && e.files.length) : [];
  const sellerReady = extras.length ? await sellerStatus(admin, author.userId).catch(() => null) : null;
  const canSellExtras = Boolean(sellerReady && !("migrationNeeded" in sellerReady) && sellerReady.tier && sellerReady.termsAccepted && sellerReady.payoutsEnabled);
  const shownExtras = extras.filter((e) => (e.priceCents != null && canSellExtras) || (e.withEbook && direct));
  const extrasCanBuy = shownExtras.length ? (direct?.canBuy ?? (await buyerCountryAllowed())) : false;
  // The audiobook, and the ebook + audiobook set, sold the same way
  const audioReady = recordFlag && book.stage === "published" ? await audiobookReadiness(admin, recordFlag).catch(() => null) : null;
  const audioBadge = audioReady?.ok && recordFlag ? (await audiobookBadges(admin, [recordFlag]).catch(() => new Map())).get(book.id) : null;
  const audio = audioReady?.ok
    ? {
        recordedHere: Boolean(audioBadge?.recordedHere),
        priceCents: audioReady.sale.priceCents,
        bundleCents: direct ? audioReady.bundleCents : null,
        hours: (audioReady.durationMs / 3_600_000).toFixed(1),
        humanNarrated: audioReady.sale.humanNarrated,
        canBuy: direct?.canBuy ?? (await buyerCountryAllowed()),
        sampleUrl: audioReady.sample ? (await signedFiles([audioReady.sample], book.id))[0].url : null,
      }
    : null;
  // Reader magnet (Studio): free for joining the list; also before release, for prequels and novellas
  const magnet = studio && recordFlag && normalizeDirectSale(recordFlag.direct_sale).magnet;
  const bundles = book.stage === "published" ? await bundlesForBook(admin, book.id).catch(() => []) : [];
  const canBuyHere = direct?.canBuy ?? (bundles.length ? await buyerCountryAllowed() : false);
  // The first store is the main button unless buying direct is; the rest go in a quieter line
  const storeLinks = book.published ? book.buyLinks : book.preorderLinks;
  const directIsMain = Boolean(direct && !isOwner && direct.canBuy && book.published);
  const mainStore = directIsMain ? null : storeLinks[0] || null;
  const otherStores = directIsMain ? storeLinks : storeLinks.slice(1);

  const stageLine =
    book.stage === "published"
      ? "Out now"
      : book.stage === "arc"
        ? "Advance copies available"
        : book.stage === "beta"
          ? "Looking for beta readers"
          : book.releaseDate
            ? `Coming ${longDate(book.releaseDate)}`
            : "Coming soon";

  const posts =
    book.stage === "published"
      ? [
          { label: "Release", text: `${book.title} is out now!` },
          { label: "Short", text: `New book: ${book.title}.` },
        ]
      : book.stage === "arc"
        ? [{ label: "ARC call", text: `Advance copies of ${book.title} are open. Read it free before release.` }]
        : book.stage === "beta"
          ? [{ label: "Beta call", text: `I'm looking for beta readers for ${book.title}.` }]
          : [
              {
                label: "Cover reveal",
                text: `${book.title}${book.releaseDate ? `, coming ${longDate(book.releaseDate)}` : ", coming soon"}.`,
              },
            ];

  return (
    <div className="min-h-screen" style={themeStyle(author.theme)}>
      <ShareVisitBeacon />
      <PublicHeader />
      {author.sitePublic && (
        <JsonLd
          data={[
            bookJsonLd({
              title: book.title,
              authorName: author.name,
              authorPath: authorPath(author.handle),
              path,
              description: book.tagline || book.blurb,
              coverUrl: book.coverUrl,
              genre: book.genre,
              releaseDate: book.releaseDate,
              isbn,
              buyLinks: book.stage === "published" ? book.buyLinks : book.preorderLinks,
              published: book.stage === "published",
              rating: reviewData?.count && reviewData.avg != null ? { avg: reviewData.avg, count: reviewData.count } : null,
            }),
            breadcrumbJsonLd([
              { name: author.name, path: authorPath(author.handle) },
              { name: book.title, path },
            ]),
          ]}
        />
      )}
      {isOwner && !author.sitePublic && <SitePrivateBar previewHref={`${path}?preview=visitor`} />}
      {isOwner && author.sitePublic && !previewing && (
        <OwnerBar
          label="This is your book's launch page."
          editHref={`/project/${book.id}?tab=publish`}
          previewHref={`${path}?preview=visitor`}
          sharePath={path}
          title={`${book.title} by ${author.name}`}
          posts={posts}
          newsletter={{
            heading: book.title,
            body: book.tagline || book.blurb.slice(0, 280) || stageLine,
            buttonLabel: book.stage === "published" ? "Get the book" : "See the book",
          }}
          squareImagePath={`${path}/square`}
        />
      )}
      {previewing && <PreviewBar backHref={path} />}

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="grid gap-8 md:grid-cols-[15rem_1fr]">
          <div className="aspect-[2/3] w-60 max-w-full overflow-hidden border border-line bg-paper-deep">
            {book.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={book.coverUrl} alt={`Cover of ${book.title}`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-center font-display text-xl text-muted">
                {book.title}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-ui text-xs uppercase tracking-wide text-accent">{stageLine}</p>
            <h1 className="font-display mt-2 text-4xl leading-tight">{book.title}</h1>
            {book.tagline && <p className="mt-2 text-lg text-muted">{book.tagline}</p>}
            <p className="font-ui mt-3 text-sm text-muted">
              by{" "}
              <Link href={authorPath(author.handle)} className="text-ink hover:text-accent">
                {author.name}
              </Link>{" "}
              · {book.genre}
            </p>
            {record && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <RecordBadge badge={record.badge} href={`${path}/record`} />
                <Link href={`${path}/record`} className="font-ui text-xs text-accent underline">
                  See how it was written
                </Link>
              </div>
            )}
            {!isOwner && <LibraryButton projectId={book.id} className="mt-3" />}
            <TrustBadges {...trust} pace={readerTrust?.trust.pace} className="mt-3" />
            <RecordSummaryLine record={readerTrust?.record} className="mt-2" />
            {thanks && (
              <p className="font-ui mt-2 inline-block border border-line px-2 py-0.5 text-xs text-muted" title="This author regularly thanks their beta, ARC, and launch team readers">
                Thanks readers
              </p>
            )}

            {book.tropes.length > 0 && (
              <ul className="font-ui mt-4 flex flex-wrap gap-2 text-xs">
                {book.tropes.map((t) => (
                  <li key={t} className="border border-line px-2 py-0.5 text-ink">
                    {t}
                  </li>
                ))}
              </ul>
            )}

            {warningLabels(normalizeWarningIds(recordFlag?.content_warnings)).length > 0 && (
              <details className="font-ui mt-3 text-xs">
                <summary className="cursor-pointer text-muted">Content warnings</summary>
                <p className="mt-1 text-ink">{warningLabels(normalizeWarningIds(recordFlag?.content_warnings)).join(" · ")}</p>
              </details>
            )}

            {/* One main action for the book's stage; everything else is quieter, so readers know where to start */}
            <div className="font-ui mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap [&>*]:text-center">
              {direct && !isOwner && (
                <BuyDirectButton
                  projectId={book.id}
                  price={direct.price}
                  canBuy={direct.canBuy}
                  {...(direct.preorderRelease
                    ? { label: "Pre-order the ebook", note: `Delivered ${longDay(direct.preorderRelease)} · cancel anytime before`, quiet: Boolean(mainStore) }
                    : shownExtras.some((e) => e.withEbook)
                      ? { note: "Direct from the author · EPUB for any e-reader · extras included" }
                      : {})}
                />
              )}
              {paperback && !isOwner && (
                <BuyPaperbackButton projectId={book.id} priceCents={paperback.priceCents} freeEbook={paperback.freeEbook} canBuy={paperback.canBuy} quiet={Boolean(direct)} />
              )}
              {audio && !isOwner && (
                <BuyDirectButton
                  projectId={book.id}
                  format="audiobook"
                  quiet={Boolean(direct)}
                  label="Buy the audiobook"
                  note={`${audio.hours} hours${audio.recordedHere ? " · Recorded in Novelist Writer" : audio.humanNarrated ? " · human narrated" : ""} · MP3, yours to keep`}
                  price={{ cents: audio.priceCents, regularCents: null }}
                  canBuy={audio.canBuy}
                />
              )}
              {audio?.bundleCents != null && direct && !isOwner && (
                <BuyDirectButton
                  projectId={book.id}
                  format="both"
                  quiet
                  label="Ebook + audiobook"
                  note="Read and listen, two real copies"
                  price={{ cents: audio.bundleCents, regularCents: direct.price.cents + audio.priceCents }}
                  canBuy={audio.canBuy}
                />
              )}
              {audio?.sampleUrl && (
                <span className="w-full text-left text-xs text-muted">
                  Listen to a sample{audio.humanNarrated ? " (human narrated)" : ""}:
                  <audio controls preload="none" src={audio.sampleUrl} className="mt-1 w-full max-w-md" />
                </span>
              )}
              {book.stage === "published" && !(direct && !isOwner && direct.canBuy) && mainStore && (
                <a href={`/go/${book.id}?s=${encodeURIComponent(mainStore.label)}`} target="_blank" rel="noopener noreferrer" className="bg-accent px-5 py-2.5 text-sm text-paper hover:bg-accent-soft">
                  Buy on {mainStore.label}
                </a>
              )}
              {!book.published && mainStore && (
                <a href={`/go/${book.id}?s=${encodeURIComponent(mainStore.label)}`} target="_blank" rel="noopener noreferrer" className="bg-accent px-5 py-2.5 text-sm text-paper hover:bg-accent-soft">
                  Preorder on {mainStore.label}
                </a>
              )}
              {book.arcOpen && !book.published && (
                <Link href={`/arc/book/${book.id}`} className="bg-ink px-5 py-2.5 text-sm text-paper">
                  Request an advance copy
                  {book.arcDeadline
                    ? ` · read by ${new Date(book.arcDeadline).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
                    : ""}
                </Link>
              )}
              {book.betaOpen && !book.published && (
                <Link href={`/beta/book/${book.id}`} className="border border-ink/30 px-5 py-2.5 text-sm text-ink">
                  Apply to beta read
                </Link>
              )}
            </div>
            {!isOwner && canBuyHere && bundles.length > 0 && (
              <div className="font-ui mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {bundles.map((b) => (
                  <BuyBundleButton key={b.id} bundle={b} fromProjectId={book.id} />
                ))}
              </div>
            )}
            {(otherStores.length > 0 || sampleOn || book.readLinks.length > 0 || !isOwner || previewing) && (
              <div className="font-ui mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                {otherStores.length > 0 && (
                  <span>
                    {book.published ? (mainStore && !(direct && !isOwner && direct.canBuy) ? "Also on" : "On") : "Also preorder on"}{" "}
                    {otherStores.map((l, i) => (
                      <span key={`${l.label}-${l.url}`}>
                        {i > 0 && " · "}
                        <a href={`/go/${book.id}?s=${encodeURIComponent(l.label)}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                          {l.label}
                        </a>
                      </span>
                    ))}
                  </span>
                )}
                {sampleOn && (
                  <Link href={`${path}/sample`} className="text-accent hover:underline">
                    Read the first chapter
                  </Link>
                )}
                {book.readLinks.map((l) => (
                  <a key={`${l.label}-${l.url}`} href={`/go/${book.id}?s=${encodeURIComponent(l.label)}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    Read on {l.label}
                  </a>
                ))}
                {(!isOwner || previewing) && <VisitorShareButton path={path} title={`${book.title} by ${author.name}`} />}
              </div>
            )}
            {shopItems.length > 0 && (
              <section className="font-ui mt-6 border-t border-line pt-4">
                <h2 className="font-display text-xl">From {author.name}&apos;s shop</h2>
                <p className="text-xs text-muted">Shipped by the author within {shop?.settings?.handlingDays ?? 5} business days. US addresses.</p>
                <ul className="mt-3 space-y-3 text-sm">
                  {shopItems.map((it) => (
                    <li key={it.id} className="flex flex-wrap items-start gap-3">
                      {it.photoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.photoUrl} alt="" className="h-20 w-20 border border-line object-cover" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-ink">{it.title}</p>
                        {it.description && <p className="text-xs text-muted">{it.description}</p>}
                        {it.includesLabel && <p className="text-[11px] text-muted">{it.includesLabel}</p>}
                        {it.limitedTotal && <p className="text-[11px] text-muted">Numbered limited edition of {it.limitedTotal}</p>}
                        {it.shipsOn && it.shipsOn > new Date().toISOString().slice(0, 10) && (
                          <p className="text-[11px] text-muted">Pre-order: ships from {new Date(`${it.shipsOn}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}</p>
                        )}
                        {it.personalize && <p className="text-[11px] text-muted">Can be signed to you</p>}
                      </div>
                      {!isOwner && <BuyItemButton itemId={it.id} priceCents={it.priceCents} stock={it.stock} personalize={it.personalize} canBuy={shopCanBuy} />}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {shownExtras.length > 0 && (
              <section className="font-ui mt-6 border-t border-line pt-4">
                <h2 className="font-display text-xl">Extras</h2>
                <ul className="mt-2 space-y-3 text-sm">
                  {shownExtras.map((e) => (
                    <li key={e.id} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-ink">{e.title}</p>
                        {e.description && <p className="text-xs text-muted">{e.description}</p>}
                        <p className="text-[11px] text-muted">
                          {e.kind === "writing" ? "Bonus writing" : "Art"} · {e.files.length} {e.files.length === 1 ? "file" : "files"} to keep
                          {e.withEbook && direct ? " · free with the ebook bought here" : ""}
                        </p>
                      </div>
                      {e.priceCents != null && canSellExtras && !isOwner && (
                        <BuyDirectButton
                          projectId={book.id}
                          format="extra"
                          extraId={e.id}
                          quiet
                          label="Buy"
                          note="Direct from the author · download and keep"
                          price={{ cents: e.priceCents, regularCents: null }}
                          canBuy={extrasCanBuy}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {magnet && (!isOwner || previewing) && (
              <div className="mt-5">
                <MagnetForm projectId={book.id} title={book.title} authorName={author.name} />
              </div>
            )}

            {book.blurb && (
              <p className="mt-8 whitespace-pre-wrap text-base leading-relaxed text-ink">{book.blurb}</p>
            )}
          </div>
        </div>

        {reviewData && (reviewData.count > 0 || !isOwner) && (
          <BookReviews
            projectId={book.id}
            authorName={author.name}
            avg={reviewData.avg}
            count={reviewData.count}
            reviews={reviewData.reviews}
            isOwner={isOwner}
            isAdmin={viewerIsAdmin}
          />
        )}

        <section className="mt-12 grid gap-6 border-t border-line pt-8 md:grid-cols-2">
          <div className="flex gap-4">
            {author.avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={author.avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-full border border-line object-cover" />
            )}
            <div className="min-w-0">
              <p className="font-ui text-[10px] uppercase tracking-wide text-muted">About the author</p>
              <Link href={authorPath(author.handle)} className="font-display text-xl hover:text-accent">
                {author.name}
              </Link>
              {author.bio && <p className="mt-1 line-clamp-4 text-sm text-muted">{author.bio}</p>}
              <AuthorLinks links={author.links} className="mt-2" />
            </div>
          </div>
          {studio && (
            <div className="space-y-4">
              <GuestListSignup
                authorUserId={author.userId}
                authorName={author.name}
                heading={book.published ? `More from ${author.name}` : `Get notified when ${book.title} is out`}
                releaseProjectId={book.published ? undefined : book.id}
              />
              <LaunchTeamCard projectId={book.id} title={book.title} authorName={author.name} loggedIn={Boolean(user)} path={path} />
            </div>
          )}
        </section>
        {!isOwner && (
          <div className="mt-10 text-center">
            <ReportConcern projectId={book.id} />
          </div>
        )}
      </main>
      <PublicFooter credit="launch-page" />
    </div>
  );
}
