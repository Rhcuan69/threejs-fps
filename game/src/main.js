// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. ?shot=start|play|plant|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal, createGrenades, WEAPONS, GRENADE } from './weapons.js';
import { createBots } from './bots.js';
import { createFx } from './fx.js';
import { createAudio } from './audio.js';
import { createMatch } from './rounds.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const PLAYER_HP = 100;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = shot ? mulberry32(seed) : Math.random;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2e333b);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const audio = createAudio({ silent: !!shot });
const world = createWorld(scene);
const fx = createFx(scene);
const hud = createHud();
const input = createInput(renderer.domElement, onLockChange);
const player = createPlayer(world.colliders, world.spawns.cobalt[0]);
const arsenal = createArsenal(camera, audio);

const raycaster = new THREE.Raycaster();
const losRay = new THREE.Raycaster();
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();

let hp = PLAYER_HP;
let alive = true;
let spectateBot = null;
let uiState = 'menu';
let started = false;
let frozen = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let lastBeep = 0;
let noise = [];
let prevFiring = false;
const chargePosVec = new THREE.Vector3();

function los(from, to) {
  direction.copy(to).sub(from);
  const dist = direction.length();
  if (dist < 0.01) return true;
  losRay.set(from, direction.normalize());
  losRay.far = dist;
  const hits = losRay.intersectObjects(world.shootables, false);
  return hits.length === 0 || hits[0].distance >= dist - 0.4;
}

const bots = createBots(scene, world, {
  los,
  fx,
  audio,
  onDamagePlayer(damage, name) {
    if (!alive) return;
    hp -= damage;
    hud.damageFlash();
    hud.setHealth(hp);
    audio.hurt();
    if (hp <= 0) {
      alive = false;
      match.addDeath();
      hud.killFeed(name, 'You', false, 'ember');
      hud.setSpectating(true);
      const teammates = bots.list.filter((b) => b.team === 'cobalt' && b.alive);
      spectateBot = teammates[0] ?? null;
      if (document.pointerLockElement) document.exitPointerLock();
    }
  },
  onBotKilled(bot, killerName) {
    const killerTeam = killerName === 'You' ? 'cobalt' : bots.list.find((b) => b.name === killerName)?.team ?? 'ember';
    hud.killFeed(killerName, bot.name, false, killerTeam);
  },
});

const grenades = createGrenades(scene, world.colliders, fx, audio, (point) => {
  noise.push({ x: point.x, z: point.z, until: elapsed + 3 });
  // Damage every combatant in the blast, falling off with distance.
  const victims = [];
  if (alive) victims.push({ pos: player.state.position, isPlayer: true });
  for (const bot of bots.list) if (bot.alive) victims.push({ pos: bot.pos, isPlayer: false, bot });
  for (const victim of victims) {
    const dist = Math.hypot(victim.pos.x - point.x, victim.pos.z - point.z);
    if (dist > GRENADE.radius) continue;
    const damage = Math.round(GRENADE.maxDamage * (1 - dist / GRENADE.radius));
    if (victim.isPlayer) {
      hp -= damage;
      hud.damageFlash();
      hud.setHealth(hp);
      audio.hurt();
      if (hp <= 0 && alive) {
        alive = false;
        match.addDeath();
        hud.killFeed('Frag grenade', 'You', false, 'cobalt');
        hud.setSpectating(true);
      }
    } else {
      const wasAlive = victim.bot.alive;
      bots.damageBot(victim.bot, damage, 'You');
      if (wasAlive && !victim.bot.alive) {
        match.addKill();
        hud.killFeed('You', victim.bot.name, false, 'cobalt');
      }
    }
  }
});

