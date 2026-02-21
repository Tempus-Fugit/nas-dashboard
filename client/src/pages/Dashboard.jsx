// pages/Dashboard.jsx – Live NFS mount monitoring.
// Self-contained: no imports from DevShell, DevBanner, or any dev file.
// All data comes from /api/mounts and /api/mounts/status.

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatSize } from '../utils/formatSize.js';

// ── Status priority for default sort ─────────────────────────────────────────
const STATUS_PRIORITY = { critical: 0, warning: 1, ok: 2, not_mounted: 3 };

// ── Color map for status cells ─────────────────────────────────────────────────
const STATUS_COLOR = {
  critical:    { bg: '#fee2e2', text: '#991b1b', label: 'Critical' },
  warning:     { bg: '#fef3c7', text: '#92400e', label: 'Warning'  },
  ok:          { bg: '#f0fdf4', text: '#166534', label: 'Ok'       },
  not_mounted: { bg: '#f1f5f9', text: '#64748b', label: 'Not Mounted' },
};

// ── Sort helpers ───────────────────────────────────────────────────────────────
function compareRows(a, b, key, dir) {
  const numericKeys = ['total_kb', 'used_kb', 'free_kb', 'percent_used'];
  let av = a[key];
  let bv = b[key];

  if (key === 'status') {
    av = STATUS_PRIORITY[a.status] ?? 99;
    bv = STATUS_PRIORITY[b.status] ?? 99;
  } else if (numericKeys.includes(key)) {
    av = av ?? -1;
    bv = bv ?? -1;
  } else {
    av = (av ?? '').toString().toLowerCase();
    bv = (bv ?? '').toString().toLowerCase();
  }

  if (av < bv) return dir === 'asc' ? -1 : 1;
  if (av > bv) return dir === 'asc' ? 1 : -1;
  return 0;
}

/**
 * Apply the current sort to the rows array.
 * Default sort: Status priority ascending, then percent_used descending.
 */
function applySortState(rows, sortKey, sortDir) {
  const copy = [...rows];
  if (!sortKey) {
    copy.sort((a, b) => {
      const ps = compareRows(a, b, 'status', 'asc');
      if (ps !== 0) return ps;
      return compareRows(b, a, 'percent_used', 'asc');
    });
    return copy;
  }
  copy.sort((a, b) => compareRows(a, b, sortKey, sortDir));
  return copy;
}

// ── Column definitions ────────────────────────────────────────────────────────
const COLUMNS = [
  { key: 'export',       label: 'Export Path'  },
  { key: 'filer',        label: 'Filer'        },
  { key: 'server',       label: 'Server'       },
  { key: 'mountpoint',   label: 'Mountpoint'   },
  { key: 'total_kb',     label: 'Total'        },
  { key: 'used_kb',      label: 'Used'         },
  { key: 'free_kb',      label: 'Free'         },
  { key: 'percent_used', label: 'Used %'       },
  { key: 'status',       label: 'Status'       },
];

// ── Sort indicator ─────────────────────────────────────────────────────────────
function SortArrow({ active, dir }) {
  if (!active) return <span style={{ color: '#cbd5e1' }}> ⇅</span>;
  return <span>{dir === 'asc' ? ' ↑' : ' ↓'}</span>;
}

