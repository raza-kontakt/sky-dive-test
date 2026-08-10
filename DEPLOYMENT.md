# DFV Trainer — Docker Deployment Guide

Deploy the DFV Trainer app to Ubuntu Server 22 using Docker and Docker Compose.

## Prerequisites

- Ubuntu Server 22.04 LTS
- Docker (v24+)
- Docker Compose (v2+)
- Git
- ~500MB free disk space (app + database + images)

## Installation

### 1. Install Docker and Docker Compose

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

### 2. Clone Repository

```bash
cd /opt
git clone https://github.com/raza-kontakt/sky-dive-test.git dfv-trainer
cd dfv-trainer
```

### 3. Set Up Environment

Create `.env.local`:

```bash
cat > .env.local << 'EOF'
NODE_ENV=production
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_PATH=/app/data/app.db
EOF
```

If deploying on a different host/port, update `NEXT_PUBLIC_APP_URL`:
```
NEXT_PUBLIC_APP_URL=http://192.168.1.100:3000
```

### 4. Create Docker Files

**Dockerfile:**

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy app
COPY . .

# Build Next.js
RUN npm run build

# Create data directory with proper permissions
RUN mkdir -p /app/data && chmod 755 /app/data

# Expose port
EXPOSE 3000

# Start app
CMD ["npm", "start"]
```

Save as: `Dockerfile`

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  app:
    build: .
    container_name: dfv-trainer
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
      - ./public:/app/public
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_APP_URL=http://localhost:3000
    restart: unless-stopped
    networks:
      - dfv-net

networks:
  dfv-net:
    driver: bridge
```

Save as: `docker-compose.yml`

### 5. Populate Database

Before starting the app, seed the database:

```bash
# Extract questions from source HTML
docker compose run --rm app npm run extract

# Generate explanations (optional, requires ANTHROPIC_API_KEY)
# docker compose run --rm app npm run explain

# Seed database
docker compose run --rm app npm run seed
```

To use `npm run explain`, add to `.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...your-key...
```

### 6. Start App

```bash
docker compose up -d
```

Check logs:
```bash
docker compose logs -f app
```

App runs on `http://localhost:3000`

## Usage

### Access from Network

Find server IP:
```bash
hostname -I
```

Access from any device on same network: `http://<server-ip>:3000`

### Stop/Restart

Stop:
```bash
docker compose down
```

Restart:
```bash
docker compose up -d
```

Restart app only:
```bash
docker compose restart app
```

### View Logs

Live logs:
```bash
docker compose logs -f app
```

Last 50 lines:
```bash
docker compose logs --tail 50 app
```

## Database Management

### Backup

```bash
cp data/app.db data/app.db.backup
```

### Restore

```bash
cp data/app.db.backup data/app.db
docker compose restart app
```

### Re-seed (Preserve User Data)

Re-seeding overwrites questions but keeps flags, notes, and attempt history:

```bash
docker compose run --rm app npm run seed
docker compose restart app
```

### Reset Everything

```bash
rm data/app.db
docker compose run --rm app npm run seed
docker compose restart app
```

## Troubleshooting

### Container won't start

Check logs:
```bash
docker compose logs app
```

Common issues:
- Port 3000 already in use: change port in `docker-compose.yml`
- Database locked: wait 30s and restart
- Node modules corrupted: `docker compose build --no-cache`

### Database not seeding

Ensure source HTML exists:
```bash
ls ~/Downloads/DFV_Theory_Trainer.html
```

If missing, get it from original source or restore from backup.

### App crashes on startup

Increase memory limit in `docker-compose.yml`:
```yaml
services:
  app:
    mem_limit: 1g
```

### LAN access not working

Verify firewall allows port 3000:
```bash
sudo ufw allow 3000/tcp
```

Check server is listening:
```bash
docker compose exec app netstat -tlnp | grep 3000
```

## Performance Tuning

### For Raspberry Pi / Low Memory

In `docker-compose.yml`:
```yaml
services:
  app:
    mem_limit: 512m
    memswap_limit: 512m
```

### Enable Auto-Restart on Reboot

Already configured (`restart: unless-stopped` in docker-compose.yml). To verify:

```bash
docker compose ps
```

Look for `Restart Policy: unless-stopped`

## Updating App

Pull latest code:
```bash
git pull origin main
docker compose build
docker compose up -d
```

Database and user data are preserved.

## Uninstall

Remove app and data:
```bash
docker compose down -v
rm -rf /opt/dfv-trainer
```

## Networking Options

### Option 1: LAN Only (Default)

Access only from devices on same Wi-Fi/Ethernet.

No additional setup needed. Use server IP + port 3000.

### Option 2: Internet-Facing (Advanced)

Requires reverse proxy (nginx/Caddy) and HTTPS. Not recommended without proper security.

If needed, consult nginx reverse proxy documentation + Let's Encrypt SSL setup.

### Option 3: VPN Access

If server runs OpenVPN/Wireguard, app is accessible only through VPN tunnel. Most secure for home deployment.

## System Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 512 MB | 1 GB |
| Disk | 500 MB | 2 GB |
| CPU | 1 core | 2+ cores |

Tested on: Raspberry Pi 4 (4GB), Ubuntu Server 22.04 on VM.

## Support

For issues:
1. Check logs: `docker compose logs -f app`
2. Verify database exists: `ls -lh data/app.db`
3. Test connectivity: `curl http://localhost:3000`
4. Restart: `docker compose restart app`

If issue persists, include full log output in troubleshooting.
