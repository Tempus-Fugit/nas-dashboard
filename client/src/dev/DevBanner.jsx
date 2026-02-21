// dev/DevBanner.jsx – Persistent amber dev environment banner.
// Displayed at the top of every page in the dev shell.
// DO NOT import this file from any feature page (Dashboard, Browse, Trends, Config).

export default function DevBanner() {
  return (
    <div style={{
      backgroundColor: '#d97706',
      color: '#fff',
      padding: '8px 16px',
      textAlign: 'center',
      fontSize: '13px',
      fontWeight: 500,
      letterSpacing: '0.02em',
      flexShrink: 0,
    }}>
      Development Environment: Data is live from the dev NFS servers and does not reflect production.
    </div>
  );
}
