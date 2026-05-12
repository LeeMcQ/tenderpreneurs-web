const express = require('express');
const router = express.Router();
const { runImport } = require('../jobs/importTenders');

// ── Simple admin authorization middleware ──────────────────────────────────
function adminOnly(req, res, next) {
  const secret = process.env.ADMIN_SECRET || 'supersecret';
  // Use either a custom header or a Bearer token
  const provided =
    req.headers['x-admin-secret'] ||
    (req.headers.authorization || '').replace('Bearer ', '');

  if (provided === secret) {
    return next();
  }

  return res.status(403).json({ error: 'Forbidden: admin access required' });
}

// ── POST /api/v1/admin/import-tenders ──────────────────────────────────────
router.post('/api/v1/admin/import-tenders', adminOnly, async (req, res) => {
  try {
    console.log('[admin] Manual tender import triggered');
    const result = await runImport();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[admin] Manual import error:', error);
    res.status(500).json({
      error: 'Import failed',
      details: error.message,
    });
  }
});

module.exports = router;