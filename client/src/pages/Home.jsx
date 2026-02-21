// pages/Home.jsx – Landing page at route /.
// Dev-only page; not migrated to production.

import { Link } from 'react-router-dom';

const cards = [
  {
    to: '/dashboard',
    title: 'Dashboard',
    description: 'Live disk usage for all NFS exports. Sort, filter, and inspect by share.',
    color: '#3b82f6',
  },
  {
    to: '/browse',
    title: 'Browse',
    description: 'Navigate the NFS filesystem tree. View files and directory sizes.',
    color: '#10b981',
  },
  {
    to: '/trends',
    title: 'Trends',
    description: '180-day usage history with projections. Spot capacity issues early.',
    color: '#8b5cf6',
  },
  {
    to: '/config',
    title: 'Config',
    description: 'Manage filers, shares, alert thresholds, and email recipients.',
    color: '#f59e0b',
  },
];

export default function Home() {
  return (
    <div style={{ maxWidth: '800px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
        NAS Monitoring Dashboard
      </h1>
      <p style={{ color: '#475569', fontSize: '15px', lineHeight: '1.6', marginBottom: '32px' }}>
        A full-stack NAS monitoring application for tracking disk usage across NFS-mounted network
        shares. Displays live usage, supports filesystem browsing, tracks 180 days of history with
        capacity projections, and manages filer and alert configuration — all from the dev NFS lab
        running on Alpine 3.19 servers with a Rocky Linux 9 client.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        {cards.map(card => (
          <Link
            key={card.to}
            to={card.to}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              border: `2px solid ${card.color}`,
              borderRadius: '8px',
              padding: '20px',
              backgroundColor: '#fff',
              transition: 'box-shadow 0.15s',
              cursor: 'pointer',
            }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = `0 4px 12px ${card.color}33`}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
            >
              <div style={{ fontSize: '18px', fontWeight: 700, color: card.color, marginBottom: '8px' }}>
                {card.title}
              </div>
              <div style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.5' }}>
                {card.description}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
