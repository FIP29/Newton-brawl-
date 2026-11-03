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
| 3 | Prediction/interpolation, health, energy, rounds, timer, local 2-player | ✅ done |
| 4 | Newton, Tesla, Curie, Einstein + The Lab with full VFX | ✅ done |
| 5 | Matchmaking, ranked Elo, leaderboard, Codex, Lab Notes, unlocks | ✅ done |
| 6 | Galileo, Archimedes, Faraday, Hooke + Space Station | ✅ done |
| 7 | Schrödinger, Heisenberg, Hawking, Doppler + Black Hole Edge | next |
| 8 | Bernoulli, Edison, S.N. Bose, J.C. Bose + Curzon Hall + rivalries | |
| 9 | Polish: shaders, cinematic ultimates, sound, balancing | |

![The four starter scientists in idle, walk, heavy, special, ultimate and hit poses](docs/screenshots/characters.jpg)

| Character select | The Lab |
|---|---|
| ![Character select](docs/screenshots/character-select.jpg) | ![The Lab arena](docs/screenshots/the-lab.jpg) |
| **Specials: Apple Drop and Chain Lightning arcing through a beaker** | **ULTIMATE cinematic: Tesla Coil** |
| ![Specials](docs/screenshots/specials.jpg) | ![Ultimate cinematic](docs/screenshots/ultimate-cinematic.jpg) |

| Victory + Lab Note | Science Codex |
|---|---|
| ![Victory screen with Elo change and Lab Note](docs/screenshots/victory-lab-note.jpg) | ![Science Codex](docs/screenshots/codex.jpg) |
| **Ranked ladder** | **Profile** |
| ![Leaderboard](docs/screenshots/leaderboard.jpg) | ![Profile](docs/screenshots/profile.jpg) |

| Unlockable roster (Phase 6) | Space Station |
|---|---|
| ![Galileo, Archimedes, Faraday and Hooke in six poses](docs/screenshots/characters-phase6.jpg) | ![Galileo's pendulum in the Space Station](docs/screenshots/space-station.jpg) ![Faraday's cage and induction coil](docs/screenshots/faraday-cage.jpg) |

## Progression

- **Matchmaking:** *Casual* pairs the two longest-waiting players. *Ranked* only pairs players inside an Elo window: ±100 to start, widening by 25 per second waited, up to ±600. Clients poll their ticket once a second and then join a **reserved room** that only those two players can enter. A ticket is dropped if its owner stops polling, and a reserved room is cancelled if the opponent doesn't arrive within 60 s. **Private rooms** (share a code) still work.
- **Elo** (ranked only): E = 1 / (1 + 10^((Rb − Ra)/400)), then R′ = R + K·(S − E). K is 40 for your first 10 ranked games and 24 after that. Ratings never drop below 100. Tiers: **Atom** < 1100 ≤ **Molecule** < 1300 ≤ **Star** < 1500 ≤ **Supernova** < 1700 ≤ **Black Hole**. Peak Elo is tracked.
- **Match history:** every match is stored (mode, fighters, rounds, Elo before and after, reason). Wins and losses count in every mode.
- **Science Codex** (`backend/src/main/resources/codex/codex.json`): 16 scientist pages, each with a bio and a fun fact, plus the law, an explanation and a Lab Note for every starter special and ultimate. A page unlocks when you play as or against that scientist. A move entry unlocks when you **land it or get hit by it**. The server withholds the text of locked entries.
- **Lab Note:** after each match, every player gets a short note on the science behind the move they used most (or the one that hit them most). Local matches show one too.
- **Unlocks** (`codex/unlocks.json`): the 12 upcoming fighters unlock by matches played, wins or Codex entries. They're flagged "arrives in a later update" until their phase ships. Each starter also has a historical skin earned by winning 3 matches with them:
  - Newton: *Royal Society President*
  - Tesla: *Colorado Springs 1899*
  - Curie: *Radium Institute Lab Coat*
  - Einstein: *Bern Patent Clerk, 1905*, with dark hair, as he had then

  The server checks every pick against your unlocks.
