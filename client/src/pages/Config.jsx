// pages/Config.jsx – Configuration management page.
// Self-contained: no imports from DevShell, DevBanner, or any dev file.
// Manages filers, shares, alert settings, and export discovery.
//
// showmount timeout handling:
//   On timeout from /api/config/discover/:filerName (HTTP 504):
//   Shows inline error per filer. Clears the spinner. Does not crash.

import { useState, useEffect, useCallback } from 'react';

// ── Shared style constants ────────────────────────────────────────────────────
const btnStyle = (color = '#3b82f6') => ({
  padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
  border: 'none', backgroundColor: color, color: '#fff',
  fontSize: '13px', fontWeight: 500,
});
const inputStyle = {
  width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0',
  borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box',
};
const thStyle = {
  padding: '8px 12px', textAlign: 'left', fontWeight: 600,
  fontSize: '12px', color: '#64748b', backgroundColor: '#f8fafc',
  borderBottom: '1px solid #e2e8f0',
};
const tdStyle = {
  padding: '8px 12px', fontSize: '13px', color: '#334155',
  borderBottom: '1px solid #f1f5f9',
};
const sectionTitle = {
  fontSize: '16px', fontWeight: 700, color: '#1e293b',
  marginBottom: '12px', marginTop: '28px',
};

