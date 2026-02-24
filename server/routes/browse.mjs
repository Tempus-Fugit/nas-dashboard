// routes/browse.mjs – Filesystem browse and directory size endpoints.
// GET /api/browse?path=       – Directory contents (files + directories)
// GET /api/browse/size?path=  – Total size of directory via du -sk
//
// Path traversal protection: all path params validated against /HNAS and /NetApp.

import express from 'express';
import { listDirectory, getDirSize, isPathAllowed } from '../services/duRunner.mjs';

const router = express.Router();

/**
 * GET /api/browse?path=<dir>
 * Returns directory contents with type "directory" or "file".
 * Path must be under /HNAS or /NetApp (enforced by duRunner.isPathAllowed).
 */
router.get('/', async (req, res) => {
  const dirPath = req.query.path;

  if (!dirPath) {
    return res.status(400).json({ error: 'path query parameter is required' });
  }

  // Path traversal protection – validated before any shell command
  if (!isPathAllowed(dirPath)) {
    return res.status(403).json({ error: 'Path is not under an allowed mount root (/HNAS, /NetApp)' });
  }

  try {
    const entries = await listDirectory(dirPath);
    res.json({ path: dirPath, entries });
  } catch (err) {
    console.error(`[browse] listDirectory failed for ${dirPath}:`, err.message);
    res.status(500).json({ error: err.message, entries: [] });
  }
});

/**
 * GET /api/browse/size?path=<dir>
 * Returns total disk usage of a directory via du -sk.
 * Enforces a 30-second timeout; returns timeout error if exceeded.
 */
router.get('/size', async (req, res) => {
  const dirPath = req.query.path;

  if (!dirPath) {
    return res.status(400).json({ error: 'path query parameter is required' });
  }

  // Path traversal protection
  if (!isPathAllowed(dirPath)) {
    return res.status(403).json({ error: 'Path is not under an allowed mount root (/HNAS, /NetApp)' });
  }

  try {
    const result = await getDirSize(dirPath);
    res.json(result);
  } catch (err) {
    if (err.message.startsWith('TIMEOUT:')) {
      // du timeout – return 504 so frontend can show spinner → error message
      return res.status(504).json({ error: err.message, timeout: true });
    }
    console.error(`[browse] getDirSize failed for ${dirPath}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
