// routes/config.mjs – Config management endpoints.
// Filer management, share management, alert settings,
// export discovery (showmount), and new-export notifications.

import express from 'express';
import { readConfig, writeConfig, readConfigOrDefault } from '../services/configHelper.mjs';
import { discoverFiler, discoverAll, getNewExports } from '../services/exportDiscovery.mjs';

const router = express.Router();

// ── Filer config ─────────────────────────────────────────────────────────────

router.get('/filers', (req, res) => {
  try {
    res.json(readConfig('filers.json'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/filers', (req, res) => {
  try {
    const data = req.body;
    if (!data || !Array.isArray(data.filers)) {
      return res.status(400).json({ error: 'Body must have a filers array' });
    }
    writeConfig('filers.json', data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Share config ──────────────────────────────────────────────────────────────

router.get('/shares', (req, res) => {
  try {
    res.json(readConfig('shares.json'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/shares', (req, res) => {
  try {
    const data = req.body;
    if (!data || !Array.isArray(data.shares)) {
      return res.status(400).json({ error: 'Body must have a shares array' });
    }
    writeConfig('shares.json', data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Alert config ──────────────────────────────────────────────────────────────

router.get('/alerts', (req, res) => {
  try {
    res.json(readConfig('alerts.json'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/alerts', (req, res) => {
  try {
    const data = req.body;
    writeConfig('alerts.json', data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Export discovery ──────────────────────────────────────────────────────────

/**
 * GET /api/config/discover/all
 * Run showmount -e against all filers.
 * showmount timeout handling (Config page context):
 *   Per-filer timeout errors are included in the response as { error: string }
 *   so the frontend can show inline errors per filer without leaving a spinner.
 */
router.get('/discover/all', async (req, res) => {
  try {
    const results = await discoverAll();
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/config/discover/:filerName
 * Run showmount -e against a single filer.
 * showmount timeout handling (Config page context):
 *   On timeout, returns 504 with a clear error message.
 *   Frontend shows inline error for that filer, clears spinner.
 */
router.get('/discover/:filerName', async (req, res) => {
  try {
    const results = await discoverFiler(req.params.filerName);
    res.json({ filer: req.params.filerName, exports: results });
  } catch (err) {
    if (err.message.startsWith('TIMEOUT:')) {
      return res.status(504).json({
        error: err.message,
        timeout: true,
        filer: req.params.filerName,
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── New exports notification ───────────────────────────────────────────────────

/**
 * GET /api/config/new-exports
 * Returns net-new exports from the last discovery run.
 */
router.get('/new-exports', (req, res) => {
  try {
    const newExports = getNewExports();
    res.json({ newExports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/config/new-exports/add
 * Add a discovered export to shares.json.
 * Body: { filer, export }
 */
router.post('/new-exports/add', (req, res) => {
  try {
    const { filer, export: exportPath } = req.body;
    if (!filer || !exportPath) {
      return res.status(400).json({ error: 'filer and export are required' });
    }

    const sharesData = readConfig('shares.json');
    const shares = sharesData.shares || [];

    // Avoid duplicates
    const exists = shares.some(s => s.filer === filer && s.export === exportPath);
    if (!exists) {
      shares.push({ filer, export: exportPath });
      writeConfig('shares.json', { shares });
    }

    // Remove from new_exports_cache
    _removeFromNewExportsCache(filer, exportPath);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/config/new-exports/dismiss
 * Add a discovered export to dismissed_exports.json.
 * Body: { filer, export }
 */
router.post('/new-exports/dismiss', (req, res) => {
  try {
    const { filer, export: exportPath } = req.body;
    if (!filer || !exportPath) {
      return res.status(400).json({ error: 'filer and export are required' });
    }

    const dismissedData = readConfigOrDefault('dismissed_exports.json', { dismissed: [] });
    const dismissed = dismissedData.dismissed || [];

    const exists = dismissed.some(d => d.filer === filer && d.export === exportPath);
    if (!exists) {
      dismissed.push({ filer, export: exportPath, dismissedAt: new Date().toISOString() });
      writeConfig('dismissed_exports.json', { dismissed });
    }

    _removeFromNewExportsCache(filer, exportPath);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Remove a specific entry from the new_exports_cache.json file.
 * @param {string} filer
 * @param {string} exportPath
 */
function _removeFromNewExportsCache(filer, exportPath) {
  try {
    const cacheData = readConfigOrDefault('new_exports_cache.json', { newExports: [] });
    const filtered = (cacheData.newExports || []).filter(
      e => !(e.filer === filer && e.export === exportPath)
    );
    writeConfig('new_exports_cache.json', { ...cacheData, newExports: filtered });
  } catch {
    // Non-fatal
  }
}

export default router;
