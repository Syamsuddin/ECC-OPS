---
name: ops-runtime-go
description: Go static binary builds, systemd supervision, graceful shutdown, and zero-downtime deploys.
version: 1.0
---

# Go Runtime Operations

## When to Use
Load when `go.mod` is detected. Covers building static binaries, running them under systemd,
graceful shutdown, environment injection, cross-compilation, and zero-downtime release.

## Static Build
```bash
# Fully static, stripped, reproducible binary; CGO off for portability
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
  go build -trimpath -ldflags '-s -w -X main.version=$(git rev-parse --short HEAD)' \
  -o /usr/local/bin/app ./cmd/app
```
```bash
# Cross-compile from a build host (e.g. arm64 target)
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o app-arm64 ./cmd/app
```
Ship the single binary to the server; no runtime toolchain needed (Prinsip 9: the artifact
comes from CI/VCS, not edited on the box).

## systemd Unit
```ini
# /etc/systemd/system/app.service
[Unit]
Description=Go app
After=network.target

[Service]
Type=notify                       # if using sd_notify; else Type=simple
User=app
EnvironmentFile=/etc/app/app.env  # env injected by systemd, never baked into binary
ExecStart=/usr/local/bin/app
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=3
TimeoutStopSec=30                 # allow in-flight requests to drain
AmbientCapabilities=CAP_NET_BIND_SERVICE   # only if binding :80/:443 directly
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

## Graceful Shutdown
Handle `SIGTERM`: stop the listener, drain with a timeout, then exit. systemd's
`TimeoutStopSec` must exceed the drain window.
```go
ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
defer stop()
<-ctx.Done()
shutdownCtx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
defer cancel()
_ = srv.Shutdown(shutdownCtx)
```

## Zero-Downtime Deploy
- Simple: install the new binary, `systemctl restart app` — brief gap, acceptable behind a
  retrying reverse proxy.
- True zero-downtime: bind with `SO_REUSEPORT` and run two instances (old + new) on the
  same port, or front N instances with an Nginx upstream and roll them one at a time.
```bash
# SO_REUSEPORT pattern: start new instance, health-check, then stop old
systemctl start app@new && curl -fsS http://127.0.0.1:8080/healthz && systemctl stop app@old
```

## JDK-free, no version manager
Upgrades = rebuild with a newer Go toolchain in CI and ship the new binary; the server is
toolchain-agnostic. Keep the previous binary for instant rollback (Prinsip 3).

## Related
- ops-webserver — Nginx upstream / reverse proxy and SO_REUSEPORT fronting.
- ops-deploy — binary swap + symlink and rollback to prior binary.
- ops-monitoring — `/healthz` probe and restart alerting.
- ops-security-hardening — systemd sandboxing and capability scoping.
