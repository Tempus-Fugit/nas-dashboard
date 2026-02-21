# Production Migration Guide

How to migrate the four feature pages from this dev environment to a production template.

---

## Files That Are Dev-Only (Do NOT go to production)

These files exist only to scaffold the development environment:

| File | Reason |
|------|--------|
| `client/src/dev/DevShell.jsx` | Dev layout wrapper with sidebar and routing |
| `client/src/dev/DevBanner.jsx` | Dev environment amber banner |
| `client/src/pages/Home.jsx` | Dev landing page |
| `client/src/main.jsx` | Dev entry point (imports DevShell) |

Do not copy any of these files to production.

---

## Files That Go to Production Unchanged

Copy these files verbatim. No modifications required.

**Frontend:**
- `client/src/pages/Dashboard.jsx`
- `client/src/pages/Browse.jsx`
- `client/src/pages/Trends.jsx`
- `client/src/pages/Config.jsx`
- `client/src/utils/formatSize.js`

**Backend (copy entire directories):**
- `server/` — all route handlers, services, and database code
- `config/` — JSON config files (update filer IPs for prod; see below)
- `scripts/` — mount_shares.sh

---

## The Only Change Required in Production

Register the four routes in the production template's router.

In the production template's routing component, add:

```jsx
import Dashboard from './pages/Dashboard.jsx';
import Browse    from './pages/Browse.jsx';
import Trends    from './pages/Trends.jsx';
import Config    from './pages/Config.jsx';

// Inside your <Routes>:
<Route path="/dashboard" element={<Dashboard />} />
<Route path="/browse"    element={<Browse />} />
<Route path="/trends"    element={<Trends />} />
<Route path="/config"    element={<Config />} />
```

Nothing inside the page components changes. The feature pages are fully
self-contained. They receive all data from the backend API and have no
coupling to any dev-specific file.

---

## Dependencies to Add to Production package.json

If these are not already present in the production template:

```json
{
  "dependencies": {
    "recharts": "^2.12.2",
    "react-router-dom": "^6.22.3"
  }
}
```

**Server dependencies** (in server/package.json, or merged into prod package.json):

```json
{
  "dependencies": {
    "better-sqlite3": "^9.4.3",
    "cors": "^2.8.5",
    "express": "^4.18.3",
    "node-cron": "^3.0.3",
    "nodemailer": "^6.9.11"
  }
}
```

---

## Production Config Update

### 1. Update filers.json with production filer IPs

Edit `config/filers.json` with the real production NFS server addresses:

```json
{
  "filers": [
    {
      "name": "prod-hnas",
      "type": "HNAS",
      "host": "10.0.1.50",
      "target_folder": "/HNAS/",
      "mount_options": "ro,soft,vers=3"
    },
    {
      "name": "prod-netapp",
      "type": "NetApp",
      "host": "10.0.1.51",
      "target_folder": "/NetApp/",
      "mount_options": "ro,soft,vers=3"
    }
  ]
}
```

Or use the Config page after the application is running.

### 2. Run Discover Exports to rebuild shares.json for production

After updating filers.json, use the Config page → Discover Exports button
for each filer. This runs `showmount -e` against the production NFS servers
and populates `config/shares.json` with the real export list.

Alternatively, run the mount script with `--discover`:

```bash
bash scripts/mount_shares.sh --discover
```

Then populate shares.json manually or via the Config page.

### 3. Mount production shares

```bash
sudo bash scripts/mount_shares.sh
```

Verify:

```bash
mount | grep nfs
df -h /HNAS/* /NetApp/*
```

---

## Checklist

- [ ] Copy all "unchanged" files listed above
- [ ] Register 4 routes in prod template router
- [ ] Install recharts and react-router-dom if not present
- [ ] Install server dependencies
- [ ] Update config/filers.json with prod IPs
- [ ] Run Discover Exports to populate shares.json
- [ ] Run mount_shares.sh
- [ ] Configure alerts.json (recipients, thresholds)
- [ ] Set up SMTP (optional, for email alerts)
- [ ] Configure systemd service or process manager
- [ ] Verify dashboard loads at prod URL