// ── Expandable row sub-table ───────────────────────────────────────────────────
function ExpandedRow({ mountpoint, unit }) {
  const [dirs, setDirs]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!mountpoint) return;
    setLoading(true);
    fetch(`/api/browse?path=${encodeURIComponent(mountpoint)}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(data => {
        const dirEntries = (data.entries || []).filter(e => e.type === 'directory');
        // Fetch sizes for each top-level directory in parallel
        return Promise.all(
          dirEntries.map(e =>
            fetch(`/api/browse/size?path=${encodeURIComponent(mountpoint + '/' + e.name)}`)
              .then(r => r.ok ? r.json() : { size_kb: null })
              .then(sz => ({ name: e.name, size_kb: sz.size_kb }))
              .catch(() => ({ name: e.name, size_kb: null }))
          )
        );
      })
      .then(results => {
        setDirs(results);
        setLoading(false);
      })
      .catch(err => {
        setError(String(err));
        setLoading(false);
      });
  }, [mountpoint]);

  const cellStyle = { padding: '6px 12px', fontSize: '13px', color: '#475569' };

  if (loading) return <div style={{ padding: '12px 24px', color: '#94a3b8' }}>Loading directory sizes...</div>;
  if (error)   return <div style={{ padding: '12px 24px', color: '#ef4444' }}>Error: {error}</div>;
  if (!dirs || dirs.length === 0) return <div style={{ padding: '12px 24px', color: '#94a3b8' }}>No subdirectories found.</div>;

  return (
    <div style={{ padding: '8px 24px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ backgroundColor: '#f1f5f9' }}>
            <th style={{ ...cellStyle, textAlign: 'left', fontWeight: 600 }}>Directory</th>
            <th style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}>Size</th>
          </tr>
        </thead>
        <tbody>
          {dirs.map(d => (
            <tr key={d.name}>
              <td style={cellStyle}>{d.name}</td>
              <td style={{ ...cellStyle, textAlign: 'right' }}>{formatSize(d.size_kb, unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Dashboard component ───────────────────────────────────────────────────
export default function Dashboard() {
  const [allShares, setAllShares]         = useState([]);
  const [sorted, setSorted]               = useState([]);
  const [sortKey, setSortKey]             = useState(null);
  const [sortDir, setSortDir]             = useState('asc');
  const [unit, setUnit]                   = useState(() => localStorage.getItem('dashUnit') || 'human');
  const [expandedRow, setExpandedRow]     = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [changeBanner, setChangeBanner]   = useState(false);
  const [thresholds, setThresholds]       = useState({ warning: 80, critical: 90 });
  const lastChangeVersion                 = useRef(null);

  // ── Fetch mount data ─────────────────────────────────────────────────────────
  const fetchMounts = useCallback(() => {
    return fetch('/api/mounts')
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(data => {
        setAllShares(data.shares || []);
        if (data.thresholds) setThresholds(data.thresholds);
        setLoading(false);
        setError(null);
        // Re-apply sort state after every refresh – do not reset sort on refresh
        setSorted(prev => applySortState(data.shares || [], sortKey, sortDir));
      })
      .catch(err => {
        setError(String(err));
        setLoading(false);
      });
  }, [sortKey, sortDir]);

  // Re-sort whenever sort state changes
  useEffect(() => {
    setSorted(applySortState(allShares, sortKey, sortDir));
  }, [allShares, sortKey, sortDir]);

  // Initial load
  useEffect(() => {
    fetchMounts();
  }, []);

  // Polling: refresh data every 60 seconds
  useEffect(() => {
    const id = setInterval(fetchMounts, 60000);
    return () => clearInterval(id);
  }, [fetchMounts]);

  // Mount change detection: poll /api/mounts/status every 60 seconds
  useEffect(() => {
    function checkStatus() {
      fetch('/api/mounts/status')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return;
          if (lastChangeVersion.current === null) {
            // Establish baseline version
            lastChangeVersion.current = data.changeVersion;
            return;
          }
          // A version bump means a mount was added or removed
          if (data.changeVersion !== lastChangeVersion.current) {
            lastChangeVersion.current = data.changeVersion;
            setChangeBanner(true);
            fetchMounts(); // Refresh table immediately on change
          }
        })
        .catch(() => {});
    }
    checkStatus();
    const id = setInterval(checkStatus, 60000);
    return () => clearInterval(id);
  }, [fetchMounts]);

  // ── Sort handler ──────────────────────────────────────────────────────────────
  function handleSort(key) {
    setSortKey(prev => {
      if (prev === key) {
        // Cycle: asc → desc → clear
        if (sortDir === 'asc') { setSortDir('desc'); return key; }
        setSortDir('asc');
        return null;
      }
      setSortDir('asc');
      return key;
    });
  }

  // ── Unit toggle ────────────────────────────────────────────────────────────────
  function handleUnitToggle(newUnit) {
    setUnit(newUnit);
    localStorage.setItem('dashUnit', newUnit);
  }

  // ── Summary counts ─────────────────────────────────────────────────────────────
  const counts = { ok: 0, warning: 0, critical: 0, not_mounted: 0 };
  for (const s of allShares) counts[s.status] = (counts[s.status] || 0) + 1;

  // ── Styles ─────────────────────────────────────────────────────────────────────
  const thStyle = {
    padding: '10px 12px',
    textAlign: 'left',
    fontWeight: 600,
    fontSize: '13px',
    color: '#475569',
    backgroundColor: '#f8fafc',
    cursor: 'pointer',
    borderBottom: '2px solid #e2e8f0',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  };
  const tdStyle = {
    padding: '10px 12px',
    fontSize: '13px',
    color: '#334155',
    borderBottom: '1px solid #e2e8f0',
  };

  if (loading) return <div style={{ color: '#94a3b8', padding: '32px' }}>Loading mount data...</div>;
  if (error)   return <div style={{ color: '#ef4444', padding: '32px' }}>Error: {error}</div>;

  return (
    <div>
      {/* Mount change banner */}
      {changeBanner && (
        <div style={{
          backgroundColor: '#dbeafe', color: '#1e40af',
          padding: '10px 16px', borderRadius: '6px', marginBottom: '16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          Mount change detected, display updated.
          <button onClick={() => setChangeBanner(false)} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#1e40af', fontWeight: 700,
          }}>✕</button>
        </div>
      )}

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>Dashboard</h2>
        {/* Unit toggle */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {['human', 'kb'].map(u => (
            <button key={u} onClick={() => handleUnitToggle(u)} style={{
              padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
              border: '1px solid #e2e8f0', fontSize: '13px',
              backgroundColor: unit === u ? '#3b82f6' : '#fff',
              color: unit === u ? '#fff' : '#64748b',
              fontWeight: unit === u ? 600 : 400,
            }}>
              {u === 'human' ? 'Human Readable' : 'KB'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Ok',          count: counts.ok,          bg: '#f0fdf4', border: '#86efac', text: '#166534' },
          { label: 'Warning',     count: counts.warning,     bg: '#fef3c7', border: '#fcd34d', text: '#92400e' },
          { label: 'Critical',    count: counts.critical,    bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' },
        ].map(card => (
          <div key={card.label} style={{
            flex: 1, padding: '16px 20px', borderRadius: '8px',
            backgroundColor: card.bg, border: `1px solid ${card.border}`,
          }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: card.text }}>{card.count}</div>
            <div style={{ fontSize: '13px', color: card.text, marginTop: '2px' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Main table */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {COLUMNS.map(col => (
                <th key={col.key} style={thStyle} onClick={() => handleSort(col.key)}>
                  {col.label}
                  <SortArrow active={sortKey === col.key} dir={sortDir} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((share, idx) => {
              const rowKey = `${share.filer}:${share.export}`;
              const isExpanded = expandedRow === rowKey;
              const statusMeta = STATUS_COLOR[share.status] || STATUS_COLOR.not_mounted;

              return [
                <tr
                  key={rowKey}
                  onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                  style={{
                    cursor: 'pointer',
                    backgroundColor: isExpanded ? '#f1f5f9' : (idx % 2 === 0 ? '#fff' : '#f8fafc'),
                  }}
                >
                  <td style={tdStyle}>{share.export}</td>
                  <td style={tdStyle}>{share.filer}</td>
                  <td style={tdStyle}>{share.server}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px' }}>{share.mountpoint || '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatSize(share.total_kb, unit)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatSize(share.used_kb,  unit)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatSize(share.free_kb,  unit)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {share.percent_used !== null ? `${share.percent_used.toFixed(1)}%` : '—'}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '2px 10px', borderRadius: '12px',
                      backgroundColor: statusMeta.bg, color: statusMeta.text,
                      fontSize: '12px', fontWeight: 600,
                    }}>
                      {statusMeta.label}
                    </span>
                  </td>
                </tr>,
                isExpanded && (
                  <tr key={`${rowKey}-expanded`}>
                    <td colSpan={COLUMNS.length} style={{ padding: 0, backgroundColor: '#f1f5f9' }}>
                      <ExpandedRow mountpoint={share.mountpoint} unit={unit} />
                    </td>
                  </tr>
                ),
              ];
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: '32px' }}>
                  No shares configured. Add filers and shares in Config.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
