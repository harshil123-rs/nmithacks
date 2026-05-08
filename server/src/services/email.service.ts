/**
 * Email service.
 *
 * Single shared `nodemailer` transport keyed off SMTP_* env vars. If those
 * aren't set, the service silently no-ops (`isEmailConfigured()` returns
 * false) — never throw on missing config, since email is best-effort.
 *
 * Templates live next to the service in `templates/`. Each template module
 * exports a function that returns `{ subject, html, text }`. The service
 * doesn't know what's in them; it just sends.
 */
import nodemailer, { type Transporter } from "nodemailer";

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

let cachedTransport: Transporter | null = null;
let cachedFrom: string | null = null;

function loadConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const portRaw = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;

  if (!host || !portRaw || !user || !pass || !from) return null;
  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) return null;
  return { host, port, user, pass, from };
}

function getTransport(): Transporter | null {
  if (cachedTransport) return cachedTransport;
  const cfg = loadConfig();
  if (!cfg) return null;
  cachedTransport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465, // 465 = TLS, 587 = STARTTLS
    auth: { user: cfg.user, pass: cfg.pass },
  });
  cachedFrom = cfg.from;
  return cachedTransport;
}

export function isEmailConfigured(): boolean {
  return loadConfig() !== null;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Send a single email. Returns `{ ok: true, messageId }` on success or
 * `{ ok: false, reason }` on failure. We never throw — callers shouldn't
 * have to wrap every send in try/catch.
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<{ ok: true; messageId: string } | { ok: false; reason: string }> {
  if (!input.to) return { ok: false, reason: "no-recipient" };
  if (process.env.EMAIL_DISABLED === "true") {
    return { ok: false, reason: "email-disabled-via-env" };
  }
  const transport = getTransport();
  if (!transport) return { ok: false, reason: "smtp-not-configured" };

  try {
    const info = await transport.sendMail({
      from: cachedFrom!,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err: any) {
    console.error("[Email] sendMail failed:", err.message);
    return { ok: false, reason: err.message ?? "send-failed" };
  }
}

/**
 * Reset the cached transport. Used by tests so they can swap SMTP env vars
 * between cases without spawning a new process.
 */
export function _resetEmailTransportForTests(): void {
  cachedTransport = null;
  cachedFrom = null;
}
