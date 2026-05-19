// Resend email helper. Used for magic-link emails and the daily audit digest.

interface SendOpts {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(opts: SendOpts): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
}

export function magicLinkEmail(verifyUrl: string): { subject: string; html: string; text: string } {
  return {
    subject: "Your Tenderpreneurs sign-in link",
    text: `Click this link to sign in. It expires in 15 minutes.\n\n${verifyUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `
<!DOCTYPE html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; max-width: 520px; margin: 40px auto; padding: 0 20px; color: #1e293b;">
  <h1 style="font-size: 22px; color: #0f172a;">Sign in to Tenderpreneurs</h1>
  <p>Click the button below to sign in. The link expires in 15 minutes.</p>
  <p style="margin: 32px 0;">
    <a href="${verifyUrl}" style="display:inline-block; background:#b45309; color:white; padding:12px 24px; text-decoration:none; border-radius:6px; font-weight:600;">
      Sign in
    </a>
  </p>
  <p style="font-size:13px; color:#64748b;">Or copy this URL into your browser:<br><code style="font-size:12px;">${verifyUrl}</code></p>
  <hr style="border:none; border-top:1px solid #e2e8f0; margin: 32px 0;">
  <p style="font-size:12px; color:#94a3b8;">If you did not request this email, ignore it — no account will be created.</p>
</body></html>`.trim(),
  };
}
