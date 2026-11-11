import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe, appUrl } from "@/lib/stripe";
import { bundleReadiness, buyerCountryAllowed, findCode, saleReadiness } from "@/lib/direct-sales";
import { codeUsable, currentPrice, discountedPrice, longDay } from "@/lib/direct-sale-rules";
import { bookPath } from "@/lib/handles";
import { audiobookReadiness } from "@/lib/audiobook-sales";
import { EXTRA_TAX_CODES, extraReadiness } from "@/lib/digital-extras";
import { paperbackReadiness, shippingQuotes } from "@/lib/print-sales";
import { isShippingLevel } from "@/lib/print-rules";

/** Stripe's tax category for downloaded ebooks the buyer keeps; overridable if Stripe changes it. */
const EBOOK_TAX_CODE = process.env.STRIPE_EBOOK_TAX_CODE || "txcd_10302000";
/** Stripe's "Audiobook" category: a recording of a book read aloud, sold to keep. */
const AUDIOBOOK_TAX_CODE = process.env.STRIPE_AUDIOBOOK_TAX_CODE || "txcd_10301000";

/** Stripe's categories for printed books and for shipping them (shipping is taxed where states require it). */
const PRINTED_BOOK_TAX_CODE = process.env.STRIPE_PRINTED_BOOK_TAX_CODE || "txcd_35010000";
const SHIPPING_TAX_CODE = "txcd_92010001";

type Body = { projectId?: string; code?: string; bundleId?: string; fromProjectId?: string; format?: string; extraId?: string; state?: string; zip?: string; shippingLevel?: string; proof?: boolean };
type Line = { name: string; description: string; cents: number; taxCode: string };

/**
 * A paperback printed and shipped by Lulu: the price set by the author (or, for the author's proof, Lulu's cost), plus
 * shipping at cost for the level the buyer picked. Stripe collects the US address and phone the printer needs.
 */
async function paperbackCheckout(admin: ReturnType<typeof createServiceClient>, body: Body, user: { id: string; email?: string } | null) {
  const { data: project } = await admin.from("projects").select("id, user_id, title, slug, published").eq("id", String(body.projectId || "")).maybeSingle();
  if (!project) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  const proof = body.proof === true;
  if (proof && user?.id !== project.user_id) return NextResponse.json({ error: "Only the author can order a proof." }, { status: 403 });
  if (!proof && user?.id === project.user_id) return NextResponse.json({ error: "You can't buy your own book. Order a proof copy from the Sell tab." }, { status: 400 });
  const ready = await paperbackReadiness(admin, project, { proof });
  if (!ready.ok) return NextResponse.json({ error: ready.reason }, { status: 400 });
  if (!isShippingLevel(body.shippingLevel)) return NextResponse.json({ error: "Pick a shipping option." }, { status: 400 });
  const state = String(body.state || "").toUpperCase();
  const zip = String(body.zip || "").trim();
  // Shipping is priced again here, so the amount always comes from Lulu, never from the browser
  const quote = (await shippingQuotes(ready.edition, ready.pod, state, zip)).find((l) => l.id === body.shippingLevel);
  if (!quote) return NextResponse.json({ error: "Shipping prices aren't available right now. Try again in a moment." }, { status: 503 });
  const e = ready.edition;
  const price = proof ? quote.printCents : e.price_cents;
  const { data: author } = await admin.from("profiles").select("display_name, handle").eq("id", project.user_id).maybeSingle();
  const title = String(project.title || "Paperback");
  const meta = {
    kind: "book_purchase",
    format: "paperback",
    project_id: project.id,
    author_user_id: project.user_id,
    buyer_user_id: user?.id || "",
    tier: ready.tier,
    title: title.slice(0, 200),
    print_cents: String(quote.printCents),
    ship_cents: String(quote.cents),
    ship_level: quote.id,
    free_ebook: !proof && e.free_ebook ? "1" : "0",
    proof: proof ? "1" : "0",
  };
  const back = author?.handle && project.slug && !proof ? appUrl(bookPath(author.handle, project.slug)) : appUrl(`/project/${project.id}?tab=sell`);
  const session = await getStripe()
    .checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: price,
            tax_behavior: "exclusive",
            product_data: {
              name: proof ? `${title} (proof copy)` : `${title} (paperback)`,
              description: proof
                ? "Your proof copy, at Lulu's printing cost."
                : `Paperback by ${author?.display_name || "the author"}, printed on demand and shipped to you${e.free_ebook ? ", with the ebook free" : ""}.`,
              tax_code: PRINTED_BOOK_TAX_CODE,
            },
          },
          quantity: 1,
        },
      ],
      shipping_address_collection: { allowed_countries: ["US"] },
      phone_number_collection: { enabled: true },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: quote.cents, currency: "usd" },
            display_name: `${quote.label} (${quote.note})`,
            tax_behavior: "exclusive",
            tax_code: SHIPPING_TAX_CODE,
          },
        },
      ],
      automatic_tax: { enabled: true },
      customer_creation: "if_required",
      ...(user?.email ? { customer_email: user.email } : {}),
      success_url: appUrl(`/purchase/thanks?session_id={CHECKOUT_SESSION_ID}`),
      cancel_url: back,
      metadata: meta,
      payment_intent_data: { metadata: meta },
    })
    .catch((err: unknown) => {
      console.error("paperback checkout failed", project.id, err);
      return null;
    });
  if (!session?.url) return NextResponse.json({ error: "Checkout isn't available right now. Try again in a little while." }, { status: 503 });
  return NextResponse.json({ url: session.url });
}
type Item = { name: string; description: string; cents: number; meta: Record<string, string>; authorId: string; backProjectId: string; backSlug: string | null; lines?: Line[] };

