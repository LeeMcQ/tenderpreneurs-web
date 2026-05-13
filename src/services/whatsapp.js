// src/services/whatsapp.js
const twilio = require('twilio');
const db = require('../db');                 // assumes a pg pool or query helper
const config = require('../config');         // project configuration
const { getUserPlan, getTenderById } = require('../utils'); // assumed helpers

// In-memory storage for last digest (production: use DB/cache)
const lastDigestTenders = new Map(); // userId -> array of tender IDs

// Twilio client (configure from env)
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const twilioPhone = process.env.TWILIO_PHONE_NUMBER; // E.164

const DAILY_USER_LIMIT = parseFloat(process.env.WHATSAPP_DAILY_USER_LIMIT || '5');
const DAILY_PLATFORM_LIMIT = parseFloat(process.env.WHATSAPP_DAILY_PLATFORM_LIMIT || '500');
const ZAR_PER_USD = parseFloat(process.env.WHATSAPP_ZAR_PER_USD || '18'); // approximate

// ----------------------------------------------------------------
// 1. sendVerificationCode(userId, phoneNumber)
// ----------------------------------------------------------------
async function sendVerificationCode(userId, phoneNumber) {
  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Store in user record
  await db.query(
    `UPDATE users
        SET whatsapp_verification_code = $1,
            whatsapp_verification_expires_at = $2,
            whatsapp_number = $3
      WHERE id = $4`,
    [code, expiresAt, phoneNumber, userId]
  );

  // Format message
  const body = `Your Tenderpreneurs verification code: ${code}
Reply with this code to enable WhatsApp alerts.
Code expires in 10 minutes.`;

  // Send via Twilio
  let twilioSid = null;
  let costZar = 0;
  let status = 'sent';
  let errorMsg = null;

  try {
    const message = await client.messages.create({
      body,
      from: `whatsapp:${twilioPhone}`,
      to: `whatsapp:${phoneNumber}`
    });
    twilioSid = message.sid;
    // Twilio returns price in USD; convert to ZAR
    if (message.price && message.priceUnit === 'USD') {
      costZar = parseFloat(message.price) * ZAR_PER_USD;
    }
  } catch (err) {
    status = 'failed';
    errorMsg = err.message;
    console.error(`sendVerificationCode error for user ${userId}:`, err);
  }

  // Log to whatsapp_log
  await db.query(
    `INSERT INTO whatsapp_log
      (user_id, message_type, twilio_sid, status, cost_zar, error_message)
     VALUES ($1, 'verification', $2, $3, $4, $5)`,
    [userId, twilioSid, status, costZar, errorMsg]
  );

  return { success: status === 'sent', sid: twilioSid };
}

// ----------------------------------------------------------------
// 2. verifyCode(userId, code)
// ----------------------------------------------------------------
async function verifyCode(userId, code) {
  const { rows } = await db.query(
    `SELECT whatsapp_verification_code, whatsapp_verification_expires_at
       FROM users
      WHERE id = $1`,
    [userId]
  );

  if (rows.length === 0) return { success: false, reason: 'User not found' };

  const { whatsapp_verification_code: storedCode, whatsapp_verification_expires_at: expiresAt } = rows[0];

  if (storedCode !== code) return { success: false, reason: 'Invalid code' };
  if (new Date() > new Date(expiresAt)) return { success: false, reason: 'Code expired' };

  // Mark verified and opted in
  await db.query(
    `UPDATE users
        SET whatsapp_verified = true,
            whatsapp_opted_in = true,
            whatsapp_verification_code = NULL,
            whatsapp_verification_expires_at = NULL
      WHERE id = $1`,
    [userId]
  );

  return { success: true };
}

