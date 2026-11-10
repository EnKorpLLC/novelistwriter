import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe, appUrl } from "@/lib/stripe";
import { bundleReadiness, buyerCountryAllowed, findCode, saleReadiness } from "@/lib/direct-sales";
import { codeUsable, currentPrice, discountedPrice } from "@/lib/direct-sale-rules";
import { bookPath } from "@/lib/handles";

/** Stripe's tax category for downloaded ebooks the buyer keeps; overridable if Stripe changes it. */
const EBOOK_TAX_CODE = process.env.STRIPE_EBOOK_TAX_CODE || "txcd_10302000";

type Item = { name: string; description: string; cents: number; meta: Record<string, string>; authorId: string; backProjectId: string; backSlug: string | null };

/** Start checkout for one ebook ({ projectId, code? }) or a bundle ({ bundleId }). Guests can buy; Stripe collects their email. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { projectId?: string; code?: string; bundleId?: string; fromProjectId?: string };
  if (!(await buyerCountryAllowed())) {
    return NextResponse.json({ error: "Buying direct is only open to readers in the US for now. The store links on this page work everywhere." }, { status: 403 });
  }
  const admin = createServiceClient();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let item: Item;
  if (body.bundleId) {
    const ready = await bundleReadiness(admin, String(body.bundleId));
    if (!ready.ok) return NextResponse.json({ error: ready.reason }, { status: 400 });
    if (user?.id === ready.authorId) return NextResponse.json({ error: "You can't buy your own books." }, { status: 400 });
    const back = ready.books.find((b) => b.id === body.fromProjectId) || ready.books[0];
    const { data: slugRow } = await admin.from("projects").select("slug").eq("id", back.id).maybeSingle();
    item = {
      name: ready.bundle.title,
      description: `${ready.bundle.projectIds.length} ebooks (EPUB): ${ready.books.map((b) => b.title).join(", ")}`.slice(0, 500),
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
      },
    };
  } else {
    const { data: project } = await admin.from("projects").select("id, user_id, title, slug, published, direct_sale").eq("id", String(body.projectId || "")).maybeSingle();
    if (!project) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const ready = await saleReadiness(admin, project);
    if (!ready.ok) return NextResponse.json({ error: "This book isn't for sale here right now." }, { status: 400 });
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
      name: project.title || "Ebook",
      description: `Ebook (EPUB) by ${author?.display_name || "the author"}. Yours to keep, for any e-reader.`,
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
      },
    };
  }

  const { data: author } = await admin.from("profiles").select("handle").eq("id", item.authorId).maybeSingle();
  const back = author?.handle && item.backSlug ? appUrl(bookPath(author.handle, item.backSlug)) : appUrl("/books");
  const meta = { kind: "book_purchase", author_user_id: item.authorId, buyer_user_id: user?.id || "", ...item.meta };
  const session = await getStripe()
    .checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: item.cents,
            tax_behavior: "exclusive",
            product_data: { name: item.name, description: item.description, tax_code: EBOOK_TAX_CODE },
          },
          quantity: 1,
        },
      ],
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
