# Server Deployment

This guide deploys one self-hosted Potluck instance on a Linux server. Potluck
does not provide a hosted cloud service; the domain, server, TLS certificate,
provider accounts, and operating costs are yours.

For a new installation, Docker with a persistent data directory is the
recommended path.

---

## Before you start

You need:

- a Linux server with Docker;
- a domain name if the instance will be used over the internet;
- permission to create DNS records and firewall rules;
- at least one model-provider account that you are authorized to use.

Choose unique values for:

```bash
openssl rand -hex 32
```

Use the generated value as `JWT_SECRET`, and choose a separate strong dashboard
password.

---

## Docker deployment

### 1. Create a private data directory

```bash
sudo install -d -m 700 /var/lib/potluck
sudo chown "$(id -u):$(id -g)" /var/lib/potluck
```

### 2. Start the container

Bind Potluck to loopback when Nginx runs on the same server:

```bash
docker run -d \
  --name potluck \
  --restart unless-stopped \
  -p 127.0.0.1:21023:21023 \
  -e DATA_DIR=/app/data \
  -e JWT_SECRET="REPLACE_WITH_RANDOM_SECRET" \
  -e INITIAL_PASSWORD="REPLACE_WITH_STRONG_PASSWORD" \
  -v /var/lib/potluck:/app/data \
  ghcr.io/ezero23/potluck:latest
```

The container listens on `21023`. Potluck serves the dashboard and compatible
API routes through the same port.

Check it locally on the server:

```bash
curl http://127.0.0.1:21023/api/health
```

Expected response:

```json
{"ok":true}
```

View logs with:

```bash
docker logs --tail 100 -f potluck
```

If the release image is unavailable for a version, build from the repository:

```bash
git clone https://github.com/Ezero23/potluck.git
cd potluck
docker build -t potluck .
```

Then replace the image name in the run command with `potluck`.

---

## Docker Compose

The repository includes `docker-compose.yml`. It builds Potluck from the
checkout and also starts the optional Headroom service:

```bash
git clone https://github.com/Ezero23/potluck.git
cd potluck
cp .env.example .env
```

Edit `.env` before starting:

```dotenv
JWT_SECRET=REPLACE_WITH_RANDOM_SECRET
INITIAL_PASSWORD=REPLACE_WITH_STRONG_PASSWORD
PORT=21023
NODE_ENV=production
```

Then run:

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:21023/api/health
```

The included Compose file publishes Potluck on `21023` and the optional
Headroom service on `8787`. Restrict both with the host firewall when the
server is public; only the reverse proxy should be internet-facing.

Before enabling the public reverse proxy, connect through an SSH tunnel:

```bash
ssh -L 21023:127.0.0.1:21023 user@your-server
```

Open `http://localhost:21023/dashboard`, change the dashboard password, and use
**Dashboard → Endpoint** to create a Potluck endpoint key and enable API-key
enforcement.

---

## Nginx and HTTPS

Install Nginx and Certbot using your distribution's supported packages. Point
the domain's DNS record to the server before requesting a certificate.

Use one upstream for both the dashboard and API:

```nginx
server {
    listen 80;
    server_name potluck.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name potluck.example.com;

    ssl_certificate /etc/letsencrypt/live/potluck.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/potluck.example.com/privkey.pem;

    client_max_body_size 128m;

    location / {
        proxy_pass http://127.0.0.1:21023;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 86400;
    }
}
```

Replace `potluck.example.com`, test the Nginx configuration, and reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

The public URLs are then:

```text
Dashboard: https://potluck.example.com/dashboard
API base:  https://potluck.example.com/v1
Health:    https://potluck.example.com/api/health
```

There is no separate dashboard port.

---

## Security checklist

Before allowing external access:

- replace the default dashboard password;
- set a persistent, random `JWT_SECRET`;
- keep dashboard login enabled;
- enable Potluck endpoint API-key enforcement;
- use HTTPS;
- expose only ports `80` and `443` publicly;
- keep `21023` and the optional Headroom port private;
- protect `.env`, `DATA_DIR`, logs, and backups;
- do not reuse provider credentials as Potluck endpoint keys;
- review release notes before upgrading.

Potluck credentials grant access to third-party services. Treat the complete
data directory as sensitive.

---

## Back up and update

The active database is:

```text
/var/lib/potluck/db/data.sqlite
```

Stop the container before taking a filesystem-level backup:

```bash
sudo install -d -m 700 /var/backups
docker stop potluck
sudo tar -C /var/lib -czf "/var/backups/potluck-$(date +%Y%m%d-%H%M%S).tar.gz" potluck
docker start potluck
```

Verify that the backup exists and can be listed:

```bash
sudo tar -tzf /var/backups/potluck-YYYYMMDD-HHMMSS.tar.gz | head
```

To update an image-based installation:

1. Read the release notes.
2. Back up `/var/lib/potluck`.
3. Pull the intended image tag.
4. Recreate the container with the same environment and data mount.
5. Check `/api/health`, sign in, and test one provider before restoring normal
   traffic.

Avoid unattended upgrades for a service that stores credentials and routes
billable requests.

---

## Troubleshooting

### Nginx returns 502

```bash
docker ps --filter name=potluck
docker logs --tail 100 potluck
curl http://127.0.0.1:21023/api/health
sudo nginx -t
```

### Streaming is delayed

Confirm that the active Nginx location has `proxy_buffering off` and a
sufficient `proxy_read_timeout`.

### The container cannot write data

```bash
ls -ld /var/lib/potluck
docker logs --tail 100 potluck
```

Do not solve a permission problem by making the data directory world-readable.

### A client receives 401

Confirm that it sends an active Potluck endpoint key, not a provider API key:

```http
Authorization: Bearer YOUR_POTLUCK_KEY
```

---

## Next steps

- [Connect subscription providers](../providers/subscription.md)
- [Create combos](../features/combos.md)
- [Connect a compatible client](../integration/other-tools.md)