- **Rewards screen:** an animated Elo counter with tier progress (and a "TIER UP!" banner), new Codex entries and unlocks, and the Lab Note.

## The starter roster

Every special is based on the real law printed next to it. When it lands, that equation writes itself on screen in glowing chalk.

| Scientist | Class | Special 1 (`L`) | Special 2 (`S`+`L`) | ULTIMATE (`I` or `K`+`L`) |
|---|---|---|---|---|
| **Isaac Newton** (gold) | Bruiser, heavy (mass 100) | **Apple Drop**: an apple appears above the opponent and falls at real g = 9.8 m/s² (F = mg) | **Gravity Flip**: inverts the target's gravity for 3 s so they drift up (F = G·m₁m₂/r²) | **Third Law**: 5 s of reflection; every hit and projectile goes back to its source (F₁₂ = −F₂₁) |
| **Nikola Tesla** (blue) | Zoner | **Chain Lightning**: arcs through metal beakers toward the opponent, +25% per jump (Coulomb) | **Magnetic Pull**: drags the opponent and the beakers toward him (F = q(v × B)) | **Tesla Coil**: an arena-wide electric field; the lab's coils strike every ⅓ s (f = 1/2π√(LC)) |
| **Marie Curie** (green) | Zoner | **Radioactive Orb**: damage halves every half-life, so it hits hardest up close (N = N₀·½^(t/t½)) | **Glow Trap**: a radium trap that stuns whoever steps on it (²²⁶Ra → ²²²Rn + α) | **Chain Reaction**: fission blasts spreading outward in both directions (n + ²³⁵U → …) |
| **Albert Einstein** (violet) | Trickster | **Light Dash**: a 320-unit blink with invulnerability that can pass through the opponent | **Time Dilation Bubble**: everything inside except him runs at 0.4× (Δt′ = Δt/√(1−v²/c²)) | **E = mc²**: his energy becomes a beam across the whole arena |

### Unlockable roster

| Scientist | Class | Special 1 (`L`) | Special 2 (`S`+`L`) | ULTIMATE | Unlock |
|---|---|---|---|---|---|
| **Galileo Galilei** (amber) | Speedster | **Pendulum Swing**: a bob that swings under θ'' = −(g/L)θ, so it strikes on the pendulum's own rhythm, T = 2π√(L/g) | **Tower Drop**: a cannonball and a musket ball fall side by side and land on the same tick | **Starry Messenger**: Io, Europa, Ganymede and Callisto orbit him under a central force, with ω chosen so that T² ∝ r³ (Kepler's third law) | 3 matches |
| **Archimedes** (bronze) | Bruiser, heaviest | **Lever Launch**: a small push multiplied ×4 by a lever (F₁d₁ = F₂d₂) | **Buoyancy Bubble**: the target floats up, unable to act (F_b = ρVg) | **Burning Mirrors**: sunbeams focus where the opponent stood, so moving dodges it (1/f = 1/dₒ + 1/dᵢ) | 8 matches |
| **Michael Faraday** (copper) | Zoner | **Faraday Cage**: every electric attack fizzles on it (a hard counter to Tesla) | **Induction Coil**: hurts opponents only while they move through it (ε = −dΦ/dt) | **Dynamo**: a spinning magnetic storm that pulls in and shocks (ε = NBAω) | 6 Codex entries |
| **Robert Hooke** (steel) | Trickster | **Spring Trap**: snaps harder the farther he walks from it (F = −kx) | **Elastic Whip**: long reach that yanks the target in (E = ½kx²) | **Breaking Point**: a huge blast that also destroys the opponent's projectiles and traps and flings every prop (σ > σ_yield) | 5 wins |

