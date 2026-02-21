'use strict';
// services/configHelper.js – Atomic config file read/write helpers.
//
// All config writes use a temp-file-then-rename strategy to prevent
// partial writes or corruption. Never writes directly to the target file.

const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '../../config');

/**
 * Read a config file by filename (relative to config/).
 * Returns parsed JSON. Throws if file is missing or malformed.
 * @param {string} filename
 * @returns {object}
 */
function readConfig(filename) {
  const filePath = path.join(CONFIG_DIR, filename);
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Atomically write a JSON object to a config file.
 * Writes to a temp file first, then renames to the target path.
 * This prevents corruption if the process is interrupted mid-write.
 * @param {string} filename
 * @param {object} data
 */
function writeConfig(filename, data) {
  const filePath = path.join(CONFIG_DIR, filename);
  const tmpPath  = `${filePath}.tmp.${process.pid}`;

  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, json, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Read a config file, return a default value if not found.
 * @param {string} filename
 * @param {object} defaultValue
 * @returns {object}
 */
function readConfigOrDefault(filename, defaultValue) {
  try {
    return readConfig(filename);
  } catch {
    return defaultValue;
  }
}

module.exports = { readConfig, writeConfig, readConfigOrDefault, CONFIG_DIR };
