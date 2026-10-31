import { logger } from "./logger";

/**
 * Outgoing messages: one-time codes to buyers/artists, and task alerts to staff.
 *
 * Providers are optional and picked up from the environment:
 *   SMS / WhatsApp — Twilio:  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and
 *                             TWILIO_FROM (an SMS number, or "whatsapp:+1415…"
 *                             to send codes over WhatsApp instead of SMS)
 *   Email          — Resend:  RESEND_API_KEY, EMAIL_FROM ("Maktaba Al-Fann <no-reply@your-domain>")
 *
 * In development, codes are also written to the server log so you can test
 * without any provider. In production nothing secret is ever logged.
 */
type To = { email?: string | null; phone?: string | null };

const isProd = () => process.env.NODE_ENV === "production";

export const smsConfigured = () =>
  Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

async function sendSms(phone: string, body: string): Promise<boolean> {
  if (!smsConfigured()) return false;
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const from = process.env.TWILIO_FROM!;
  const to = from.startsWith("whatsapp:") ? `whatsapp:${phone}` : phone;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) logger.error({ status: res.status, body: (await res.text()).slice(0, 300) }, "Twilio send failed");
    return res.ok;
  } catch (err) {
    logger.error({ err }, "Twilio send failed");
    return false;
  }
}

async function sendEmail(email: string, subject: string, text: string): Promise<boolean> {
  if (!emailConfigured()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email], subject, text }),
    });
    if (!res.ok) logger.error({ status: res.status, body: (await res.text()).slice(0, 300) }, "Resend send failed");
    return res.ok;
  } catch (err) {
    logger.error({ err }, "Resend send failed");
    return false;
  }
}

/** Sends to the phone if there is one (else email). Returns whether a provider accepted it. */
export async function sendMessage(to: To, subject: string, text: string): Promise<boolean> {
  if (to.phone) return sendSms(to.phone, text);
  if (to.email) return sendEmail(to.email, subject, text);
  return false;
}

const PURPOSE_TEXT: Record<string, string> = {
  verify_email: "verify your email",
  verify_phone: "verify your phone number",
  reset_password: "reset your password",
};

/** One-time code. Returns true when it was handed to a provider (or logged in dev). */
export async function sendCode(to: To, code: string, purpose: string): Promise<boolean> {
  const what = PURPOSE_TEXT[purpose] ?? "continue";
  const text = `Maktaba Al-Fann: ${code} is your code to ${what}. It expires in 10 minutes. Never share it with anyone.`;
  const sent = await sendMessage(to, `Your Maktaba Al-Fann code: ${code}`, text);
  if (!isProd()) {
    logger.info({ channel: to.phone ? "phone" : "email", purpose, code, sent }, "DEV ONLY — one-time code");
    return true;
  }
  if (!sent) logger.warn({ channel: to.phone ? "phone" : "email", purpose }, "One-time code NOT delivered — configure Twilio/Resend");
  return sent;
}
