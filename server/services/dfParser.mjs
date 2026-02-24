// services/dfParser.mjs – Runs `df -k` against a mountpoint and parses output.
// Returns structured disk usage data.

import { execFile } from 'child_process';

/**
 * Run `df -k` on a single mountpoint and parse the result.
 * @param {string} mountpoint
 * @returns {Promise<{total_kb, used_kb, free_kb, percent_used}|null>}
 */
function dfSingle(mountpoint) {
  return new Promise((resolve) => {
    execFile('df', ['-k', '--output=size,used,avail,pcent', mountpoint], { timeout: 10000 }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      // Output lines: header + data
      // Filesystem  1K-blocks  Used  Available Use%
      const lines = stdout.trim().split('\n').filter(Boolean);
      if (lines.length < 2) {
        resolve(null);
        return;
      }
      const parts = lines[1].trim().split(/\s+/);
      // With --output=size,used,avail,pcent: [size, used, avail, pcent%]
      if (parts.length < 4) {
        resolve(null);
        return;
      }
      const total_kb = parseInt(parts[0], 10);
      const used_kb  = parseInt(parts[1], 10);
      const free_kb  = parseInt(parts[2], 10);
      const pctStr   = parts[3].replace('%', '');
      const percent_used = parseFloat(pctStr);

      if (isNaN(total_kb) || isNaN(used_kb) || isNaN(free_kb)) {
        resolve(null);
        return;
      }

      resolve({ total_kb, used_kb, free_kb, percent_used });
    });
  });
}

/**
 * Run `df -k` on all mount points and return a map of mountpoint → usage.
 * Uses a single df call for all paths for efficiency.
 * @param {string[]} mountpoints
 * @returns {Promise<Map<string, {total_kb, used_kb, free_kb, percent_used}>>}
 */
function dfAll(mountpoints) {
  if (!mountpoints || mountpoints.length === 0) {
    return Promise.resolve(new Map());
  }

  return new Promise((resolve) => {
    execFile('df', ['-k', '--output=target,size,used,avail,pcent', ...mountpoints], { timeout: 15000 }, (err, stdout) => {
      const result = new Map();
      if (err) {
        resolve(result);
        return;
      }
      const lines = stdout.trim().split('\n').filter(Boolean);
      // Skip header line
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        // target size used avail pcent
        if (parts.length < 5) continue;
        const mountpoint  = parts[0];
        const total_kb    = parseInt(parts[1], 10);
        const used_kb     = parseInt(parts[2], 10);
        const free_kb     = parseInt(parts[3], 10);
        const percent_used = parseFloat(parts[4].replace('%', ''));
        if (!isNaN(total_kb)) {
          result.set(mountpoint, { total_kb, used_kb, free_kb, percent_used });
        }
      }
      resolve(result);
    });
  });
}

export { dfSingle, dfAll };
