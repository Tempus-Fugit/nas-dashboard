'use strict';
// services/duRunner.js – Directory size (du) and listing (ls) helpers.
//
// CRITICAL IMPLEMENTATION NOTE for listDirectory:
// Uses `ls -la --time-style=+%s` which produces 7 columns per line:
//   [0]permissions [1]links [2]owner [3]group [4]size [5]epoch [6]filename
// Column guard: parts.length < 7  (NOT 9 – using 9 discards every entry)
// Filename:     parts.slice(6).join(' ')  (NOT parts.slice(8))
// Timestamp:    parts[5]  (epoch seconds)
//
// Path traversal protection: all paths validated against ALLOWED_ROOTS before
// any shell command is executed.

const { execFile } = require('child_process');
const path = require('path');

// Allowed mount roots for path traversal protection (Browse page)
const ALLOWED_ROOTS = ['/HNAS', '/NetApp'];

/**
 * Validate that a given path is under one of the allowed mount roots.
 * Prevents path traversal attacks (e.g. path=../../../../etc/passwd).
 * @param {string} inputPath
 * @returns {boolean}
 */
function isPathAllowed(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return false;
  const resolved = path.resolve(inputPath);
  return ALLOWED_ROOTS.some(root => resolved === root || resolved.startsWith(root + '/'));
}

/**
 * Get the total disk usage of a directory via `du -sk`.
 * Enforces a 30-second timeout; rejects with a timeout error if exceeded.
 * @param {string} dirPath
 * @returns {Promise<{path: string, size_kb: number}>}
 */
function getDirSize(dirPath) {
  if (!isPathAllowed(dirPath)) {
    return Promise.reject(new Error(`Path traversal blocked: ${dirPath}`));
  }

  return new Promise((resolve, reject) => {
    // 30-second timeout as required
    execFile('du', ['-sk', dirPath], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        if (err.killed || err.signal === 'SIGTERM') {
          reject(new Error('TIMEOUT: du took longer than 30 seconds'));
        } else {
          reject(new Error(`du failed: ${err.message}`));
        }
        return;
      }
      const parts = stdout.trim().split('\t');
      const size_kb = parseInt(parts[0], 10);
      resolve({ path: dirPath, size_kb: isNaN(size_kb) ? 0 : size_kb });
    });
  });
}

/**
 * List directory contents using `ls -la --time-style=+%s`.
 *
 * Column layout (7 columns with --time-style=+%s):
 *   [0] permissions  [1] links  [2] owner  [3] group
 *   [4] size(bytes)  [5] epoch  [6..] filename
 *
 * Guard: parts.length < 7 (NOT 9)
 * Filename: parts.slice(6).join(' ') (NOT parts.slice(8))
 *
 * @param {string} dirPath
 * @returns {Promise<Array<{name, type, size_bytes, modified_epoch}>>}
 */
function listDirectory(dirPath) {
  if (!isPathAllowed(dirPath)) {
    return Promise.reject(new Error(`Path traversal blocked: ${dirPath}`));
  }

  return new Promise((resolve, reject) => {
    execFile('ls', ['-la', '--time-style=+%s', dirPath], { timeout: 15000 }, (err, stdout) => {
      if (err) {
        reject(new Error(`ls failed: ${err.message}`));
        return;
      }

      const entries = [];
      const lines = stdout.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);

        // CRITICAL: Guard at < 7, NOT < 9.
        // Using 9 would discard every entry and return an empty array.
        if (parts.length < 7) continue;

        const perms       = parts[0];
        const size_bytes  = parseInt(parts[4], 10);
        const epoch       = parseInt(parts[5], 10);

        // CRITICAL: Filename starts at index 6, NOT 8.
        // With --time-style=+%s there is no date/time field before the name.
        const name = parts.slice(6).join(' ');

        // Skip . and .. entries
        if (name === '.' || name === '..') continue;
        // Skip the total line
        if (perms === 'total') continue;

        // Determine type from permissions string first character
        const isDir = perms[0] === 'd';
        const isLink = perms[0] === 'l';

        entries.push({
          name,
          type: isDir || isLink ? 'directory' : 'file',
          size_bytes: isNaN(size_bytes) ? 0 : size_bytes,
          modified_epoch: isNaN(epoch) ? null : epoch,
        });
      }

      resolve(entries);
    });
  });
}

module.exports = { getDirSize, listDirectory, isPathAllowed, ALLOWED_ROOTS };
