/**
 * Resend client for the Edge runtime.
 *
 * Transactional email only (currently: staff invitations). A plain fetch
 * against Resend's HTTP API is enough for a single send call — no SDK needed,
 * matching the Deno-native fetch approach used for Stripe in stripe.ts.
 */

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'OrderVora <onboarding@ordervora.com>';

if (!RESEND_API_KEY) {
  throw new Error('Missing RESEND_API_KEY environment variable.');
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/** Sends a single transactional email via Resend. Throws on a non-2xx response. */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend request failed (${response.status}): ${body}`);
  }
}
