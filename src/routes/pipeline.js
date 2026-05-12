// src/routes/pipeline.js
const express = require('express');
const router = express.Router();
const pool = require('../db');                  // PostgreSQL connection pool
const auth = require('../middleware/auth');    // Authentication middleware (attaches req.user)

// Apply authentication to all pipeline routes
router.use(auth);

// Valid pipeline stages (order reflects natural flow)
const VALID_STAGES = [
  'identified',
  'bid_preparing',
  'submitted',
  'awarded',
  'lost',
  'withdrawn'
];

/**
 * Helper: check that an item belongs to the authenticated user.
 * Returns the item if found and owned, otherwise throws an error.
 */
async function getOwnedItem(itemId, userId) {
  const result = await pool.query(
    'SELECT * FROM pipeline_items WHERE id = $1',
    [itemId]
  );
  if (result.rows.length === 0) {
    const err = new Error('Pipeline item not found');
    err.status = 404;
    throw err;
  }
  const item = result.rows[0];
  if (item.user_id !== userId) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  return item;
}

/**
 * Helper: log a stage change to the audit table.
 */
async function logStageChange(itemId, oldStage, newStage, userId) {
  await pool.query(
    `INSERT INTO pipeline_audit (pipeline_item_id, old_stage, new_stage, changed_by)
     VALUES ($1, $2, $3, $4)`,
    [itemId, oldStage, newStage, userId]
  );
}

