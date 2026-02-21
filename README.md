# nas-dashboard

Full-stack NAS monitoring web application. Runs on Rocky Linux 9. Monitors NFS-mounted network shares. Displays live disk usage, filesystem browsing, 180-day trends, and configuration management.

## Tech Stack

- **Frontend:** React 18 + React Router + Recharts
- **Backend:** Node.js + Express
- **Database:** SQLite (180-day snapshot history)
- **Mount protocol:** NFS v3, read-only (`ro,soft,vers=3`)
- **Host OS:** Rocky Linux 9

---

## Prerequisites

- Node.js 18+ (installed via nvm — see below)
- `nfs-utils` installed on the host (`dnf install -y nfs-utils`)
- NFS shares accessible from the host (or use the `nfs-lab` Vagrant environment)
- `git` if cloning the repo

---

## Install

### 1. Install Node.js via nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install --lts
nvm use --lts
```

### 2. Install dependencies

```bash
npm install --prefix server
npm install --prefix client
npm install          # installs concurrently for the root runner
```

Or from the repo root:

```bash
npm run install:all
```

---

## Start (Development)

```bash
npm run dev
```

This starts both the Node.js backend (port 3001) and React dev server (port 3000) using `concurrently`.

Dashboard: **http://localhost:3000**

---

## Configuration

### config/filers.json

Defines the NFS filers to monitor. Ships pre-populated with dev lab values.

```json
{
  "filers": [
    {
      "name": "nfs1",
      "type": "HNAS",
      "host": "192.168.56.10",
      "target_folder": "/HNAS/",
      "mount_options": "ro,soft,vers=3"
    },
    {
      "name": "nfs2",
      "type": "NetApp",
      "host": "192.168.56.11",
      "target_folder": "/NetApp/",
      "mount_options": "ro,soft,vers=3"
    }
  ]
}
```

Edit directly or use the Config page in the dashboard.

### config/shares.json

Lists the NFS exports to monitor. Populated by bootstrap.sh via `showmount -e`. Can also be managed from the Config page.

```json
{
  "shares": [
    { "filer": "nfs1", "export": "/exports/engineering" },
    { "filer": "nfs2", "export": "/exports/product" }
  ]
}
```

### config/alerts.json

Email alert thresholds and recipients.

```json
{
  "enabled": true,
  "recipients": ["admin@example.com"],
  "warning_threshold": 80,
  "critical_threshold": 90,
  "snapshot_time": "05:00"
}
```

---

## Mount Script

Run manually to mount all configured shares:

```bash
sudo bash scripts/mount_shares.sh

# Options:
sudo bash scripts/mount_shares.sh --dry-run      # Preview mounts, no execution
sudo bash scripts/mount_shares.sh --unmount-all  # Unmount all configured shares
sudo bash scripts/mount_shares.sh --discover     # Run showmount -e on all filers
```

Mount point structure:
- nfs1 shares → `/HNAS/<share-name>` (e.g., `/HNAS/engineering`)
- nfs2 shares → `/NetApp/<share-name>` (e.g., `/NetApp/product`)

Cron (runs before 05:00 snapshot):

```
50 4 * * * /opt/nas-dashboard/scripts/mount_shares.sh >> /var/log/nas_monitor/mount.log 2>&1
```

---

## Deploy to Production (systemd)

```bash
# Create a systemd service
sudo tee /etc/systemd/system/nas-dashboard.service > /dev/null << 'EOF'
[Unit]
Description=NAS Monitoring Dashboard
After=network.target

[Service]
Type=simple
User=devuser
WorkingDirectory=/opt/nas-dashboard
ExecStart=/bin/bash -c "source ~/.nvm/nvm.sh && npm run dev"
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now nas-dashboard
sudo systemctl status nas-dashboard
```

---

## SELinux Note

Rocky Linux 9 runs SELinux in enforcing mode. If NFS mounts succeed but files are inaccessible or API calls fail silently, check for AVC denials:

```bash
ausearch -m avc -ts recent
```

Allow NFS access temporarily for testing:

```bash
sudo setenforce 0
```

---

## Application Structure

```
nas-dashboard/
├── client/              # React frontend (Vite)
│   └── src/
│       ├── dev/         # Dev shell and banner (dev only, not in prod)
│       ├── pages/       # Feature pages (prod-ready, self-contained)
│       └── utils/       # Shared utilities (formatSize.js)
├── server/              # Node.js Express backend
│   ├── routes/          # API route handlers
│   ├── services/        # Business logic, df, du, showmount, SQLite
│   └── db/              # SQLite schema and query helpers
├── config/              # JSON config files (filers, shares, alerts)
├── scripts/             # mount_shares.sh
└── logs/                # SQLite DB and mount logs
```

---

## API Reference

| Method | Endpoint                        | Description                          |
|--------|---------------------------------|--------------------------------------|
| GET    | /api/mounts                     | Live mount data, all shares          |
| GET    | /api/mounts/status              | Mount change detection state         |
| GET    | /api/browse?path=               | Directory contents at path           |
| GET    | /api/browse/size?path=          | Directory total size via du          |
| GET    | /api/trends?days=180            | Snapshot history, all exports        |
| GET    | /api/trends/:export             | Snapshot history, one export         |
| GET    | /api/config/filers              | Read filers.json                     |
| POST   | /api/config/filers              | Write filers.json                    |
| GET    | /api/config/shares              | Read shares.json                     |
| POST   | /api/config/shares              | Write shares.json                    |
| GET    | /api/config/alerts              | Read alerts.json                     |
| POST   | /api/config/alerts              | Write alerts.json                    |
| GET    | /api/config/discover/:filerName | showmount -e one filer               |
| GET    | /api/config/discover/all        | showmount -e all filers              |
| GET    | /api/config/new-exports         | New exports from last discovery      |
| POST   | /api/config/new-exports/add     | Add discovered export to shares.json |
| POST   | /api/config/new-exports/dismiss | Dismiss export                       |