No authentic portrait of Hooke survives, so his design follows contemporaries' descriptions: thin, stooped, with long unpowdered hair. All four have Codex pages, move entries and Lab Notes.

### Arenas

| Arena | Physics |
|---|---|
| **The Lab** | gravity 2600; metal beakers on the floor (punch them into the opponent, magnetise them, chain lightning through them) |
| **Space Station** | gravity 1100 (jumps hang in the air); four pieces of zero-g debris drift and bounce off every surface, and a punch turns them into projectiles |

Online matches pick an arena at random. In Local Versus you choose it (`Q` cycles The Lab / Space Station / Random). Arenas are data (`Arena.java` / `constants.ts`): gravity, prop gravity, restitution and props.

**Shared:** the energy meter fills from dealing and taking damage, and a full meter unlocks the ULTIMATE. Specials have cooldowns. The metal beakers in The Lab can be hit or kicked into the opponent, magnetised by Tesla, and used as lightning conductors.

**Look:** the scientists are stylised caricatures of their best-known portraits:
- Newton: curled periwig, crimson frock coat, cravat and stockings.
- Tesla: centre-parted slick hair, moustache and a dark three-piece suit.
- Curie: hair in a bun, a high-collared Victorian dress and a glowing vial.
- Einstein: wild white hair, moustache and a baggy cardigan.

They're procedural vector art on a two-bone-IK rig (`frontend/src/game/render/characters`), with idle, walk, crouch, jump, attack, cast, hit and KO poses. Open `/dev/characters` in dev mode to see the gallery.

**Swapping in real art:** add a spritesheet at `public/fighters/<id>/sheet.json` with animations named after the actions (`IDLE`, `WALK`, `light`, `special1`…) and register it in `ART_MANIFESTS` (`FighterVisual.ts`). The renderer only talks to the `FighterVisual` interface, so no gameplay or netcode changes are needed.

**VFX** (`frontend/src/game/render`):
- Lighting and post-processing: bloom, shockwave distortion on heavy hits, chromatic aberration plus darkening and speed lines during ULTIMATE cinematics, god rays through the lab window, dynamic additive lights cast by projectiles, beams, traps and coils.
- Motion: afterimage trails, particle sparks and rings.
- Camera and feel: hit-stop, screen shake, camera zoom that grows with combos, slow-motion on the deciding KO (simulated on the server, so both players see it).
- Arena: multi-layer parallax with chalk dust, a flickering lamp, twinkling stars and sparking Tesla coils.
- Performance: quality drops automatically (bloom, shockwaves and god rays turn off) if the frame rate can't keep up.

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
npm test                       # Java↔TS simulation parity + prediction tests
```

### Trying an online match locally

1. Start the backend (`dev` profile) and the frontend as described above.
2. Open http://localhost:5173 in two browser windows that don't share storage, for example a normal window and a private/incognito one. Register a different player in each.
3. Player 1: **Play Online → Create room**. Player 2: **Play Online → Join with code**.
4. Both players pick a scientist in the room. The match starts once both are locked in.
5. Controls: `A`/`D` move, `W` jump, `S` crouch, `J` light, `K` heavy, `L` special 1, `S`+`L` special 2, `I` (or `K`+`L`) ULTIMATE. Gamepads work too (RB = ULTIMATE). `H` toggles the hitbox overlay, `P` toggles client-side prediction (to feel the difference) and `/` toggles the controls help.

**Local Versus** (main menu) needs no second account or server round trip. Both players pick on the same screen (P1 `A`/`D` + `J`; P2 `←`/`→` + `1`). P1 uses WASD + `J`/`K`/`L`/`I`. P2 uses the arrow keys + numpad `1`/`2`/`3`/`4`, or `,` `.` `/` `'` on keyboards without a numpad. Gamepad 1 is P1 and gamepad 2 is P2. `Esc` pauses.

## API

