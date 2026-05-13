const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const auth = require('../middleware/auth'); // Assumes req.user.id set
const googleCalendar = require('../services/googleCalendar');
const icalFeed = require('../services/icalFeed');

const router = express.Router();

// GET /api/v1/calendar/google/auth
router.get('/google/auth', auth, (req, res) => {
  const url = googleCalendar.getAuthUrl(req.user.id);
  res.json({ url });
});

// GET /api/v1/calendar/google/callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('Missing parameters');

    // Verify state JWT
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    const userId = decoded.userId;

    await googleCalendar.handleCallback(code, userId);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard/settings?calendar=connected`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard/settings?calendar=error`);
  }
});

// POST /api/v1/calendar/google/disconnect
router.post('/google/disconnect', auth, async (req, res) => {
  try {
    await db.query(
      `UPDATE users 
       SET google_calendar_token = NULL,
           google_calendar_refresh_token = NULL,
           calendar_sync_enabled = false
       WHERE id = $1`,
      [req.user.id]
    );
    // Optionally clean up events
    await db.query('DELETE FROM calendar_events WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'Disconnected' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// POST /api/v1/calendar/sync-pipeline
router.post('/sync-pipeline', auth, async (req, res) => {
  try {
    const { tender_id } = req.body;
    if (!tender_id) return res.status(400).json({ error: 'tender_id required' });

    // Sync to Google if enabled
    const { rows } = await db.query(
      'SELECT calendar_sync_enabled FROM users WHERE id = $1',
      [req.user.id]
    );
    if (rows[0]?.calendar_sync_enabled) {
      await googleCalendar.syncTenderEvents(req.user.id, tender_id);
    }

    res.json({ message: 'Pipeline events synced' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// GET /api/v1/calendar/ical/:token
router.get('/ical/:token', async (req, res) => {
  try {
    const feed = await icalFeed.generateIcalFeed(req.params.token);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.send(feed);
  } catch (err) {
    console.error(err);
    res.status(404).send('Invalid or expired feed token');
  }
});

// POST /api/v1/calendar/ical/regenerate
router.post('/ical/regenerate', auth, async (req, res) => {
  try {
    const newToken = crypto.randomUUID();
    await db.query(
      'UPDATE users SET ical_feed_token = $1 WHERE id = $2',
      [newToken, req.user.id]
    );
    res.json({
      url: `https://api.tenderpreneurs.co.za/api/v1/calendar/ical/${newToken}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Regeneration failed' });
  }
});

module.exports = router;

/* 
  Auto-trigger integration points (to be added in pipeline/tender routes):
  1. When user adds tender to pipeline (POST /pipeline):
       await fetch(`/api/v1/calendar/sync-pipeline`, { method:'POST', body:{ tender_id } })
  2. When briefing_date or site_visit_date is updated on a tender:
       → Find all users tracking that tender and call syncTenderEvents() for each.
*/