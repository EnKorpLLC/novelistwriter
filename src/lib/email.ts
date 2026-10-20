import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { appUrl } from "@/lib/stripe";

type SendOpts = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string | null;
};

export type SendResult = { ok: true } | { ok: false; error: string };

let transport: Transporter | null = null;

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_APP_PASSWORD);
}

function getTransport() {
  if (transport) return transport;
  const port = Number(process.env.SMTP_PORT || 465);
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      // Google shows app passwords with spaces; SMTP wants the 16 characters only
      pass: String(process.env.SMTP_APP_PASSWORD || "").replace(/\s+/g, ""),
    },
  });
  return transport;
}

export async function sendEmail(opts: SendOpts): Promise<SendResult> {
  if (!emailConfigured()) {
    return { ok: false, error: "Email is not configured (SMTP_USER / SMTP_APP_PASSWORD)." };
  }
  const to = opts.to.trim();
  if (!to.includes("@")) return { ok: false, error: "Invalid recipient" };
  try {
    await getTransport().sendMail({
      from: process.env.EMAIL_FROM || `Novelist Writer <${process.env.SMTP_USER}>`,
      to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      replyTo: opts.replyTo || undefined,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain branded email: paragraphs plus one optional button. */
export function renderEmail(opts: {
  heading: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  footer?: string;
}): { html: string; text: string } {
  const paras = opts.paragraphs
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p)}</p>`)
    .join("");
  const button = opts.button
    ? `<p style="margin:22px 0"><a href="${escapeHtml(opts.button.url)}" style="background:#2c5f4a;color:#fff;padding:10px 18px;text-decoration:none;display:inline-block">${escapeHtml(opts.button.label)}</a></p>`
    : "";
  const footer = escapeHtml(opts.footer || "Novelist Writer");
  const html = `<!doctype html><html><body style="margin:0;background:#f7f2e9;font-family:Georgia,serif;color:#1a1612">
<div style="max-width:560px;margin:0 auto;padding:28px 24px">
<p style="font-size:20px;margin:0 0 18px"><a href="${escapeHtml(appUrl("/"))}" style="color:#1a1612;text-decoration:none">Novelist Writer</a></p>
<h1 style="font-size:22px;font-weight:normal;margin:0 0 16px">${escapeHtml(opts.heading)}</h1>
${paras}${button}
<p style="margin:28px 0 0;font-size:12px;color:#6b6358">${footer}</p>
</div></body></html>`;
  const text = [
    opts.heading,
    "",
    ...opts.paragraphs.flatMap((p) => [p, ""]),
    opts.button ? `${opts.button.label}: ${opts.button.url}` : "",
    "",
    opts.footer || "Novelist Writer",
  ]
    .join("\n")
    .trim();
  return { html, text };
}