const match = createMatch({
  onPhase(phase) {
    if (phase === 'buy') {
      bots.reset();
      respawn();
      hud.setPlant(0);
      hud.setSpectating(false);
      hud.banner(`ROUND ${match.state.round}`, 'Buy phase — press B to buy, then the round starts');
      hud.hideBuyMenu();
      if (!shot) hud.setTimer(match.state.phaseT, 'buy');
    } else if (phase === 'live') {
      hud.hideBuyMenu();
      if (uiState === 'buy') {
        // The buy window closed with the menu open: take the mouse back.
        uiState = 'playing';
        input.requestLock();
      }
      hud.banner(`ROUND ${match.state.round}`, 'Plant the charge at Crane Bay or Silo Row');
    }
  },
  onPlant(site) {
    const siteDef = world.sites.find((s) => s.id === site);
    world.charge.position.set(siteDef.x, 0.14, siteDef.z);
    world.charge.visible = true;
    world.charge.children[1].intensity = 6;
    hud.banner('CHARGE PLANTED', `Site ${site} — ${siteDef.name}. Defend it for ${40} seconds`);
    audio.plantBeep(true);
  },
  onRoundEnd(winner, reason) {
    const state = match.state;
    if (winner === 'cobalt') audio.roundWin();
    else audio.roundLose();
    if (reason === 'Charge detonated') {
      const siteDef = world.sites.find((s) => s.id === state.plantedSite);
      if (siteDef) fx.explosion(new THREE.Vector3(siteDef.x, 0.2, siteDef.z));
    }
    world.charge.visible = false;
    hud.setPlant(0);
    hud.setSpectating(false);
    if (!shot) {
      uiState = 'roundEnd';
      if (document.pointerLockElement) document.exitPointerLock();
      hud.showOverlay('roundEnd', { winner, reason, score: state.score });
    }
  },
  onMatchEnd(winner) {
    const state = match.state;
    if (!shot) {
      uiState = 'matchEnd';
      if (document.pointerLockElement) document.exitPointerLock();
      hud.showOverlay('matchEnd', { winner, score: state.score });
    }
  },
});

function respawn() {
  const spawn = world.spawns.cobalt[0];
  player.teleport(spawn.x, spawn.z, spawn.yaw);
  hp = PLAYER_HP;
  alive = true;
  spectateBot = null;
  arsenal.refillAmmo();
  hud.setHealth(hp);
  hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name.toUpperCase(), arsenal.state.grenades);
}

function syncCamera() {
  if (!alive && spectateBot) {
    camera.position.set(spectateBot.pos.x, spectateBot.pos.y + 1.55, spectateBot.pos.z);
    camera.rotation.set(0, spectateBot.yaw, 0, 'YXZ');
    return;
  }
  const body = player.state;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function syncHud() {
  const state = match.state;
  hud.setHealth(hp);
  hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name.toUpperCase(), arsenal.state.grenades);
  hud.setMoney(state.money);
  hud.setTimer(state.phaseT, state.phase);
  hud.setScore(state.score.cobalt, state.score.ember, state.round);
  hud.setAlive(bots.aliveCount('cobalt') + (alive ? 1 : 0), bots.aliveCount('ember'));
  const spread = arsenal.spread(player.groundSpeed(), player.state.crouching, player.state.walking);
  hud.setCrosshair(6 + spread * 900);
  hud.setScoped(arsenal.state.scoped);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    uiState = 'playing';
    started = true;
    audio.unlock();
    hud.hideOverlay();
    hud.hideBuyMenu();
  } else if (uiState === 'playing') {
    uiState = 'paused';
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (uiState === 'matchEnd') {
    match.startMatch();
    respawn();
  }
  hud.hideOverlay();
  uiState = 'playing';
  input.requestLock();
});

input.onPress('KeyB', () => {
  if (shot || match.state.phase !== 'buy' || uiState === 'menu') return;
  if (uiState === 'buy') {
    hud.hideBuyMenu();
    uiState = 'playing';
    input.requestLock();
  } else if (uiState === 'playing') {
    uiState = 'buy';
    if (document.pointerLockElement) document.exitPointerLock();
    hud.showBuyMenu(match.state.money, arsenal.state.primary, arsenal.state.grenades);
  }
});

input.onPress('KeyG', () => {
  if (shot || !alive || uiState !== 'playing') return;
  if (arsenal.state.grenades <= 0) return;
  if (match.state.phase !== 'live' && match.state.phase !== 'planted') return;
  arsenal.state.grenades -= 1;
  camera.getWorldDirection(direction);
  muzzle.copy(camera.position).addScaledVector(direction, 0.6);
  muzzle.y -= 0.1;
  grenades.throwGrenade(muzzle, direction);
  audio.click();
});

input.onPress('Digit1', () => {
  if (uiState === 'playing') arsenal.equip('pistol');
});
input.onPress('Digit2', () => {
  if (uiState === 'playing') arsenal.equip(arsenal.state.primary);
});
input.onPress('KeyR', () => {
  if (uiState === 'playing') arsenal.reload();
});

