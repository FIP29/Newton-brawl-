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
| 7 | Schrödinger, Heisenberg, Hawking, Doppler + Black Hole Edge | ✅ done |
| 8 | Bernoulli, Edison, S.N. Bose, J.C. Bose + Curzon Hall + rivalries | ✅ done |
| 9 | Polish: shaders, cinematic ultimates, sound, balancing | ✅ done |

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

| Quantum and cosmic roster (Phase 7) | Black Hole Edge |
|---|---|
| ![Schrödinger, Heisenberg, Hawking and Doppler in six poses](docs/screenshots/characters-phase7.jpg) | ![Black Hole Edge: rocks orbiting the black hole](docs/screenshots/black-hole-edge.jpg) ![Particle in a Box: standing waves at the antinodes](docs/screenshots/particle-in-a-box.jpg) |

| Phase 8 roster | Curzon Hall, Dhaka |
|---|---|
| ![Bernoulli, Edison, S.N. Bose and J.C. Bose in six poses](docs/screenshots/characters-phase8.jpg) | ![Curzon Hall at night](docs/screenshots/curzon-hall.jpg) ![Rivalry intro: Tesla vs Edison](docs/screenshots/rivalry-intro.jpg) |

| Gravitational lensing shader | ULTIMATE cinematic |
|---|---|
| ![Black holes bending the scene into Einstein rings](docs/screenshots/gravitational-lensing.jpg) | ![Letterbox, rays and the equation writing itself](docs/screenshots/ultimate-cinematic-v2.jpg) |

## Progression

- **Matchmaking:** *Casual* pairs the two longest-waiting players. *Ranked* only pairs players inside an Elo window: ±100 to start, widening by 25 per second waited, up to ±600. Clients poll their ticket once a second and then join a **reserved room** that only those two players can enter. A ticket is dropped if its owner stops polling, and a reserved room is cancelled if the opponent doesn't arrive within 60 s. **Private rooms** (share a code) still work.
- **Elo** (ranked only): E = 1 / (1 + 10^((Rb − Ra)/400)), then R′ = R + K·(S − E). K is 40 for your first 10 ranked games and 24 after that. Ratings never drop below 100. Tiers: **Atom** < 1100 ≤ **Molecule** < 1300 ≤ **Star** < 1500 ≤ **Supernova** < 1700 ≤ **Black Hole**. Peak Elo is tracked.
- **Match history:** every match is stored (mode, fighters, rounds, Elo before and after, reason). Wins and losses count in every mode.
- **Science Codex** (`backend/src/main/resources/codex/codex.json`): 16 scientist pages, each with a bio and a fun fact, plus the law, an explanation and a Lab Note for every special and ultimate of all 16 scientists (48 move entries). A page unlocks when you play as or against that scientist. A move entry unlocks when you **land it or get hit by it**. The server withholds the text of locked entries.
- **Lab Note:** after each match, every player gets a short note on the science behind the move they used most (or the one that hit them most). Local matches show one too.
- **Unlocks** (`codex/unlocks.json`): the 12 non-starter fighters unlock by matches played, wins or Codex entries. Each starter also has a historical skin earned by winning 3 matches with them:
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

| **Erwin Schrödinger** (teal) | Trickster | **Superposition**: a second copy of him appears. The first hit "measures" which one was real: 50% he was the ghost (he appears there and the hit passes through), 50% the ghost vanishes and the hit lands | **Schrödinger's Cat**: a sealed box opens after a moment. Alive (½): the cat pounces. Dead (½): the poison flask broke and a vapour cloud spreads | **Particle in a Box**: the arena becomes an infinite square well. Standing waves ψ₃ then ψ₂ flare at their antinodes; only the nodes are safe, so you must move from L/3 to L/2 in time (ψₙ ∝ sin(nπx/L)) | 10 Codex entries |
| **Werner Heisenberg** (magenta) | Speedster | **Uncertain Position**: a blink of 170, 270 or 370 units, chosen at random; arriving on the opponent hits | **Measurement**: a photon pins down the opponent's position, so their momentum kick has a random direction and strength (Δx·Δp ≥ ħ/2) | **Uncertainty Principle**: the opponent's left and right swap for 5 s, and a field may strike them every ⅓ s (50% each time) | 15 matches |
| **Stephen Hawking** (indigo) | Zoner, hover chair | **Hawking Radiation**: a mini black hole that shrinks as it flies and hits harder as it does, since T ∝ 1/M | **Event Horizon**: a black hole that pulls the opponent in, bends their projectiles and swallows any that cross the horizon; its core hurts (r_s = 2GM/c²) | **Supermassive Black Hole**: a huge, strong one that evaporates in a final burst (F = GMm/r²) | 12 wins |
| **Christian Doppler** (red) | Speedster | **Doppler Shift**: a sound wave whose damage is the observed frequency, f' = f·(c + v_o)/(c − v_s). It hits harder if he fires it during a jump-in or the opponent walks into it, softer if they back away | **Sonic Boom**: breaks the sound barrier with a dash; the shock cone hits after he has passed (sin θ = c/v) | **Blueshift Barrage**: six wavefronts squeezed together, λ' = λ(1 − v/c), that hit one after another | 25 matches |

