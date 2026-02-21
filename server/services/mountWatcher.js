'use strict';
// services/mountWatcher.js – Watches /proc/mounts for NFS mount changes.
//
// Every 60 seconds, reads /proc/mounts and extracts NFS entries.
// Compares against the previous snapshot to detect additions/removals.
// Exposes a getStatus() function and a changeVersion counter for polling.

const fs = require('fs');

const MOUNTS_FILE = '/proc/mounts';
const POLL_INTERVAL_MS = 60 * 1000;

// Internal state
let previousMountSet = null;  // Set of mount strings from last poll
let changeVersion = 0;        // Incremented on every detected change
let lastChangeAt = null;      // ISO timestamp of last change
let currentMounts = [];       // Current list of NFS mount entries

/**
 * Read /proc/mounts and extract all NFS mount entries.
 * Returns an array of { device, mountpoint, fstype, options } objects.
 */
function readNfsMounts() {
  try {
    const raw = fs.readFileSync(MOUNTS_FILE, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const nfsMounts = [];

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 4) continue;
      const [device, mountpoint, fstype] = parts;
      // Match nfs, nfs4, nfs3 etc.
      if (!fstype.startsWith('nfs')) continue;
      nfsMounts.push({ device, mountpoint, fstype, options: parts[3] });
    }

    return nfsMounts;
  } catch {
    return [];
  }
}

/**
 * Convert mount array to a stable string Set for diffing.
 * Key is "device:mountpoint" – sufficient to detect changes.
 */
function toMountSet(mounts) {
  return new Set(mounts.map(m => `${m.device}:${m.mountpoint}`));
}

/**
 * Compute the diff between two mount sets.
 * Returns { added: string[], removed: string[] }.
 *
 * Mount change detection diffing logic:
 * - added: entries in newSet that were not in oldSet
 * - removed: entries in oldSet that are not in newSet
 */
function diffMountSets(oldSet, newSet) {
  const added   = [...newSet].filter(m => !oldSet.has(m));
  const removed = [...oldSet].filter(m => !newSet.has(m));
  return { added, removed };
}

/**
 * Poll /proc/mounts and update internal state.
 * Increments changeVersion if any NFS mount additions or removals are detected.
 */
function poll() {
  const fresh = readNfsMounts();
  const freshSet = toMountSet(fresh);

  if (previousMountSet === null) {
    // First poll – establish baseline, no change event
    previousMountSet = freshSet;
    currentMounts = fresh;
    return;
  }

  const { added, removed } = diffMountSets(previousMountSet, freshSet);

  if (added.length > 0 || removed.length > 0) {
    changeVersion++;
    lastChangeAt = new Date().toISOString();
    console.log(`[mountWatcher] Mount change detected (v${changeVersion}): +${added.length} added, -${removed.length} removed`);
    if (added.length)   console.log(`[mountWatcher] Added:   ${added.join(', ')}`);
    if (removed.length) console.log(`[mountWatcher] Removed: ${removed.join(', ')}`);
  }

  previousMountSet = freshSet;
  currentMounts = fresh;
}

/**
 * Start the mount watcher polling loop.
 */
function start() {
  poll(); // Immediate first poll to establish baseline
  setInterval(poll, POLL_INTERVAL_MS);
  console.log('[mountWatcher] Started. Polling /proc/mounts every 60s.');
}

/**
 * Get current status for the /api/mounts/status endpoint.
 */
function getStatus() {
  return {
    changeVersion,
    lastChangeAt,
    mountCount: currentMounts.length,
    mounts: currentMounts,
  };
}

/**
 * Check if a specific mountpoint is currently mounted (NFS).
 * @param {string} mountpoint
 * @returns {boolean}
 */
function isMounted(mountpoint) {
  return currentMounts.some(m => m.mountpoint === mountpoint);
}

module.exports = { start, getStatus, isMounted, readNfsMounts };
