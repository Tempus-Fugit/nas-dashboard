// pages/Trends.jsx – 180-day NFS usage history with Recharts line chart.
// Self-contained: no imports from DevShell, DevBanner, or any dev file.
// All data comes from /api/trends and /api/config/alerts.
//
// Projected Full Indicator:
//   Uses linear regression on the last 30 days per export.
//   If projected date to reach critical threshold is within 60 days
//   AND the trend is consistently upward, shows a warning on the chart.
//   Flat or declining trends suppress the projection entirely.

import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { formatSize } from '../utils/formatSize.js';

// Palette for chart lines (cycles if more exports than colors)
const LINE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#a855f7', '#eab308', '#64748b', '#0ea5e9',
];

// ── Linear regression ──────────────────────────────────────────────────────────
/**
 * Compute simple linear regression over (x, y) pairs.
 * Returns { slope, intercept } where y = slope * x + intercept.
 *
 * Linear regression logic for trend projection:
 *   Uses least-squares method on epoch timestamps (x) and percent_used (y).
 *   A positive slope indicates an upward trend.
 */
function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const [x, y] of points) {
    sumX  += x;
    sumY  += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return null;

  const slope     = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/**
 * Compute the projected date when percent_used reaches the critical threshold.
 * Returns null if trend is flat/declining or projection is beyond 60 days.
 *
 * @param {Array} snapshots   All snapshots for this export (sorted ascending)
 * @param {number} criticalThreshold
 * @returns {{ daysUntil: number, date: string }|null}
 */
function computeProjection(snapshots, criticalThreshold) {
  if (!snapshots || snapshots.length < 7) return null;

  // Use last 30 days of data for regression
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = snapshots.filter(s => new Date(s.timestamp).getTime() >= cutoff);
  if (recent.length < 5) return null;

  const points = recent.map(s => [
    new Date(s.timestamp).getTime() / 1000, // epoch seconds
    s.percent_used,
  ]);

  const reg = linearRegression(points);
  if (!reg) return null;

  // Suppress projection if trend is flat or declining (slope ≤ 0)
  if (reg.slope <= 0) return null;

  // Current usage (latest snapshot)
  const latestUsage = points[points.length - 1][1];
  if (latestUsage >= criticalThreshold) return null; // Already critical

  // Days until projection reaches critical threshold
  // slope is in % per second, so:
  //   daysUntilCritical = (criticalThreshold - latestUsage) / (slope * 86400)
  const daysUntilCritical = (criticalThreshold - latestUsage) / (reg.slope * 86400);

  // Only show projection if within 60 days
  if (daysUntilCritical > 60 || daysUntilCritical < 0) return null;

  const projectedDate = new Date(Date.now() + daysUntilCritical * 24 * 60 * 60 * 1000);
  return {
    daysUntil: Math.round(daysUntilCritical),
    date: projectedDate.toLocaleDateString(),
  };
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, yMode, unit }) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div style={{
      backgroundColor: '#1e293b', color: '#f8fafc',
      padding: '10px 14px', borderRadius: '6px', fontSize: '12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    }}>
      <div style={{ marginBottom: '6px', fontWeight: 600 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: '2px' }}>
          {p.name}: {yMode === 'percent'
            ? `${p.value?.toFixed(1)}%`
            : formatSize(p.payload[`${p.name}_used_kb`], unit)
          }
        </div>
      ))}
    </div>
  );
}

