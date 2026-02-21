'use strict';
// routes/mounts.js – Live mount data endpoints.
// GET /api/mounts        – All configured shares with live df usage
// GET /api/mounts/status – Mount change detection state (for polling)

const express = require('express');
const router = express.Router();
const { dfAll } = require('../services/dfParser');
const { getStatus } = require('../services/mountWatcher');
const { readConfig } = require('../services/configHelper');
const { buildMountpoint } = require('../services/mountHelper');

/**
 * GET /api/mounts
 * Returns all configured shares with live disk usage from df -k.
 * Shares that are not mounted return status "not_mounted".
 */
router.get('/', async (req, res) => {
  try {
    const filersData = readConfig('filers.json');
    const sharesData = readConfig('shares.json');
    const alertsData = readConfig('alerts.json');

    const filerMap = new Map((filersData.filers || []).map(f => [f.name, f]));
    const shares = sharesData.shares || [];

    const warningThreshold  = alertsData.warning_threshold  || 80;
    const criticalThreshold = alertsData.critical_threshold || 90;

    // Build mountpoints for all shares
    const mountpointMap = new Map();
    for (const share of shares) {
      const filer = filerMap.get(share.filer);
      if (!filer) continue;
      const mountpoint = buildMountpoint(filer.target_folder, share.export);
      mountpointMap.set(`${share.filer}:${share.export}`, mountpoint);
    }

    // Single df call for all mountpoints
    const allMountpoints = [...mountpointMap.values()];
    const dfResults = await dfAll(allMountpoints);

    const result = shares.map(share => {
      const filer = filerMap.get(share.filer);
      const mountpoint = mountpointMap.get(`${share.filer}:${share.export}`);
      const usage = mountpoint ? dfResults.get(mountpoint) : null;

      let status = 'not_mounted';
      if (usage) {
        if (usage.percent_used >= criticalThreshold) status = 'critical';
        else if (usage.percent_used >= warningThreshold) status = 'warning';
        else status = 'ok';
      }

      return {
        filer:      share.filer,
        export:     share.export,
        server:     filer ? filer.host : 'unknown',
        mountpoint: mountpoint || null,
        total_kb:   usage ? usage.total_kb  : null,
        used_kb:    usage ? usage.used_kb   : null,
        free_kb:    usage ? usage.free_kb   : null,
        percent_used: usage ? usage.percent_used : null,
        status,
      };
    });

    res.json({ shares: result, thresholds: { warning: warningThreshold, critical: criticalThreshold } });
  } catch (err) {
    console.error('[mounts] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/mounts/status
 * Returns the current mount watcher state for change detection polling.
 * Frontend polls this every 60 seconds and compares changeVersion.
 */
router.get('/status', (req, res) => {
  try {
    const status = getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
