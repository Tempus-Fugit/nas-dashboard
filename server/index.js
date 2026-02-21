'use strict';
// server/index.js – NAS Monitoring Dashboard Express server.
// Serves the REST API for the React frontend.
// Starts the mount watcher and daily snapshot cron on startup.

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const mountsRouter  = require('./routes/mounts');
const browseRouter  = require('./routes/browse');
const trendsRouter  = require('./routes/trends');
const configRouter  = require('./routes/config');

const { start: startMountWatcher } = require('./services/mountWatcher');
const { startSnapshotJob }         = require('./services/snapshotJob');

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

// ── 404 handler ────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
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

module.exports = app;