// ── Main Trends component ──────────────────────────────────────────────────────
export default function Trends() {
  const [snapshots, setSnapshots]         = useState([]);
  const [alerts, setAlerts]               = useState({ warning_threshold: 80, critical_threshold: 90 });
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [selectedExports, setSelected]    = useState(new Set());
  const [allExportKeys, setAllExportKeys] = useState([]);
  const [yMode, setYMode]                 = useState('percent'); // 'percent' | 'size'
  const [dateFrom, setDateFrom]           = useState('');
  const [dateTo, setDateTo]               = useState('');
  const [unit] = useState(() => localStorage.getItem('dashUnit') || 'human');

  // ── Fetch data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/trends?days=180').then(r => r.ok ? r.json() : { snapshots: [] }),
      fetch('/api/config/alerts').then(r => r.ok ? r.json() : {}),
    ])
      .then(([trendData, alertData]) => {
        const snaps = trendData.snapshots || [];
        setSnapshots(snaps);
        setAlerts(alertData);

        // Collect unique export keys
        const keys = [...new Set(snaps.map(s => `${s.filer}:${s.export}`))];
        setAllExportKeys(keys);
        setSelected(new Set(keys)); // Default: all selected
        setLoading(false);
      })
      .catch(err => {
        setError(String(err));
        setLoading(false);
      });
  }, []);

  // ── Build chart data ──────────────────────────────────────────────────────────
  const { chartData, exportKeys } = useMemo(() => {
    if (!snapshots.length) return { chartData: [], exportKeys: [] };

    const keys = allExportKeys.filter(k => selectedExports.has(k));

    // Group snapshots by date (YYYY-MM-DD) and export key
    const byDate = new Map();
    for (const snap of snapshots) {
      const date = snap.timestamp.slice(0, 10);

      // Apply date range filter
      if (dateFrom && date < dateFrom) continue;
      if (dateTo   && date > dateTo)   continue;

      if (!byDate.has(date)) byDate.set(date, { date });
      const entry = byDate.get(date);
      const key = `${snap.filer}:${snap.export}`;
      if (keys.includes(key)) {
        entry[key]             = snap.percent_used;
        entry[`${key}_used_kb`] = snap.used_kb;
      }
    }

    const chartData = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    return { chartData, exportKeys: keys };
  }, [snapshots, selectedExports, allExportKeys, dateFrom, dateTo]);

  // ── Per-export projections ────────────────────────────────────────────────────
  const projections = useMemo(() => {
    const result = [];
    const criticalThreshold = alerts.critical_threshold || 90;

    for (const key of exportKeys) {
      const [filer, ...exportParts] = key.split(':');
      const exportPath = exportParts.join(':');
      const exportSnaps = snapshots.filter(s => s.filer === filer && s.export === exportPath);
      const proj = computeProjection(exportSnaps, criticalThreshold);
      if (proj) {
        result.push({ key, filer, export: exportPath, ...proj });
      }
    }
    return result;
  }, [snapshots, exportKeys, alerts.critical_threshold]);

  // ── Toggle export selection ───────────────────────────────────────────────────
  function toggleExport(key) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading) return <div style={{ color: '#94a3b8', padding: '32px' }}>Loading trends data...</div>;
  if (error)   return <div style={{ color: '#ef4444', padding: '32px' }}>Error: {error}</div>;

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Trends</h2>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'flex-start' }}>
        {/* Y-axis mode */}
        <div>
          <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Y Axis</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[['percent', 'Percent Used'], ['size', 'Used Size']].map(([val, label]) => (
              <button key={val} onClick={() => setYMode(val)} style={{
                padding: '5px 12px', borderRadius: '6px', cursor: 'pointer',
                border: '1px solid #e2e8f0', fontSize: '13px',
                backgroundColor: yMode === val ? '#3b82f6' : '#fff',
                color: yMode === val ? '#fff' : '#64748b',
              }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Date range */}
        <div>
          <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Date From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }} />
        </div>
        <div>
          <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Date To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }} />
        </div>
      </div>

      {/* Export multi-select filter */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
          Exports ({selectedExports.size} of {allExportKeys.length} selected)
          <button onClick={() => setSelected(new Set(allExportKeys))}
            style={{ marginLeft: '10px', fontSize: '12px', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>
            All
          </button>
          <button onClick={() => setSelected(new Set())}
            style={{ marginLeft: '6px', fontSize: '12px', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>
            None
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {allExportKeys.map((key, i) => (
            <button key={key} onClick={() => toggleExport(key)} style={{
              padding: '3px 10px', borderRadius: '12px', cursor: 'pointer',
              border: `1px solid ${LINE_COLORS[i % LINE_COLORS.length]}`,
              backgroundColor: selectedExports.has(key) ? LINE_COLORS[i % LINE_COLORS.length] : '#fff',
              color: selectedExports.has(key) ? '#fff' : LINE_COLORS[i % LINE_COLORS.length],
              fontSize: '12px',
            }}>
              {key.split(':').slice(1).join(':') || key}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
        {chartData.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: '48px' }}>
            No snapshot data yet. Data populates after the first daily snapshot at 05:00.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis
                domain={yMode === 'percent' ? [0, 100] : ['auto', 'auto']}
                tick={{ fontSize: 11 }}
                tickLine={false}
                tickFormatter={v => yMode === 'percent' ? `${v}%` : formatSize(v, unit)}
              />
              <Tooltip content={<CustomTooltip yMode={yMode} unit={unit} />} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />

              {/* Warning and critical threshold reference lines */}
              {yMode === 'percent' && (
                <>
                  <ReferenceLine
                    y={alerts.warning_threshold || 80}
                    stroke="#f59e0b" strokeDasharray="4 2"
                    label={{ value: `Warning ${alerts.warning_threshold || 80}%`, position: 'right', fontSize: 11, fill: '#f59e0b' }}
                  />
                  <ReferenceLine
                    y={alerts.critical_threshold || 90}
                    stroke="#ef4444" strokeDasharray="4 2"
                    label={{ value: `Critical ${alerts.critical_threshold || 90}%`, position: 'right', fontSize: 11, fill: '#ef4444' }}
                  />
                </>
              )}

              {exportKeys.map((key, i) => {
                const hasProjection = projections.some(p => p.key === key);
                return (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={yMode === 'percent' ? key : undefined}
                    name={key.split(':').slice(1).join(':') || key}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    strokeWidth={hasProjection ? 2.5 : 1.5}
                    dot={false}
                    strokeDasharray={hasProjection ? '0' : undefined}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Projection warnings */}
      {projections.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          {projections.map(p => (
            <div key={p.key} style={{
              backgroundColor: '#fef3c7', border: '1px solid #fcd34d',
              borderRadius: '6px', padding: '10px 14px', marginBottom: '8px',
              fontSize: '13px', color: '#92400e',
            }}>
              ⚠ <strong>{p.filer}:{p.export}</strong> projected to reach Critical in{' '}
              <strong>{p.daysUntil} days</strong> (est. {p.date})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
