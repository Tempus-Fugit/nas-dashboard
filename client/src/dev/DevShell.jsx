// dev/DevShell.jsx – Development layout wrapper.
// Persistent sidebar (left) + main content area (right).
// All feature pages render inside the content area via React Router.
//
// DO NOT import this file from any feature page. Feature pages are
// fully self-contained and receive data from the backend API only.
// When migrating to production, only this file changes (route registration).

import { BrowserRouter, NavLink, Routes, Route, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import DevBanner from './DevBanner.jsx';
import Home      from '../pages/Home.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import Browse    from '../pages/Browse.jsx';
import Trends    from '../pages/Trends.jsx';
import Config    from '../pages/Config.jsx';

// ── Sidebar link styles ────────────────────────────────────────────────────────
const sidebarStyle = {
  width: '200px',
  minHeight: '100%',
  backgroundColor: '#1e293b',
  color: '#cbd5e1',
  display: 'flex',
  flexDirection: 'column',
  padding: '16px 0',
  flexShrink: 0,
};

const navLinkBase = {
  display: 'block',
  padding: '10px 20px',
  color: '#94a3b8',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 500,
  borderLeft: '3px solid transparent',
  transition: 'all 0.15s',
};

const navLinkActive = {
  ...navLinkBase,
  color: '#f8fafc',
  backgroundColor: '#334155',
  borderLeft: '3px solid #3b82f6',
};

// ── Sidebar component with new-export badge on Config ─────────────────────────
function Sidebar() {
  const [newExportCount, setNewExportCount] = useState(0);

  useEffect(() => {
    // Poll for new export count to drive the Config nav badge
    function fetchCount() {
      fetch('/api/config/new-exports')
        .then(r => r.ok ? r.json() : { newExports: [] })
        .then(data => setNewExportCount((data.newExports || []).length))
        .catch(() => {});
    }
    fetchCount();
    const id = setInterval(fetchCount, 60000);
    return () => clearInterval(id);
  }, []);

  const navItems = [
    { to: '/',          label: 'Home'      },
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/browse',    label: 'Browse'    },
    { to: '/trends',    label: 'Trends'    },
    { to: '/config',    label: 'Config', badge: newExportCount },
  ];

  return (
    <nav style={sidebarStyle}>
      <div style={{ padding: '0 20px 16px', fontSize: '12px', fontWeight: 700,
                    color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        NAS Monitor
      </div>
      {navItems.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          style={({ isActive }) => isActive ? navLinkActive : navLinkBase}
        >
          {item.label}
          {item.badge > 0 && (
            <span style={{
              marginLeft: '8px',
              backgroundColor: '#f59e0b',
              color: '#fff',
              borderRadius: '10px',
              padding: '1px 7px',
              fontSize: '11px',
              fontWeight: 700,
            }}>
              {item.badge}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

// ── Main shell layout ──────────────────────────────────────────────────────────
export default function DevShell() {
  return (
    <BrowserRouter>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
        <DevBanner />
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Sidebar />
          <main style={{
            flex: 1,
            overflow: 'auto',
            backgroundColor: '#f8fafc',
            padding: '24px',
          }}>
            <Routes>
              <Route path="/"          element={<Home />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/browse"    element={<Browse />} />
              <Route path="/trends"    element={<Trends />} />
              <Route path="/config"    element={<Config />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
