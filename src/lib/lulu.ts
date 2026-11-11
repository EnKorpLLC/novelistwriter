import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Lulu's Print API: prints and ships each paperback order, charged to the card on file in our Lulu account.
 * Needs LULU_CLIENT_KEY and LULU_CLIENT_SECRET; LULU_SANDBOX=true uses Lulu's sandbox (test orders, never printed).
 */

function config() {
  const key = process.env.LULU_CLIENT_KEY?.trim();
  const secret = process.env.LULU_CLIENT_SECRET?.trim();
  if (!key || !secret) return null;
  const sandbox = process.env.LULU_SANDBOX === "true";
  return { key, secret, sandbox, base: sandbox ? "https://api.sandbox.lulu.com" : "https://api.lulu.com" };
}

export const luluConfigured = () => Boolean(config());
export const luluSandbox = () => Boolean(config()?.sandbox);

let token: { value: string; until: number } | null = null;

async function accessToken() {
  const c = config();
  if (!c) throw new Error("Paperback printing isn't connected yet: add the Lulu API keys in Vercel.");
  if (token && token.until > Date.now() + 30_000) return token.value;
  const r = await fetch(`${c.base}/auth/realms/glasstree/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${c.key}:${c.secret}`).toString("base64")}` },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`Lulu sign-in failed (${r.status}). Check the Lulu API keys.`);
  const d = (await r.json()) as { access_token: string; expires_in: number };
  token = { value: d.access_token, until: Date.now() + d.expires_in * 1000 };
  return token.value;
}

async function lulu<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const c = config();
  if (!c) throw new Error("Paperback printing isn't connected yet.");
  const r = await fetch(`${c.base}${path}`, {
    method: init.method || "GET",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", "Cache-Control": "no-cache" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Lulu said no (${r.status}): ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export type LuluAddress = { name?: string; street1: string; street2?: string; city: string; state_code: string; postcode: string; country_code: string; phone_number: string };
type Money = { total_cost_excl_tax: string; total_cost_incl_tax?: string; total_tax?: string };
type CostResponse = {
  line_item_costs: Money[];
  fulfillment_cost: Money;
  shipping_cost: Money;
  fees?: (Money & { fee_type: string })[];
  total_cost_excl_tax: string;
  total_cost_incl_tax: string;
  total_tax: string;
};
const cents = (v: string | undefined) => Math.round(Number(v || 0) * 100);

/** What Lulu charges for an order, in cents: printing (with the fulfillment fee), shipping (with any handling), tax, and the total. */
export async function luluCost(opts: { pod: string; pages: number; quantity?: number; address: LuluAddress; level: string }) {
  const d = await lulu<CostResponse>("/print-job-cost-calculations/", {
    method: "POST",
    body: {
      line_items: [{ page_count: opts.pages, pod_package_id: opts.pod, quantity: opts.quantity || 1 }],
      shipping_address: opts.address,
      shipping_option: opts.level,
    },
  });
  const handling = (d.fees || []).filter((f) => f.fee_type === "HANDLING_FEE").reduce((n, f) => n + cents(f.total_cost_excl_tax), 0);
  return {
    printCents: d.line_item_costs.reduce((n, l) => n + cents(l.total_cost_excl_tax), 0) + cents(d.fulfillment_cost?.total_cost_excl_tax),
    shippingCents: cents(d.shipping_cost?.total_cost_excl_tax) + handling,
    taxCents: cents(d.total_tax),
    totalCents: cents(d.total_cost_incl_tax),
  };
}

/** A stand-in US address for estimating printing costs before anyone has ordered. */
export const SAMPLE_ADDRESS: LuluAddress = { street1: "101 Independence Ave SE", city: "Washington", state_code: "DC", postcode: "20540", country_code: "US", phone_number: "+1 206 555 0100" };

/** The full cover size (front, spine, and back, with bleed) Lulu needs for this book, in inches. */
export async function coverDimensions(pod: string, pages: number) {
  const d = await lulu<{ width: string; height: string }>("/cover-dimensions/", { method: "POST", body: { pod_package_id: pod, interior_page_count: pages, unit: "inch" } });
  return { width: Number(d.width), height: Number(d.height) };
}

type Check = { id: number; status: string; errors?: string[] | null; page_count?: string | number | null };
/** Lulu checks a file in the background; this starts the check. */
export async function startCheck(kind: "interior" | "cover", url: string, pod: string, pages: number) {
  const d = await lulu<Check>(kind === "interior" ? "/validate-interior/" : "/validate-cover/", {
    method: "POST",
    body: kind === "interior" ? { source_url: url, pod_package_id: pod } : { source_url: url, pod_package_id: pod, interior_page_count: pages },
  });
  return String(d.id);
}
/** ok, checking, or error with Lulu's reasons (and the interior's page count, which the cover check needs). */
export async function readCheck(kind: "interior" | "cover", id: string) {
  const d = await lulu<Check>(`${kind === "interior" ? "/validate-interior/" : "/validate-cover/"}${id}/`);
  const status = ["VALIDATED", "NORMALIZED"].includes(d.status) ? "ok" : d.status === "ERROR" ? "error" : "checking";
  return { status, errors: (d.errors || []).map(String), pages: d.page_count ? Number(d.page_count) : null };
}

export type PrintJob = { id: number; status?: { name: string; message?: string; line_item_statuses?: { messages?: { tracking_urls?: string[]; carrier_name?: string } }[] }; costs?: { total_cost_incl_tax?: string } };

export async function createPrintJob(opts: { externalId: string; title: string; pod: string; interiorUrl: string; coverUrl: string; quantity: number; address: LuluAddress; level: string; contactEmail: string }) {
  return lulu<PrintJob>("/print-jobs/", {
    method: "POST",
    body: {
      contact_email: opts.contactEmail,
      external_id: opts.externalId,
      // The buyer can cancel within the hour before printing starts
      production_delay: 60,
      shipping_level: opts.level,
      shipping_address: opts.address,
      line_items: [
        {
          external_id: opts.externalId,
          title: opts.title.slice(0, 200),
          quantity: opts.quantity,
          printable_normalization: { pod_package_id: opts.pod, interior: { source_url: opts.interiorUrl }, cover: { source_url: opts.coverUrl } },
        },
      ],
    },
  });
}

/** Cancel a job Lulu hasn't started printing (unpaid, or within its production delay). */
export async function cancelPrintJob(id: string) {
  await lulu(`/print-jobs/${id}/status/`, { method: "PUT", body: { name: "CANCELED" } });
}

type Webhook = { id: number | string; url: string; topics: string[]; is_active: boolean };

/** Lulu's connection for the admin: signed in, and whether status updates reach us. */
export async function luluStatus(url: string) {
  if (!luluConfigured()) return { state: "not_set_up" as const };
  try {
    const d = await lulu<{ results?: Webhook[] } | Webhook[]>("/webhooks/");
    const hooks = Array.isArray(d) ? d : d.results || [];
    const hook = hooks.find((h) => h.url === url);
    return { state: "connected" as const, sandbox: luluSandbox(), webhook: hook ? (hook.is_active ? ("active" as const) : ("inactive" as const)) : ("missing" as const) };
  } catch (e) {
    return { state: "error" as const, error: e instanceof Error ? e.message : "Couldn't reach Lulu" };
  }
}

/** Ask Lulu to send print job status changes here (or switch a deactivated one back on). */
export async function connectWebhook(url: string) {
  const d = await lulu<{ results?: Webhook[] } | Webhook[]>("/webhooks/");
  const hook = (Array.isArray(d) ? d : d.results || []).find((h) => h.url === url);
  if (hook) await lulu(`/webhooks/${hook.id}/`, { method: "PATCH", body: { is_active: true, topics: ["PRINT_JOB_STATUS_CHANGED"] } });
  else await lulu("/webhooks/", { method: "POST", body: { url, topics: ["PRINT_JOB_STATUS_CHANGED"] } });
}

/** Webhooks from Lulu carry an HMAC-SHA256 of the raw body, keyed with our API secret. */
export function luluSignatureOk(rawBody: string, signature: string | null) {
  const c = config();
  if (!c || !signature) return false;
  const expected = createHmac("sha256", c.secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A tracking link and carrier from a shipped job, if Lulu gave one. */
export function trackingOf(job: PrintJob) {
  const msg = job.status?.line_item_statuses?.find((s) => s.messages?.tracking_urls?.length)?.messages;
  return msg ? { url: msg.tracking_urls![0], carrier: msg.carrier_name || "" } : null;
}