hud.onBuy((item) => {
  if (match.state.phase !== 'buy') return;
  if (item === 'grenade') {
    if (arsenal.state.grenades >= GRENADE.maxCarry) return audio.denied();
    if (!match.spend(GRENADE.price)) return audio.denied();
    arsenal.buyGrenade();
  } else {
    const def = WEAPONS[item];
    if (arsenal.state.primary === item) return audio.denied();
    if (!match.spend(def.price)) return audio.denied();
    arsenal.buyPrimary(item);
  }
  audio.buy();
  hud.setMoney(match.state.money);
  hud.showBuyMenu(match.state.money, arsenal.state.primary, arsenal.state.grenades);
  hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name.toUpperCase(), arsenal.state.grenades);
});

function shoot() {
  const def = arsenal.def();
  if (!arsenal.takeRound()) return false;
  camera.getWorldDirection(direction);
  const spread = shot ? 0 : arsenal.spread(player.groundSpeed(), player.state.crouching, player.state.walking);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  muzzle.copy(camera.position);
  muzzle.x += -Math.sin(player.state.yaw) * 0.3;
  muzzle.z += -Math.cos(player.state.yaw) * 0.3;
  muzzle.y -= 0.15;
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  raycaster.far = def.range;
  const targets = world.shootables.concat(bots.hitMeshes());
  const hit = raycaster.intersectObjects(targets, false)[0];
  const end = hit ? hit.point : camera.position.clone().addScaledVector(direction, def.range);
  fx.tracer(muzzle, end);
  if (hit) {
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const headshot = hit.object.userData.part === 'head';
      const falloff = Math.max(0.6, 1 - hit.distance * 0.006);
      const damage = Math.round(def.damage * (headshot ? def.headMult : 1) * falloff);
      const wasAlive = bot.alive;
      bots.damageBot(bot, damage, 'You');
      hud.hitMarker(wasAlive && !bot.alive, headshot);
      audio.hit(headshot);
      if (wasAlive && !bot.alive) {
        match.addKill();
        hud.killFeed('You', bot.name, headshot, 'cobalt');
      }
    } else {
      fx.impact(hit.point, hit.face ? hit.face.normal : null);
    }
  }
  noise.push({ x: player.state.position.x, z: player.state.position.z, until: elapsed + 2 });
  arsenal.pullTrigger();
  player.recoil(arsenal.recoil() * (0.9 + random() * 0.2), (random() * 2 - 1) * 0.004);
  hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, def.name.toUpperCase(), arsenal.state.grenades);
  return true;
}

