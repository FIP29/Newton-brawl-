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

## Option S: frontend on Vercel, backend on Render, database on Supabase

Templates of every variable: [`backend/.env.example`](backend/.env.example) (Render) and
[`frontend/.env.example`](frontend/.env.example) (Vercel). Paste the values into each site's
Environment Variables page; don't commit real secrets.

The backend speaks **MySQL or PostgreSQL**: it picks the right migrations
(`db/migration/mysql` or `db/migration/postgresql`) from `DB_URL`. Supabase is PostgreSQL.
Do the three parts in this order.

### 1. Database: Supabase
1. https://supabase.com → **New project**. Pick a region close to your players and use the
   **same region** for Render (e.g. Singapore). **Save the database password** you set.
2. Click **Connect** (top of the project page) and choose **Session pooler**. You'll see a string like
   `postgresql://postgres.abcdefghijkl:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`.
   Turn it into three values for Render:
   ```
   DB_URL=jdbc:postgresql://aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require
   DB_USER=postgres.abcdefghijkl
   DB_PASSWORD=<your database password>
   ```
   (Copy *your* host and user from the dashboard; the ones above are examples.)
   - Use the **Session pooler**, not "Direct connection" (IPv6 only, which Render can't reach)
     and not the "Transaction pooler" on port 6543.
3. Don't create any tables: the backend creates them on its first start. It also turns on Row
   Level Security for them, so Supabase's public API can't read player data; the game only uses
   its own backend, so nothing else is needed.

### 2. Backend: Render
1. https://render.com → **New → Web Service →** connect GitHub and pick this repository,
   branch `ccr-b9f0a571-np7x0r` (or `main` once merged).
2. **Language/Runtime: Docker** (Render finds the `Dockerfile`). Same region as Supabase.
   Instance type: Free works for trying it out (see the note below).
3. **Environment variables:** the three `DB_…` values above, plus
   ```
   JWT_SECRET=<output of: openssl rand -base64 48>
   CORS_ORIGINS=https://your-project.vercel.app
   ```
   (`CORS_ORIGINS` is your Vercel address from step 3; put a placeholder now and fix it after.)
4. **Advanced → Health Check Path:** `/actuator/health`. Create the service. The first build
   takes a few minutes; it's ready when the log shows `Started NewtonBrawlApplication`.
   You get an address like `https://newton-brawl.onrender.com`.
   Opening it shows the game too (the image includes it), which is a handy check.

Render's **free** plan stops the service after 15 minutes without visitors, and the next visit waits
while it starts again. Three things soften that:
- The image starts fast: the jar is unpacked and a class-data-sharing archive is recorded at build time
  (`JAVA_OPTS` keeps `-XX:TieredStopAtLevel=1` for the tiny free CPU).
- The game pings `/actuator/health` the moment the page opens and shows "Waking the server up…" on the
  login screen, so the server boots while the player types.
- [`.github/workflows/keep-warm.yml`](.github/workflows/keep-warm.yml) pings it every 10 minutes so it
  never falls asleep (one always-on free service fits in the 750 free hours a month). Set the repository
  variable `BACKEND_URL` if your Render address differs. A free uptime monitor (UptimeRobot,
  cron-job.org) hitting the same URL works too. A paid instance stays awake on its own.

### 3. Frontend: Vercel
1. https://vercel.com → **Add New → Project →** import this repository. Root Directory: `./` or
   `frontend` (both work). Leave the build command overrides off. Branch: **Settings → Git**.
2. **Environment Variables:** `VITE_API_BASE=https://newton-brawl.onrender.com` (your Render
   address, no trailing slash). Deploy.
3. Copy the Vercel address into Render's `CORS_ORIGINS` (Render redeploys), and play.

If logins fail with a network or CORS error, `CORS_ORIGINS` on Render doesn't exactly match the
address in your browser (https, no trailing slash). If the Render log shows a database connection
error, re-check the Session pooler host, the `postgres.<project>` user and the password.

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
