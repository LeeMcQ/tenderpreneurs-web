// src/routes/push.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // your JWT/session auth middleware
const { saveSubscription, sendPushToUser } = require('../services/pushNotifications');

// POST /api/v1/push/subscribe
router.post('/subscribe', auth, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }
    await saveSubscription(req.user.id, subscription);
    res.status(201).json({ message: 'Subscription saved' });
  } catch (err) {
    console.error('Subscribe error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/push/unsubscribe
router.delete('/unsubscribe', auth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'Missing endpoint' });
    }
    await pool.query(
      'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [req.user.id, endpoint]
    );
    res.json({ message: 'Unsubscribed' });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;