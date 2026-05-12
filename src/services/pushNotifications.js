// src/services/pushNotifications.js
const webpush = require('web-push');
const pool = require('../db'); // your pg pool
require('dotenv').config();

// One-time VAPID configuration (call once at app startup)
webpush.setVapidDetails(
  'mailto:admin@tenderpreneurs.co.za',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

/**
 * Upsert a push subscription for a user.
 */
async function saveSubscription(userId, subscription) {
  const { endpoint, keys } = subscription;
  const { p256dh, auth } = keys;

  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, endpoint)
     DO UPDATE SET p256dh = $3, auth = $4, created_at = NOW()`,
    [userId, endpoint, p256dh, auth]
  );
}

/**
 * Send a push notification to all devices of a user.
 * Automatically removes expired subscriptions (HTTP 410).
 */
async function sendPushToUser(userId, payload) {
  const { rows } = await pool.query(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId]
  );

  const results = await Promise.allSettled(
    rows.map(sub =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        },
        JSON.stringify(payload)
      )
    )
  );

  // Clean up expired subscriptions
  results.forEach((result, index) => {
    if (result.status === 'rejected' && result.reason?.statusCode === 410) {
      pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [
        rows[index].endpoint,
        userId
      ]);
    }
  });
}

/**
 * Send an instant alert for a new matched tender.
 * Called from alertMatcher.js.
 */
async function sendAlertPush(userId, tender) {
  const title = `New tender: ${tender.title}`;
  const body = `${tender.entity} | R${tender.value} | Closes ${tender.closing_date}`;
  const url = `/tenders/${tender.id}`;

  await sendPushToUser(userId, {
    title,
    body,
    icon: '/icon-192x192.png', // adjust to your PWA icon
    url,
    tag: `tender-${tender.id}`   // prevents duplicate notifications
  });
}

module.exports = { saveSubscription, sendPushToUser, sendAlertPush };