| **Daniel Bernoulli** (sky cyan) | Speedster | **Lift Jump**: fast air above means low pressure above (P + ½ρv² = const), so he rises far higher than a jump; the updraft launches anyone beside him | **Pressure Jet**: a narrow, fast jet (A₁v₁ = A₂v₂): little damage, a huge shove | **Hurricane**: a vortex whose low-pressure eye drags the opponent in and lifts them | 14 Codex entries |
| **Thomas Edison** (filament yellow) | Bruiser | **DC Punch**: a steady direct current that keeps hurting, but only up close (DC lost power over distance). A Faraday cage stops it | **Lightbulb Flash**: dazzles; a dazzled opponent can't use specials or turn to face him | **Patent**: copies the opponent's last special, then patents it so they can't use it for 5 s | 20 wins |
| **Satyendra Nath Bose** (ice blue) | Trickster | **Condensate Freeze**: the first hit chills (the target acts on half the ticks); a second hit while chilled freezes them solid | **Boson Copy**: bosons share states, so he casts the opponent's last special himself | **Bose–Einstein Condensate**: the arena freezes into one super-atom. The opponent's projectiles vanish, props stop dead and the opponent is frozen | 16 Codex entries |
| **Jagadish Chandra Bose** (emerald) | Zoner | **Microwave Pulse**: millimetre waves that leave through one wall and come back through the other. A Faraday cage stops them, just as a microwave oven's door does | **Crescograph Vines**: a plant grows where he points and grabs the opponent only when they move near it (plants respond to stimuli) | **Living Signal**: all his plants, plus new shoots around the opponent, strike at the same instant | 35 matches |

**Counters:** Faraday's cage blocks every electric attack (Tesla, Edison's DC Punch, J.C. Bose's microwaves). Hawking's black holes swallow projectiles. Heisenberg dodges zoners: every projectile has a 30% chance to pass straight through him, because you can't pin down where he is.

### Rivalries

Four famous pairings get their own pre-fight exchange over the round-1 countdown, a winner's line and the real history on the result screen (`codex/rivalries.json`):

| Pairing | Title | The history |
|---|---|---|
| Tesla vs Edison | The War of the Currents | AC against DC in the 1880s and 1890s; AC won because transformers let it travel long distances |
| Newton vs Hooke | The Inverse-Square Feud | Hooke said he had suggested the inverse-square law; Newton cut mentions of Hooke from the Principia |
| Schrödinger vs Heisenberg | Waves versus Matrices | rival formulations of quantum mechanics that turned out to be equivalent |
| S.N. Bose and Einstein | Legendary duo | Bose's 1924 letter from Dhaka, which Einstein translated and extended into the Bose–Einstein condensate |

No authentic portrait of Hooke survives, so his design follows contemporaries' descriptions: thin, stooped, with long unpowdered hair. Hawking is shown as he was best known, using a powered chair and a speech computer; here the chair hovers and his screen is mounted at its side. When he's KO'd the chair settles to the ground. S.N. Bose wears a kurta and a woollen shawl, as he often did. All twelve unlockable scientists have Codex pages, move entries and Lab Notes.

**Quantum randomness is deterministic.** Superposition, the cat, Heisenberg's blink, his projectile dodging and the uncertainty field all draw from the match's own xorshift32 generator. The Java and TypeScript copies are identical, so local play, replays and the parity test all reproduce the same "random" outcomes.

### Arenas

| Arena | Physics |
|---|---|
| **The Lab** | gravity 2600; metal beakers on the floor (punch them into the opponent, magnetise them, chain lightning through them) |
| **Space Station** | gravity 1100 (jumps hang in the air); four pieces of zero-g debris drift and bounce off every surface, and a punch turns them into projectiles |
| **Curzon Hall** | gravity 2400, on the lawn of the University of Dhaka's red-brick hall at night, where S.N. Bose taught. Pointed arcades, rooftop chhatris, flame trees in bloom, fireflies and Bose's formulas glowing on the walls. Two terracotta pots to kick around (clay doesn't conduct, so lightning won't chain through them) |
| **Black Hole Edge** | gravity 2200, on a platform beneath a black hole. Rocks orbit it under a softened inverse-square law, a = GM/(r² + s²), and a punch knocks them out of orbit. Rocks that fall inside the horizon are swallowed and reappear. Straight-flying projectiles curve toward it (gravitational lensing, which also curves Tesla's bolts and Doppler's waves), and fighters drift slowly toward the middle |

Online matches pick an arena at random. In Local Versus you choose it (`Q` cycles Random / The Lab / Space Station / Black Hole Edge / Curzon Hall). Arenas are data (`Arena.java` / `constants.ts`): gravity, prop gravity, restitution and props.

