# Deploying NEWTON BRAWL

The game ships as **one Docker image**: Spring Boot serves the API, the WebSocket match server
*and* the built game, all from one address. It needs a **MySQL 8** database next to it.

Two things to know before you pick a host:
- **WebSockets** must be supported (online fights use them). The options below all support them.
- Run **one instance**. Rooms, matchmaking queues and live matches are kept in memory, so don't
  scale it to several copies. Give it about **512 MB–1 GB of RAM**.

The image needs these environment variables:

| Variable | What it is |
|---|---|
| `DB_URL` | `jdbc:mysql://HOST:PORT/DATABASE?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC` |
| `DB_USER`, `DB_PASSWORD` | database login |
| `JWT_SECRET` | signs login tokens; generate with `openssl rand -base64 48` and keep it secret |
| `CORS_ORIGINS` | the public address players open, e.g. `https://newton-brawl.up.railway.app` (no trailing slash) |
| `PORT` | optional; set automatically by most platforms (default 8080) |

The database tables are created automatically on first start (Flyway migrations).

---

## Option V: frontend on Vercel + backend on Railway

Vercel only runs static sites and short-lived serverless functions, so it can't run the backend
(live matches stay in memory, the simulation runs 60 times a second and fights use long-lived
WebSockets). Split it: **the game (frontend) on Vercel**, **the backend + MySQL on Railway**.

1. **Backend first:** follow Option A below. Note its domain, e.g. `https://newton-brawl.up.railway.app`.
2. **Vercel:** https://vercel.com → **Add New → Project →** import this GitHub repository.
   - **Root Directory:** either the repository root (`./`) or `frontend` works; each has its own
     `vercel.json`. With `frontend`, keep **"Include files outside the root directory in the Build
     Step"** enabled (the default), because the game imports fighter data from `backend/`.
   - Leave the build/install/output command overrides **off**; `vercel.json` sets them.
   - **Branch:** pick the production branch in **Settings → Git** (e.g. `main`, or `ccr-b9f0a571-np7x0r`).
   - **Environment Variables:** `VITE_API_BASE=https://newton-brawl.up.railway.app` (your Railway
     domain, no trailing slash). WebSockets follow it automatically (`wss://…`).
   - **Deploy.** You get an address like `https://newton-brawl.vercel.app`.
3. **Back on Railway**, set the backend's `CORS_ORIGINS` to the Vercel address,
   e.g. `CORS_ORIGINS=https://newton-brawl.vercel.app`. Several addresses can be listed,
   comma-separated (add your custom domain too). Without this, logins and online fights are refused.
4. Open the Vercel address and play.

Notes:
- `VITE_API_BASE` is baked in when the frontend is built: after changing it, redeploy on Vercel.
- Vercel's preview deployments get their own random addresses; they can only talk to the backend
  if you add those addresses to `CORS_ORIGINS` too. The production address is enough for playing.

## Option A: Railway (easiest)

Railway builds the Dockerfile straight from GitHub and offers a MySQL database in the same project.

1. Sign in at https://railway.app with GitHub.
2. **New Project → Deploy from GitHub repo →** pick this repository. In the service's
   **Settings → Source**, choose the branch to deploy (e.g. `main`, or `ccr-b9f0a571-np7x0r`).
   Railway finds the `Dockerfile` by itself.
3. In the same project: **New → Database → MySQL**.
4. Open the game service → **Variables** and add (the `${{…}}` parts are copied from the MySQL service automatically):
   ```
   DB_URL=jdbc:mysql://${{MySQL.MYSQLHOST}}:${{MySQL.MYSQLPORT}}/${{MySQL.MYSQLDATABASE}}?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
   DB_USER=${{MySQL.MYSQLUSER}}
   DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
   JWT_SECRET=<output of: openssl rand -base64 48>
   ```
5. **Settings → Networking → Generate Domain**. Copy the address and add one more variable:
   `CORS_ORIGINS=https://<that-domain>`. Railway redeploys.
6. Optional: **Settings → Healthcheck path** `/actuator/health`.
7. Open the domain, register, play. Every push to the chosen branch redeploys.

## Option B: your own server (VPS)

Any Linux server with Docker works (Hetzner, DigitalOcean, Oracle Cloud's free tier, …).

```bash
# on the server
git clone https://github.com/fip29/newton-brawl-.git && cd newton-brawl-
git checkout ccr-b9f0a571-np7x0r          # or main, once merged
cp .env.example .env && nano .env          # fill in PUBLIC_URL, passwords, JWT_SECRET
docker compose -f docker-compose.prod.yml up -d --build
```

The game is now on port 8080. For HTTPS with your own domain, point the domain's DNS at the
server and put [Caddy](https://caddyserver.com) in front (it gets certificates automatically and
passes WebSockets through):

```
# /etc/caddy/Caddyfile
brawl.example.com {
    reverse_proxy localhost:8080
}
```

Update later with `git pull && docker compose -f docker-compose.prod.yml up -d --build`.
The database lives in the `mysql-data` Docker volume; back it up with
`docker compose -f docker-compose.prod.yml exec mysql mysqldump -u root -p newton_brawl > backup.sql`.

## Trying the image locally

```bash
docker build -t newton-brawl .
docker run -p 8080:8080 -e SPRING_PROFILES_ACTIVE=dev -e CORS_ORIGINS=http://localhost:8080 newton-brawl   # in-memory database, data is lost on stop
```

Then open http://localhost:8080.
