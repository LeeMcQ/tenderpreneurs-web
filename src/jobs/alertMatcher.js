// src/jobs/alertMatcher.js

const email = require('../services/email');
const whatsapp = require('../services/whatsapp');
const { getUser, updateUser } = require('../models/user'); // hypothetical user access
const { insertAlertLog } = require('../models/alertLog'); // hypothetical alert log
const { Alert, AlertPreference } = require('../models/alert'); // hypothetical

/**
 * Process instant alerts for newly matched tenders.
 * @param {Array} matchedAlerts - array of { alert, user, tenders }
 */
async function runInstantAlerts(matchedAlerts) {
  for (const { alert, user, tenders } of matchedAlerts) {
    const userId = user.id;
    const channel = alert.alert_preference?.channel || 'email'; // default to email
    const canUseWhatsApp = user.plan !== 'free' && user.whatsapp_opted_in;

    // Logging helper
    const logSend = async (usedChannel) => {
      await insertAlertLog({
        userId,
        alertId: alert.id,
        tenderIds: tenders.map(t => t.id),
        channel: usedChannel,
        timestamp: new Date(),
      });
    };

    // ---------- EMAIL ONLY ----------
    if (channel === 'email') {
      // Existing email sending code (unchanged)
      await email.sendTenderAlert(alert, user, tenders);
      await logSend('email');
      continue;
    }

    // ---------- WHATSAPP ONLY ----------
    if (channel === 'whatsapp') {
      // Check if WhatsApp is allowed
      if (canUseWhatsApp && whatsapp.costGuard(userId) === false) {
        try {
          await whatsapp.sendTenderAlert(alert, user, tenders);
          await logSend('whatsapp');
          continue; // success, no fallback needed
        } catch (err) {
          console.error(`WhatsApp send failed for user ${userId}, falling back to email.`, err);
          // fallback to email
        }
      }
      // Fallback: send email (even if canUseWhatsApp false or costGuard true)
      await email.sendTenderAlert(alert, user, tenders);
      await logSend('email');
      continue;
    }

    // ---------- BOTH ----------
    if (channel === 'both') {
      // Always send email
      await email.sendTenderAlert(alert, user, tenders);

      let whatsappSent = false;
      if (canUseWhatsApp && whatsapp.costGuard(userId) === false) {
        try {
          await whatsapp.sendTenderAlert(alert, user, tenders);
          whatsappSent = true;
        } catch (err) {
          console.error(`WhatsApp send failed for user ${userId} in 'both' mode.`, err);
        }
      }

      // Log the combined channel string
      const loggedChannel = whatsappSent ? 'both' : 'email'; // if WhatsApp failed, only email sent effectively
      await logSend(loggedChannel);
      continue;
    }

    // Fallback for unknown channel (shouldn't happen)
    await email.sendTenderAlert(alert, user, tenders);
    await logSend('email');
  }
}

/**
 * Process daily alert digest.
 * @param {Array} userDailyDigests - array of { user, tenders, alertPreference }
 */
async function runDailyAlerts(userDailyDigests) {
  for (const { user, tenders, alertPreference } of userDailyDigests) {
    const userId = user.id;
    const channel = alertPreference?.channel || 'email';
    const canUseWhatsApp = user.plan !== 'free' && user.whatsapp_opted_in;

    const logDigestSend = async (usedChannel) => {
      await insertAlertLog({
        userId,
        alertId: null, // daily digest not tied to a specific alert
        tenderIds: tenders.map(t => t.id),
        channel: usedChannel,
        timestamp: new Date(),
      });
    };

    // ---------- EMAIL ONLY ----------
    if (channel === 'email') {
      // Existing daily email code (unchanged)
      await email.sendDailyDigest(user, tenders);
      await logDigestSend('email');
      continue;
    }

    // ---------- WHATSAPP ONLY ----------
    if (channel === 'whatsapp') {
      if (canUseWhatsApp && whatsapp.costGuard(userId) === false) {
        try {
          await whatsapp.sendDailyDigest(user, tenders);
          await logDigestSend('whatsapp');
          continue;
        } catch (err) {
          console.error(`Daily WhatsApp digest failed for user ${userId}, falling back to email.`, err);
        }
      }
      // Fallback to email
      await email.sendDailyDigest(user, tenders);
      await logDigestSend('email');
      continue;
    }

    // ---------- BOTH ----------
    if (channel === 'both') {
      // Always send email
      await email.sendDailyDigest(user, tenders);

      let whatsappSent = false;
      if (canUseWhatsApp && whatsapp.costGuard(userId) === false) {
        try {
          await whatsapp.sendDailyDigest(user, tenders);
          whatsappSent = true;
        } catch (err) {
          console.error(`Daily WhatsApp digest failed for user ${userId} in 'both' mode.`, err);
        }
      }
      const loggedChannel = whatsappSent ? 'both' : 'email';
      await logDigestSend(loggedChannel);
      continue;
    }

    // Fallback for safety
    await email.sendDailyDigest(user, tenders);
    await logDigestSend('email');
  }
}

module.exports = { runInstantAlerts, runDailyAlerts };