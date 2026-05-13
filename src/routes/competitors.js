// routes/competitors.js
// Express router for competitor tracking features.
// All routes require authentication and 'professional' or 'business' plan.

const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated, requirePlan } = require('../middleware/auth');
const {
  getCompetitorStats,
  getCompetitorIntelligence
} = require('../services/competitorAlerts');

// Apply auth & plan requirement to all routes
router.use(isAuthenticated);
router.use(requirePlan('professional', 'business'));

// ---- CRUD for tracked competitors ----

// List tracked competitors for the logged-in user
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, competitor_name, competitor_registration, notes, alert_on_new_award, created_at
       FROM tracked_competitors
       WHERE user_id = $1
       ORDER BY competitor_name ASC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add a new competitor to track
router.post('/', async (req, res) => {
  const { competitor_name, competitor_registration, notes, alert_on_new_award } = req.body;
  if (!competitor_name) {
    return res.status(400).json({ error: 'competitor_name is required' });
  }
  try {
    const result = await db.query(
      `INSERT INTO tracked_competitors (user_id, competitor_name, competitor_registration, notes, alert_on_new_award)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, competitor_name) DO UPDATE SET
         competitor_registration = EXCLUDED.competitor_registration,
         notes = EXCLUDED.notes,
         alert_on_new_award = EXCLUDED.alert_on_new_award
       RETURNING *`,
      [req.user.id, competitor_name, competitor_registration || null, notes || null, alert_on_new_award ?? true]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a tracked competitor
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `DELETE FROM tracked_competitors WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Not found or not yours' });
    }
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---- Awards & Intelligence for a specific tracked competitor ----

// Get recent awards + stats for a tracked competitor (uses the tracked name)
router.get('/:id/awards', async (req, res) => {
  try {
    // Fetch tracked competitor record
    const tracked = await db.query(
      `SELECT * FROM tracked_competitors WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (tracked.rows.length === 0) {
      return res.status(404).json({ error: 'Competitor not found' });
    }

    const competitorName = tracked.rows[0].competitor_name;

    // Return recent awards (last 20) and aggregated stats
    const awardsRes = await db.query(
      `SELECT ta.id, ta.winner_name, ta.award_value_zar, ta.award_date, ta.source,
              t.title AS tender_title, t.reference_number
       FROM tender_awards ta
       JOIN tenders t ON ta.tender_id = t.id
       WHERE ta.winner_name ILIKE $1
       ORDER BY ta.award_date DESC
       LIMIT 20`,
      [`%${competitorName}%`]
    );

    const stats = await getCompetitorStats(competitorName, req.user.id);

    res.json({
      competitor: tracked.rows[0],
      awards: awardsRes.rows.map(a => ({
        id: a.id,
        tender: a.tender_title,
        reference: a.reference_number,
        winner: a.winner_name,
        value: Number(a.award_value_zar),
        date: a.award_date,
        source: a.source
      })),
      stats
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get competitive intelligence for a tracked competitor
router.get('/:id/intelligence', async (req, res) => {
  try {
    const tracked = await db.query(
      `SELECT competitor_name FROM tracked_competitors WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (tracked.rows.length === 0) {
      return res.status(404).json({ error: 'Competitor not found' });
    }

    const intelligence = await getCompetitorIntelligence(tracked.rows[0].competitor_name);
    res.json(intelligence);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---- Search / Autocomplete ----
router.get('/search', async (req, res) => {
  const q = req.query.q;
  if (!q || q.length < 2) {
    return res.json([]);
  }
  try {
    const result = await db.query(
      `SELECT DISTINCT winner_name
       FROM tender_awards
       WHERE winner_name ILIKE $1
       ORDER BY winner_name
       LIMIT 10`,
      [`%${q}%`]
    );
    res.json(result.rows.map(r => r.winner_name));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---- Leaderboard (industry benchmark) ----
router.get('/leaderboard', async (req, res) => {
  try {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

    const result = await db.query(
      `SELECT winner_name,
              COUNT(*)::int AS award_count,
              SUM(award_value_zar)::bigint AS total_value_zar
       FROM tender_awards
       WHERE award_date >= $1
       GROUP BY winner_name
       ORDER BY total_value_zar DESC
       LIMIT 20`,
      [twelveMonthsAgo]
    );

    res.json(result.rows.map(r => ({
      winner_name: r.winner_name,
      award_count: r.award_count,
      total_value_zar: Number(r.total_value_zar)
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;