| Method | Path | Auth | Body / result |
|--------|------|------|---------------|
| POST | `/api/rooms` | Bearer | create a private room → `201 {code, status, playerCount}` |
| GET | `/api/rooms/{code}` | Bearer | room status (404 if unknown or finished) |
| WS | `/ws/match?room=CODE&token=JWT` | JWT in query | live match, see protocol below |

### Progression

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/matchmaking/{casual\|ranked}` | join a queue → `{ticket, state, roomCode?, waitedSeconds, eloWindow, playersSearching}` |
| GET | `/api/matchmaking/tickets/{id}` | poll (~1 s); `roomCode` appears once matched |
| DELETE | `/api/matchmaking/tickets/{id}` | leave the queue |
| GET | `/api/leaderboard?page=&size=` | ranked ladder + your own row |
| GET | `/api/codex` | all pages; text only for unlocked entries |
| GET | `/api/codex/lab-note?fighter=&move=` | a Lab Note (used after local matches) |
| GET | `/api/unlocks` · `/api/unlocks/usable` | unlock progress · fighters and skins you can pick |
| GET | `/api/players/me/matches?limit=` · `/api/players/me/fighters` | match history · per-fighter stats |

The match socket's `end` message now carries a personal `reward`: `{mode, eloBefore, eloAfter, tierBefore, tierAfter, newCodex, newUnlocks, labNote}`.

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
- **Match format** (`MatchRules`): best of 3 rounds with a 99 s clock that pauses during hit-stop. At time-out the higher health percentage wins the round. Draw rounds are capped at 5 rounds in total.
- **Energy:** fills by dealing damage (×1.0) and taking it (×0.6), up to 1000, and carries over between rounds. A full meter powers the ULTIMATE. Starting one freezes the world for exactly 60 ticks while the cinematic plays.
- **Specials:** each fighter's Java class (mirrored in `roster.ts`) spawns **projectiles** (with acceleration, half-life decay, chaining through metal, reflection), **zones** (time-dilation bubble, magnetic pull, trap, blast, beam, electric field) or sets **status effects** (flipped gravity, reflection, invulnerability). All numbers live in the fighter's JSON.
- **Arena objects:** The Lab's metal beakers bounce, can be knocked into the opponent (60 damage), are pulled by magnetism, and conduct lightning.
- **Knockback is momentum:** a move delivers an impulse *J*, and the defender's velocity becomes *J / m*. Heavier fighters fly less.
- **Input buffer:** attack presses made up to 6 ticks before a fighter can act (including during hit-stop) still come out.
- **Inputs, not state, go up the wire.** The client sends `{"t":"in","s":seq,"b":buttons}` 60 times a second. The server consumes one input per tick from a bounded queue (`InputQueue`) and acknowledges the last applied `seq` in every snapshot. Phase 3's prediction and reconciliation build on that acknowledgement.
- **Snapshots go down every tick:** `state` messages carry the fighters (including their hidden timers), round and timer, hit events and acks. The opponent is rendered about 3 ticks in the past, interpolated between snapshots (`SnapshotBuffer`).
- **Client-side prediction** (`Predictor`): your own fighter is simulated locally the moment you press a button. On each snapshot the client rewinds to the server's state at the acknowledged input, replays the inputs the server hasn't processed yet, and blends any correction away over about 100 ms. Damage is never predicted; it only comes from the server. In tests, prediction error stays under 0.5 units with 100 ms of latency each way.
- **One simulation, two languages:** `frontend/src/game/sim` is a line-for-line TypeScript port of the Java engine. It powers Local Versus and prediction. `ParityFixtureTest` (Java) records a 2,400-tick bot match with KOs, a time-out and several rounds. `parity.test.ts` replays it and must reproduce every snapshot exactly. If the engine changes, the Java test regenerates the fixture and fails once, as a reminder to port the change.
- **Disconnects:** a player who drops mid-match has 8 s (`newton-brawl.match.reconnect-grace`) to reconnect before forfeiting. Reconnecting, or opening the match in another tab, takes over the seat. Wins and losses are recorded when a match ends.

Server → client message types: `welcome`, `lobby`, `start`, `state`, `end`, `pong`, `error` (see `ServerMessages.java` / `protocol.ts`).

### Adding a fighter

1. `backend/src/main/resources/fighters/<id>.json`: stats, body size and moves with frame data, hitboxes, impulses, equations and special `params`. The frontend imports this same file (`game/data/fighters.ts`).
2. A `Fighter` subclass in `engine/fighter/roster/` whose `onTrigger` implements the specials, and the same logic in `frontend/src/game/sim/roster.ts`.
3. One line in `FighterCatalog.FACTORIES` (plus `PLAYABLE` if selectable).
4. A `Look` in `frontend/src/game/render/characters/looks.ts` (costume, hair, facial hair, colours) and, if needed, a cast pose in `rig.ts`.
5. Add the fighter to a matchup in `ParityFixtureTest` and run `mvn test` and `npm test`.

## Backend layout

```
com.newtonbrawl
├── auth/        controller → service, DTOs (register/login)
├── player/      Player entity, repository, service, controller, RankTier (Elo → tier)
├── security/    JwtService, JwtAuthenticationFilter, AuthenticatedPlayer principal
├── config/      SecurityConfig, typed @ConfigurationProperties
├── common/      ApiError, GlobalExceptionHandler, domain exceptions
├── match/       rooms (REST), RoomService (match lifecycle), MatchStats, MatchResultService (rewards), WebSocket + protocol
├── matchmaking/ casual + ranked queues (widening Elo window)
├── ranked/      Elo maths
├── history/     match records
├── codex/       Science Codex catalogue, progress, Lab Notes
├── unlock/      fighter/skin unlock catalogue + evaluation
├── leaderboard/ ranked ladder
└── engine/      Spring-free simulation
    ├── input/     InputBits, InputFrame, InputQueue
    ├── fighter/   FighterDefinition (JSON), Fighter base class, FighterCatalog, roster/ (8 scientists)
    ├── sim/       MatchSimulation, MatchRules, FighterState, Projectile, Zone, ArenaObject, Arena, snapshots/events
    └── runtime/   MatchRunner (60 Hz thread), MatchListener
