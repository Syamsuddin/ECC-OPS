---
name: ops-performance
description: Performance analysis and tuning across web server, runtime, and database layers.
version: 1.0
---

# Operations: Performance Analysis & Tuning

Performance work follows one rule: **measure, change one thing, measure again.** Guessing wastes capacity and hides the real bottleneck. This skill provides fast diagnostics to locate the constrained layer, then per-layer tuning levers with the reasoning behind each.

## When to Use

- A service is slow but up (latency, not outage).
- After a traffic increase, to right-size workers and buffers.
- Capacity planning before a launch (`/perf-tune`).

## Quick Diagnostics (locate the bottleneck)

```bash
# Live overview: CPU/mem/load + per-process; press M (mem) or P (cpu) to sort
top -b -n1 | head -20

# Memory headroom and swap pressure (swap in use under load = RAM bound)
free -h

# Per-device I/O: %util near 100 = disk bound; await high = slow storage
iostat -xz 1 3

# Top memory consumers
ps -eo pid,comm,%mem,rss --sort=-%mem | head -10

# Top CPU consumers
ps -eo pid,comm,%cpu,time --sort=-%cpu | head -10

# Listening sockets + connection counts (find the busy port)
ss -s; ss -tlnp

# What's holding a file / port (e.g. who has the log open, who binds :80)
lsof -i :80; lsof -nP +L1 | head   # +L1: open-but-deleted files eating disk
```

Interpretation: high load + low CPU% usually means I/O wait (check `iostat`); high CPU% on the runtime means application/CPU-bound work; growing swap means RAM-bound — fix that first, since swapping makes everything slow.

## PHP-FPM Tuning

Pool sizing is the single biggest PHP lever. Size `pm.max_children` to RAM, not optimism: `max_children = (RAM_for_PHP) / (avg process RSS)`.

```ini
; /etc/php/8.3/fpm/pool.d/example.conf
[example]
user = www-data
group = www-data
listen = /run/php/example.sock
listen.owner = www-data
listen.group = www-data

pm = dynamic
pm.max_children = 24          ; e.g. 3GB for PHP / ~128MB per worker
pm.start_servers = 6
pm.min_spare_servers = 4
pm.max_spare_servers = 10
pm.max_requests = 500         ; recycle workers to bound memory leaks

; Surface slow requests for ops-log-management to analyze
request_slowlog_timeout = 5s
slowlog = /var/log/php8.3-fpm-slow.log
```

```ini
; /etc/php/8.3/mods-available/opcache.ini — production opcache
opcache.enable=1
opcache.memory_consumption=256
opcache.interned_strings_buffer=16
opcache.max_accelerated_files=20000
opcache.validate_timestamps=0   ; deploy must clear opcache (reload fpm); huge win
opcache.jit=tracing
opcache.jit_buffer_size=128M
```

## Nginx Tuning

```nginx
# /etc/nginx/conf.d/performance.conf
# Buffers sized to avoid spilling proxied responses to disk
proxy_buffering on;
proxy_buffer_size 8k;
proxy_buffers 16 8k;
proxy_busy_buffers_size 16k;
client_body_buffer_size 16k;
client_max_body_size 32m;

# Compression for text payloads (skip already-compressed binaries)
gzip on;
gzip_vary on;
gzip_comp_level 5;
gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript
           application/xml text/xml image/svg+xml font/woff2;

# Long-cache immutable static assets at the edge of the box
location ~* \.(?:css|js|woff2|jpg|jpeg|png|gif|svg|ico)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
    access_log off;
    try_files $uri =404;
}
```

## MySQL Tuning Guidelines

The dominant lever on a dedicated DB host is the InnoDB buffer pool — it should hold the working set. Validate with `SHOW ENGINE INNODB STATUS` and the slow log before/after.

| Parameter | Formula / guideline | Why |
|---|---|---|
| `innodb_buffer_pool_size` | 60–70% of RAM (dedicated host) | Keeps hot data/index pages in memory |
| `innodb_buffer_pool_instances` | 1 per GB of pool, cap ~8 | Reduces internal contention |
| `innodb_log_file_size` | ~25% of buffer pool | Fewer checkpoint flushes |
| `innodb_flush_log_at_trx_commit` | 1 (safe) / 2 (faster, risk 1s) | Durability vs throughput trade |
| `innodb_flush_method` | `O_DIRECT` | Avoid double-buffering with OS cache |
| `max_connections` | peak concurrent + headroom | Too high wastes RAM per conn |
| `tmp_table_size`/`max_heap_table_size` | equal, e.g. 64M | Avoid on-disk temp tables |
| `long_query_time` | 1s (then tune down) | Feed the slow log |
| `slow_query_log` | ON | Enables `mysqldumpslow` analysis |

```ini
; /etc/mysql/mysql.conf.d/zz-ecc-tuning.cnf (example for ~16GB dedicated host)
[mysqld]
innodb_buffer_pool_size = 10G
innodb_buffer_pool_instances = 8
innodb_log_file_size = 2G
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT
max_connections = 200
tmp_table_size = 64M
max_heap_table_size = 64M
slow_query_log = 1
long_query_time = 1
slow_query_log_file = /var/log/mysql/slow.log
```

## Node — PM2 Cluster

Run one worker per core to use all CPUs; PM2 load-balances across them and restarts on crash.

```javascript
// ecosystem.config.js — cluster across all cores with memory guardrails
module.exports = {
  apps: [{
    name: 'example',
    script: './server.js',
    instances: 'max',          // one per CPU core
    exec_mode: 'cluster',
    max_memory_restart: '512M',// restart a worker if it leaks past 512MB
    env: { NODE_ENV: 'production', PORT: 3000 },
  }],
};
```

```bash
pm2 start ecosystem.config.js   # WRITE: starts/loads the cluster
pm2 save                        # persist process list across reboot
pm2 monit                       # live per-worker CPU/mem (READ)
```

## Related

- `ops-monitoring` — sustained threshold breaches trigger a tuning session.
- `ops-log-management` — slowlog/slow-query data is the input to tuning.
- `ops-runtime-php` / `ops-runtime-node` — runtime-specific deploy & pool details.
- `ops-database` — schema/index changes that may outrank server tuning.