function step(dt) {
  elapsed += dt;
  const state = match.state;
  noise = noise.filter((n) => elapsed < n.until);

  // Planting: hold E inside a site while the round is live.
  let planting = false;
  let plantSite = null;
  if (alive && state.phase === 'live' && input.state.keys.has('KeyE')) {
    for (const site of world.sites) {
      const dist = Math.hypot(player.state.position.x - site.x, player.state.position.z - site.z);
      if (dist < site.radius) {
        planting = true;
        plantSite = site.id;
        break;
      }
    }
  }
  if (planting && Math.random() < dt * 2) audio.plantBeep(false);

  match.step(dt, {
    cobaltAlive: bots.aliveCount('cobalt') + (alive ? 1 : 0),
    emberAlive: bots.aliveCount('ember'),
    planting,
    plantSite,
    defusing: bots.defuseActive(),
  });

  // The charge beeps faster as the fuse runs down.
  if (state.phase === 'planted' && elapsed - lastBeep > Math.max(0.4, state.phaseT / 40)) {
    lastBeep = elapsed;
    audio.plantBeep(false);
  }

  if (state.phase === 'planted' || state.phase === 'live') {
    hud.setPlant(
      state.phase === 'planted' ? match.state.defuseProgress : match.state.plantProgress,
      state.phase === 'planted' ? 'DEFUSE IN PROGRESS — SITE ' + (state.plantedSite ?? '') : 'PLANTING CHARGE',
    );
  } else {
    hud.setPlant(0);
  }

  if (alive) {
    player.step(dt, input.state.keys);
    // Semi-auto weapons fire once per click; full-auto weapons fire while held.
    const firingEdge = input.state.firing && !prevFiring;
    prevFiring = input.state.firing;
    if (input.state.firing && arsenal.ready() && (arsenal.def().auto || firingEdge)) shoot();
    if (input.state.keys.has('KeyR')) arsenal.reload();
    arsenal.setScoped(input.state.scoping);
    if (arsenal.state.scoped) {
      camera.fov += (30 - camera.fov) * Math.min(1, dt * 14);
      camera.updateProjectionMatrix();
    } else if (camera.fov !== 74) {
      camera.fov += (74 - camera.fov) * Math.min(1, dt * 14);
      camera.updateProjectionMatrix();
    }
  }
  arsenal.step(dt);
  grenades.step(dt);
  if (state.plantedSite) {
    const siteDef = world.sites.find((s) => s.id === state.plantedSite);
    chargePosVec.set(siteDef.x, 0, siteDef.z);
  } else {
    chargePosVec.set(0, 0, 0);
  }
  bots.step(dt, {
    time: elapsed,
    phase: state.phase,
    plantedSite: state.plantedSite,
    chargePos: chargePosVec,
    playerPos: player.state.position,
    playerAlive: alive,
    playerSpeed: player.groundSpeed(),
    playerCrouching: player.state.crouching,
    noise,
  });
  fx.step(dt);
  world.step(dt, elapsed);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (alive) player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    syncHud();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function placeBot(name, x, z, yaw) {
  const bot = bots.list.find((b) => b.name === name);
  if (!bot) return null;
  bot.pos.set(x, 0, z);
  bot.yaw = yaw;
  bot.group.position.set(x, 0, z);
  bot.group.rotation.y = yaw;
  bot.path = [];
  bot.target = null;
  return bot;
}

function runShot(name) {
  hud.hideOverlay();
  match.startMatch();
  const body = player.state;
  if (name === 'start') {
    hud.clearBanner();
    body.position.set(0, 0, 16.5);
    body.yaw = 0.12;
    body.pitch = 0;
    settle(10);
    hud.showBuyMenu(match.state.money, arsenal.state.primary, arsenal.state.grenades);
    aimAt(new THREE.Vector3(0, 1.4, -6));
  } else if (name === 'play') {
    match.state.phase = 'live';
    match.state.phaseT = 82;
    hud.banner('ROUND 1', 'Plant the charge at Crane Bay or Silo Row');
    body.position.set(-8.5, 0, 0);
    settle(6);
    const rook = placeBot('Rook', -9, -6, Math.PI);
    placeBot('Nyx', -14, -4, Math.PI + 0.4);
    placeBot('Vex', -6, 3, -0.2);
    settle(4);
    aimAt(new THREE.Vector3(rook.pos.x, 1.3, rook.pos.z));
    shoot();
    settle(4);
    aimAt(new THREE.Vector3(rook.pos.x, 1.3, rook.pos.z));
    shoot();
    settle(3);
  } else if (name === 'plant') {
    match.state.phase = 'planted';
    match.state.phaseT = 32;
    match.state.plantedSite = 'A';
    match.state.defuseProgress = 0.45;
    hud.banner('CHARGE PLANTED', 'Site A — Crane Bay. Defend it for 40 seconds');
    const siteA = world.sites.find((s) => s.id === 'A');
    world.charge.position.set(siteA.x, 0.14, siteA.z);
    world.charge.visible = true;
    world.charge.children[1].intensity = 6;
    body.position.set(-11, 0, -7);
    settle(6);
    const ash = placeBot('Ash', -12.5, -10, Math.PI + 0.5);
    placeBot('Mara', -19, -8, 0.4);
    settle(2);
    aimAt(new THREE.Vector3(ash.pos.x, 1.3, ash.pos.z));
    shoot();
    settle(3);
    aimAt(new THREE.Vector3(-16, 0.4, -12));
  } else if (name === 'end') {
    match.state.phase = 'end';
    match.state.phaseT = 4;
    match.state.roundWinner = 'cobalt';
    match.state.roundReason = 'Charge detonated';
    match.state.score.cobalt = 1;
    match.state.score.ember = 0;
    hud.clearBanner();
    body.position.set(2, 0, 9);
    settle(6);
    placeBot('Rook', -4, -2, Math.PI);
    settle(8);
    aimAt(new THREE.Vector3(-16, 1.5, -12));
    // Detonate at the last moment so the blast ring is at full strength in the shot.
    const siteA = world.sites.find((s) => s.id === 'A');
    fx.explosion(new THREE.Vector3(siteA.x, 0.2, siteA.z));
    hud.showOverlay('roundEnd', { winner: 'cobalt', reason: 'Charge detonated', score: match.state.score });
  }
  syncCamera();
  syncHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__game = { match, bots, player, arsenal, world, hud };

match.startMatch();
syncCamera();
syncHud();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
