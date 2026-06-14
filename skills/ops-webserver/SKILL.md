---
name: ops-webserver
description: Configure and troubleshoot Nginx, Apache, and Caddy for PHP-FPM apps and reverse-proxied Node/Go/Python/Java services with production-grade security and performance.
version: 1.0
---

# Web Server Operations (Nginx / Apache / Caddy)

## When to Use
- Setting up a virtual host / server block for a new application.
- Configuring a reverse proxy in front of an app runtime (Node, Go, Python, Java).
- Hardening web server security headers and blocking sensitive paths.
- Tuning worker processes, gzip, sendfile, and buffers for throughput.
- Diagnosing HTTP errors (502/504/403/413/404) from the web server layer.

Always run `nginx -t` (or `apachectl configtest` / `caddy validate`) before reloading.
Keep a copy of the old config first (Principle 3). Reloading a service is a WRITE
operation: show the diff and impact, then confirm.

## Detection First (Principle 1)
```bash
# Which web server is installed and listening?
command -v nginx apache2 httpd caddy 2>/dev/null
ss -ltnp | grep -E ':80|:443'
systemctl is-active nginx apache2 httpd caddy 2>/dev/null

# Locate config roots
nginx -V 2>&1 | tr ' ' '\n' | grep -E 'conf-path|prefix'   # Nginx
apachectl -V 2>/dev/null | grep -E 'SERVER_CONFIG_FILE|HTTPD_ROOT'  # Apache
ls -la /etc/caddy/Caddyfile 2>/dev/null                    # Caddy
```

## Nginx — PHP-FPM Application (root /public)

For modern PHP frameworks (Laravel, Symfony, WordPress in a subdir) the document
root is the `public/` directory; everything else stays above the web root.

```nginx
# /etc/nginx/sites-available/example.com
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;

    # All HTTP -> HTTPS (managed by Certbot after issuance; keep ACME path open)
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name example.com www.example.com;

    root /var/www/example.com/current/public;
    index index.php;

    # --- TLS (certs injected by Certbot / ops-ssl) ---
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;   # protocols + ciphers

    # --- Security headers ---
    add_header X-Frame-Options              "SAMEORIGIN"        always;
    add_header X-Content-Type-Options       "nosniff"           always;
    add_header Referrer-Policy              "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy           "geolocation=(), microphone=(), camera=()" always;
    add_header Strict-Transport-Security    "max-age=63072000; includeSubDomains" always; # see ops-ssl HSTS note
    server_tokens off;

    # --- Upload limit (match php.ini upload_max_filesize/post_max_size) ---
    client_max_body_size 25m;

    # --- Logging ---
    access_log /var/log/nginx/example.com.access.log;
    error_log  /var/log/nginx/example.com.error.log warn;

    # --- Front controller ---
    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    # --- PHP-FPM ---
    location ~ \.php$ {
        try_files $uri =404;                       # do not pass non-existent files to FPM
        fastcgi_split_path_info ^(.+\.php)(/.+)$;
        fastcgi_pass unix:/run/php/app.sock;        # per-app pool from ops-runtime-php
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        fastcgi_param DOCUMENT_ROOT   $realpath_root;
        fastcgi_param HTTPS on;
        fastcgi_read_timeout 60s;
        fastcgi_buffers 16 16k;
        fastcgi_buffer_size 32k;
    }

    # --- Static asset caching ---
    location ~* \.(?:css|js|jpg|jpeg|png|gif|ico|svg|webp|woff2?|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
        try_files $uri =404;
    }

    # --- Block sensitive files & VCS/dependency dirs ---
    location ~ /\.(?!well-known) { deny all; }          # dotfiles incl. .env, .git
    location ~ \.(?:env|ini|log|sh|sql|bak|conf)$ { deny all; }
    location ~* /(?:vendor|node_modules|storage|tests)/ { deny all; }
    location = /composer.json  { deny all; }
    location = /composer.lock  { deny all; }
    location = /package.json   { deny all; }
}
```

Enable and reload:
```bash
ln -sf /etc/nginx/sites-available/example.com /etc/nginx/sites-enabled/example.com
nginx -t && systemctl reload nginx
```

## Nginx — Reverse Proxy (Node / Go / Python / Java)

Use a named upstream with keepalive for connection reuse. Forward the real client
IP and scheme, and handle WebSocket upgrades.

```nginx
# /etc/nginx/sites-available/app.example.com
upstream app_backend {
    server 127.0.0.1:3000;          # Node/Next, Go, Gunicorn, Spring Boot, etc.
    keepalive 32;                    # reuse upstream connections
}

map $http_upgrade $connection_upgrade {  # WebSocket support
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl;
    http2 on;
    server_name app.example.com;

    ssl_certificate     /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    client_max_body_size 25m;

    access_log /var/log/nginx/app.example.com.access.log;
    error_log  /var/log/nginx/app.example.com.error.log warn;

    # Optional: serve static assets directly (Next.js build output, Go embed, etc.)
    location /_next/static/ {
        alias /var/www/app/current/.next/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location / {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;

        # WebSocket upgrade
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        # Pass real client info
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        # NOTE: do NOT add a second `proxy_set_header Connection ""` here — the last
        # directive wins for the whole location and would kill WebSocket upgrades.
        # The $connection_upgrade map already yields "close" for non-upgrade requests.

        # Timeouts
        proxy_connect_timeout 5s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;

        # Buffering
        proxy_buffering on;
        proxy_buffers 16 16k;
        proxy_buffer_size 32k;
    }
}
```

> Note: when WebSockets are required on the same server block, keep the `Connection`
> header driven by the `$connection_upgrade` map (set `proxy_set_header Connection
> $connection_upgrade;`) instead of clearing it. Use cleared `Connection ""` only on
> blocks that are pure HTTP keepalive without upgrades.

