'use strict';
// services/mountHelper.js – Shared utility for building NFS mountpoints.
// Mountpoint = target_folder + basename of export path.
// e.g., target_folder="/HNAS/", export="/exports/engineering" → "/HNAS/engineering"

const path = require('path');

/**
 * Build the local mountpoint path for a given filer target folder and export.
 * @param {string} targetFolder e.g. "/HNAS/"
 * @param {string} exportPath  e.g. "/exports/engineering"
 * @returns {string}           e.g. "/HNAS/engineering"
 */
function buildMountpoint(targetFolder, exportPath) {
  const baseName = path.basename(exportPath);
  // Normalize trailing slash on targetFolder
  const base = targetFolder.endsWith('/') ? targetFolder.slice(0, -1) : targetFolder;
  return `${base}/${baseName}`;
}

module.exports = { buildMountpoint };
