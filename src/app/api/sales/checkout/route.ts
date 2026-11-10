import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe, appUrl } from "@/lib/stripe";
import { buyerCountryAllowed, saleReadiness } from "@/lib/direct-sales";
import { currentPrice } from "@/lib/direct-sale-rules";
import { bookPath } from "@/lib/handles";

/** Stripe's tax category for downloaded ebooks the buyer keeps; overridable if Stripe changes it. */
const EBOOK_TAX_CODE = process.env.STRIPE_EBOOK_TAX_CODE || "txcd_10302000";

/** Start checkout for one ebook. Guests can buy; Stripe collects their email. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { projectId?: string };
  const admin = createServiceClient();
  const { data: project } = await admin.from("projects").select("id, user_id, title, slug, published, direct_sale").eq("id", String(body.projectId || "")).maybeSingle();
  if (!project) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  if (!(await buyerCountryAllowed())) return NextResponse.json({ error: "Buying direct is only open to readers in the US for now. The store links on this page work everywhere." }, { status: 403 });
  const ready = await saleReadiness(admin, project);
  if (!ready.ok) return NextResponse.json({ error: "This book isn't for sale here right now." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === project.user_id) return NextResponse.json({ error: "You can't buy your own book. Download it from the Format tab." }, { status: 400 });

  const [{ data: author }] = await Promise.all([admin.from("profiles").select("display_name, handle").eq("id", project.user_id).maybeSingle()]);
  const price = currentPrice(ready.sale);
  const back = author?.handle && project.slug ? appUrl(bookPath(author.handle, project.slug)) : appUrl("/books");
  const meta = {
    kind: "book_purchase",
    project_id: project.id,
    author_user_id: project.user_id,
    buyer_user_id: user?.id || "",
    tier: ready.tier,
    title: String(project.title || "").slice(0, 200),
  };
  const session = await getStripe()
    .checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: price.cents,
          tax_behavior: "exclusive",
          product_data: {
            name: project.title || "Ebook",
            description: `Ebook (EPUB) by ${author?.display_name || "the author"}. Yours to keep, for any e-reader.`,
            tax_code: EBOOK_TAX_CODE,
          },
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
      console.error("book checkout failed", project.id, e);
      return null;
    });
  if (!session?.url) return NextResponse.json({ error: "Checkout isn't available right now. Try again in a little while, or use the store links." }, { status: 503 });
  return NextResponse.json({ url: session.url });
}