/**
 * GET /api/v1/pipeline
 * Return all pipeline items for the user, grouped by stage.
 * Response includes stage arrays and counts.
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Fetch pipeline items with their associated tender (if any)
    const result = await pool.query(
      `SELECT pi.*, t.title AS tender_title, t.tender_code
       FROM pipeline_items pi
       LEFT JOIN tenders t ON pi.tender_id = t.id
       WHERE pi.user_id = $1
       ORDER BY pi.created_at DESC`,
      [userId]
    );
    const items = result.rows;

    // Group items by stage and build counts
    const stages = {};
    const counts = {};

    VALID_STAGES.forEach(stage => {
      stages[stage] = [];
      counts[stage] = 0;
    });

    items.forEach(item => {
      if (stages[item.stage]) {
        stages[item.stage].push(item);
        counts[item.stage] += 1;
      } else {
        // In case of unexpected stage, still include it
        if (!stages[item.stage]) {
          stages[item.stage] = [];
          counts[item.stage] = 0;
        }
        stages[item.stage].push(item);
        counts[item.stage] += 1;
      }
    });

    res.json({ stages, counts });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/pipeline
 * Create a new pipeline item.
 * Body: { tender_id?, manual_title?, stage, priority,
 *         submission_date?, estimated_value_zar? }
 */
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      tender_id,
      manual_title,
      stage,
      priority,
      submission_date,
      estimated_value_zar
    } = req.body;

    // Validate: at least one of tender_id or manual_title must be provided
    if (!tender_id && !manual_title) {
      return res.status(400).json({
        error: 'Either tender_id or manual_title is required'
      });
    }

    // Validate stage
    if (!stage || !VALID_STAGES.includes(stage)) {
      return res.status(400).json({
        error: `Invalid stage. Must be one of: ${VALID_STAGES.join(', ')}`
      });
    }

    // Insert new item
    const insertResult = await pool.query(
      `INSERT INTO pipeline_items
        (user_id, tender_id, manual_title, stage, priority, submission_date, estimated_value_zar)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        userId,
        tender_id || null,
        manual_title || null,
        stage,
        priority || null,
        submission_date || null,
        estimated_value_zar || null
      ]
    );
    const newItem = insertResult.rows[0];

    // Fetch the full item with tender data
    const itemResult = await pool.query(
      `SELECT pi.*, t.title AS tender_title, t.tender_code
       FROM pipeline_items pi
       LEFT JOIN tenders t ON pi.tender_id = t.id
       WHERE pi.id = $1`,
      [newItem.id]
    );

    res.status(201).json(itemResult.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v1/pipeline/:id
 * Update any fields of the pipeline item.
 */
router.put('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;

    // Ownership check
    const item = await getOwnedItem(itemId, userId);

    // Extract allowed fields from body
    const {
      tender_id,
      manual_title,
      stage,
      priority,
      submission_date,
      estimated_value_zar
    } = req.body;

    // Build dynamic SET clause
    const updates = [];
    const values = [];
    let idx = 1;

    if (tender_id !== undefined) {
      updates.push(`tender_id = $${idx++}`);
      values.push(tender_id);
    }
    if (manual_title !== undefined) {
      updates.push(`manual_title = $${idx++}`);
      values.push(manual_title);
    }
    if (stage !== undefined) {
      if (!VALID_STAGES.includes(stage)) {
        return res.status(400).json({
          error: `Invalid stage. Must be one of: ${VALID_STAGES.join(', ')}`
        });
      }
      updates.push(`stage = $${idx++}`);
      values.push(stage);
    }
    if (priority !== undefined) {
      updates.push(`priority = $${idx++}`);
      values.push(priority);
    }
    if (submission_date !== undefined) {
      updates.push(`submission_date = $${idx++}`);
      values.push(submission_date);
    }
    if (estimated_value_zar !== undefined) {
      updates.push(`estimated_value_zar = $${idx++}`);
      values.push(estimated_value_zar);
    }

    if (updates.length === 0) {
      // No fields to update, return current item
      const current = await pool.query(
        `SELECT pi.*, t.title AS tender_title, t.tender_code
         FROM pipeline_items pi
         LEFT JOIN tenders t ON pi.tender_id = t.id
         WHERE pi.id = $1`,
        [itemId]
      );
      return res.json(current.rows[0]);
    }

    // Ensure at least one title remains after update
    const finalTenderId = tender_id !== undefined ? tender_id : item.tender_id;
    const finalManualTitle = manual_title !== undefined ? manual_title : item.manual_title;
    if (!finalTenderId && !finalManualTitle) {
      return res.status(400).json({
        error: 'At least one of tender_id or manual_title must be present'
      });
    }

    // If stage is changing to 'awarded', log the change
    const oldStage = item.stage;
    const newStage = stage !== undefined ? stage : oldStage;
    if (newStage === 'awarded' && oldStage !== 'awarded') {
      await logStageChange(itemId, oldStage, newStage, userId);
    }

    // Perform update
    values.push(itemId);
    await pool.query(
      `UPDATE pipeline_items SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${idx}`,
      values
    );

    // Return full updated item
    const updated = await pool.query(
      `SELECT pi.*, t.title AS tender_title, t.tender_code
       FROM pipeline_items pi
       LEFT JOIN tenders t ON pi.tender_id = t.id
       WHERE pi.id = $1`,
      [itemId]
    );

    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/pipeline/:id
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;

    // Ownership check (throws if not found or not owner)
    await getOwnedItem(itemId, userId);

    await pool.query('DELETE FROM pipeline_items WHERE id = $1', [itemId]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v1/pipeline/:id/move
 * Quick stage change for drag-and-drop operations.
 * Body: { stage }
 */
router.put('/:id/move', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;
    const { stage: newStage } = req.body;

    if (!newStage || !VALID_STAGES.includes(newStage)) {
      return res.status(400).json({
        error: `Invalid stage. Must be one of: ${VALID_STAGES.join(', ')}`
      });
    }

    // Ownership check
    const item = await getOwnedItem(itemId, userId);
    const oldStage = item.stage;

    // Log if moving to 'awarded'
    if (newStage === 'awarded' && oldStage !== 'awarded') {
      await logStageChange(itemId, oldStage, newStage, userId);
    }

    // Update only the stage
    await pool.query(
      `UPDATE pipeline_items SET stage = $1, updated_at = NOW() WHERE id = $2`,
      [newStage, itemId]
    );

    // Return updated item
    const updated = await pool.query(
      `SELECT pi.*, t.title AS tender_title, t.tender_code
       FROM pipeline_items pi
       LEFT JOIN tenders t ON pi.tender_id = t.id
       WHERE pi.id = $1`,
      [itemId]
    );

    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/pipeline/stats
 * Return aggregated statistics for the user's pipeline.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const statsResult = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE stage IN ('identified','bid_preparing','submitted')) AS total_active,
        COALESCE(SUM(estimated_value_zar) FILTER (WHERE stage IN ('identified','bid_preparing','submitted')), 0) AS total_value_zar,
        COUNT(*) FILTER (WHERE stage = 'submitted') AS submitted_count,
        COUNT(*) FILTER (WHERE stage = 'awarded') AS awarded_count,
        COUNT(*) FILTER (WHERE stage IN ('awarded','lost','withdrawn')) AS total_closed,
        COUNT(*) FILTER (WHERE submission_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '6 days') AS expiring_this_week
      FROM pipeline_items
      WHERE user_id = $1`,
      [userId]
    );

    const s = statsResult.rows[0];
    const totalActive = parseInt(s.total_active, 10);
    const totalValueZar = parseFloat(s.total_value_zar);
    const submittedCount = parseInt(s.submitted_count, 10);
    const awardedCount = parseInt(s.awarded_count, 10);
    const totalClosed = parseInt(s.total_closed, 10);
    const expiringThisWeek = parseInt(s.expiring_this_week, 10);

    const winRate = totalClosed > 0 ? (awardedCount / totalClosed) * 100 : 0;

    res.json({
      total_active: totalActive,
      total_value_zar: totalValueZar,
      submitted_count: submittedCount,
      win_rate: Math.round(winRate * 100) / 100, // two decimal places
      expiring_this_week: expiringThisWeek
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;