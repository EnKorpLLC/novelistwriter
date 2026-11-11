import "server-only";
import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2 (S3-compatible) for audiobook files: review copies, final delivery, and listening copies.
 * Audio never passes through Vercel: browsers upload and download with short-lived signed links.
 * Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.
 */

function config() {
  const account = process.env.R2_ACCOUNT_ID?.trim();
  const key = process.env.R2_ACCESS_KEY_ID?.trim();
  const secret = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  return account && key && secret && bucket ? { account, key, secret, bucket } : null;
}

export const r2Configured = () => Boolean(config());

function client() {
  const c = config();
  if (!c) throw new Error("Audio storage isn't set up: add the four R2 settings in Vercel.");
  return { aws: new AwsClient({ accessKeyId: c.key, secretAccessKey: c.secret, service: "s3", region: "auto" }), base: `https://${c.account}.r2.cloudflarestorage.com/${c.bucket}` };
}

const objectUrl = (base: string, key: string) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;

/** A link the browser can PUT a file to, for a few minutes. */
export async function signedUploadUrl(key: string, seconds = 900): Promise<string> {
  const { aws, base } = client();
  const signed = await aws.sign(new Request(`${objectUrl(base, key)}?X-Amz-Expires=${seconds}`, { method: "PUT" }), { aws: { signQuery: true } });
  return signed.url;
}

/** A link the browser can play or download a file from, for a while. */
export async function signedDownloadUrl(key: string, seconds = 3600, downloadName?: string): Promise<string> {
  const { aws, base } = client();
  const q = new URLSearchParams({ "X-Amz-Expires": String(seconds) });
  if (downloadName) q.set("response-content-disposition", `attachment; filename="${downloadName.replace(/"/g, "")}"`);
  const signed = await aws.sign(new Request(`${objectUrl(base, key)}?${q}`, { method: "GET" }), { aws: { signQuery: true } });
  return signed.url;
}

export async function putObject(key: string, body: BodyInit, contentType = "application/octet-stream") {
  const { aws, base } = client();
  const r = await aws.fetch(objectUrl(base, key), { method: "PUT", body, headers: { "Content-Type": contentType } });
  if (!r.ok) throw new Error(`Storage upload failed (${r.status})`);
}

/** Size in bytes, or null if there's no such file. */
export async function objectSize(key: string): Promise<number | null> {
  const { aws, base } = client();
  const r = await aws.fetch(objectUrl(base, key), { method: "HEAD" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Storage check failed (${r.status})`);
  return Number(r.headers.get("content-length") || 0);
}

export async function deleteObject(key: string) {
  const { aws, base } = client();
  const r = await aws.fetch(objectUrl(base, key), { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new Error(`Storage delete failed (${r.status})`);
}

/** Total stored, for the free-tier gauge (R2 includes 10 GB a month). Counts up to 10,000 files. */
export async function bucketBytes(): Promise<{ bytes: number; files: number; partial: boolean }> {
  const { aws, base } = client();
  let token = "";
  let bytes = 0;
  let files = 0;
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ "list-type": "2", "max-keys": "1000" });
    if (token) q.set("continuation-token", token);
    const r = await aws.fetch(`${base}?${q}`);
    if (!r.ok) throw new Error(`Storage list failed (${r.status})`);
    const xml = await r.text();
    for (const m of xml.matchAll(/<Size>(\d+)<\/Size>/g)) {
      bytes += Number(m[1]);
      files++;
    }
    token = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] || "";
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml)) return { bytes, files, partial: false };
  }
  return { bytes, files, partial: true };
}

export type StorageStatus =
  | { state: "not_set_up" }
  | { state: "connected"; bytes: number; files: number; partial: boolean }
  | { state: "error"; error: string };

/** Write, read back, and delete a tiny file: proves the keys, the bucket, and permissions all work. */
export async function storageStatus(): Promise<StorageStatus> {
  if (!r2Configured()) return { state: "not_set_up" };
  const key = `_health/check-${Date.now()}.txt`;
  try {
    await putObject(key, "ok", "text/plain");
    if ((await objectSize(key)) == null) throw new Error("A test file didn't save");
    await deleteObject(key);
    return { state: "connected", ...(await bucketBytes()) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't reach storage";
    return { state: "error", error: /\(403\)/.test(msg) ? `${msg}: check the API token has Object Read & Write on this bucket` : /\(404\)/.test(msg) ? `${msg}: check R2_BUCKET matches the bucket name` : msg };
  }
}