// ----------------------------------------------------------------
// 3. sendTenderAlert(userId, tender)
// ----------------------------------------------------------------
async function sendTenderAlert(userId, tender) {
  // Pre-flight checks
  const { rows } = await db.query(
    `SELECT whatsapp_verified, whatsapp_opted_in, plan
       FROM users
      WHERE id = $1`,
    [userId]
  );

  if (rows.length === 0) throw new Error('User not found');
  const user = rows[0];
  if (!user.whatsapp_verified || !user.whatsapp_opted_in) {
    return { success: false, reason: 'WhatsApp not verified or opted out' };
  }
  // Check plan – only professional/business (customize plan names as needed)
  const allowedPlans = ['professional', 'business'];
  if (!allowedPlans.includes(user.plan)) {
    return { success: false, reason: 'Plan does not support WhatsApp alerts' };
  }

  // Format message (max 1024 chars)
  const closingDate = tender.closing_date
    ? new Date(tender.closing_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'N/A';
  const valueFormatted = tender.value ? `R${Number(tender.value).toLocaleString('en-ZA')}` : 'Not specified';

  let body = `🔔 *New Tender Match*

📋 ${tender.title}
🏛️ ${tender.entity}
📍 ${tender.province} | ${tender.sector}
💰 ${valueFormatted}
⏰ Closes: ${closingDate}

View: tenderpreneurs.co.za/t/${tender.id}

Reply STOP to pause alerts`;

  // Truncate to 1024 characters (Twilio limit for WhatsApp body)
  if (body.length > 1024) body = body.substring(0, 1020) + '...';

  // Send via Twilio
  let twilioSid = null;
  let costZar = 0;
  let status = 'sent';
  let errorMsg = null;

  try {
    const message = await client.messages.create({
      body,
      from: `whatsapp:${twilioPhone}`,
      to: `whatsapp:${user.whatsapp_number}`
    });
    twilioSid = message.sid;
    if (message.price && message.priceUnit === 'USD') {
      costZar = parseFloat(message.price) * ZAR_PER_USD;
    }
  } catch (err) {
    status = 'failed';
    errorMsg = err.message;
    console.error(`sendTenderAlert error for user ${userId}:`, err);
  }

  // Log
  await db.query(
    `INSERT INTO whatsapp_log
      (user_id, message_type, tender_id, twilio_sid, status, cost_zar, error_message)
     VALUES ($1, 'tender_alert', $2, $3, $4, $5, $6)`,
    [userId, tender.id, twilioSid, status, costZar, errorMsg]
  );

  return { success: status === 'sent', sid: twilioSid };
}

// ----------------------------------------------------------------
// 4. sendDailyDigest(userId, tenders[])
// ----------------------------------------------------------------
async function sendDailyDigest(userId, tenders) {
  const { rows } = await db.query(
    `SELECT whatsapp_verified, whatsapp_opted_in, whatsapp_number
       FROM users
      WHERE id = $1`,
    [userId]
  );

  if (rows.length === 0 || !rows[0].whatsapp_verified || !rows[0].whatsapp_opted_in) {
    return { success: false, reason: 'Not eligible' };
  }

  const phone = rows[0].whatsapp_number;
  // Take up to 5 tenders
  const selected = tenders.slice(0, 5);
  if (selected.length === 0) return { success: false, reason: 'No tenders' };

  // Build message
  const parts = ['📬 *Daily Tender Digest*', ''];
  selected.forEach((t, idx) => {
    parts.push(`${idx + 1}. ${t.title}`);
    parts.push(`   ${t.entity} — R${Number(t.value || 0).toLocaleString('en-ZA')}`);
    parts.push(`   Closes: ${new Date(t.closing_date).toLocaleDateString('en-ZA')}`);
    parts.push('');
  });
  parts.push('Reply with the number for full details.');

  let body = parts.join('\n');
  if (body.length > 1024) body = body.substring(0, 1020) + '...';

  // Store digest tenders for later reply lookup
  lastDigestTenders.set(userId, selected.map(t => t.id));

  let twilioSid = null;
  let costZar = 0;
  let status = 'sent';
  let errorMsg = null;

  try {
    const message = await client.messages.create({
      body,
      from: `whatsapp:${twilioPhone}`,
      to: `whatsapp:${phone}`
    });
    twilioSid = message.sid;
    if (message.price && message.priceUnit === 'USD') {
      costZar = parseFloat(message.price) * ZAR_PER_USD;
    }
  } catch (err) {
    status = 'failed';
    errorMsg = err.message;
  }

  await db.query(
    `INSERT INTO whatsapp_log
      (user_id, message_type, twilio_sid, status, cost_zar, error_message)
     VALUES ($1, 'daily_digest', $2, $3, $4, $5)`,
    [userId, twilioSid, status, costZar, errorMsg]
  );

  return { success: status === 'sent' };
}

// ----------------------------------------------------------------
// 5. handleIncomingMessage(from, body)
// ----------------------------------------------------------------
async function handleIncomingMessage(from, body) {
  // 'from' is the WhatsApp number, e.g., "whatsapp:+27123456789"
  const phoneNumber = from.replace('whatsapp:', '');

  // Find user by whatsapp_number
  const { rows } = await db.query(
    `SELECT id, whatsapp_verification_code, whatsapp_opted_in
       FROM users
      WHERE whatsapp_number = $1`,
    [phoneNumber]
  );

  if (rows.length === 0) {
    console.warn(`Incoming WhatsApp from unknown number: ${phoneNumber}`);
    return;
  }

  const user = rows[0];
  const userId = user.id;
  const normalizedBody = body.trim().toUpperCase();

  // Log incoming message
  await db.query(
    `INSERT INTO whatsapp_log (user_id, message_type, status, error_message)
     VALUES ($1, 'incoming', 'delivered', $2)`,
    [userId, body]
  );

  // Check for verification code
  if (user.whatsapp_verification_code && body.trim() === user.whatsapp_verification_code) {
    const result = await verifyCode(userId, body.trim());
    if (result.success) {
      // Send confirmation
      await client.messages.create({
        body: '✅ Your WhatsApp alerts are now active!',
        from: `whatsapp:${twilioPhone}`,
        to: `whatsapp:${phoneNumber}`
      });
    } else {
      await client.messages.create({
        body: `❌ Verification failed: ${result.reason}. Please try again.`,
        from: `whatsapp:${twilioPhone}`,
        to: `whatsapp:${phoneNumber}`
      });
    }
    return;
  }

  // Handle STOP / START commands
  if (normalizedBody === 'STOP') {
    await db.query('UPDATE users SET whatsapp_opted_in = false WHERE id = $1', [userId]);
    await client.messages.create({
      body: 'You have been unsubscribed from WhatsApp alerts. Reply START to resume.',
      from: `whatsapp:${twilioPhone}`,
      to: `whatsapp:${phoneNumber}`
    });
    return;
  }

  if (normalizedBody === 'START') {
    await db.query('UPDATE users SET whatsapp_opted_in = true WHERE id = $1', [userId]);
    await client.messages.create({
      body: 'Welcome back! WhatsApp alerts are now active.',
      from: `whatsapp:${twilioPhone}`,
      to: `whatsapp:${phoneNumber}`
    });
    return;
  }

  // Handle numeric replies (1-5) for digest details
  const num = parseInt(normalizedBody, 10);
  if (num >= 1 && num <= 5 && lastDigestTenders.has(userId)) {
    const tenderIds = lastDigestTenders.get(userId);
    if (num <= tenderIds.length) {
      const tenderId = tenderIds[num - 1];
      try {
        const tender = await getTenderById(tenderId); // helper to fetch full tender
        if (tender) {
          const detailMsg = `📋 *${tender.title}*\n\n` +
            `🏛️ ${tender.entity}\n` +
            `📍 ${tender.province} | ${tender.sector}\n` +
            `💰 R${Number(tender.value || 0).toLocaleString('en-ZA')}\n` +
            `⏰ Closes: ${new Date(tender.closing_date).toLocaleDateString('en-ZA')}\n\n` +
            `📄 ${tender.description || ''}\n\n` +
            `🔗 tenderpreneurs.co.za/t/${tender.id}`;

          await client.messages.create({
            body: detailMsg.substring(0, 1024),
            from: `whatsapp:${twilioPhone}`,
            to: `whatsapp:${phoneNumber}`
          });
        }
      } catch (err) {
        console.error(`Error sending digest detail for tender ${tenderId}:`, err);
      }
    }
    return;
  }

  // Fallback reply
  await client.messages.create({
    body: 'Reply with the verification code, STOP to unsubscribe, or a number (1-5) from the latest digest.',
    from: `whatsapp:${twilioPhone}`,
    to: `whatsapp:${phoneNumber}`
  });
}

// ----------------------------------------------------------------
// 6. costGuard(userId)
// ----------------------------------------------------------------
async function costGuard(userId) {
  // Daily limit per user
  const { rows: userRows } = await db.query(
    `SELECT COALESCE(SUM(cost_zar), 0) as total
       FROM whatsapp_log
      WHERE user_id = $1
        AND sent_at >= CURRENT_DATE`,
    [userId]
  );
  const userTotal = parseFloat(userRows[0].total);
  if (userTotal >= DAILY_USER_LIMIT) return true;

  // Platform daily limit
  const { rows: platformRows } = await db.query(
    `SELECT COALESCE(SUM(cost_zar), 0) as total
       FROM whatsapp_log
      WHERE sent_at >= CURRENT_DATE`
  );
  const platformTotal = parseFloat(platformRows[0].total);
  if (platformTotal >= DAILY_PLATFORM_LIMIT) return true;

  return false;
}

module.exports = {
  sendVerificationCode,
  verifyCode,
  sendTenderAlert,
  sendDailyDigest,
  handleIncomingMessage,
  costGuard
};