**Shared:** the energy meter fills from dealing and taking damage, and a full meter unlocks the ULTIMATE. Specials have cooldowns. The metal beakers in The Lab can be hit or kicked into the opponent, magnetised by Tesla, and used as lightning conductors.

**Look:** the scientists are stylised caricatures of their best-known portraits:
- Newton: curled periwig, crimson frock coat, cravat and stockings.
- Tesla: centre-parted slick hair, moustache and a dark three-piece suit.
- Curie: hair in a bun, a high-collared Victorian dress and a glowing vial.
- Einstein: wild white hair, moustache and a baggy cardigan.

They're procedural vector art on a two-bone-IK rig (`frontend/src/game/render/characters`), with idle, walk, crouch, jump, attack, cast, hit and KO poses. Open `/dev/characters` in dev mode to see the gallery (`?new`, `?p7` and `?p8` for the Phase 6, 7 and 8 fighters). In dev mode, `/local?unlockAll` makes every fighter selectable in Local Versus without earning the unlocks.

**Swapping in real art:** add a spritesheet at `public/fighters/<id>/sheet.json` with animations named after the actions (`IDLE`, `WALK`, `light`, `special1`…) and register it in `ART_MANIFESTS` (`FighterVisual.ts`). The renderer only talks to the `FighterVisual` interface, so no gameplay or netcode changes are needed.

**VFX** (`frontend/src/game/render`):
- Lighting and post-processing: bloom, shockwave distortion on heavy hits, chromatic aberration plus darkening and speed lines during ULTIMATE cinematics, god rays through the lab window, dynamic additive lights cast by projectiles, beams, traps and coils.
- Motion: afterimage trails, particle sparks and rings.
- Camera and feel: hit-stop, screen shake, camera zoom that grows with combos, slow-motion on the deciding KO (simulated on the server, so both players see it).
- Arena: multi-layer parallax with chalk dust, a flickering lamp, twinkling stars and sparking Tesla coils.
- Shaders (`render/fx/shaders.ts`, GLSL):
  - **Gravitational lensing.** Each black hole on screen (the Black Hole Edge's well and Hawking's singularities) is a thin point-mass lens. A pixel at angle θ from the lens shows the light from β = θ − θ_E²/θ, so the scene bends into arcs and an Einstein ring. Up to four lenses.
  - **Chalkboard grade.** Animated grain and drifting chalk-dust blotches, a vignette, and chromatic fringing toward the edges that grows during an ULTIMATE.
- ULTIMATE cinematics play within the server's 1-second freeze: letterbox bars, rotating rays in the fighter's colour, a giant "ULTIMATE" slam, the portrait sliding in, the equation writing itself in chalk, a jolt when it finishes, then a white release flash.
- Performance: quality drops automatically (bloom, shockwaves, god rays, lensing and the grade turn off) if the frame rate can't keep up.

**Audio** (`frontend/src/audio`, all synthesised with the Web Audio API, no files needed):
- **Music:** a step sequencer scheduled ahead on the audio clock, so timing stays tight. There's a calm menu theme and one fight theme per arena:
  - The Lab: driving four-on-the-floor in A minor.
  - Space Station: airy D dorian with echoing arpeggios.
  - Black Hole Edge: heavy half-time C♯ phrygian with a sub drone.
  - Curzon Hall: a tanpura-like drone, tabla-like strokes and a sitar-like melody in a Bhairav-like scale, over an electronic beat.

  Extra layers come in for the final round or when someone is close to a KO. The music is muffled during ULTIMATE cinematics and the slow-motion KO.
- **SFX:** hits, every UI action, a sound signature per scientist, and stings for ROUND / FIGHT! / K.O. / victory / defeat, the last-five-seconds tick, copies, freezes and black holes.
- **Settings:** separate music and effects volumes plus mute, saved per browser (♪ button on menus, the pause menu, or `M` anywhere).
- **Real audio files:** register a file in `AUDIO_ASSETS` (`audio/assets.ts`) under a sound name, a fighter id or `music:<track>`, and it plays through Howler.js instead of the synthesised version.

**Balance** (`backend/src/test/java/com/newtonbrawl/engine/balance`):
- `BalanceLeague` plays a bot league with every pair, on both sides, in every arena. The bots play each class's game plan.
- The tuning pass brought every fighter's win rate from a 10–79% spread into **43–59%**; the full numbers are in [docs/balance-report.md](docs/balance-report.md). The league also confirms the designed counters: Faraday beats Tesla, and Hawking's black holes beat the projectile zoners.
- `BalanceLeagueTest` guards against regressions: no fighter may leave 30–70%. `mvn test -Dtest=BalanceLeagueTest -Dbalance.full=true` runs the bigger league and rewrites the report.
- Bots aren't people: the numbers flag outliers, they don't settle a matchup.

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
