'use strict';
// services/exportDiscovery.js – Runs showmount -e against all configured filers
// and compares results against shares.json and dismissed_exports.json.
// Stores net-new exports for the Config page notification banner.
//
// showmount timeout handling:
//   All showmount calls enforce a 10-second timeout via child_process.exec
//   timeout option. On timeout: log the error, skip that filer, continue others.
//   The Config page endpoint surfaces per-filer timeout errors as inline messages.

const { exec } = require('child_process');
const path = require('path');
const { readConfig, writeConfig } = require('./configHelper');

const CONFIG_DIR = path.join(__dirname, '../../config');

/**
 * Run `showmount -e <host>` with a 10-second timeout.
 * Returns an array of export path strings, or throws on timeout/error.
 *
 * showmount timeout handling (discovery job context):
 *   On timeout: log the error, return empty array, continue to next filer.
 */
function showmount(host) {
  return new Promise((resolve, reject) => {
    // Enforce 10-second timeout on showmount
    exec(`showmount -e ${host} --no-headers`, { timeout: 10000 }, (err, stdout) => {
      if (err) {
        if (err.killed || err.signal === 'SIGTERM' || err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
          reject(new Error(`TIMEOUT: showmount -e ${host} exceeded 10 seconds`));
        } else {
          reject(new Error(`showmount failed for ${host}: ${err.message}`));
        }
        return;
      }

      const exports = stdout.trim().split('\n')
        .filter(Boolean)
        .map(line => line.trim().split(/\s+/)[0])
        .filter(Boolean);

      resolve(exports);
    });
  });
}

/**
 * Run export discovery against all filers in filers.json.
 * Compares against shares.json and dismissed_exports.json.
 * Net-new exports are written to a runtime store for the Config page.
 *
 * Called by the daily cron job at 05:00.
 */
async function runDiscovery() {
  console.log('[exportDiscovery] Starting daily export discovery ...');

  const filersData = readConfig('filers.json');
  const filers = filersData.filers || [];

  const sharesData = readConfig('shares.json');
  const existingExports = new Set(
    (sharesData.shares || []).map(s => `${s.filer}:${s.export}`)
  );

  const dismissedData = readConfig('dismissed_exports.json');
  const dismissedExports = new Set(
    (dismissedData.dismissed || []).map(d => `${d.filer}:${d.export}`)
  );

  const newExports = [];

  for (const filer of filers) {
    try {
      const exports = await showmount(filer.host);
      for (const exp of exports) {
        const key = `${filer.name}:${exp}`;
        if (!existingExports.has(key) && !dismissedExports.has(key)) {
          newExports.push({ filer: filer.name, export: exp, discoveredAt: new Date().toISOString() });
        }
      }
      console.log(`[exportDiscovery] Filer ${filer.name}: ${exports.length} exports found.`);
    } catch (err) {
      // showmount timeout handling (daily job): log and skip, do not abort
      console.error(`[exportDiscovery] WARNING: ${err.message} – skipping filer ${filer.name}`);
    }
  }

  // Write new-exports to a runtime cache file
  const newExportsPath = path.join(CONFIG_DIR, 'new_exports_cache.json');
  writeConfig('new_exports_cache.json', { newExports, updatedAt: new Date().toISOString() });

  console.log(`[exportDiscovery] Discovery complete. ${newExports.length} net-new exports found.`);
  return newExports;
}

/**
 * Run showmount against a single filer by name.
 * Used by GET /api/config/discover/:filerName.
 *
 * showmount timeout handling (Config page context):
 *   On timeout: throws an error which the route handler surfaces as
 *   a JSON error response. The frontend shows it as an inline error per filer.
 */
async function discoverFiler(filerName) {
  const filersData = readConfig('filers.json');
  const filer = (filersData.filers || []).find(f => f.name === filerName);
  if (!filer) throw new Error(`Filer not found: ${filerName}`);

  const exports = await showmount(filer.host);

  const sharesData = readConfig('shares.json');
  const existingExports = new Set(
    (sharesData.shares || []).filter(s => s.filer === filerName).map(s => s.export)
  );

  const dismissedData = readConfig('dismissed_exports.json');
  const dismissedExports = new Set(
    (dismissedData.dismissed || []).filter(d => d.filer === filerName).map(d => d.export)
  );

  return exports.map(exp => ({
    export: exp,
    alreadyMonitored: existingExports.has(exp),
    dismissed: dismissedExports.has(exp),
  }));
}

/**
 * Run showmount against all filers.
 * Used by GET /api/config/discover/all.
 *
 * showmount timeout handling (Config page context):
 *   Per-filer errors are included in the response as { error: string }
 *   entries rather than crashing the whole response.
 */
async function discoverAll() {
  const filersData = readConfig('filers.json');
  const filers = filersData.filers || [];
  const sharesData = readConfig('shares.json');
  const dismissedData = readConfig('dismissed_exports.json');

  const results = {};

  for (const filer of filers) {
    try {
      const exports = await showmount(filer.host);
      const existingExports = new Set(
        (sharesData.shares || []).filter(s => s.filer === filer.name).map(s => s.export)
      );
      const dismissedExports = new Set(
        (dismissedData.dismissed || []).filter(d => d.filer === filer.name).map(d => d.export)
      );

      results[filer.name] = exports.map(exp => ({
        export: exp,
        alreadyMonitored: existingExports.has(exp),
        dismissed: dismissedExports.has(exp),
      }));
    } catch (err) {
      // showmount timeout handling (Config page - all): include per-filer error
      results[filer.name] = { error: err.message };
    }
  }

  return results;
}

/**
 * Get currently cached new exports from the last discovery run.
 */
function getNewExports() {
  try {
    const data = readConfig('new_exports_cache.json');
    return data.newExports || [];
  } catch {
    return [];
  }
}

module.exports = { showmount, runDiscovery, discoverFiler, discoverAll, getNewExports };
