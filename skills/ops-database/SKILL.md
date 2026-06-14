---
name: ops-database
description: Setup, secure, tune, and diagnose MySQL/MariaDB, PostgreSQL, and Redis with least-privilege users and localhost-only access.
version: 1.0
---

# ops-database — Database Setup, Security & Diagnostics

Knowledge base for provisioning and operating relational and cache databases
(MySQL/MariaDB, PostgreSQL 16, Redis) with a security-first, least-privilege posture.

## When to Use

- Provisioning a database engine on a fresh server (Prinsip 1: detect engine/version first).
- Creating an application database and its dedicated users.
- Hardening database access (bind address, auth, network exposure).
- Tuning memory/IO parameters to the host's RAM.
- Diagnosing slow queries, connection exhaustion, replication, or disk pressure.

> All `SELECT`/`SHOW`/`EXPLAIN` and `*.cnf` reads are READ tier (auto).
> Creating users, editing config, restarting the engine are WRITE tier (single confirm + rollback).
> `DROP DATABASE`, `DROP USER`, `TRUNCATE`, `FLUSH ... RESET` are DESTRUCTIVE (double-confirm + verify backup exists).

---

## MySQL / MariaDB

### 1. Install & secure

```bash
# Debian/Ubuntu
apt-get update && apt-get install -y mysql-server   # or mariadb-server
systemctl enable --now mysql

# Interactive hardening: set root password, remove anon users,
# disable remote root, drop test DB, reload privileges.
mysql_secure_installation
```

Non-interactive equivalent (idempotent — Prinsip 4) when scripting:

```sql
-- Run as root (auth_socket on Debian) BEFORE setting a root password.
DELETE FROM mysql.user WHERE User='';
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost','127.0.0.1','::1');
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
FLUSH PRIVILEGES;
```

### 2. Create database + TWO dedicated users (least-privilege)

> **CRITICAL**
> - NEVER let the app connect as `root`.
> - NEVER `GRANT ALL` to an application user.
> - NEVER use `@'%'` (any host). Bind users to `localhost`.
> - The runtime user gets DML only; a separate user gets DDL for migrations.

```sql
CREATE DATABASE myapp CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Runtime user: data access only (no schema changes).
CREATE USER 'myapp_app'@'localhost' IDENTIFIED BY '<STRONG_RANDOM_PW>';
GRANT SELECT, INSERT, UPDATE, DELETE ON myapp.* TO 'myapp_app'@'localhost';

-- Migration user: DML + DDL, used only during deploy/migrate, never by the running app.
CREATE USER 'myapp_migrate'@'localhost' IDENTIFIED BY '<DIFFERENT_STRONG_PW>';
GRANT SELECT, INSERT, UPDATE, DELETE,
      CREATE, ALTER, DROP, INDEX, REFERENCES, CREATE TEMPORARY TABLES
      ON myapp.* TO 'myapp_migrate'@'localhost';

FLUSH PRIVILEGES;
```

Verify the grants are scoped correctly (Prinsip 7 — auditable):

```sql
SHOW GRANTS FOR 'myapp_app'@'localhost';
SHOW GRANTS FOR 'myapp_migrate'@'localhost';
```

### 3. Security configuration

`/etc/mysql/mysql.conf.d/zz-ecc-hardening.cnf`:

```ini
[mysqld]
# Listen on loopback only — never expose to the network without a deliberate reason.
bind-address            = 127.0.0.1
mysqlx-bind-address     = 127.0.0.1

# Do not resolve client hostnames (faster, avoids DNS-based auth surprises).
skip-name-resolve       = ON

# Reject symlinked tables (path-traversal hardening).
symbolic-links          = 0

# Disable arbitrary file load/dump via SQL.
local-infile            = 0
secure-file-priv        = /var/lib/mysql-files

# Audit slow queries for performance diagnostics.
slow_query_log          = 1
slow_query_log_file     = /var/log/mysql/slow.log
long_query_time         = 1.0
log_queries_not_using_indexes = 1
```

If the engine must accept LAN connections, prefer an SSH tunnel or a private
interface + a firewall allowlist (see `ops-firewall`) over `bind-address = 0.0.0.0`.

### 4. Tuning by RAM

InnoDB buffer pool is the single most impactful setting. Rule of thumb: ~60–70%
of RAM on a dedicated DB host, less when the box is shared with web/runtime.