// ── New Exports Banner ────────────────────────────────────────────────────────
function NewExportsBanner({ newExports, onAdd, onDismiss }) {
  if (!newExports || newExports.length === 0) return null;
  return (
    <div style={{ marginBottom: '20px' }}>
      {newExports.map(exp => (
        <div key={`${exp.filer}:${exp.export}`} style={{
          backgroundColor: '#fef3c7', border: '1px solid #fcd34d',
          borderRadius: '6px', padding: '10px 14px', marginBottom: '8px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: '13px', color: '#92400e',
        }}>
          <span>New export discovered: <strong>{exp.filer}:{exp.export}</strong></span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => onAdd(exp)} style={{ ...btnStyle('#10b981'), padding: '4px 10px', fontSize: '12px' }}>
              Add to Monitoring
            </button>
            <button onClick={() => onDismiss(exp)} style={{ ...btnStyle('#6b7280'), padding: '4px 10px', fontSize: '12px' }}>
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Filer modal ───────────────────────────────────────────────────────────────
function FilerModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    name: '', type: 'HNAS', host: '', target_folder: '', mount_options: 'ro,soft,vers=3',
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '24px', width: '440px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700 }}>
          {initial ? 'Edit Filer' : 'Add Filer'}
        </h3>
        {[
          { key: 'name',          label: 'Name'         },
          { key: 'host',          label: 'Host / IP'    },
          { key: 'target_folder', label: 'Target Folder' },
          { key: 'mount_options', label: 'Mount Options' },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>{f.label}</label>
            <input value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              style={inputStyle} />
          </div>
        ))}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Type</label>
          <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
            style={{ ...inputStyle, backgroundColor: '#fff' }}>
            <option>HNAS</option>
            <option>NetApp</option>
            <option>Other</option>
          </select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} style={{ ...btnStyle('#e2e8f0'), color: '#64748b' }}>Cancel</button>
          <button onClick={() => onSave(form)} style={btnStyle()}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Config component ─────────────────────────────────────────────────────
export default function Config() {
  const [filers, setFilers]           = useState([]);
  const [shares, setShares]           = useState([]);
  const [alerts, setAlerts]           = useState({});
  const [newExports, setNewExports]   = useState([]);
  const [filerModal, setFilerModal]   = useState(null); // null | 'add' | filer object
  const [discoverState, setDiscover]  = useState({}); // filerName → { loading, result, error }
  const [addShare, setAddShare]       = useState(null); // null | { filer, export }
  const [saving, setSaving]           = useState(false);
  const [saveMsg, setSaveMsg]         = useState('');

  // ── Load all config ───────────────────────────────────────────────────────────
  const loadAll = useCallback(() => {
    Promise.all([
      fetch('/api/config/filers').then(r => r.ok ? r.json() : { filers: [] }),
      fetch('/api/config/shares').then(r => r.ok ? r.json() : { shares: [] }),
      fetch('/api/config/alerts').then(r => r.ok ? r.json() : {}),
      fetch('/api/config/new-exports').then(r => r.ok ? r.json() : { newExports: [] }),
    ]).then(([f, s, a, ne]) => {
      setFilers(f.filers || []);
      setShares(s.shares || []);
      setAlerts(a);
      setNewExports(ne.newExports || []);
    }).catch(console.error);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Save helpers ──────────────────────────────────────────────────────────────
  function showSaved(msg = 'Saved.') {
    setSaveMsg(msg);
    setTimeout(() => setSaveMsg(''), 3000);
  }

  async function saveFilers(updatedFilers) {
    const r = await fetch('/api/config/filers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filers: updatedFilers }),
    });
    if (!r.ok) throw new Error(await r.text());
    setFilers(updatedFilers);
    showSaved('Filers saved.');
  }

  async function saveShares(updatedShares) {
    const r = await fetch('/api/config/shares', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shares: updatedShares }),
    });
    if (!r.ok) throw new Error(await r.text());
    setShares(updatedShares);
    showSaved('Shares saved.');
  }

  // ── Filer actions ─────────────────────────────────────────────────────────────
  function handleAddFiler(form) {
    saveFilers([...filers, form]).catch(console.error);
    setFilerModal(null);
  }

  function handleEditFiler(idx, form) {
    const updated = filers.map((f, i) => i === idx ? form : f);
    saveFilers(updated).catch(console.error);
    setFilerModal(null);
  }

  function handleDeleteFiler(idx) {
    if (!window.confirm('Delete this filer?')) return;
    const updated = filers.filter((_, i) => i !== idx);
    saveFilers(updated).catch(console.error);
  }

  // ── Discover exports for a single filer ───────────────────────────────────────
  // showmount timeout handling (Config page per-filer context):
  //   If the backend returns 504 (timeout), display inline error, clear spinner.
  async function handleDiscover(filerName) {
    setDiscover(p => ({ ...p, [filerName]: { loading: true, result: null, error: null } }));
    try {
      const r = await fetch(`/api/config/discover/${encodeURIComponent(filerName)}`);
      if (r.status === 504) {
        // showmount timed out – show inline error, do not leave spinner running
        const err = await r.json();
        setDiscover(p => ({ ...p, [filerName]: { loading: false, result: null, error: err.error || 'showmount timed out (10s)' } }));
        return;
      }
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      // Initialize checklist: new exports unchecked, already-monitored pre-checked
      const withChecked = (data.exports || []).map(e => ({ ...e, checked: !e.dismissed }));
      setDiscover(p => ({ ...p, [filerName]: { loading: false, result: withChecked, error: null } }));
    } catch (err) {
      setDiscover(p => ({ ...p, [filerName]: { loading: false, result: null, error: err.message } }));
    }
  }

  async function handleSaveDiscovered(filerName) {
    const state = discoverState[filerName];
    if (!state?.result) return;
    const toAdd = state.result.filter(e => e.checked && !e.alreadyMonitored);
    const updated = [...shares];
    for (const e of toAdd) {
      if (!updated.some(s => s.filer === filerName && s.export === e.export)) {
        updated.push({ filer: filerName, export: e.export });
      }
    }
    await saveShares(updated);
    setDiscover(p => ({ ...p, [filerName]: null }));
  }

  // ── New export actions ────────────────────────────────────────────────────────
  async function handleAddNewExport(exp) {
    await fetch('/api/config/new-exports/add', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filer: exp.filer, export: exp.export }),
    });
    setNewExports(p => p.filter(e => !(e.filer === exp.filer && e.export === exp.export)));
    loadAll();
  }

  async function handleDismissNewExport(exp) {
    await fetch('/api/config/new-exports/dismiss', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filer: exp.filer, export: exp.export }),
    });
    setNewExports(p => p.filter(e => !(e.filer === exp.filer && e.export === exp.export)));
  }

  // ── Share actions ─────────────────────────────────────────────────────────────
  function handleDeleteShare(idx) {
    const updated = shares.filter((_, i) => i !== idx);
    saveShares(updated).catch(console.error);
  }

  function handleAddShare(e) {
    e.preventDefault();
    if (!addShare || !addShare.filer || !addShare.export) return;
    const updated = [...shares];
    if (!updated.some(s => s.filer === addShare.filer && s.export === addShare.export)) {
      updated.push({ filer: addShare.filer, export: addShare.export });
    }
    saveShares(updated).catch(console.error);
    setAddShare(null);
  }

  // ── Alert settings save ───────────────────────────────────────────────────────
  async function handleSaveAlerts(e) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/config/alerts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alerts),
    });
    setSaving(false);
    showSaved('Alert settings saved.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: '900px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Config</h2>

      {saveMsg && (
        <div style={{ backgroundColor: '#d1fae5', border: '1px solid #6ee7b7',
                      borderRadius: '6px', padding: '8px 14px', marginBottom: '12px',
                      fontSize: '13px', color: '#065f46' }}>
          {saveMsg}
        </div>
      )}

      {/* New exports banner */}
      <NewExportsBanner
        newExports={newExports}
        onAdd={handleAddNewExport}
        onDismiss={handleDismissNewExport}
      />

      {/* ── Section 1: Filer Management ── */}
      <div style={sectionTitle}>Filer Management</div>
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Name', 'Type', 'Host', 'Target Folder', 'Mount Options', 'Actions'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filers.map((filer, idx) => (
              <tr key={filer.name}>
                <td style={tdStyle}><strong>{filer.name}</strong></td>
                <td style={tdStyle}>{filer.type}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px' }}>{filer.host}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px' }}>{filer.target_folder}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px' }}>{filer.mount_options}</td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button onClick={() => setFilerModal({ idx, ...filer })}
                      style={{ ...btnStyle('#6366f1'), padding: '3px 10px', fontSize: '12px' }}>Edit</button>
                    <button onClick={() => handleDeleteFiler(idx)}
                      style={{ ...btnStyle('#ef4444'), padding: '3px 10px', fontSize: '12px' }}>Delete</button>
                    <button
                      onClick={() => handleDiscover(filer.name)}
                      disabled={discoverState[filer.name]?.loading}
                      style={{ ...btnStyle('#0ea5e9'), padding: '3px 10px', fontSize: '12px',
                               opacity: discoverState[filer.name]?.loading ? 0.7 : 1 }}>
                      {discoverState[filer.name]?.loading ? 'Discovering…' : 'Discover Exports'}
                    </button>
                  </div>

                  {/* showmount timeout / error inline display */}
                  {discoverState[filer.name]?.error && (
                    <div style={{ marginTop: '6px', color: '#ef4444', fontSize: '12px' }}>
                      ⚠ {discoverState[filer.name].error}
                    </div>
                  )}

                  {/* Discover results checklist */}
                  {discoverState[filer.name]?.result && (
                    <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '6px',
                                  padding: '10px', backgroundColor: '#f8fafc', maxWidth: '360px' }}>
                      <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '6px' }}>
                        Discovered exports for {filer.name}:
                      </div>
                      {discoverState[filer.name].result.map(e => (
                        <label key={e.export} style={{ display: 'flex', alignItems: 'center',
                                                        gap: '6px', fontSize: '12px', marginBottom: '4px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={e.checked}
                            onChange={() => {
                              setDiscover(p => ({
                                ...p,
                                [filer.name]: {
                                  ...p[filer.name],
                                  result: p[filer.name].result.map(r =>
                                    r.export === e.export ? { ...r, checked: !r.checked } : r
                                  ),
                                },
                              }));
                            }}
                          />
                          <span style={{ fontFamily: 'monospace' }}>{e.export}</span>
                          {e.alreadyMonitored && (
                            <span style={{ color: '#10b981', fontSize: '11px' }}>Already Monitored</span>
                          )}
                          {e.dismissed && !e.alreadyMonitored && (
                            <span style={{ color: '#6b7280', fontSize: '11px' }}>Previously Dismissed</span>
                          )}
                        </label>
                      ))}
                      <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
                        <button onClick={() => handleSaveDiscovered(filer.name)} style={{ ...btnStyle('#10b981'), padding: '4px 12px', fontSize: '12px' }}>
                          Save Selected
                        </button>
                        <button onClick={() => setDiscover(p => ({ ...p, [filer.name]: null }))}
                          style={{ ...btnStyle('#e2e8f0'), color: '#64748b', padding: '4px 12px', fontSize: '12px' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filers.length === 0 && (
              <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: '24px' }}>
                No filers configured.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <button onClick={() => setFilerModal('add')} style={{ ...btnStyle(), marginTop: '10px' }}>+ Add Filer</button>

      {/* Filer modal */}
      {filerModal === 'add' && (
        <FilerModal onSave={handleAddFiler} onClose={() => setFilerModal(null)} />
      )}
      {filerModal && typeof filerModal === 'object' && (
        <FilerModal
          initial={filerModal}
          onSave={(form) => handleEditFiler(filerModal.idx, form)}
          onClose={() => setFilerModal(null)}
        />
      )}

      {/* ── Section 2: Share Management ── */}
      <div style={sectionTitle}>Share Management</div>
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
        {/* Scrollable table at 11+ rows */}
        <div style={{ maxHeight: shares.length >= 11 ? '420px' : 'none', overflowY: shares.length >= 11 ? 'auto' : 'visible' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th style={thStyle}>Filer</th>
                <th style={thStyle}>Export Path</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shares.map((share, idx) => (
                <tr key={`${share.filer}:${share.export}`}>
                  <td style={tdStyle}>{share.filer}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px' }}>{share.export}</td>
                  <td style={tdStyle}>
                    <button onClick={() => handleDeleteShare(idx)}
                      style={{ ...btnStyle('#ef4444'), padding: '3px 10px', fontSize: '12px' }}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {shares.length === 0 && (
                <tr><td colSpan={3} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: '24px' }}>
                  No shares configured. Use Discover Exports or Add Share.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <button onClick={() => setAddShare({ filer: filers[0]?.name || '', export: '' })}
        style={{ ...btnStyle(), marginTop: '10px' }}>
        + Add Share
      </button>

      {/* Add share form */}
      {addShare && (
        <form onSubmit={handleAddShare} style={{
          marginTop: '12px', padding: '16px', backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0', borderRadius: '8px',
          display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap',
        }}>
          <div>
            <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Filer</label>
            <select value={addShare.filer} onChange={e => setAddShare(p => ({ ...p, filer: e.target.value }))}
              style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', backgroundColor: '#fff' }}>
              {filers.map(f => <option key={f.name}>{f.name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Export Path</label>
            <input value={addShare.export} onChange={e => setAddShare(p => ({ ...p, export: e.target.value }))}
              placeholder="/exports/department" style={inputStyle} required />
          </div>
          <button type="submit" style={btnStyle('#10b981')}>Add</button>
          <button type="button" onClick={() => setAddShare(null)} style={{ ...btnStyle('#e2e8f0'), color: '#64748b' }}>Cancel</button>
        </form>
      )}

      {/* ── Section 3: Alert Settings ── */}
      <div style={sectionTitle}>Alert Settings</div>
      <form onSubmit={handleSaveAlerts} style={{
        backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px',
      }}>
        {/* Enable toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!alerts.enabled}
            onChange={e => setAlerts(p => ({ ...p, enabled: e.target.checked }))}
            style={{ width: '18px', height: '18px' }} />
          <span style={{ fontSize: '14px', fontWeight: 500 }}>Enable email alerts</span>
        </label>

        {/* Recipients */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '6px' }}>Recipients</label>
          {(alerts.recipients || []).map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
              <input value={r}
                onChange={e => setAlerts(p => {
                  const rcp = [...p.recipients]; rcp[i] = e.target.value;
                  return { ...p, recipients: rcp };
                })}
                style={{ ...inputStyle, flex: 1 }} placeholder="email@example.com" />
              <button type="button"
                onClick={() => setAlerts(p => ({ ...p, recipients: p.recipients.filter((_, j) => j !== i) }))}
                style={{ ...btnStyle('#ef4444'), padding: '6px 10px' }}>✕</button>
            </div>
          ))}
          <button type="button"
            onClick={() => setAlerts(p => ({ ...p, recipients: [...(p.recipients || []), ''] }))}
            style={{ ...btnStyle('#6366f1'), marginTop: '4px', fontSize: '12px', padding: '4px 12px' }}>
            + Add Recipient
          </button>
        </div>

        {/* Thresholds */}
        <div style={{ display: 'flex', gap: '20px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {[
            { key: 'warning_threshold',  label: 'Warning Threshold %',  default: 80 },
            { key: 'critical_threshold', label: 'Critical Threshold %', default: 90 },
          ].map(f => (
            <div key={f.key} style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>{f.label}</label>
              <input type="number" min={0} max={100}
                value={alerts[f.key] ?? f.default}
                onChange={e => setAlerts(p => ({ ...p, [f.key]: Number(e.target.value) }))}
                style={inputStyle} />
            </div>
          ))}
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Snapshot / Alert Time</label>
            <input type="time" value={alerts.snapshot_time || '05:00'}
              onChange={e => setAlerts(p => ({ ...p, snapshot_time: e.target.value }))}
              style={inputStyle} />
          </div>
        </div>

        <button type="submit" disabled={saving} style={{ ...btnStyle(), opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving…' : 'Save Alert Settings'}
        </button>
      </form>
    </div>
  );
}
