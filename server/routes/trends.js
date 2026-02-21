'use strict';
// routes/trends.js – Historical snapshot data for the Trends page.
// GET /api/trends?days=180    – All exports, up to N days of history
// GET /api/trends/:export     – Single export (filer+export as query params)

const express = require('express');
const router = express.Router();
const { getTrends, getExportTrends } = require('../db/sqlite');

/**
 * GET /api/trends?days=180
 * Returns snapshot history for all exports.
 */
router.get('/', (req, res) => {
  const days = parseInt(req.query.days || '180', 10);
  if (isNaN(days) || days < 1 || days > 365) {
    return res.status(400).json({ error: 'days must be between 1 and 365' });
  }
  try {
    const rows = getTrends(days);
    res.json({ days, count: rows.length, snapshots: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/trends/:export?filer=nfs1&days=180
 * Returns snapshot history for a single export.
 * :export is URL-encoded export path (e.g. /exports/engineering → %2Fexports%2Fengineering)
 */
router.get('/:export(*)', (req, res) => {
  const exportPath = req.params.export || req.query.export;
  const filer = req.query.filer;
  const days = parseInt(req.query.days || '180', 10);

  if (!exportPath) {
    return res.status(400).json({ error: 'export path is required' });
  }
  if (!filer) {
    return res.status(400).json({ error: 'filer query parameter is required' });
  }
  if (isNaN(days) || days < 1 || days > 365) {
    return res.status(400).json({ error: 'days must be between 1 and 365' });
  }

  try {
    // Decode the export path in case it was URL-encoded
    const decodedExport = decodeURIComponent(exportPath);
    const rows = getExportTrends(filer, decodedExport, days);
    res.json({ filer, export: decodedExport, days, count: rows.length, snapshots: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
