// src/services/betaEmails.js
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const BASE_URL = 'https://tenderpreneurs.co.za';
const FROM = 'Lebo from Tenderpreneurs <beta@tenderpreneurs.co.za>';
const BRAND_COLOR = '#1a5c38';

/**
 * Quick helper to build an HTML button link.
 */
function button(text, url, bgColor = BRAND_COLOR) {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0;">
      <tr>
        <td align="center" style="border-radius: 6px; background-color: ${bgColor};">
          <a href="${url}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 16px; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">${text}</a>
        </td>
      </tr>
    </table>`;
}

/**
 * Strip HTML tags for a plain-text version.
 */
function strip(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// 1. Beta invite
// ---------------------------------------------------------------------------
export async function sendBetaInvite(user, remainingSpots = 'a limited number') {
  const name = user.firstName || user.name || 'there';
  const subject = "You're invited — free access to Tenderpreneurs";

  const html = `
    <div style="max-width: 560px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; line-height: 1.6;">
      <p>Hi ${name},</p>

      <p>We’re giving <strong>${remainingSpots}</strong> SA businesses free Professional access for 60 days — in exchange for honest feedback that helps us build a product you’ll actually love.</p>

      <p>No catch, no credit card. Here’s what you unlock straight away:</p>
      <ul style="padding-left: 20px;">
        <li>Full tender details (no more summaries behind a paywall)</li>
        <li>AI compliance checker – catch missing docs before you submit</li>
        <li>AI bid drafter – turn a tender into a first draft in minutes</li>
        <li>Pipeline tracker – see every opportunity at a glance</li>
        <li>Custom alerts – never miss a relevant tender again</li>
      </ul>

      ${button('Claim your free access →', `${BASE_URL}/register?beta=true`)}

      <p>Fair warning – this link expires in <strong>48 hours</strong>. After that, the beta spots will be gone.</p>

      <p>If you have any questions just reply. I’m genuinely keen to hear what you think.</p>

      <p>— Lebo<br>Founder, Tenderpreneurs</p>
    </div>`;

  const text = strip(html).replace(/\s+/g, ' ');

  return resend.emails.send({
    from: FROM,
    to: user.email,
    subject,
    html,
    text,
  });
}

// ---------------------------------------------------------------------------
// 2. Beta welcome
// ---------------------------------------------------------------------------
export async function sendBetaWelcome(user) {
  const name = user.firstName || user.name || 'there';
  const subject = "Welcome to the beta — here's how to get started";

  const html = `
    <div style="max-width: 560px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; line-height: 1.6;">
      <p>Hey ${name},</p>
      <p>Your free Professional access is live. Here’s the quickest way to get value today:</p>

      <ol style="padding-left: 20px;">
        <li>
          <strong>Set up your tender alerts</strong> (2 min)<br>
          Tell us what you’re looking for and we’ll start surfacing matches.
          <br><a href="${BASE_URL}/app/alerts" target="_blank">Go to alerts →</a>
        </li>
        <li style="margin-top: 16px;">
          <strong>Find a tender and run a compliance check</strong><br>
          Pick any open tender and let the AI spot missing documents or risks before you invest time.
          <br><a href="${BASE_URL}/app/tenders" target="_blank">Browse tenders →</a>
        </li>
        <li style="margin-top: 16px;">
          <strong>Try the AI bid drafter on any tender</strong><br>
          Once you’ve checked compliance, let the AI produce a solid first draft in seconds.
          <br><a href="${BASE_URL}/app/bid-drafter" target="_blank">Open bid drafter →</a>
        </li>
      </ol>

      <p>I built Tenderpreneurs to take the pain out of bidding. If something feels clunky, broken, or you just have an idea – <strong>reply to this email</strong>. I read every message and I’ll often reply the same day.</p>

      <p>— Lebo<br>Founder, Tenderpreneurs</p>
    </div>`;

  const text = strip(html);

  return resend.emails.send({
    from: FROM,
    to: user.email,
    subject,
    html,
    text,
  });
}

// ---------------------------------------------------------------------------
// 3. Feedback request (after 7 days)
// ---------------------------------------------------------------------------
export async function sendBetaFeedbackRequest(user) {
  const name = user.firstName || user.name || 'there';
  const subject = "Quick question about your experience";

  const html = `
    <div style="max-width: 560px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; line-height: 1.6;">
      <p>Hey ${name},</p>

      <p>You’ve been using Tenderpreneurs for a week now – I’d love your honest take on a few things. Just reply to this email with your answers (even a few words helps massively).</p>

      <p><strong>1. What’s the most useful feature so far?</strong></p>
      <p><strong>2. What’s missing or broken?</strong></p>
      <p><strong>3. Would you pay R299/month after the beta?</strong> (No pressure – I’m just trying to work out if the pricing feels fair.)</p>

      <p>Thanks for helping shape this thing. It really means a lot.</p>

      <p>— Lebo</p>
    </div>`;

  const text = strip(html);

  return resend.emails.send({
    from: FROM,
    to: user.email,
    subject,
    html,
    text,
  });
}

// ---------------------------------------------------------------------------
// 4. Conversion offer (beta ending)
// ---------------------------------------------------------------------------
export async function sendBetaConversion(user, discountCode) {
  const name = user.firstName || user.name || 'there';
  const subject = "Your beta ends in 7 days — special offer inside";

  const html = `
    <div style="max-width: 560px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; line-height: 1.6;">
      <p>Hi ${name},</p>

      <p>Your 60-day free beta access wraps up in 7 days. I wanted to say a massive thank you for being part of the early group – your feedback has been gold.</p>

      <p>As a thank you, I’ve set up a special offer: <strong>40% off your first 3 months</strong>.</p>

      <div style="margin: 24px 0; padding: 24px; background: #f3fef6; border-left: 4px solid ${BRAND_COLOR}; border-radius: 8px;">
        <p style="margin: 0; font-size: 14px; color: #065f46;">Your discount code</p>
        <p style="margin: 8px 0 0; font-size: 28px; font-weight: bold; letter-spacing: 2px; color: #0f172a;">${discountCode}</p>
        <p style="margin: 8px 0 0; font-size: 15px; color: #065f46;">R299 → <strong>R179/month</strong> for the first 3 months</p>
      </div>

      ${button('Lock in my discount →', `${BASE_URL}/register?beta=true&code=${discountCode}`)}

      <p style="font-size: 14px; color: #6b7280;">The discount expires when your beta access ends. No credit card required to claim the code – just click above and it'll be attached to your account.</p>

      <p>— Lebo<br>Founder, Tenderpreneurs</p>
    </div>`;

  const text = strip(html);

  return resend.emails.send({
    from: FROM,
    to: user.email,
    subject,
    html,
    text,
  });
}