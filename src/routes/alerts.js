// src/routes/alerts.js
import { Router } from 'express';
import { pool } from '../db';
import auth from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(auth);

// GET /api/v1/alerts - List user's alert preferences
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, frequency, provinces, sectors, keywords, min_value_zar, is_active, created_at, updated_at
       FROM alert_preferences
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/alerts - Create new alert preference
router.post('/', async (req, res, next) => {
  try {
    const { frequency, provinces, sectors, keywords, min_value_zar } = req.body;

    // Validate required field
    if (!frequency || !['instant', 'daily', 'weekly'].includes(frequency)) {
      return res.status(400).json({ error: 'Valid frequency is required: instant, daily, or weekly' });
    }

    const { rows: [pref] } = await pool.query(
      `INSERT INTO alert_preferences 
         (user_id, frequency, provinces, sectors, keywords, min_value_zar, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [req.user.id, frequency, provinces || null, sectors || null, keywords || null, min_value_zar || null]
    );
    res.status(201).json(pref);
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/alerts/:id - Update alert preference
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { frequency, provinces, sectors, keywords, min_value_zar, is_active } = req.body;

    // Verify ownership
    const { rows: [existing] } = await pool.query(
      `SELECT id FROM alert_preferences WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Alert preference not found' });
    }

    // Build update fields
    const fields = [];
    const params = [];
    let counter = 1;

    if (frequency !== undefined) {
      fields.push(`frequency = $${counter++}`);
      params.push(frequency);
    }
    if (provinces !== undefined) {
      fields.push(`provinces = $${counter++}`);
      params.push(provinces);
    }
    if (sectors !== undefined) {
      fields.push(`sectors = $${counter++}`);
      params.push(sectors);
    }
    if (keywords !== undefined) {
      fields.push(`keywords = $${counter++}`);
      params.push(keywords);
    }
    if (min_value_zar !== undefined) {
      fields.push(`min_value_zar = $${counter++}`);
      params.push(min_value_zar);
    }
    if (is_active !== undefined) {
      fields.push(`is_active = $${counter++}`);
      params.push(is_active);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    params.push(id);
    params.push(req.user.id);

    const { rows: [updated] } = await pool.query(
      `UPDATE alert_preferences 
       SET ${fields.join(', ')}
       WHERE id = $${counter++} AND user_id = $${counter++}
       RETURNING *`,
      params
    );

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/alerts/:id - Delete alert preference
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: [existing] } = await pool.query(
      `SELECT id FROM alert_preferences WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Alert preference not found' });
    }

    await pool.query(`DELETE FROM alert_preferences WHERE id = $1`, [id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;