| Host RAM | `innodb_buffer_pool_size` | `innodb_buffer_pool_instances` | `max_connections` |
| -------- | ------------------------- | ------------------------------ | ----------------- |
| 1 GB     | 256M                      | 1                              | 50                |
| 2 GB     | 1G                        | 1                              | 80                |
| 4 GB     | 2G                        | 2                              | 100               |
| 8 GB     | 5G                        | 4                              | 150               |
| 16 GB    | 11G                       | 8                              | 200               |

```ini
[mysqld]
innodb_buffer_pool_size       = 2G
innodb_buffer_pool_instances  = 2
innodb_flush_log_at_trx_commit = 1     # 1 = ACID-safe; 2 only if you can lose ~1s on crash
innodb_flush_method           = O_DIRECT
innodb_redo_log_capacity      = 1G     # MySQL 8.0.30+ (replaces the deprecated innodb_log_file_size)
max_connections               = 100
tmp_table_size                = 64M
max_heap_table_size           = 64M
```

Apply with rollback ready (Prinsip 3): copy the current config, write the new
one, then `systemctl restart mysql` and verify `SELECT @@innodb_buffer_pool_size;`.

### 5. Diagnostics

```sql
-- Active sessions and what they are running.
SHOW FULL PROCESSLIST;

-- Connection pressure.
SHOW STATUS LIKE 'Threads_connected';
SHOW STATUS LIKE 'Max_used_connections';

-- Buffer pool efficiency (reads from disk vs from memory).
SHOW STATUS LIKE 'Innodb_buffer_pool_read%';

-- Largest tables by size.
SELECT table_schema, table_name,
       ROUND((data_length+index_length)/1024/1024,1) AS mb
FROM information_schema.tables
ORDER BY (data_length+index_length) DESC LIMIT 10;

-- Inspect a slow query plan.
EXPLAIN ANALYZE SELECT ...;
```

```bash
# Slow queries summarized.
mysqldumpslow -s t -t 10 /var/log/mysql/slow.log
```

---

## PostgreSQL 16

### 1. Install & init

```bash
apt-get install -y postgresql-16
systemctl enable --now postgresql
sudo -u postgres psql -c "\conninfo"
```

### 2. Create database + dedicated users

```sql
-- Runtime role: connect + DML only, no schema ownership.
CREATE ROLE myapp_app LOGIN PASSWORD '<STRONG_RANDOM_PW>';

-- Owner/migration role: owns the schema, runs migrations.
CREATE ROLE myapp_migrate LOGIN PASSWORD '<DIFFERENT_STRONG_PW>';

CREATE DATABASE myapp OWNER myapp_migrate ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8' TEMPLATE template0;

\connect myapp

-- Lock down the public schema; grant runtime DML only.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO myapp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO myapp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE myapp_migrate IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO myapp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO myapp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE myapp_migrate IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO myapp_app;
```

> **CRITICAL** — same rules as MySQL: app role never owns the schema, never gets
> superuser, never `GRANT ALL`. Migration role is used only at deploy time.

### 3. `pg_hba.conf` (client authentication)

`/etc/postgresql/16/main/pg_hba.conf` — use `scram-sha-256`, never `trust`,
never a `0.0.0.0/0` rule:

```ini
# TYPE  DATABASE  USER           ADDRESS         METHOD
local   all       postgres                       peer
local   myapp     myapp_app                      scram-sha-256
local   myapp     myapp_migrate                  scram-sha-256
host    myapp     myapp_app      127.0.0.1/32    scram-sha-256
host    myapp     myapp_app      ::1/128         scram-sha-256
host    myapp     myapp_migrate  127.0.0.1/32    scram-sha-256   # migrate role over loopback (used by backup/restore)
host    myapp     myapp_migrate  ::1/128         scram-sha-256
# NEVER:  host  all  all  0.0.0.0/0  trust   <-- forbidden
```

`/etc/postgresql/16/main/postgresql.conf`:

```ini
listen_addresses = 'localhost'   # loopback only
password_encryption = scram-sha-256
ssl = on
```

Reload (no restart needed for HBA changes): `sudo -u postgres psql -c "SELECT pg_reload_conf();"`.

### 4. Tuning by RAM

