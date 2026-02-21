// pages/Browse.jsx – Filesystem tree browser.
// Self-contained: no imports from DevShell, DevBanner, or any dev file.
// All data comes from /api/browse and /api/browse/size.
//
// Left panel: lazy-loaded tree (filer → exports → dirs → files, no depth limit).
// Right panel: directory contents listing with search and filter.
//
// On failed fetch: set children to [] (not null) to prevent broken re-fetch loops.
// du timeout: 30s enforced by backend, shown as spinner then error message.

import { useState, useEffect, useCallback } from 'react';
import { formatSize } from '../utils/formatSize.js';

const ICON_FOLDER = '📁';
const ICON_FILE   = '📄';
const ICON_OPEN   = '📂';

// ── Tree node helpers ──────────────────────────────────────────────────────────

/**
 * Build the root-level tree from /api/config/filers and /api/mounts.
 * Filers are top-level nodes; their exports are children.
 */
function buildRootNodes(filers, mounts) {
  return (filers || []).map(filer => ({
    id:       filer.name,
    label:    filer.name,
    type:     'filer',
    path:     null,
    filer:    filer.name,
    children: null,   // null = not yet loaded
    expanded: false,
    filerObj: filer,
  }));
}

// ── Tree item component ────────────────────────────────────────────────────────
function TreeItem({ node, depth, onToggle, onSelect, selectedPath }) {
  const indent = depth * 16;
  const isSelected = selectedPath === node.path;

  return (
    <div>
      <div
        onClick={() => node.type === 'file' ? null : onToggle(node)}
        onDoubleClick={() => onSelect(node)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          paddingLeft: `${indent + 8}px`,
          cursor: node.type === 'file' ? 'default' : 'pointer',
          backgroundColor: isSelected ? '#dbeafe' : 'transparent',
          borderRadius: '4px',
          fontSize: '13px',
          color: '#1e293b',
          userSelect: 'none',
        }}
        onClick={() => {
          onSelect(node);
          if (node.type !== 'file') onToggle(node);
        }}
      >
        <span style={{ marginRight: '6px', fontSize: '12px' }}>
          {node.type === 'file'
            ? ICON_FILE
            : node.expanded ? ICON_OPEN : ICON_FOLDER}
        </span>
        {node.label}
        {node.children === null && node.type !== 'file' && node.expanded && (
          <span style={{ marginLeft: '6px', color: '#94a3b8', fontSize: '11px' }}>…</span>
        )}
      </div>
      {node.expanded && node.children && node.children.map(child => (
        <TreeItem
          key={child.id}
          node={child}
          depth={depth + 1}
          onToggle={onToggle}
          onSelect={onSelect}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}

// ── Main Browse component ──────────────────────────────────────────────────────
export default function Browse() {
  const [tree, setTree]             = useState([]);
  const [selectedNode, setSelected] = useState(null);
  const [contents, setContents]     = useState([]);
  const [dirSize, setDirSize]       = useState(null);
  const [sizeLoading, setSizeLoading] = useState(false);
  const [sizeError, setSizeError]   = useState(null);
  const [contentsLoading, setContentsLoading] = useState(false);
  const [contentsError, setContentsError] = useState(null);
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState('all');
  const [unit] = useState(() => localStorage.getItem('dashUnit') || 'human');

  // ── Initialize tree from filers config ──────────────────────────────────────
  useEffect(() => {
    fetch('/api/config/filers')
      .then(r => r.ok ? r.json() : { filers: [] })
      .then(data => {
        setTree(buildRootNodes(data.filers || []));
      })
      .catch(() => setTree([]));
  }, []);

  // ── Fetch children for a node ────────────────────────────────────────────────
  const fetchChildren = useCallback(async (node) => {
    if (node.type === 'filer') {
      // Load exports for this filer from /api/mounts
      try {
        const data = await fetch('/api/mounts').then(r => r.json());
        const filerShares = (data.shares || []).filter(s => s.filer === node.id && s.mountpoint);
        return filerShares.map(s => ({
          id:       `${s.filer}:${s.export}`,
          label:    s.export,
          type:     'export',
          path:     s.mountpoint,
          filer:    s.filer,
          children: null,
          expanded: false,
        }));
      } catch {
        return []; // On fetch failure: return empty array, not null
      }
    }

    if (node.type === 'export' || node.type === 'directory') {
      try {
        const data = await fetch(`/api/browse?path=${encodeURIComponent(node.path)}`).then(r => {
          if (!r.ok) return { entries: [] };
          return r.json();
        });
        return (data.entries || []).map(entry => ({
          id:       `${node.path}/${entry.name}`,
          label:    entry.name,
          type:     entry.type === 'directory' ? 'directory' : 'file',
          path:     `${node.path}/${entry.name}`,
          filer:    node.filer,
          children: entry.type === 'directory' ? null : undefined, // files have no children
          expanded: false,
        }));
      } catch {
        // On failed fetch: set children to [] (NOT null)
        // Null leaves the node broken and re-fetches on every toggle
        return [];
      }
    }

    return [];
  }, []);

  // ── Toggle tree node open/closed ──────────────────────────────────────────────
  const handleToggle = useCallback(async (targetNode) => {
    function updateNode(nodes, id) {
      return nodes.map(n => {
        if (n.id === id) {
          return { ...n, expanded: !n.expanded };
        }
        if (n.children) {
          return { ...n, children: updateNode(n.children, id) };
        }
        return n;
      });
    }

    // If closing, just collapse
    if (targetNode.expanded) {
      setTree(prev => updateNode(prev, targetNode.id));
      return;
    }

    // If opening and children not loaded, fetch them first
    if (targetNode.children === null) {
      // Show loading state (expanded: true, children: null shows spinner)
      setTree(prev => updateNode(prev, targetNode.id));
      const children = await fetchChildren(targetNode);

      // Set children in tree
      function setChildren(nodes, id, ch) {
        return nodes.map(n => {
          if (n.id === id) return { ...n, children: ch, expanded: true };
          if (n.children) return { ...n, children: setChildren(n.children, id, ch) };
          return n;
        });
      }
      setTree(prev => setChildren(prev, targetNode.id, children));
    } else {
      setTree(prev => updateNode(prev, targetNode.id));
    }
  }, [fetchChildren]);

  // ── Select node → load right panel ────────────────────────────────────────────
  const handleSelect = useCallback(async (node) => {
    setSelected(node);
    setSearch('');
    setContentsError(null);
    setDirSize(null);
    setSizeError(null);

    if (node.type === 'file') {
      setContents([{ name: node.label, type: 'file', size_bytes: null, modified_epoch: null }]);
      return;
    }

    if (!node.path) {
      setContents([]);
      return;
    }

    // Load directory contents
    setContentsLoading(true);
    try {
      const data = await fetch(`/api/browse?path=${encodeURIComponent(node.path)}`).then(r => {
        if (!r.ok) return { entries: [] };
        return r.json();
      });
      setContents(data.entries || []);
      setContentsLoading(false);
    } catch {
      setContentsError('Failed to load directory contents.');
      setContentsLoading(false);
      setContents([]);
    }

    // Load directory total size (spinner while waiting, error on timeout)
    if (node.type !== 'filer') {
      setSizeLoading(true);
      try {
        const sz = await fetch(`/api/browse/size?path=${encodeURIComponent(node.path)}`);
        if (sz.status === 504) {
          const err = await sz.json();
          setSizeError(err.error || 'du timed out after 30 seconds');
          setSizeLoading(false);
          return;
        }
        const szData = await sz.json();
        setDirSize(szData.size_kb);
        setSizeLoading(false);
      } catch {
        setSizeError('Failed to get directory size.');
        setSizeLoading(false);
      }
    }
  }, []);

  // ── Filter and search contents ────────────────────────────────────────────────
  const filteredContents = contents.filter(entry => {
    if (filter === 'dirs'  && entry.type !== 'directory') return false;
    if (filter === 'files' && entry.type !== 'file')      return false;
    if (search && !entry.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // ── Styles ────────────────────────────────────────────────────────────────────
  const panelStyle = {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };
  const thStyle = {
    padding: '8px 12px',
    textAlign: 'left',
    fontWeight: 600,
    fontSize: '12px',
    color: '#64748b',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
  };
  const tdStyle = {
    padding: '8px 12px',
    fontSize: '13px',
    color: '#334155',
    borderBottom: '1px solid #f1f5f9',
  };

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Browse</h2>
      <div style={{ display: 'flex', gap: '16px', height: 'calc(100vh - 180px)' }}>

        {/* ── Left panel: Tree navigator ── */}
        <div style={{ ...panelStyle, width: '280px', flexShrink: 0 }}>
          <div style={{ padding: '10px 12px', fontWeight: 600, fontSize: '13px',
                        color: '#475569', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
            File System
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 4px' }}>
            {tree.length === 0 && (
              <div style={{ padding: '16px', color: '#94a3b8', fontSize: '13px' }}>
                No filers configured. Add filers in Config.
              </div>
            )}
            {tree.map(node => (
              <TreeItem
                key={node.id}
                node={node}
                depth={0}
                onToggle={handleToggle}
                onSelect={handleSelect}
                selectedPath={selectedNode?.path}
              />
            ))}
          </div>
        </div>

        {/* ── Right panel: Contents listing ── */}
        <div style={{ ...panelStyle, flex: 1 }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', gap: '8px', padding: '10px 12px',
                        borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc',
                        alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, padding: '6px 10px', border: '1px solid #e2e8f0',
                       borderRadius: '6px', fontSize: '13px', outline: 'none' }}
            />
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #e2e8f0',
                       borderRadius: '6px', fontSize: '13px', backgroundColor: '#fff' }}
            >
              <option value="all">All</option>
              <option value="dirs">Directories Only</option>
              <option value="files">Files Only</option>
            </select>
          </div>

          {/* Size summary bar */}
          {selectedNode && selectedNode.type !== 'file' && selectedNode.path && (
            <div style={{ padding: '8px 12px', backgroundColor: '#f0f9ff',
                          borderBottom: '1px solid #bae6fd', fontSize: '13px', color: '#0369a1' }}>
              {sizeLoading && '⏳ Calculating directory size...'}
              {!sizeLoading && sizeError && `⚠ Size error: ${sizeError}`}
              {!sizeLoading && !sizeError && dirSize !== null && (
                <>Total: <strong>{formatSize(dirSize, unit)}</strong> — {selectedNode.path}</>
              )}
            </div>
          )}

          {/* Contents table */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {contentsLoading && (
              <div style={{ padding: '24px', color: '#94a3b8', textAlign: 'center' }}>Loading...</div>
            )}
            {contentsError && (
              <div style={{ padding: '24px', color: '#ef4444' }}>{contentsError}</div>
            )}
            {!contentsLoading && !contentsError && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Type</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Size</th>
                    <th style={thStyle}>Last Modified</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContents.map(entry => (
                    <tr key={entry.name} style={{ backgroundColor: '#fff' }}>
                      <td style={tdStyle}>
                        <span style={{ marginRight: '6px' }}>
                          {entry.type === 'directory' ? ICON_FOLDER : ICON_FILE}
                        </span>
                        {entry.name}
                      </td>
                      <td style={tdStyle}>{entry.type === 'directory' ? 'Directory' : 'File'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {entry.size_bytes != null
                          ? formatSize(Math.ceil(entry.size_bytes / 1024), unit)
                          : '—'}
                      </td>
                      <td style={tdStyle}>
                        {entry.modified_epoch
                          ? new Date(entry.modified_epoch * 1000).toLocaleString()
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  {filteredContents.length === 0 && !contentsLoading && (
                    <tr>
                      <td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: '32px' }}>
                        {selectedNode ? 'No entries match your filter.' : 'Select a folder in the tree to browse.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
