---
name: ops-runtime-php
description: PHP-FPM pool tuning, opcache, Composer deploy, and Laravel/Symfony operations for production.
version: 1.0
---

# PHP Runtime Operations

## When to Use
Load when `composer.json` (or `*.php` + `php-fpm`) is detected. Covers PHP 8.3/8.4 with
PHP-FPM behind Nginx/Apache, OPcache tuning, Composer-based deploys, and Laravel/Symfony
artisan/console workflows.

## FPM Pool Tuning
Per-app pool isolation: one socket + one Unix user per app. Avoid the shared `www.conf`.

`max_children` formula: `(RAM available for PHP) / (avg process RSS)`. Measure RSS first
(WRITE requires no change, READ-only):

```bash
# Average resident memory per php-fpm worker (MB)
ps --no-headers -o rss -C php-fpm8.3 | awk '{s+=$1; n++} END {printf "%.0f MB avg over %d procs\n", s/n/1024, n}'
```

```ini
; /etc/php/8.3/fpm/pool.d/app.conf
[app]
user = app
group = app
listen = /run/php/app.sock
listen.owner = www-data
listen.group = www-data
listen.mode = 0660

pm = dynamic
pm.max_children = 24          ; = usable_RAM_MB / avg_RSS_MB
pm.start_servers = 6
pm.min_spare_servers = 4
pm.max_spare_servers = 10
pm.max_requests = 500         ; recycle workers to bound memory leaks

request_terminate_timeout = 60s
catch_workers_output = yes
php_admin_value[error_log] = /var/log/php/app-error.log
php_admin_flag[log_errors] = on
```

Use `pm = static` only on dedicated single-app hosts with predictable load (set
`pm.max_children` = the static count). Use `pm = ondemand` for many low-traffic sites.

## OPcache (Production)
```ini
; /etc/php/8.3/fpm/conf.d/10-opcache.ini
opcache.enable=1
opcache.enable_cli=0
opcache.memory_consumption=256
opcache.interned_strings_buffer=16
opcache.max_accelerated_files=20000      ; >= number of .php files
opcache.validate_timestamps=0            ; production: never re-stat; reload FPM on deploy
opcache.jit=tracing
opcache.jit_buffer_size=128M
opcache.preload=/var/www/app/preload.php ; optional; preload.php must be readable by FPM user
opcache.preload_user=app
```
With `validate_timestamps=0`, code changes are invisible until FPM reload — every deploy
MUST end with `systemctl reload php8.3-fpm` (the deploy step is the WRITE/rollback boundary).

## Composer Deploy
```bash
# Idempotent production install — never run composer update on a server
composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist --no-progress
composer dump-autoload --classmap-authoritative --no-dev   # if autoload map changed
```
Commit `composer.lock`; the server installs exactly the locked versions (Prinsip 9).

## Laravel / Symfony
```bash
# Laravel — production deploy sequence (run inside release dir, before symlink flip)
php artisan down --render="errors::503" --retry=15   # optional maintenance window
php artisan migrate --force                           # --force = non-interactive (WRITE: back up DB first)
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache
php artisan storage:link
php artisan up

# Symfony equivalent
php bin/console cache:clear --env=prod --no-debug
php bin/console doctrine:migrations:migrate --no-interaction   # WRITE: back up DB first
php bin/console asset-map:compile                              # or assets:install --symlink
```
Caches are environment-specific — clear/rebuild them on every release. `migrate --force`
is a WRITE operation; the orchestrator backs up the DB (see ops-backup) before invoking it.

## php.ini (Production Hardening)
```ini
expose_php = Off
display_errors = Off
log_errors = On
memory_limit = 256M
max_execution_time = 30
upload_max_filesize = 16M
post_max_size = 20M
realpath_cache_size = 4096k
realpath_cache_ttl = 600
session.cookie_httponly = 1
session.cookie_secure = 1
session.cookie_samesite = "Lax"
disable_functions = exec,passthru,shell_exec,system,proc_open,popen
```

## PHP Version Upgrade Path
1. Install the new version side-by-side (`apt install php8.4-fpm php8.4-{cli,mbstring,...}`); the old version keeps running (Prinsip 3).
2. Replicate the pool config under `/etc/php/8.4/fpm/pool.d/` and verify `php8.4-fpm -t`.
3. Point the Nginx `fastcgi_pass` to the new socket for one app; smoke-test.
4. Roll remaining apps; once stable, stop and purge the old FPM service.

## Related
- ops-webserver — Nginx `fastcgi_pass` and FPM socket wiring.
- ops-deploy — zero-downtime symlink release flow that calls this skill.
- ops-database — DB backup before `migrate --force`.
- ops-performance — profiling slow PHP requests and FPM saturation.
