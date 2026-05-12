// src/routes/onboarding.js
const express = require('express');
const router = express.Router();
const db = require('../db'); // assume database connection module

// All routes require authentication
router.use((req, res, next) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
});

// POST /api/v1/onboarding/step
router.post('/step', async (req, res) => {
  try {
    const { step, data } = req.body;
    const userId = req.user.id;

    if (![1, 2, 3, 4].includes(step)) {
      return res.status(400).json({ error: 'Invalid step. Must be 1-4.' });
    }
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Data object required.' });
    }

    // Validate and update fields per step
    const updateFields = {};
    let requiredFields = [];

    switch (step) {
      case 1:
        requiredFields = ['role', 'company_name'];
        break;
      case 2:
        requiredFields = ['primary_province', 'primary_sectors'];
        break;
      case 3:
        requiredFields = ['bbbee_level', 'company_registration'];
        break;
      case 4:
        // Step 4 uses previously saved data; no new required fields in data itself
        break;
    }

    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
      // special handling for primary_sectors (must be array)
      if (field === 'primary_sectors') {
        if (!Array.isArray(data[field])) {
          return res.status(400).json({ error: 'primary_sectors must be an array' });
        }
        updateFields[field] = data[field]; // PostgreSQL will store as text[]
      } else {
        updateFields[field] = data[field];
      }
    }

    // For step 4 we don't have data fields; we use data stored previously
    if (step === 4) {
      // Retrieve user's previously saved province and sectors
      const userQuery = await db.query(
        'SELECT primary_province, primary_sectors FROM users WHERE id = $1',
        [userId]
      );
      const user = userQuery.rows[0];
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (!user.primary_province || !user.primary_sectors) {
        return res.status(400).json({ error: 'Province and sectors must be saved from previous steps' });
      }

      // Create default alert preference
      const existingAlert = await db.query(
        'SELECT id FROM alert_preferences WHERE user_id = $1',
        [userId]
      );
      if (existingAlert.rows.length === 0) {
        await db.query(
          'INSERT INTO alert_preferences (user_id, province, sectors) VALUES ($1, $2, $3)',
          [userId, user.primary_province, user.primary_sectors]
        );
      }

      updateFields.onboarding_completed = true;
    }

    // Update onboarding_step to the completed step
    updateFields.onboarding_step = step;

    // Build dynamic UPDATE query
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updateFields)) {
      setClauses.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
    values.push(userId);

    const query = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING onboarding_step, onboarding_completed`;
    const result = await db.query(query, values);
    const updated = result.rows[0];

    const nextStep = updated.onboarding_completed ? null : step < 4 ? step + 1 : null;
    const completionPercent = Math.round((step / 4) * 100);

    res.json({
      next_step: nextStep,
      completion_percent: completionPercent
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/onboarding/status
router.get('/status', async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await db.query(
      `SELECT onboarding_completed, onboarding_step,
              role, company_name, primary_province, primary_sectors,
              bbbee_level, company_registration
       FROM users WHERE id = $1`,
      [userId]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const missingFields = [];
    if (user.onboarding_completed) {
      // Nothing missing if completed
      return res.json({
        step: user.onboarding_step,
        completed: true,
        missing_fields: []
      });
    }

    // Check required fields that are still null/empty
    if (!user.role) missingFields.push('role');
    if (!user.company_name) missingFields.push('company_name');
    if (!user.primary_province) missingFields.push('primary_province');
    if (!user.primary_sectors || user.primary_sectors.length === 0) missingFields.push('primary_sectors');
    if (user.bbbee_level === null) missingFields.push('bbbee_level');
    if (!user.company_registration) missingFields.push('company_registration');

    res.json({
      step: user.onboarding_step,
      completed: false,
      missing_fields: missingFields
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/onboarding/skip
router.post('/skip', async (req, res) => {
  try {
    const userId = req.user.id;
    const data = req.body || {};

    // Allow saving any partial onboarding data they provided
    const allowedFields = [
      'role', 'company_name', 'company_registration',
      'bbbee_level', 'primary_province', 'primary_sectors',
      'referred_by', 'utm_source', 'utm_medium', 'utm_campaign'
    ];

    const updateFields = { onboarding_completed: true, onboarding_step: 4 };
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(data[field]);
        paramIndex++;
      }
    }

    // Always set onboarding_completed and step
    setClauses.push(`onboarding_completed = $${paramIndex++}`);
    values.push(true);
    setClauses.push(`onboarding_step = $${paramIndex++}`);
    values.push(4);

    values.push(userId);
    const query = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`;
    await db.query(query, values);

    res.json({ success: true, message: 'Onboarding skipped and marked complete' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;