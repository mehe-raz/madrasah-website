// ============================================================================
// mailer.js — transactional email via Resend's HTTP API
// ============================================================================
// Previously this app sent email over raw SMTP (nodemailer -> smtp.gmail.com).
// That works locally but times out in production on Render: since September
// 2025 Render blocks outbound traffic to SMTP ports 25/465/587 on free web
// services, and port 25 stays blocked even on paid plans — so a direct SMTP
// connection from the server process can hang/fail regardless of correct
// credentials (see "Email sending failed ... ETIMEDOUT" in server logs).
//
// Resend's API is a plain HTTPS POST to api.resend.com — HTTPS (443) is
// never blocked, so this works the same on every Render plan (and every
// other host). No new dependency needed: Node 18+ has a built-in `fetch`.
//
// Setup: sign up at https://resend.com (free tier is enough for password
// resets), create an API key, and set RESEND_API_KEY in the environment.
// EMAIL_FROM must be an address on a domain you've verified in Resend — for
// quick testing before verifying your own domain, Resend provides a shared
// `onboarding@resend.dev` sender that works without verification.
// ============================================================================

const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Sends one HTML email via Resend. Throws on failure (missing API key,
 * network error, or a non-2xx response from Resend) so callers can log/
 * handle it the same way they handled a rejected nodemailer sendMail().
 */
async function sendMail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set — cannot send email");
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "onboarding@resend.dev",
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API error ${res.status}: ${body || res.statusText}`);
  }

  return res.json();
}

module.exports = { sendMail };
