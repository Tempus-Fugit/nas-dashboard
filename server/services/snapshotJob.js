'use strict';
// services/snapshotJob.js – Daily cron job at 05:00.
// 1. Records disk usage snapshots into SQLite for all configured exports.
// 2. Sends alert email for Warning/Critical exports.
// 3. Runs export discovery and caches new exports.
// 4. Prunes snapshots older than 180 days.

const cron = require('node-cron');
const { dfAll } = require('./dfParser');
const { insertManySnapshots, pruneOldSnapshots } = require('../db/sqlite');
const { readConfig } = require('./configHelper');
const { sendAlerts } = require('./emailService');
const { runDiscovery } = require('./exportDiscovery');
const { buildMountpoint } = require('./mountHelper');

/**
 * Take a snapshot of all configured exports.
 * Reads filers.json and shares.json to know what to monitor.
 * Reads alerts.json for thresholds.
 * @returns {Promise<{total: number, errors: number}>}
 */
async function takeSnapshot() {
  console.log('[snapshotJob] Starting daily snapshot ...');

  const filersData = readConfig('filers.json');
  const sharesData = readConfig('shares.json');
  const alertsData = readConfig('alerts.json');

  const filerMap = new Map((filersData.filers || []).map(f => [f.name, f]));
  const shares = sharesData.shares || [];

  const timestamp = new Date().toISOString();
  const mountpoints = [];

  // Build list of mountpoints for all shares
  for (const share of shares) {
    const filer = filerMap.get(share.filer);
    if (!filer) continue;
    const mountpoint = buildMountpoint(filer.target_folder, share.export);
    mountpoints.push(mountpoint);
  }

  // Run df against all mountpoints in one call
  const dfResults = await dfAll(mountpoints);

  const rows = [];
  const warningThreshold  = alertsData.warning_threshold  || 80;
  const criticalThreshold = alertsData.critical_threshold || 90;
  const alertEntries = [];

  for (const share of shares) {
    const filer = filerMap.get(share.filer);
    if (!filer) continue;

    const mountpoint = buildMountpoint(filer.target_folder, share.export);
    const usage = dfResults.get(mountpoint);
    if (!usage) continue;

    rows.push({
      timestamp,
      filer:        share.filer,
      export:       share.export,
      mountpoint,
      total_kb:     usage.total_kb,
      used_kb:      usage.used_kb,
      free_kb:      usage.free_kb,
      percent_used: usage.percent_used,
    });

    // Collect alert candidates
    if (usage.percent_used >= criticalThreshold) {
      alertEntries.push({ ...share, ...usage, mountpoint, status: 'Critical' });
    } else if (usage.percent_used >= warningThreshold) {
      alertEntries.push({ ...share, ...usage, mountpoint, status: 'Warning' });
    }
  }

  // Insert all snapshot rows
  insertManySnapshots(rows);

  // Prune old snapshots (>180 days)
  const pruned = pruneOldSnapshots();
  if (pruned > 0) console.log(`[snapshotJob] Pruned ${pruned} old snapshot rows.`);

  // Send alert emails
  if (alertsData.enabled && alertEntries.length > 0) {
    try {
      await sendAlerts(alertEntries, alertsData);
    } catch (err) {
      console.error('[snapshotJob] Alert email failed:', err.message);
    }
  }

  // Run export discovery
  try {
    await runDiscovery();
  } catch (err) {
    console.error('[snapshotJob] Export discovery failed:', err.message);
  }

  console.log(`[snapshotJob] Snapshot complete. ${rows.length} exports recorded.`);
  return { total: rows.length, errors: shares.length - rows.length };
}

/**
 * Start the daily cron job.
 * Fires at 05:00 every day (reads snapshot_time from alerts.json at startup,
 * defaulting to "05:00").
 */
function startSnapshotJob() {
  // Read snapshot time from alerts.json at startup
  let cronExpression = '0 5 * * *'; // default 05:00
  try {
    const alerts = readConfig('alerts.json');
    if (alerts.snapshot_time) {
      const [hour, minute] = alerts.snapshot_time.split(':').map(Number);
      if (!isNaN(hour) && !isNaN(minute)) {
        cronExpression = `${minute} ${hour} * * *`;
      }
    }
  } catch {
    // Use default
  }

  cron.schedule(cronExpression, async () => {
    try {
      await takeSnapshot();
    } catch (err) {
      console.error('[snapshotJob] Unexpected error during snapshot:', err.message);
    }
  });

  console.log(`[snapshotJob] Daily snapshot cron scheduled: ${cronExpression}`);
}

module.exports = { startSnapshotJob, takeSnapshot };