/**
 * Start checkout for one book ({ projectId, format?: "ebook" | "audiobook" | "both", code? }), a bundle or box set
 * ({ bundleId }), or an extra ({ format: "extra", extraId }). Before release, the ebook is a pre-order.
 * Guests can buy; Stripe collects their email.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const format = body.format === "audiobook" || body.format === "both" || body.format === "extra" || body.format === "paperback" ? body.format : "ebook";
  if (!(await buyerCountryAllowed())) {
    return NextResponse.json({ error: "Buying direct is only open to readers in the US for now. The store links on this page work everywhere." }, { status: 403 });
  }
  const admin = createServiceClient();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (format === "paperback") return paperbackCheckout(admin, body, user);

  let item: Item;
  if (body.bundleId) {
    const ready = await bundleReadiness(admin, String(body.bundleId));
    if (!ready.ok) return NextResponse.json({ error: ready.reason }, { status: 400 });
    if (user?.id === ready.authorId) return NextResponse.json({ error: "You can't buy your own books." }, { status: 400 });
    const back = ready.books.find((b) => b.id === body.fromProjectId) || ready.books[0];
    const { data: slugRow } = await admin.from("projects").select("slug").eq("id", back.id).maybeSingle();
    const titles = ready.bundle.projectIds.map((id) => ready.books.find((b) => b.id === id)?.title || "").filter(Boolean);
    item = {
      name: ready.bundle.title,
      description: (ready.bundle.boxSetId
        ? `One ebook (EPUB) with all ${titles.length} books: ${titles.join(", ")}`
        : `${titles.length} ebooks (EPUB): ${titles.join(", ")}`
      ).slice(0, 500),
      cents: ready.bundle.priceCents,
      authorId: ready.authorId,
      backProjectId: back.id,
      backSlug: (slugRow?.slug as string | null) || null,
      meta: {
        bundle_id: ready.bundle.id,
        project_ids: ready.bundle.projectIds.join(","),
        tier: ready.tier,
        title: ready.bundle.title.slice(0, 200),
        regular_cents: String(ready.regularCents),
        ...(ready.bundle.boxSetId ? { box_set_id: ready.bundle.boxSetId } : {}),
      },
    };
  } else if (format === "extra") {
    const ready = await extraReadiness(admin, String(body.extraId || ""));
    if (!ready.ok) return NextResponse.json({ error: ready.reason }, { status: 400 });
    if (user?.id === ready.extra.authorId) return NextResponse.json({ error: "You can't buy your own extras." }, { status: 400 });
    const { data: project } = await admin.from("projects").select("id, title, slug").eq("id", ready.extra.projectId).maybeSingle();
    if (!project) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const n = ready.extra.files.length;
    const description = `${ready.extra.kind === "writing" ? "Bonus writing" : "Digital art"} for ${project.title || "the book"}: ${n} ${n === 1 ? "file" : "files"} to download and keep.`;
    const cents = ready.extra.priceCents!;
    item = {
      name: ready.extra.title,
      description,
      cents,
      authorId: ready.extra.authorId,
      backProjectId: project.id,
      backSlug: project.slug,
      lines: [{ name: ready.extra.title, description, cents, taxCode: EXTRA_TAX_CODES[ready.extra.kind] }],
      meta: {
        project_id: project.id,
        extra_id: ready.extra.id,
        tier: ready.tier,
        title: ready.extra.title.slice(0, 200),
        regular_cents: String(cents),
      },
    };
  } else if (format !== "ebook") {
    const { data: project } = await admin.from("projects").select("id, user_id, title, slug, published, direct_sale, audiobook_sale").eq("id", String(body.projectId || "")).maybeSingle();
    if (!project) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    if (user?.id === project.user_id) return NextResponse.json({ error: "You can't buy your own book." }, { status: 400 });
    const audio = await audiobookReadiness(admin, project);
    if (!audio.ok) return NextResponse.json({ error: "The audiobook isn't for sale here right now." }, { status: 400 });
    const ebook = format === "both" ? await saleReadiness(admin, project) : null;
    if (format === "both" && (!ebook?.ok || audio.bundleCents == null)) return NextResponse.json({ error: "The ebook and audiobook set isn't for sale right now." }, { status: 400 });
    const ebookCents = ebook?.ok ? currentPrice(ebook.sale).cents : 0;
    const regular = format === "both" ? ebookCents + audio.sale.priceCents : audio.sale.priceCents;
    let cents = format === "both" ? audio.bundleCents! : audio.sale.priceCents;
    let codeId = "";
    if (body.code && String(body.code).trim()) {
      const code = await findCode(admin, project.user_id, body.code);
      const problem = code ? codeUsable(code, project.id) : "That code isn't valid for this author.";
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      cents = discountedPrice(cents, code!);
      codeId = code!.id;
    }
    const { data: author } = await admin.from("profiles").select("display_name").eq("id", project.user_id).maybeSingle();
    const by = author?.display_name || "the author";
    const hours = (audio.durationMs / 3_600_000).toFixed(1);
    const title = project.title || "Audiobook";
    // The set is two products taxed differently, so its price is split by their regular prices
    const ebookShare = format === "both" ? Math.round((cents * ebookCents) / Math.max(1, regular)) : 0;
    item = {
      name: format === "both" ? `${title}: ebook + audiobook` : `${title} (audiobook)`,
      description: "",
      cents,
      authorId: project.user_id,
      backProjectId: project.id,
      backSlug: project.slug,
      lines: [
        ...(format === "both" ? [{ name: `${title} (ebook)`, description: `Ebook (EPUB) by ${by}. Yours to keep, for any e-reader.`, cents: ebookShare, taxCode: EBOOK_TAX_CODE }] : []),
        {
          name: `${title} (audiobook)`,
          description: `Audiobook by ${by}, ${hours} hours${audio.sale.humanNarrated ? ", human narrated" : ""}. MP3 files, yours to keep; stream or download.`,
          cents: cents - ebookShare,
          taxCode: AUDIOBOOK_TAX_CODE,
        },
      ],
      meta: {
        project_id: project.id,
        formats: format === "both" ? "ebook,audiobook" : "audiobook",
        ebook_cents: String(ebookShare),
        tier: audio.tier,
        title: String(title).slice(0, 200),
        code_id: codeId,
        regular_cents: String(regular),
      },
    };
  } else {
    const { data: project } = await admin.from("projects").select("id, user_id, title, slug, published, direct_sale, release_date").eq("id", String(body.projectId || "")).maybeSingle();
    if (!project) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const ready = await saleReadiness(admin, project, { preorder: true });
    if (!ready.ok) return NextResponse.json({ error: "This book isn't for sale here right now." }, { status: 400 });
    const preorder = ready.preorder && project.release_date ? String(project.release_date).slice(0, 10) : null;
    if (user?.id === project.user_id) return NextResponse.json({ error: "You can't buy your own book. Download it from the Format tab." }, { status: 400 });
    const base = currentPrice(ready.sale);
    let cents = base.cents;
    let codeId = "";
    if (body.code && String(body.code).trim()) {
      const code = await findCode(admin, project.user_id, body.code);
      const problem = code ? codeUsable(code, project.id) : "That code isn't valid for this author.";
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      cents = discountedPrice(base.cents, code!);
      codeId = code!.id;
    }
    const { data: author } = await admin.from("profiles").select("display_name").eq("id", project.user_id).maybeSingle();
    item = {
      name: preorder ? `${project.title || "Ebook"} (pre-order)` : project.title || "Ebook",
      description: preorder
        ? `Ebook (EPUB) by ${author?.display_name || "the author"}, delivered on ${longDay(preorder)}. Cancel anytime before then for a full refund.`
        : `Ebook (EPUB) by ${author?.display_name || "the author"}. Yours to keep, for any e-reader.`,
      cents,
      authorId: project.user_id,
      backProjectId: project.id,
      backSlug: project.slug,
      meta: {
        project_id: project.id,
        tier: ready.tier,
        title: String(project.title || "").slice(0, 200),
        code_id: codeId,
        regular_cents: String(base.regularCents ?? base.cents),
        ...(preorder ? { preorder_release: preorder } : {}),
      },
    };
  }

  const { data: author } = await admin.from("profiles").select("handle").eq("id", item.authorId).maybeSingle();
  const back = author?.handle && item.backSlug ? appUrl(bookPath(author.handle, item.backSlug)) : appUrl("/books");
  const meta = { kind: "book_purchase", author_user_id: item.authorId, buyer_user_id: user?.id || "", ...item.meta };
  const session = await getStripe()
    .checkout.sessions.create({
      mode: "payment",
      line_items: (item.lines || [{ name: item.name, description: item.description, cents: item.cents, taxCode: EBOOK_TAX_CODE }]).map((l) => ({
        price_data: {
          currency: "usd",
          unit_amount: l.cents,
          tax_behavior: "exclusive" as const,
          product_data: { name: l.name, description: l.description, tax_code: l.taxCode },
        },
        quantity: 1,
      })),
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      customer_creation: "if_required",
      ...(user?.email ? { customer_email: user.email } : {}),
      success_url: appUrl(`/purchase/thanks?session_id={CHECKOUT_SESSION_ID}`),
      cancel_url: back,
      metadata: meta,
      payment_intent_data: { metadata: meta },
    })
    .catch((e: unknown) => {
      console.error("book checkout failed", item.backProjectId, e);
      return null;
    });
  if (!session?.url) return NextResponse.json({ error: "Checkout isn't available right now. Try again in a little while, or use the store links." }, { status: 503 });
  return NextResponse.json({ url: session.url });
}
