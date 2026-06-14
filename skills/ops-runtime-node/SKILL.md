---
name: ops-runtime-node
description: Node.js process management with PM2 or systemd, npm ci deploys, builds, and graceful reload.
version: 1.0
---

# Node.js Runtime Operations

## When to Use
Load when `package.json` is detected. Covers Node 20/22 LTS, PM2 cluster mode or systemd
supervision, reproducible `npm ci` installs, framework builds (Next.js), and graceful reloads.

## Version Pinning
Commit `.nvmrc` and the `engines` field so every environment uses one Node version.
```
# .nvmrc
22
```
```bash
nvm install && nvm use      # reads .nvmrc
node -v                     # verify matches engines.node
```

## Install & Build
```bash
# Reproducible production install (respects package-lock.json; fails if lock is stale)
npm ci --omit=dev
# If the build needs devDependencies, do a full ci, build, then prune:
npm ci && npm run build && npm prune --omit=dev

# Next.js standalone output (smallest runtime surface)
npm run build               # next.config.js: output: 'standalone'
node .next/standalone/server.js
```

## PM2 (Cluster)
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'app',
    script: 'dist/server.js',
    instances: 'max',              // one worker per CPU core
    exec_mode: 'cluster',
    max_memory_restart: '512M',    // restart a worker that exceeds this RSS
    node_args: '--max-old-space-size=448',
    env_production: { NODE_ENV: 'production', PORT: 3000 },
    error_file: '/var/log/app/err.log',
    out_file: '/var/log/app/out.log',
    time: true,
  }],
};
```
```bash
pm2 start ecosystem.config.js --env production
pm2 reload app          # zero-downtime rolling reload across cluster workers
pm2 save                # persist process list
pm2 startup systemd     # generate boot unit (run printed command once)
```

## systemd (PM2 Alternative)
Prefer systemd for single-process apps or to avoid the PM2 daemon. Use the Node cluster
module or run N units behind Nginx upstream for multi-core.
```ini
# /etc/systemd/system/app.service
[Unit]
Description=Node app
After=network.target

[Service]
Type=simple
User=app
WorkingDirectory=/var/www/app
Environment=NODE_ENV=production
EnvironmentFile=/var/www/app/.env
ExecStart=/usr/bin/node dist/server.js
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5
# hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/www/app/storage

[Install]
WantedBy=multi-user.target
```

## Graceful Reload
The app must handle `SIGTERM`/`SIGHUP`: stop accepting new connections, drain in-flight
requests, then exit. PM2 `reload` and systemd `Restart` rely on this for zero-downtime.
```javascript
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGHUP',  () => server.close(() => process.exit(0)));  // systemctl reload sends SIGHUP
```

## Node Version Upgrade Path
1. Bump `.nvmrc` + `engines.node`; `nvm install <new>` alongside the old (Prinsip 3).
2. `npm ci` against the new version in a release dir; run the test/smoke suite.
3. Flip PM2/systemd `ExecStart` to the new Node path; `pm2 reload` / `systemctl restart`.
4. Verify health endpoint, then remove the old Node version.

## Related
- ops-webserver — Nginx reverse proxy / upstream to the Node port.
- ops-deploy — release directory + symlink flip that triggers `pm2 reload`.
- ops-monitoring — health endpoint and memory-restart alerting.
- ops-log-management — rotating PM2 / app log files.