| Host RAM | `shared_buffers` | `effective_cache_size` | `work_mem` | `maintenance_work_mem` |
| -------- | ---------------- | ---------------------- | ---------- | ---------------------- |
| 1 GB     | 256MB            | 512MB                  | 8MB        | 64MB                   |
| 2 GB     | 512MB            | 1500MB                 | 16MB       | 128MB                  |
| 4 GB     | 1GB              | 3GB                    | 32MB       | 256MB                  |
| 8 GB     | 2GB              | 6GB                    | 64MB       | 512MB                  |
| 16 GB    | 4GB              | 12GB                   | 128MB      | 1GB                    |

```ini
shared_buffers = 2GB              # ~25% RAM
effective_cache_size = 6GB        # ~75% RAM (planner hint, not allocation)
work_mem = 64MB                   # per sort/hash op — multiply by connections!
maintenance_work_mem = 512MB
wal_compression = on
checkpoint_completion_target = 0.9
random_page_cost = 1.1           # SSD
```

### 5. Maintenance (bloat / vacuum)

```sql
-- Tables most in need of (auto)vacuum: high dead-tuple ratio.
SELECT relname,
       n_dead_tup,
       n_live_tup,
       ROUND(n_dead_tup::numeric / NULLIF(n_live_tup,0), 3) AS dead_ratio,
       last_autovacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC LIMIT 10;

-- Reclaim bloat (locks the table — WRITE tier, schedule off-peak).
VACUUM (ANALYZE, VERBOSE) myapp_table;

-- Heavy bloat: rebuild without an exclusive lock (PG 12+).
REINDEX TABLE CONCURRENTLY myapp_table;
```

```bash
# Cache hit ratio (target > 0.99).
sudo -u postgres psql -d myapp -c \
"SELECT sum(heap_blks_hit)/(sum(heap_blks_hit)+sum(heap_blks_read)) AS hit_ratio FROM pg_statio_user_tables;"

# Long-running / blocking queries.
sudo -u postgres psql -d myapp -c \
"SELECT pid, now()-query_start AS dur, state, query FROM pg_stat_activity WHERE state<>'idle' ORDER BY dur DESC;"
```

---

## Redis

### 1. Install

```bash
apt-get install -y redis-server
systemctl enable --now redis-server
```

### 2. Secure & configure

`/etc/redis/redis.conf`:

```ini
# Loopback only (or a private interface behind the firewall).
bind 127.0.0.1 ::1
protected-mode yes
port 6379

# Strong auth — required even on loopback.
requirepass <LONG_RANDOM_64_CHAR_SECRET>

# Memory cap + eviction. Use allkeys-lru for caches,
# noeviction for queues/persistent data (so writes fail loudly instead of silently dropping).
maxmemory 512mb
maxmemory-policy allkeys-lru

# Disable/obfuscate dangerous commands in shared environments.
rename-command FLUSHALL ""
rename-command FLUSHDB  ""
rename-command CONFIG   "CONFIG_b1f3..."

# Persistence: RDB snapshot + AOF for durability.
appendonly yes
appendfsync everysec
```

> The `requirepass` value is a secret — store it via `ops-secrets`, never inline it
> into app config in git. Restart: `systemctl restart redis-server`.

### 3. Diagnostics

```bash
redis-cli -a "$REDIS_PW" INFO memory          # used_memory, maxmemory, fragmentation
redis-cli -a "$REDIS_PW" INFO stats           # hits/misses, evicted_keys, ops/sec
redis-cli -a "$REDIS_PW" INFO clients         # connected_clients, blocked_clients
redis-cli -a "$REDIS_PW" --bigkeys            # find memory-heavy keys
redis-cli -a "$REDIS_PW" SLOWLOG GET 10       # slowest recent commands
redis-cli -a "$REDIS_PW" LATENCY DOCTOR       # latency analysis
```

Hit ratio: `keyspace_hits / (keyspace_hits + keyspace_misses)` — a low ratio with
high `evicted_keys` means `maxmemory` is too small for the working set.

## Related

- `ops-secrets` — store DB/Redis passwords in `.env` (chmod 640) or a secret manager.
- `ops-backup` — dump and verify databases before any destructive operation.
- `ops-firewall` — keep DB ports closed; allowlist only when network access is required.
- `ops-performance` — end-to-end performance tuning across web/runtime/DB.
- `ops-security-hardening` — layered hardening that includes the DB tier.
