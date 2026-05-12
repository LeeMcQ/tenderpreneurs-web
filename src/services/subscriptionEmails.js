const { Resend } = require('resend');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const FROM_EMAIL = process.env.FROM_EMAIL || 'Tenderpreneurs <noreply@tenderpreneurs.co.za>';
const DASHBOARD_URL = 'https://tenderpreneurs.co.za/dashboard';
const BILLING_URL = 'https://tenderpreneurs.co.za/billing';
const PRICING_URL = 'https://tenderpreneurs.co.za/pricing';
const UNSUBSCRIBE_URL = 'https://tenderpreneurs.co.za/unsubscribe';
const SUPPORT_EMAIL = 'support@tenderpreneurs.co.za';
const BRAND_COLOR = '#1a5c38';

// Resend client – uses RESEND_API_KEY from environment
const resend = new Resend(process.env.RESEND_API_KEY);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal HTML wrapper that applies consistent footer with unsubscribe link.
 * @param {string} content - Inner HTML content (everything after <body> start).
 * @returns {string} Full HTML email.
 */
function wrapEmail(content) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title></title>
    </head>
    <body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:20px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
              <tr>
                <td style="padding:30px 40px 20px;">
                  ${content}
                </td>
              </tr>
              <tr>
                <td style="padding:20px 40px; border-top:1px solid #eaeaea; text-align:center; color:#888888; font-size:13px; line-height:1.5;">
                  <p style="margin:0;">
                    <a href="${UNSUBSCRIBE_URL}" style="color:#888888; text-decoration:underline;">Unsubscribe</a> from these emails.
                  </p>
                  <p style="margin:5px 0 0;">Tenderpreneurs, 123 Business Park, Johannesburg</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;
}

/**
 * Creates a styled call-to-action button.
 * @param {string} text - Button label.
 * @param {string} url - Destination URL.
 * @returns {string} Button markup.
 */
function ctaButton(text, url) {
  return `
    <table cellpadding="0" cellspacing="0" style="margin:25px 0;">
      <tr>
        <td align="center" style="background-color:${BRAND_COLOR}; border-radius:6px;">
          <a href="${url}" style="display:inline-block; padding:12px 30px; color:#ffffff; text-decoration:none; font-size:16px; font-weight:bold; border-radius:6px;">${text}</a>
        </td>
      </tr>
    </table>`;
}

// ---------------------------------------------------------------------------
// 1. sendWelcomePro
// ---------------------------------------------------------------------------
async function sendWelcomePro(user) {
  const firstName = user.firstName || 'there';
  const subject = "Welcome to Tenderpreneurs Professional 🎉";

  const htmlContent = `
    <h2 style="color:${BRAND_COLOR}; margin-top:0;">Welcome, ${firstName}! 🎉</h2>
    <p style="font-size:16px; line-height:1.6; color:#333333;">
      Thank you for upgrading to <strong>Tenderpreneurs Professional</strong>.
      We’re thrilled to have you on board.
    </p>
    <p style="font-size:16px; line-height:1.6; color:#333333;">Here’s what you now have access to:</p>
    <ul style="font-size:16px; line-height:1.8; color:#333333; padding-left:20px;">
      <li>Full tender details</li>
      <li>Unlimited AI analysis</li>
      <li>Pipeline tracker</li>
      <li>Custom alerts</li>
    </ul>
    ${ctaButton('Start Finding Tenders →', DASHBOARD_URL)}
    <p style="font-size:14px; color:#666666;">If you have any questions, just reply to this email.</p>
  `;

  const text = `Welcome, ${firstName}! 🎉

Thank you for upgrading to Tenderpreneurs Professional. We're thrilled to have you on board.

Here’s what you now have access to:
- Full tender details
- Unlimited AI analysis
- Pipeline tracker
- Custom alerts

Start finding tenders: ${DASHBOARD_URL}

If you have any questions, just reply to this email.

Unsubscribe: ${UNSUBSCRIBE_URL}`;

  return resend.emails.send({
    from: FROM_EMAIL,
    to: user.email,
    subject,
    html: wrapEmail(htmlContent),
    text,
  });
}

