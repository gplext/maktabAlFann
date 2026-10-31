# Deploying Maktaba Al-Fann on Coolify

Step-by-step, in order. Commands are for **PowerShell** on your PC unless marked
**(server)**. Replace `<...>` placeholders with your own values.
Steps marked 🔑 involve passwords or keys: type those yourself and never commit them.

---

## 0. What you need

- A VPS with Coolify installed, and SSH access to it (`ssh <user>@<vps-ip>` works, key login only).
- A domain pointed at Cloudflare.
- An S3-compatible bucket for backups (Cloudflare R2 or Backblaze B2), at a
  different provider from your VPS, with **versioning / object lock on**.
- `psql` and `pg_dump` on your PC (`pg_dump --version` prints a version).

## 1. Export your local database

Run migrations 06 and 07 first (both are safe to run again), then dump:

```powershell
cd C:\Users\lapify\Downloads\maktaba-alfann-code
$env:DATABASE_URL = ((Get-Content .env | Select-String '^DATABASE_URL=').Line -replace '^DATABASE_URL=', '').Trim('"')
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/migration-06-frames.sql
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/migration-07-croc-leather-frame.sql
pg_dump --format=custom --no-owner --no-privileges -d "$env:DATABASE_URL" -f maktaba.dump
pg_dump --version      # note the major version, e.g. 16
```

`*.dump` files are git-ignored. Delete `maktaba.dump` after step 3.
Remove test accounts/orders in your local DB before exporting if you don't want them live.

## 2. Coolify: create the database

1. **+ New → Database → PostgreSQL**. Pick the **same or newer major version** as step 1.
2. Leave **"Make it publicly available" OFF**.
3. **Ports Mappings**: `127.0.0.1:5433:5432` (reachable only from the server itself). Restart the database.
4. Note the **Postgres user, password and database name** Coolify shows, and the
   **internal URL** (`postgres://...@<container>:5432/...`) for step 4.
5. 🔑 **Backups** tab → add your S3 storage (Settings → S3 Storages → validate first) →
   schedule `0 */6 * * *`, keep **7 local / 30 on S3**, S3 upload ON.

## 3. Restore the database through an SSH tunnel

Window 1 (keep it open):
```powershell
ssh -N -L 5433:127.0.0.1:5433 <user>@<vps-ip>
```
Window 2 (asks for the database password from step 2.4):
```powershell
pg_restore --no-owner --no-privileges --exit-on-error -W -h 127.0.0.1 -p 5433 -U <db-user> -d <db-name> maktaba.dump
psql -h 127.0.0.1 -p 5433 -U <db-user> -d <db-name> -c "select count(*) from artworks; select count(*) from frame_profiles;"
```
The counts should match your local site. Then create the read-only login (🔑 choose a password):
```powershell
psql -h 127.0.0.1 -p 5433 -U <db-user> -d <db-name> -v ON_ERROR_STOP=1 -v ro_password='<strong-password>' -f deploy/create-readonly-user.sql
```
Use `maf_readonly` in DBeaver/pgAdmin for browsing (host `localhost`, port `5433`, tunnel open).

## 4. Coolify: create the app

1. **+ New → Application → GitHub** (connect Coolify's GitHub App to `gplext/maktabAlFann`), branch `main`.
2. **Build Pack: Dockerfile**. **Port: 8080**. **Health check path: `/api/healthz`**.
3. **Persistent Storage** → add volume, destination **`/data`**.
4. 🔑 **Environment variables**:

| Name | Value |
|---|---|
| `DATABASE_URL` | the **internal** URL from step 2.4 |
| `DATA_ENCRYPTION_KEY` | **the SAME value as in your local `.env`.** A new key makes stored contact details unreadable. Keep a copy in a password manager. |
| `SESSION_SECRET` | a NEW random value (command below) |
| `ADMIN_USERNAME` | your admin login name |
| `ADMIN_PASSWORD` | a NEW strong password (not the local one) |
| `WHATSAPP_NUMBER` | `+923450462952` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | only if you take card payments |
| `RESEND_API_KEY`, `EMAIL_FROM`, `TWILIO_*` | only if you send email/SMS |

Generate a random value (works in Windows PowerShell 5 and 7):
```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | % { $_.ToString('x2') }) -join ''
```
5. **Domains**: `https://<your-domain>`. Deploy, then open `https://<your-domain>/api/healthz` → `{"status":"ok"}`.

## 5. Copy the images artists already uploaded

```powershell
scp -r uploads\uploads <user>@<vps-ip>:/tmp/maf-uploads
ssh <user>@<vps-ip>
```
**(server)**:
```bash
docker ps --format '{{.Names}}'            # find the app container (name contains the app's UUID)
docker cp /tmp/maf-uploads/. <container>:/data/uploads/
rm -rf /tmp/maf-uploads
```

## 6. Backups for images and Coolify itself

- App → **Backups → Storage backups** → target the `/data` volume, **daily**, keep 3 local / 14 on S3.
- **Settings → Backup** (Coolify instance) → weekly.
- Once a month: restore the latest DB backup into a throw-away database and check the counts.

## 7. Cloudflare

- SSL/TLS mode **Full (strict)**; DNS record **proxied** (orange cloud).
- **Cache Rule**: URI path starts with `/assets/` OR `/images/` OR `/api/storage/objects/`
  → Eligible for cache, Edge TTL 1 month.
- Do **not** cache anything else under `/api/`.

## 8. Card payments (only if used)

🔑 Stripe Dashboard → Webhooks → endpoint `https://<your-domain>/api/payments/stripe/webhook`
→ copy the signing secret into `STRIPE_WEBHOOK_SECRET` → redeploy.

## 9. Server security (once)

**(server)**:
```bash
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
# /etc/ssh/sshd_config: PasswordAuthentication no  → sudo systemctl restart ssh
```
Never map the database port to `0.0.0.0` (Docker bypasses ufw).

## 10. Go-live checklist

- [ ] `/api/healthz` OK; home, `/art`, `/artists`, `/cart` load
- [ ] `/admin` login works with the NEW password; `/staff` login works for a staff account
- [ ] An artist can upload an image; after **Redeploy** the image is still there (volume works)
- [ ] Test order: local + international; WhatsApp link opens the right number
- [ ] First DB backup shows **Success** and the file exists in the bucket
- [ ] Storage backup shows **Success**
- [ ] Delete `maktaba.dump` from your PC

## Later

- **Code changes**: push to `main` → Coolify redeploys (enable Auto Deploy).
- **Database changes**: Coolify **Backup Now** → tunnel → `psql ... -v ON_ERROR_STOP=1 -f migrations/<new>.sql`.
- **Rollback**: Coolify → Deployments → redeploy the previous one. Data: restore the last backup.