```

Rank tiers are derived from Elo and never stored: Atom < 1100 ≤ Molecule < 1300 ≤ Star < 1500 ≤ Supernova < 1700 ≤ Black Hole.

## Frontend layout

```
src/
├── api/        fetch client (JWT, typed ApiError), DTO types, auth endpoints
├── auth/       AuthProvider (restores the session via /players/me), RequireAuth route guard
├── screens/    Login, MainMenu, PlayOnline (queues), Fight, LocalVersus, Codex, Leaderboard, Profile
├── components/ FightHud, CharacterSelect, FightOverlays, VictoryPanel (rewards + Lab Note), TierBadge, portraits
├── game/
│   ├── protocol.ts          wire types mirroring the backend
│   ├── sim/                 TypeScript port of the engine (+ Java parity fixture/test)
│   ├── data/                fighter definitions (imported from the backend's JSON)
│   ├── input/               keymaps (online / local P1 / local P2) + gamepads → button bitmask
│   ├── net/                 MatchConnection (60 Hz input pump, ping), SnapshotBuffer (interpolation), Predictor
│   └── render/              FightRenderer (camera, filters), characters/ (rig, looks, draw, FighterVisual),
│                            arena/ (TheLab, SpaceStation), fx/ (particles, lightning, EntityLayer for projectiles/zones/objects)
├── fx/         PixiJS ChalkboardBackground (parallax stars, glowing equations, chalk dust), palette
├── audio/      Web Audio placeholder SFX (replaced by Howler assets later)
└── styles/     Neon Chalkboard theme
```
