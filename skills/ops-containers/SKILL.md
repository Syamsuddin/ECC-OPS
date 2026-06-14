---
name: ops-containers
description: Docker, Docker Compose, and Podman operations — image build, production compose, volumes, and cleanup.
version: 1.0
---

# Container Operations

## When to Use
Load when `Dockerfile` or `docker-compose.yml` is detected. Covers building lean secure
images, running production Compose stacks, volume/network management, container log
rotation, image cleanup, and rootless Podman as a Docker alternative.

## Dockerfile Best Practices
```dockerfile
# Multi-stage: build with the toolchain, ship only the runtime
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
# Non-root: never run app processes as root
RUN groupadd -r app && useradd -r -g app app
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/node_modules ./node_modules
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "dist/server.js"]
```
```
# .dockerignore — keep build context small & avoid leaking secrets
.git
node_modules
.env
*.log
```
- Pin base image tags (and ideally digests); prefer `-slim`/distroless.
- Order layers cheap→expensive (deps before source) for cache reuse.
- One concern per image; no SSH/cron inside the container.

## docker-compose.yml (Production)
```yaml
services:
  web:
    image: registry.example.com/app:1.4.2     # pinned tag, never :latest in prod
    restart: unless-stopped
    env_file: [/etc/app/app.env]              # secrets out of the compose file
    ports:
      - "127.0.0.1:3000:3000"                 # bind to localhost; Nginx terminates TLS
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:3000/healthz"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 20s
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "5" }   # bound disk usage
    depends_on:
      db: { condition: service_healthy }
    networks: [appnet]

  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    volumes:
      - dbdata:/var/lib/postgresql/data       # named volume = persistent state
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      retries: 5
    secrets: [db_password]
    networks: [appnet]

volumes:
  dbdata:
networks:
  appnet:
secrets:
  db_password:
    file: /etc/app/secrets/db_password
```

## Volumes & Networks
- Named volumes for stateful data (DB, uploads); bind mounts only for read-only config.
- Per-stack user-defined bridge network → DNS-by-service-name + isolation from other stacks.
- Back up named volumes via `ops-backup` (dump DB inside the container; archive volume paths).

## Log Rotation
Without `max-size`, `json-file` logs grow unbounded and fill the disk. Set per-service
(above) or globally:
```json
// /etc/docker/daemon.json
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
```

## Image Cleanup
```bash
docker image prune -f                     # dangling images (safe)
docker system prune -af --volumes         # DESTRUCTIVE: removes unused images+volumes — double-confirm, verify nothing needed
docker builder prune -f                   # build cache
```
`docker system prune --volumes` can delete data volumes not attached to a running
container — treat as DESTRUCTIVE (Tier 3): confirm a current backup exists first.

## Podman (Rootless Alternative)
Drop-in for Docker with daemonless, rootless containers (better isolation, no root daemon).
```bash
podman generate systemd --new --name app > ~/.config/systemd/user/app.service  # or use Quadlet (.container) on modern Podman
systemctl --user enable --now app
loginctl enable-linger app                # keep user services running after logout
```
`podman-compose` (or `docker-compose` with the Podman socket) runs the same compose file.

## Related
- ops-webserver — reverse proxy to the localhost-bound container port.
- ops-secrets — `env_file` / Docker secrets sourcing and rotation.
- ops-backup — dumping DB containers and archiving named volumes.
- ops-firewall — ensuring published ports stay bound to 127.0.0.1, not 0.0.0.0.
- ops-monitoring — container healthcheck status and resource metrics.
