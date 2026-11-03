# NEWTON BRAWL

A 2D online PvP fighting game where every fighter is a famous scientist and every move obeys a real law of physics.
The art direction is called Neon Chalkboard. Netcode is server-authoritative, and the ranked ladder goes from **Atom → Black Hole**.

```
/backend   Java 21 · Spring Boot 3 · Spring Security (JWT) · JPA · Flyway · MySQL
/frontend  TypeScript · Vite · React · PixiJS v8 · pixi-filters · GSAP · Howler.js
```

## Roadmap

| Phase | Scope | Status |
|------:|-------|--------|
| 1 | Spring Boot + MySQL + JWT auth; frontend skeleton with login | ✅ done |
| 2 | Java match engine + WebSocket, two players moving/hitting online (placeholder shapes) | next |
| 3 | Prediction/interpolation, health, energy, rounds, timer, local 2-player | |
| 4 | Newton, Tesla, Curie, Einstein + The Lab with full VFX | |
| 5 | Matchmaking, ranked Elo, leaderboard, Codex, Lab Notes, unlocks | |
| 6 | Galileo, Archimedes, Faraday, Hooke + Space Station | |
| 7 | Schrödinger, Heisenberg, Hawking, Doppler + Black Hole Edge | |
| 8 | Bernoulli, Edison, S.N. Bose, J.C. Bose + Curzon Hall + rivalries | |
| 9 | Polish: shaders, cinematic ultimates, sound, balancing | |

## Running locally

### Backend

No setup needed (in-memory H2 in MySQL mode; data resets on restart):

```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

With MySQL (default profile):

```bash
docker compose up -d          # from the repo root
cd backend && mvn spring-boot:run
```

| Env var | Default | Notes |
|---------|---------|-------|
| `DB_URL` | `jdbc:mysql://localhost:3306/newton_brawl…` | |
| `DB_USER` / `DB_PASSWORD` | `newton` / `newton` | |
| `JWT_SECRET` | dev-only value | **Set in production.** Base64, ≥ 32 bytes: `openssl rand -base64 48` |
| `JWT_EXPIRATION_MINUTES` | `1440` | |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated |

Tests: `cd backend && mvn test`. They run against H2 using the same Flyway migrations.

### Frontend

```bash
cd frontend
npm install
npm run dev                    # http://localhost:5173 — proxies /api and /ws to :8080
```

## API (Phase 1)

| Method | Path | Auth | Body / result |
|--------|------|------|---------------|
| POST | `/api/auth/register` | – | `{username, email, password, displayName?}` → `201 {token, expiresAt, player}` |
| POST | `/api/auth/login` | – | `{login, password}` (`login` = username or email) → `{token, expiresAt, player}` |
| GET | `/api/players/me` | Bearer | own profile |
| PATCH | `/api/players/me` | Bearer | `{displayName}` |
| GET | `/api/players/{id}` | Bearer | public profile |
| GET | `/actuator/health` | – | liveness |

All errors use the same shape: `{timestamp, status, error, message, path, fieldErrors?}`.

## Backend layout

```
com.newtonbrawl
├── auth/        controller → service, DTOs (register/login)
├── player/      Player entity, repository, service, controller, RankTier (Elo → tier)
├── security/    JwtService, JwtAuthenticationFilter, AuthenticatedPlayer principal
├── config/      SecurityConfig, typed @ConfigurationProperties
├── common/      ApiError, GlobalExceptionHandler, domain exceptions
└── engine/      match simulation (Phase 2), kept free of Spring imports
```

Rank tiers are derived from Elo and never stored: Atom < 1100 ≤ Molecule < 1300 ≤ Star < 1500 ≤ Supernova < 1700 ≤ Black Hole.

## Frontend layout

```
src/
├── api/        fetch client (JWT, typed ApiError), DTO types, auth endpoints
├── auth/       AuthProvider (restores the session via /players/me), RequireAuth route guard
├── screens/    LoginScreen, MainMenuScreen
├── fx/         PixiJS ChalkboardBackground (parallax stars, glowing equations, chalk dust), palette
├── audio/      Web Audio placeholder SFX (replaced by Howler assets later)
└── styles/     Neon Chalkboard theme
```
