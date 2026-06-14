# Rule: ops-verify

Per Principle 4 (idempotent) and "a working system is the only acceptable end state": every change MUST be verified. A change is NOT "done" until verification passes. If verification fails, roll back immediately using the prepared rollback plan.

## After a service change (restart/reload/edit unit or config)
1. `systemctl is-active <svc>` returns `active`; `systemctl status <svc>` shows no failed state.
2. Config validity tested BEFORE reload (`nginx -t`, `apachectl configtest`, `php-fpm -t`, `sshd -t`).
3. Health probe: service answers on its socket/port (`ss -ltnp`, `curl -fsS localhost`).
4. Error log clean since the change: tail `journalctl -u <svc> --since` + service log; no new errors/restarts.

## After a deploy
1. App responds `HTTP 200` (or expected status) on its public URL and a real route, not just `/`.
2. No new application errors in logs (app log, PHP-FPM, server error log).
3. Queue/workers and scheduler are running (`systemctl`/`pm2 list`/`supervisorctl status`).
4. Migrations applied without error; SSL still valid (cert not expired, chain OK).
5. Assets/build present and served (no 404 on hashed assets).

## After a security change (firewall / SSH / hardening)
1. SSH access STILL WORKS — open a SECOND session and authenticate BEFORE closing the current one. Never disconnect on an unverified change.
2. Firewall does not block legitimate traffic: required ports (SSH, 80, 443, app) reachable; verify with `ss -ltnp` + external probe.
3. Application remains functional end-to-end after hardening (PHP/Nginx/DB limits not breaking the app).
4. Confirm the intended attack surface is actually closed (port no longer open, login policy enforced).

The hook `ops-post-verify.js` performs an automatic service-active check after `systemctl restart/reload/start`; treat its warnings as a trigger to investigate or roll back.
