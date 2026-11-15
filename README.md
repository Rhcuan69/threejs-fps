# SCRAPLINE — a three.js tactical FPS

A round-based, Counter-Strike-style tactical first-person shooter that runs
offline in a desktop browser. Single-player against bots, built with
three.js 0.187.0. Original map, art, sounds and names — not a copy of any
commercial game.

## The game

- **Map "Yard 7"**: a decommissioned freight terminal (44×36 m) with three
  lanes, containers, crates, a crane gantry and silos for cover.
- **Two teams, 4v5**: Cobalt (you + 3 bots) vs Ember (5 bots). Bots hold,
  patrol, push, investigate noise and engage with reaction times and burst
  fire; bot-vs-bot combat can resolve rounds without you.
- **Objective: plant/defuse.** Hold E for 3 s to plant the charge at Crane
  Bay (A) or Silo Row (B); 40 s fuse; defenders channel a 5 s defuse.
  Eliminating the other team also wins the round. First to 5, max 9 rounds.
- **Economy + buy menu (B):** start $800; win $3,250, loss $1,900
  (+$500/loss streak, max 2); kill $300; plant $300. Five weapons: P9
  Sparrow pistol (free), VX-9 Wasp SMG ($1,250), AR-77 Kestrel rifle
  ($2,700), LW-50 Heron sniper ($4,750, right-click scope), frag grenades
  ($300, max 2, G to throw). Spread and recoil punish firing on the move;
  Shift slow-walks (steadier), Ctrl/C crouches, Space jumps.
- **HUD:** health, ammo, weapon, grenades, round timer, score, money, alive
  pips, kill feed, plant/defuse bar, dynamic crosshair, hitmarkers, damage
  vignette, scope overlay, spectate-on-death.

## Play it

```sh
node serve.ts   # serves game/ at http://localhost:8080
```

Open the page in desktop Chrome (WebGL 2), click to lock the pointer,
WASD to move, mouse to look, click to shoot, R to reload, B for the buy
menu, E to plant/defuse, G to throw a grenade. No build step, no network
requests — the game is static files under `game/`, and all sounds are
procedural WebAudio.

## Layout

- `main.ts` — the entry program (Node 22): copies `game/` and
  `screenshots/` to `/output` and writes `/output/dossier.json`.
- `game/` — the playable game: `index.html` + ES modules under `src/`,
  three.js 0.187.0 vendored byte-for-byte under `vendor/three/`.
- `screenshots/` — four real renders of the game (buy phase, combat,
  plant, round end).
- `vendor/makefun-threejs.ts` — the make.fun dossier library, copied from
  the bounty kit unchanged.
- `serve.ts` — tiny static server for local play; `shots.json` records how
  each screenshot was taken (`?shot=…&seed=1`).

## Entry

Built for the make.fun bounty "Make the best three.js tactical FPS"
(`threejs-fps-02`, $1,000). MIT licensed — see `LICENSE`.