## Nginx — Global Tuning (nginx.conf)

```nginx
# /etc/nginx/nginx.conf (excerpt)
worker_processes  auto;            # one per CPU core
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    multi_accept on;
}

http {
    sendfile        on;            # zero-copy file transfer
    tcp_nopush      on;
    tcp_nodelay     on;
    keepalive_timeout  65;
    keepalive_requests 1000;
    types_hash_max_size 2048;
    server_tokens   off;

    # Compression
    gzip              on;
    gzip_vary         on;
    gzip_comp_level   5;
    gzip_min_length   256;
    gzip_proxied      any;
    gzip_types text/plain text/css application/json application/javascript
               application/xml+rss text/xml image/svg+xml application/font-woff2;

    # Buffers / timeouts (DoS resilience)
    client_body_timeout   12s;
    client_header_timeout 12s;
    send_timeout          10s;

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
```

## Apache — Virtual Host (PHP + Reverse Proxy)

```bash
# Required modules
a2enmod rewrite headers ssl proxy proxy_http proxy_wstunnel
# PHP via PHP-FPM (preferred over mod_php)
a2enconf php8.3-fpm
```

```apache
# /etc/apache2/sites-available/example.com.conf
<VirtualHost *:443>
    ServerName  example.com
    ServerAlias www.example.com
    DocumentRoot /var/www/example.com/current/public

    SSLEngine on
    SSLCertificateFile    /etc/letsencrypt/live/example.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/example.com/privkey.pem

    # Security headers
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set Strict-Transport-Security "max-age=63072000; includeSubDomains"
    ServerSignature Off

    <Directory /var/www/example.com/current/public>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # PHP-FPM handoff
    <FilesMatch \.php$>
        SetHandler "proxy:unix:/run/php/app.sock|fcgi://localhost"
    </FilesMatch>

    # Block sensitive files
    <FilesMatch "(^\.|\.(env|ini|log|sh|sql|bak)$)">
        Require all denied
    </FilesMatch>

    LimitRequestBody 26214400   # 25 MiB upload cap

    ErrorLog  ${APACHE_LOG_DIR}/example.com.error.log
    CustomLog ${APACHE_LOG_DIR}/example.com.access.log combined
</VirtualHost>

# Reverse proxy variant (Node/Go/Python)
<VirtualHost *:443>
    ServerName app.example.com
    SSLEngine on
    SSLCertificateFile    /etc/letsencrypt/live/app.example.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/app.example.com/privkey.pem

    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
    # WebSocket upgrade
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*) ws://127.0.0.1:3000/$1 [P,L]
</VirtualHost>
```

```bash
a2ensite example.com.conf
apachectl configtest && systemctl reload apache2
```

## Caddy — Automatic HTTPS

Caddy obtains and renews TLS certificates automatically; no Certbot needed.

```caddy
# /etc/caddy/Caddyfile

# PHP-FPM site
example.com {
    root * /var/www/example.com/current/public
    encode gzip zstd
    php_fastcgi unix//run/php/app.sock
    file_server

    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        -Server
    }

    # Block sensitive paths
    @sensitive path /.env /.git/* /vendor/* /storage/* /composer.* 
    respond @sensitive 403

    request_body { max_size 25MB }
    log { output file /var/log/caddy/example.com.log }
}

# Reverse proxy site (Node/Go/Python) — auto-SSL + WebSocket handled natively
app.example.com {
    encode gzip zstd
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-Proto {scheme}
        transport http { keepalive 32 }
    }
    log { output file /var/log/caddy/app.example.com.log }
}
```

```bash
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

## Troubleshooting — Common HTTP Errors

| Error | Typical meaning | First checks | Common fix |
|-------|-----------------|--------------|------------|
| **502 Bad Gateway** | Upstream (FPM/app) down or wrong socket/port | `systemctl status php8.3-fpm`; `ss -ltnp \| grep 3000`; tail nginx error log | Start/restart FPM or app; correct `fastcgi_pass`/`proxy_pass` target; fix socket path/perms |
| **504 Gateway Timeout** | Upstream too slow to respond | App/DB slow query; `fastcgi_read_timeout`/`proxy_read_timeout` | Raise timeout for known-slow endpoint; fix slow query (ops-performance); add caching |
| **403 Forbidden** | Permission or explicit deny rule | File perms/owner; SELinux/AppArmor; `deny`/`Require` blocks | `chown -R www-data` on web root; relax over-broad deny; `chmod 755` dirs / `644` files |
| **413 Payload Too Large** | Upload exceeds limit | `client_max_body_size` / `LimitRequestBody` vs `post_max_size` | Raise nginx/Apache limit AND PHP `upload_max_filesize`+`post_max_size`; reload both |
| **404 Not Found** | Wrong root or missing front-controller rewrite | `root` path; `try_files`/`mod_rewrite`; symlink `current` valid | Point root at `/public`; add `try_files $uri /index.php?$query_string`; fix release symlink |

## Related
- [ops-ssl](../ops-ssl/SKILL.md) — TLS certificates and HTTPS hardening.
- [ops-dns](../ops-dns/SKILL.md) — resolve names to this server before serving.
- [ops-runtime-php](../ops-runtime-php/SKILL.md) — PHP-FPM pool referenced by `fastcgi_pass`.
- [ops-runtime-node](../ops-runtime-node/SKILL.md) / [ops-runtime-go](../ops-runtime-go/SKILL.md) / [ops-runtime-python](../ops-runtime-python/SKILL.md) — proxied upstreams.
- [ops-performance](../ops-performance/SKILL.md) — tuning workers, buffers, caching.
- [ops-log-management](../ops-log-management/SKILL.md) — access/error log locations and queries.
