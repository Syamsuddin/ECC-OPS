---
name: ops-secrets
description: Manage credentials safely — .env (chmod 640) or a secret manager, strong generation, rotation, and leak auditing; never in code, logs, or git.
version: 1.0
---

# ops-secrets — Credentials, .env, Rotation & Secret Stores

Knowledge base for handling secrets (DB passwords, API keys, app keys, tokens)
without leaking them. Secrets are the keys to the data domain; mishandling one
secret can compromise everything `ops-database` and `ops-backup` protect.

## When to Use

- Placing or fixing credentials for a deployed application.
- Rotating a password/key (planned, or after a suspected leak).
- Choosing a secret store beyond plain `.env`.
- Auditing a server for accidentally exposed secrets.

> Reading file permissions and grepping for leaks is READ tier.
> Writing/rotating secrets and chmod is WRITE tier (single confirm).
> Revoking a credential that an app actively uses is effectively DESTRUCTIVE — confirm impact first.

---

## Core principles

1. **Secrets live in exactly one place per environment**: an `.env` file
   (mode 600, owned by the app/deploy user) **or** a secret manager — never both,
   never in source code.
2. **Never in code, never in git, never in logs, never in command output.**
   No `echo "$DB_PASSWORD"`, no secrets in `mysql -p<pw>` (use option files),
   no secrets printed in error messages or stack traces.
3. **Least exposure**: a process gets a secret only at the moment it needs it,
   scoped as narrowly as possible.
4. **Rotatable**: every secret must have a known, tested rotation procedure
   (Prinsip 3 — you can always move forward to a fresh credential).

---

## .env structure & permissions

```bash
# /var/www/myapp/shared/.env  (symlinked into each release)
chown deploy:www-data /var/www/myapp/shared/.env
chmod 640 /var/www/myapp/shared/.env       # owner rw, group www-data read (FPM needs group read)
```

```ini
# .env — values are secrets; this file is NEVER committed.
APP_KEY=base64:Xk3...                       # app encryption key
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_DATABASE=myapp
DB_USERNAME=myapp_app                       # runtime user (DML only), NOT root
DB_PASSWORD=...
REDIS_PASSWORD=...
MAIL_PASSWORD=...
```

> The `ops-env-protect.js` hook auto-applies `chmod 640` whenever an `.env` is
> written or edited (Prinsip 5). `.env` and `.env.*` are always in `.gitignore`;
> only `.env.example` (no real values) is committed.

---

## Generate strong secrets

```bash
openssl rand -base64 48                      # generic 48-byte secret
openssl rand -hex 32                         # 64-char hex token / Redis requirepass
php artisan key:generate --show              # Laravel APP_KEY (base64:...)
python -c 'import secrets; print(secrets.token_urlsafe(48))'   # Django/FastAPI
```

Never reuse a secret across environments (dev/stage/prod) or across services.

---

## Rotation procedures

### Database password (zero/low downtime)

```sql
-- 1. Set a NEW strong password on the existing least-privilege user.
ALTER USER 'myapp_app'@'localhost' IDENTIFIED BY '<NEW_STRONG_PW>';   -- MySQL
-- ALTER ROLE myapp_app PASSWORD '<NEW_STRONG_PW>';                   -- PostgreSQL
FLUSH PRIVILEGES;
```

```bash
# 2. Update the single source of truth, then reload the app (don't hard-down it).
sed -i 's/^DB_PASSWORD=.*/DB_PASSWORD=<NEW_STRONG_PW>/' /var/www/myapp/shared/.env
systemctl reload php8.4-fpm    # or restart the runtime service for the app
# 3. Verify the app can connect; then the old password is dead.
```

### API key / third-party token

1. Generate the new key in the provider console (keep the old one valid).
2. Update `.env`, reload the app, verify traffic uses the new key.
3. Revoke the old key in the provider console (now DESTRUCTIVE — old key dies).

### App key (e.g. Laravel `APP_KEY`)

> WARNING: rotating `APP_KEY` invalidates anything encrypted with it (sessions,
> encrypted columns, signed URLs). Plan re-encryption or accept the invalidation
> before rotating. Always back up the old key.

---

## Secret store options

| Option                  | Best for                          | Notes                                                       |
| ----------------------- | --------------------------------- | ---------------------------------------------------------- |
| `.env` + chmod 640      | single host, simple apps          | baseline; pair with `ops-env-protect.js`                  |
| **sops + age**          | git-ops, encrypted-at-rest config | commit *encrypted* secrets; `age` key stays on the host    |
| **HashiCorp Vault**     | fleets, dynamic/short-lived creds | central audit, lease/revoke, DB credential brokering       |
| systemd `LoadCredential`| service-scoped secrets            | kernel keyring; secret never lands on disk in plaintext    |
| Docker / Compose secrets| containerized apps                | mounted at `/run/secrets/<name>`, not in image or env dump |

```ini
# systemd LoadCredential — secret exposed only to this unit, via $CREDENTIALS_DIRECTORY.
[Service]
LoadCredential=db_password:/root/secrets/myapp_db_password
ExecStart=/usr/bin/myapp   # reads ${CREDENTIALS_DIRECTORY}/db_password at runtime
```

```bash
# sops + age: edit secrets encrypted; plaintext never touches disk unencrypted.
age-keygen -o /root/.config/sops/age/keys.txt   # 600
sops --age "$(age-keygen -y /root/.config/sops/age/keys.txt)" secrets.enc.yaml
```

---

## Leak auditing

```bash
# 1. World-accessible .env or key files (.env must be 640 or 600, keys 600 — flag any "others" access).
find /var/www /etc /root -name '.env' -o -name '*.pem' -o -name '*.key' 2>/dev/null \
  | xargs -r stat -c '%a %U %n' | grep -vE '^[0-9][0-9]0 '

# 2. Secrets accidentally tracked in git history.
git -C /var/www/myapp log -p --all -S 'DB_PASSWORD' -- ':!*.example' | head
git -C /var/www/myapp ls-files | grep -E '\.env$|\.pem$|\.key$'   # should be empty

# 3. Secrets leaking into logs.
grep -rIl -E 'password|secret|api[_-]?key|token' /var/log/myapp 2>/dev/null

# 4. Secrets in shell history (then scrub).
grep -nE 'mysql .*-p[^ ]|PASSWORD=|API_KEY=' ~/.bash_history ~/.zsh_history 2>/dev/null
```

If a secret was ever committed, exposed, or logged: treat it as compromised —
**rotate immediately** (it cannot be "un-leaked"), then purge it from history/logs
and review access logs via `ops-incident-response`.

## Related

- `ops-database` — the DB credentials and Redis `requirepass` managed here.
- `ops-backup` — the GPG recipient/key and backup DB credentials.
- `ops-deploy` — injects `.env` into releases; never bakes secrets into artifacts.
- `ops-security-hardening` — filesystem permissions and least-privilege posture.
- `ops-incident-response` — rotation and revocation as part of breach response.
