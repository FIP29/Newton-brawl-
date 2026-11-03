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
| 2 | Java match engine + WebSocket, two players moving/hitting online (placeholder shapes) | ✅ done |
| 3 | Prediction/interpolation, health, energy, rounds, timer, local 2-player | next |
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

### Trying an online match locally

1. Start the backend (`dev` profile) and the frontend as described above.
2. Open http://localhost:5173 in two browser windows that don't share storage, for example a normal window and a private/incognito one. Register a different player in each.
3. Player 1: **Play Online → Create room**. Player 2: **Play Online → Join with code**.
4. Controls: `A`/`D` move, `W` jump, `S` crouch, `J` light, `K` heavy (`L` special comes in Phase 4). Gamepads work too. `H` toggles the hitbox overlay and `/` toggles the controls help.

## API

| Method | Path | Auth | Body / result |
|--------|------|------|---------------|
| POST | `/api/rooms` | Bearer | create a private room → `201 {code, status, playerCount}` |
| GET | `/api/rooms/{code}` | Bearer | room status (404 if unknown or finished) |
| WS | `/ws/match?room=CODE&token=JWT` | JWT in query | live match, see protocol below |

### Auth & profile

| Method | Path | Auth | Body / result |
|--------|------|------|---------------|
| POST | `/api/auth/register` | – | `{username, email, password, displayName?}` → `201 {token, expiresAt, player}` |
| POST | `/api/auth/login` | – | `{login, password}` (`login` = username or email) → `{token, expiresAt, player}` |
| GET | `/api/players/me` | Bearer | own profile |
| PATCH | `/api/players/me` | Bearer | `{displayName}` |
| GET | `/api/players/{id}` | Bearer | public profile |
| GET | `/actuator/health` | – | liveness |

All errors use the same shape: `{timestamp, status, error, message, path, fieldErrors?}`.

## Match engine & netcode

The engine (`com.newtonbrawl.engine`) has no Spring dependencies and is deterministic: the same inputs always produce the same states. There is a test for this.

- **Fixed 60 Hz tick** on a dedicated thread per match (`MatchRunner`). An exception ends the match cleanly instead of silently stopping the loop.
- **Physics:** gravity, semi-implicit Euler integration, floor and walls, body separation. 100 world units ≈ 1 m, y is up.
- **Combat:** frame data (startup / active / recovery) loaded from `fighters/<id>.json`, AABB hitboxes against hurtboxes, simultaneous hits trade, hit-stop, hitstun, KO.
- **Knockback is momentum:** a move delivers an impulse *J*, and the defender's velocity becomes *J / m*. Heavier fighters fly less.
- **Input buffer:** attack presses made up to 6 ticks before a fighter can act (including during hit-stop) still come out.
- **Inputs, not state, go up the wire.** The client sends `{"t":"in","s":seq,"b":buttons}` 60 times a second. The server consumes one input per tick from a bounded queue (`InputQueue`) and acknowledges the last applied `seq` in every snapshot. Phase 3's prediction and reconciliation build on that acknowledgement.
- **Snapshots go down every tick:** `state` messages carry the fighters, hit events and acks. The client renders about 3 ticks in the past and interpolates between snapshots (`SnapshotBuffer`).
- **Disconnects:** a player who drops mid-match has 8 s (`newton-brawl.match.reconnect-grace`) to reconnect before forfeiting. Reconnecting, or opening the match in another tab, takes over the seat. Wins and losses are recorded when a match ends.

Server → client message types: `welcome`, `lobby`, `start`, `state`, `end`, `pong`, `error` (see `ServerMessages.java` / `protocol.ts`).

### Adding a fighter

1. `backend/src/main/resources/fighters/<id>.json`: stats, body size and moves with frame data, hitboxes and impulses.
2. A `Fighter` subclass in `engine/fighter/` for behaviour that can't be expressed as data.
3. One line in `FighterCatalog.FACTORIES`.

## Backend layout

```
com.newtonbrawl
├── auth/        controller → service, DTOs (register/login)
├── player/      Player entity, repository, service, controller, RankTier (Elo → tier)
├── security/    JwtService, JwtAuthenticationFilter, AuthenticatedPlayer principal
├── config/      SecurityConfig, typed @ConfigurationProperties
├── common/      ApiError, GlobalExceptionHandler, domain exceptions
├── match/       rooms (REST), RoomService (match lifecycle), WebSocket handler + handshake auth, protocol
└── engine/      Spring-free simulation
    ├── input/     InputBits, InputFrame, InputQueue
    ├── fighter/   FighterDefinition (JSON), Fighter base class, FighterCatalog
    ├── sim/       MatchSimulation, FighterState, Aabb, Arena, snapshots/events
    └── runtime/   MatchRunner (60 Hz thread), MatchListener
```

Rank tiers are derived from Elo and never stored: Atom < 1100 ≤ Molecule < 1300 ≤ Star < 1500 ≤ Supernova < 1700 ≤ Black Hole.

## Frontend layout

```
src/
├── api/        fetch client (JWT, typed ApiError), DTO types, auth endpoints
├── auth/       AuthProvider (restores the session via /players/me), RequireAuth route guard
├── screens/    LoginScreen, MainMenuScreen, PlayOnlineScreen, FightScreen (+ HUD)
├── game/
│   ├── protocol.ts          wire types mirroring the backend
│   ├── input/               keyboard + gamepad → button bitmask
│   ├── net/                 MatchConnection (60 Hz input pump, ping), SnapshotBuffer (interpolation)
│   └── render/              FightRenderer: camera follow/zoom, shake, sparks, shockwaves, hitbox overlay
├── fx/         PixiJS ChalkboardBackground (parallax stars, glowing equations, chalk dust), palette
├── audio/      Web Audio placeholder SFX (replaced by Howler assets later)
└── styles/     Neon Chalkboard theme
```
