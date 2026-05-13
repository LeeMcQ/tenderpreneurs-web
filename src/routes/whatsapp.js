// src/routes/whatsapp.js
const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsapp');
const auth = require('../middleware/auth'); // assumed authentication middleware

// POST /api/v1/whatsapp/verify-start
router.post('/verify-start', auth, async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: 'Phone number required' });
  // Basic E.164 validation
  if (!/^\+[1-9]\d{1,14}$/.test(phoneNumber)) {
    return res.status(400).json({ error: 'Invalid phone number format (E.164)' });
  }
  try {
    const result = await whatsappService.sendVerificationCode(req.user.id, phoneNumber);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/whatsapp/verify-confirm
router.post('/verify-confirm', auth, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Verification code required' });
  try {
    const result = await whatsappService.verifyCode(req.user.id, code);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/whatsapp/webhook – Twilio incoming messages
router.post('/webhook', async (req, res) => {
  const { From, Body } = req.body; // Twilio POST fields
  if (!From || !Body) return res.sendStatus(200); // acknowledge
  try {
    await whatsappService.handleIncomingMessage(From, Body);
  } catch (err) {
    console.error('Webhook error:', err);
  }
  res.sendStatus(200); // always respond OK to Twilio
});

// POST /api/v1/whatsapp/opt-out
router.post('/opt-out', auth, async (req, res) => {
  try {
    const db = require('../db');
    await db.query('UPDATE users SET whatsapp_opted_in = false WHERE id = $1', [req.user.id]);
    res.json({ success: true, message: 'Opted out of WhatsApp alerts' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/whatsapp/preferences
router.put('/preferences', auth, async (req, res) => {
  const { channel } = req.body; // expected: 'email', 'whatsapp', 'both'
  if (!['email', 'whatsapp', 'both'].includes(channel)) {
    return res.status(400).json({ error: 'Invalid channel. Choose email, whatsapp, or both.' });
  }
  try {
    const db = require('../db');
    await db.query(
      `UPDATE alert_preferences SET channel = $1 WHERE user_id = $2`,
      [channel, req.user.id]
    );
    res.json({ success: true, channel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;