// ---------------------------------------------------------------------------
// 2. sendPaymentFailed
// ---------------------------------------------------------------------------
async function sendPaymentFailed(user, retryDate) {
  const firstName = user.firstName || 'there';
  const subject = "Action required — payment failed";

  // Format retryDate as a readable string (assumes it's a Date or ISO string)
  const retryString = retryDate instanceof Date
    ? retryDate.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })
    : String(retryDate);

  const htmlContent = `
    <h2 style="color:${BRAND_COLOR}; margin-top:0;">Payment Failed, ${firstName}</h2>
    <p style="font-size:16px; line-height:1.6; color:#333333;">
      Your recent payment for <strong>Tenderpreneurs Professional</strong> was unsuccessful.
    </p>
    <p style="font-size:16px; line-height:1.6; color:#333333;">
      We will automatically retry on <strong>${retryString}</strong>.
      To avoid any interruption, please update your payment method now.
    </p>
    ${ctaButton('Update Payment Method', BILLING_URL)}
    <p style="font-size:14px; color:#666666;">
      Need help? Contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.
    </p>
  `;

  const text = `Payment Failed, ${firstName}

Your recent payment for Tenderpreneurs Professional was unsuccessful.
We will automatically retry on ${retryString}. To avoid any interruption, please update your payment method: ${BILLING_URL}

Need help? Contact us at ${SUPPORT_EMAIL}.

Unsubscribe: ${UNSUBSCRIBE_URL}`;

  return resend.emails.send({
    from: FROM_EMAIL,
    to: user.email,
    subject,
    html: wrapEmail(htmlContent),
    text,
  });
}

// ---------------------------------------------------------------------------
// 3. sendCancellationConfirmed
// ---------------------------------------------------------------------------
async function sendCancellationConfirmed(user, accessUntil) {
  const firstName = user.firstName || 'there';
  const subject = "Your subscription has been cancelled";

  const accessString = accessUntil instanceof Date
    ? accessUntil.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })
    : String(accessUntil);

  const htmlContent = `
    <h2 style="color:${BRAND_COLOR}; margin-top:0;">Subscription Cancelled, ${firstName}</h2>
    <p style="font-size:16px; line-height:1.6; color:#333333;">
      Your <strong>Tenderpreneurs Professional</strong> subscription has been cancelled as requested.
    </p>
    <p style="font-size:16px; line-height:1.6; color:#333333;">
      You will still have full access to all Pro features until <strong>${accessString}</strong>.
    </p>
    <p style="font-size:16px; line-height:1.6; color:#333333;">
      No hard feelings — we’d love to have you back whenever you’re ready.
    </p>
    ${ctaButton('Resubscribe to Pro', PRICING_URL)}
    <p style="font-size:14px; color:#666666;">
      Thank you for being part of Tenderpreneurs. If you have feedback, just reply.
    </p>
  `;

  const text = `Subscription Cancelled, ${firstName}

Your Tenderpreneurs Professional subscription has been cancelled as requested.
You will still have full access to all Pro features until ${accessString}.

No hard feelings — we'd love to have you back whenever you're ready.
Resubscribe to Pro: ${PRICING_URL}

Thank you for being part of Tenderpreneurs.

Unsubscribe: ${UNSUBSCRIBE_URL}`;

  return resend.emails.send({
    from: FROM_EMAIL,
    to: user.email,
    subject,
    html: wrapEmail(htmlContent),
    text,
  });
}

// ---------------------------------------------------------------------------
// 4. sendUpgradeReminder
// ---------------------------------------------------------------------------
async function sendUpgradeReminder(user, featureName, usageCount) {
  const firstName = user.firstName || 'there';
  // The spec calls for exactly this subject line, but we'll keep it dynamic just in case.
  const subject = `You've used ${usageCount}/${usageCount} free ${featureName} this month`;

  const htmlContent = `
    <h2 style="color:${BRAND_COLOR}; margin-top:0;">Hi ${firstName},</h2>
    <p style="font-size:16px; line-height:1.6; color:#333333;">
      You’ve used all <strong>${usageCount} of your free ${featureName}</strong> this month.
    </p>
    <p style="font-size:16px; line-height:1.6; color:#333333;">
      Upgrade to <strong>Tenderpreneurs Professional</strong> and get unlimited access to
      everything, plus:
    </p>
    <ul style="font-size:16px; line-height:1.8; color:#333333; padding-left:20px;">
      <li>Full tender details</li>
      <li>Unlimited AI analysis</li>
      <li>Pipeline tracker</li>
      <li>Custom alerts</li>
    </ul>
    <p style="font-size:16px; line-height:1.6; color:#333333;">
      Only <strong>R299/month</strong> — cancel anytime.
    </p>
    ${ctaButton('Upgrade to Pro →', PRICING_URL)}
  `;

  const text = `Hi ${firstName},

You've used all ${usageCount} of your free ${featureName} this month.

Upgrade to Tenderpreneurs Professional and get unlimited access to everything, plus:
- Full tender details
- Unlimited AI analysis
- Pipeline tracker
- Custom alerts

Only R299/month — cancel anytime.
Upgrade: ${PRICING_URL}

Unsubscribe: ${UNSUBSCRIBE_URL}`;

  return resend.emails.send({
    from: FROM_EMAIL,
    to: user.email,
    subject,
    html: wrapEmail(htmlContent),
    text,
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  sendWelcomePro,
  sendPaymentFailed,
  sendCancellationConfirmed,
  sendUpgradeReminder,
};