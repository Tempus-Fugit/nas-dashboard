// server/index.mjs – NAS Monitoring Dashboard Express server.
// Serves the REST API and built React frontend.
// Starts the mount watcher and daily snapshot cron on startup.

import express from 'express';
import cors    from 'cors';
import path    from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import mountsRouter  from './routes/mounts.mjs';
import browseRouter  from './routes/browse.mjs';
import trendsRouter  from './routes/trends.mjs';
import configRouter  from './routes/config.mjs';

import { start as startMountWatcher } from './services/mountWatcher.mjs';
import { startSnapshotJob }           from './services/snapshotJob.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3001;

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json());

// Request logging (simple)
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
});

// ── API routes ─────────────────────────────────────────────────────────────────
app.use('/api/mounts',  mountsRouter);
app.use('/api/browse',  browseRouter);
app.use('/api/trends',  trendsRouter);
app.use('/api/config',  configRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── API 404 handler ────────────────────────────────────────────────────────────
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

// ── Static frontend (production) ───────────────────────────────────────────────
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));

// SPA fallback – serve index.html for all non-API routes (React Router)
app.get('{*splat}', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ── Error handler ──────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[server] Unhandled error:', err.stack || err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Start services and listen ──────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] NAS Dashboard API listening on port ${PORT}`);

  // Start mount change watcher
  startMountWatcher();

  // Start daily snapshot cron
  startSnapshotJob();
});
