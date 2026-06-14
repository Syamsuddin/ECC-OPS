---
name: ops-runtime-python
description: Python WSGI/ASGI deploys with venv, Gunicorn/uvicorn, systemd, and Django operations.
version: 1.0
---

# Python Runtime Operations

## When to Use
Load when `requirements.txt` or `pyproject.toml` is detected. Covers Python 3.12/3.13,
isolated virtualenvs, Gunicorn (WSGI) and uvicorn (ASGI/FastAPI), systemd + socket
activation, and Django `migrate`/`collectstatic`.

## Virtualenv & Dependency Pinning
```bash
python3.12 -m venv /var/www/app/.venv
/var/www/app/.venv/bin/pip install --upgrade pip wheel
# Pinned, hash-verified install (generate requirements.txt via pip-compile / uv)
/var/www/app/.venv/bin/pip install -r requirements.txt --require-hashes --no-deps
```
Always commit a fully pinned `requirements.txt` (or `uv.lock`/`poetry.lock`). The server
installs exact versions — never `pip install <pkg>` ad hoc (Prinsip 9).

## Gunicorn (WSGI: Django/Flask)
`workers = 2 * CPU + 1`. Use `gthread` for I/O-bound apps; `sync` for CPU-bound.
```bash
exec /var/www/app/.venv/bin/gunicorn app.wsgi:application \
  --workers 5 --worker-class gthread --threads 4 \
  --bind unix:/run/app.sock --timeout 60 --graceful-timeout 30 \
  --max-requests 1000 --max-requests-jitter 100 \
  --access-logfile - --error-logfile -
```

## uvicorn (ASGI: FastAPI/Starlette)
```bash
# Behind a process manager use uvicorn workers under Gunicorn, or systemd + uvicorn directly
exec /var/www/app/.venv/bin/gunicorn app.main:app \
  --workers 5 --worker-class uvicorn.workers.UvicornWorker \
  --bind unix:/run/app.sock --timeout 60
```

## systemd + Socket Activation
```ini
# /etc/systemd/system/app.socket
[Socket]
ListenStream=/run/app.sock
SocketUser=www-data
SocketMode=0660

[Install]
WantedBy=sockets.target
```
```ini
# /etc/systemd/system/app.service
[Unit]
Requires=app.socket
After=network.target

[Service]
User=app
WorkingDirectory=/var/www/app
EnvironmentFile=/var/www/app/.env
ExecStart=/var/www/app/.venv/bin/gunicorn app.wsgi:application --workers 5 --bind fd://0
ExecReload=/bin/kill -s HUP $MAINPID
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/www/app/media /run

[Install]
WantedBy=multi-user.target
```
Graceful reload: `systemctl reload app` sends `HUP`; Gunicorn re-forks workers without
dropping the listening socket (zero-downtime).

## Django Deploy
```bash
source /var/www/app/.venv/bin/activate
python manage.py migrate --noinput            # WRITE: back up DB first (ops-backup)
python manage.py collectstatic --noinput      # build static assets
python manage.py check --deploy               # security/config audit before go-live
systemctl reload app
```

## Python Version Upgrade Path
1. Install the new interpreter (`apt install python3.13-venv` or pyenv) alongside the old (Prinsip 3).
2. Recreate the venv with the new interpreter; `pip install -r requirements.txt`; run tests.
3. Point the systemd `ExecStart` at the new venv; `systemctl restart app`.
4. Verify health, then delete the old venv.

## Related
- ops-webserver — Nginx proxy to the Unix socket / port.
- ops-deploy — release flow and socket-activated restart.
- ops-database — DB backup before `migrate`.
- ops-monitoring — worker saturation and health-check alerting.
