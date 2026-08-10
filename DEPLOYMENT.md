# DFV Trainer — Docker Deployment Guide

Deploy the DFV Trainer to a Linux server (tested on Ubuntu 22.04) with Docker Compose.

`Dockerfile`, `docker-compose.yml`, `.dockerignore` and `docker-entrypoint.sh` are
committed — you do not need to create them.

## Prerequisites

- Docker Engine 24+ with the Compose v2 plugin
- Git
- ~1 GB free disk space (image is ~440 MB, plus the database)

Install on Ubuntu:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER
newgrp docker
```

Verify:

```bash
docker --version
docker compose version
```

## Quick start

```bash
cd /opt
git clone https://github.com/raza-kontakt/sky-dive-test.git dfv-trainer
cd dfv-trainer
docker compose up -d --build
```

The app is then on `http://<server-ip>:3000`. First boot takes a few seconds
longer because the container seeds its database (see below).

Check it came up:

```bash
docker compose ps          # STATUS should reach "healthy"
docker compose logs -f app
```

## Configuration

Everything optional lives in a `.env` file next to `docker-compose.yml`
(gitignored):

| Variable | Default | Purpose |
|----------|---------|---------|
| `APP_PORT` | `3000` | Host port to publish |
| `APP_BIND` | `0.0.0.0` | Host interface to bind. Use `127.0.0.1` when running behind a reverse proxy or when the app should not be reachable from the LAN |

Example — loopback only, on port 3100:

```bash
cat > .env << 'EOF'
APP_BIND=127.0.0.1
APP_PORT=3100
EOF
docker compose up -d
```

The app itself reads no environment variables; there is nothing else to
configure.

## How the database is seeded

The container starts through `docker-entrypoint.sh`, which seeds
`/app/data/app.db` from the bundled question bank **only when that file does not
exist**. Migrations run as part of seeding. So a first `docker compose up -d`
gives you a populated database with no extra commands, and later restarts leave
your flags, notes and attempt history alone.

`data/` on the host is bind-mounted to `/app/data` in the container, so the
database lives at `data/app.db` in the project directory. Question images ship
inside the image and are not mounted.

### Re-seed an existing database

Refreshes questions, options and explanations from the bank while preserving
user data (flags, notes, attempts, and any explanation you edited in the app):

```bash
docker compose exec app node /app/seed.cjs
docker compose restart app
```

### Reset everything

```bash
docker compose down
rm -f data/app.db data/app.db-shm data/app.db-wal
docker compose up -d      # entrypoint re-seeds from scratch
```

### Backup / restore

```bash
docker compose stop app
cp data/app.db data/app.db.backup
docker compose start app
```

Restore by copying the backup back while the container is stopped. Stop first —
copying a live WAL-mode database can capture a torn state.

## Regenerating the question bank (development machine)

`npm run extract` and `npm run explain` are development tasks; they need the dev
dependencies and are not available inside the runtime image. The deployed app
never calls the Anthropic API and needs no API key — explanations are generated
once here and stored in the database. Run them on a machine with the repo
checked out and `npm install` done:

```bash
npm run extract   # data/source/DFV_Theory_Trainer.html -> data/bank.json
npm run explain   # needs ANTHROPIC_API_KEY -> data/explanations.json
```

`npm run explain` is a resumable bulk job over all ~500 questions:

- It skips any question that already has an explanation, in either
  `data/explanations.json` or `data/app.db` — re-running never regenerates and
  never re-bills work already done.
- Results are written after each batch via an atomic rename, so an interrupted
  run resumes from where it stopped.
- A question that fails is logged and left pending for the next run. A missing
  or invalid API key aborts the run immediately rather than failing all 500.

Commit the updated `data/bank.json`, then rebuild the image. `data/explanations.json`
is gitignored but is picked up by the build when present in the working tree.
To load explanations into an already-running deployment without a rebuild, copy
the file into `data/` on the server and point the seeder at it (the baked-in
default is `/app/seed-data/`, which the `data` volume does not cover):

```bash
docker compose exec -e EXPLANATIONS_PATH=/app/data/explanations.json app node /app/seed.cjs
```

## Operating

### Logs

```bash
docker compose logs -f app          # live
docker compose logs --tail 50 app   # last 50 lines
```

### Stop / start / restart

```bash
docker compose down
docker compose up -d
docker compose restart app
```

`restart: unless-stopped` means the container comes back automatically after a
reboot.

### Update to a new version

```bash
git pull origin main
docker compose up -d --build
```

The database and all user data survive the rebuild.

### Uninstall

```bash
docker compose down --rmi local
```

`data/app.db` is a bind mount and is **not** removed by `docker compose down -v`.
Delete the project directory to remove it.

## Networking

### LAN access (default)

Find the server IP with `hostname -I` and open `http://<server-ip>:3000` from any
device on the same network. If a firewall is active:

```bash
sudo ufw allow 3000/tcp
```

### Behind a reverse proxy

Set `APP_BIND=127.0.0.1` in `.env` so only the proxy can reach the app, then
point nginx/Caddy at `127.0.0.1:${APP_PORT}`. Next.js streams responses, so
disable proxy buffering (nginx: `proxy_buffering off;`).

Do not expose the app directly to the internet — it has no authentication.

### VPN

If the server runs Wireguard/OpenVPN, keep `APP_BIND=127.0.0.1` or bind to the
tunnel interface so the app is reachable only through the VPN.

## Troubleshooting

**Port already allocated** — another service holds the port. Set `APP_PORT` in
`.env` and `docker compose up -d`.

**Container is unhealthy** — check `docker compose logs app`. The healthcheck
fetches `/` every 30s with a 20s start period.

**"Database not ready" page** — the app found no questions. Look for a seeding
error in the logs, then re-seed with `docker compose exec app node /app/seed.cjs`.

**Permission denied on data/app.db** — the container runs as uid 1000 (`node`).
Fix ownership of the bind mount: `sudo chown -R 1000:1000 data`.

**Stale build** — `docker compose build --no-cache && docker compose up -d`.

**Check the app from inside the container**:

```bash
docker compose exec app node -e "fetch('http://127.0.0.1:3000/').then(r => console.log(r.status))"
```

## Image layout

Multi-stage build:

- **builder** (`node:22-bookworm-slim`) — full `npm ci`, `next build`, and an
  esbuild bundle of the seeder into `seed.cjs`. Debian rather than Alpine so
  `better-sqlite3` uses a prebuilt binary; `python3/make/g++` are present for the
  source-build fallback.
- **runner** — Next.js standalone output (`server.js` plus only the traced
  `node_modules`), static assets, `public/`, migrations, `seed.cjs` and the
  question bank. Runs as the non-root `node` user.

## System requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 512 MB | 1 GB |
| Disk | 1 GB | 2 GB |
| CPU | 1 core | 2+ cores |

Building the image needs noticeably more RAM than running it (~1.5 GB). On a
small machine, build elsewhere and push the image, or add swap.
