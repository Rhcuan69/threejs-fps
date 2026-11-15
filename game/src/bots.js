// Bots: the other nine players. Each bot runs a small state machine — hold a position,
// push a lane, investigate a noise, engage what it sees — over the waypoint graph, with
// line of sight, a reaction time and burst fire. They plant nothing and defuse the
// charge when it is planted; the human carries the charge.
import * as THREE from 'three';
import { PALETTE, shade } from './palette.js';
import { WEAPONS } from './weapons.js';

const BOT_RADIUS = 0.34;
const BOT_HEIGHT = 1.72;
const EYE_HEIGHT = 1.55;
const VIEW_DISTANCE = 30;
const VIEW_HALF_ANGLE = 0.96;
const HEAR_DISTANCE = 18;
const TURN_RATE = 5.2;
const WALK_SPEED = 4.0;
const ENGAGE_SPEED = 2.4;

const NAMES = {
  cobalt: ['Vex', 'Mara', 'Juno'],
  ember: ['Rook', 'Ash', 'Kilo', 'Nyx', 'Dagger'],
};
const ROLES = {
  cobalt: ['pushA', 'pushB', 'mid'],
  ember: ['holdA', 'holdB', 'holdA', 'holdB', 'roam'],
};
// Waypoint a role heads for when it is pushing or holding.
const ROLE_TARGET = { pushA: 15, pushB: 16, mid: 17, holdA: 15, holdB: 16, roam: 17 };
const ROLE_HOLD = { holdA: 13, holdB: 14, roam: 17, pushA: 15, pushB: 16, mid: 17 };

function bfsPath(waypoints, from, to) {
  if (from === to) return [to];
  const prev = new Array(waypoints.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const node = queue.shift();
    for (const next of waypoints[node].links) {
      if (prev[next] !== -1) continue;
      prev[next] = node;
      if (next === to) {
        const path = [to];
        let at = to;
        while (at !== from) {
          at = prev[at];
          path.unshift(at);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [to];
}

function nearestWaypoint(waypoints, x, z) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < waypoints.length; i += 1) {
    const d = (waypoints[i].x - x) ** 2 + (waypoints[i].z - z) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function angleTo(fromX, fromZ, toX, toZ) {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createBots(scene, world, deps) {
  const { los, fx, audio } = deps;
  const waypoints = world.waypoints;
  const colliders = world.colliders;
  const raycaster = new THREE.Raycaster();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const probe = new THREE.Box3();
  let now = 0;

  const teamMaterial = {
    cobalt: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.cobalt), roughness: 0.7 }),
    ember: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.7 }),
  };
  const darkMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xc9a586), roughness: 0.7 });

  const bots = [];

  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - BOT_RADIUS, y + lift, z - BOT_RADIUS);
    probe.max.set(x + BOT_RADIUS, y + height - lift, z + BOT_RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  function buildMesh(bot) {
    const group = new THREE.Group();
    const mat = teamMaterial[bot.team];
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.16), darkMaterial);
    legL.position.set(-0.12, 0.4, 0);
    const legR = legL.clone();
    legR.position.x = 0.12;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.32), mat);
    torso.position.y = 1.16;
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.36), darkMaterial);
    vest.position.y = 1.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), skinMaterial);
    head.position.y = 1.68;
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.185, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    helmet.position.y = 1.68;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), darkMaterial);
    gun.position.set(0.2, 1.32, -0.3);
    group.add(legL, legR, torso, vest, head, helmet, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    bot.torsoMesh = torso;
    bot.headMesh = head;
    bot.group = group;
    scene.add(group);
    return group;
  }

  function makeBot(team, index, spawn) {
    const bot = {
      id: `${team}-${index}`,
      name: NAMES[team][index],
      team,
      role: ROLES[team][index],
      weapon: team === 'ember' && index === 4 ? WEAPONS.smg : WEAPONS.rifle,
      pos: new THREE.Vector3(spawn.x, 0, spawn.z),
      yaw: spawn.yaw,
      pitch: 0,
      hp: 100,
      alive: true,
      fall: 0,
      path: [],
      holdNode: ROLE_HOLD[ROLES[team][index]],
      target: null,
      lastSeen: null,
      lastSeenAt: -10,
      reactAt: 0,
      burstLeft: 0,
      shotAt: 0,
      pauseUntil: 0,
      scanPhase: Math.random() * Math.PI * 2,
      strafeDir: 1,
      strafeAt: 0,
      defusing: false,
      defuseBlockUntil: 0,
      investigate: null,
      thinkAt: Math.random() * 0.12,
      homeSpawn: spawn,
      scanBase: null,
    };
    buildMesh(bot);
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 3; i += 1) makeBot('cobalt', i, world.spawns.cobalt[i + 1]);
  for (let i = 0; i < 5; i += 1) makeBot('ember', i, world.spawns.ember[i]);

  function killBot(bot, killerName) {
    if (!bot.alive) return;
    bot.alive = false;
    bot.hp = 0;
    bot.fall = 0;
    bot.defusing = false;
    bot.target = null;
    deps.onBotKilled(bot, killerName);
  }

  function damageBot(bot, amount, killerName) {
    if (!bot.alive) return;
    bot.hp -= amount;
    // Taking damage interrupts a defuse for a moment, as in the real game.
    bot.defusing = false;
    bot.defuseBlockUntil = now + 1.5;
    if (bot.hp <= 0) killBot(bot, killerName);
  }

  function setPath(bot, targetNode) {
    const from = nearestWaypoint(waypoints, bot.pos.x, bot.pos.z);
    bot.path = bfsPath(waypoints, from, targetNode);
    bot.scanBase = null;
    if (bot.path[0] === from) bot.path.shift();
  }

  // Walk straight at a point (not via waypoints), with the same collision rules.
  // Used for the final approach to the charge, where the nearest waypoint can be
  // the site itself and a waypoint path would come back empty metres short.
  function moveToward(bot, dt, x, z, speed) {
    const dx = x - bot.pos.x;
    const dz = z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.3) return true;
    const stepX = (dx / dist) * speed * dt;
    const stepZ = (dz / dist) * speed * dt;
    if (!overlaps(bot.pos.x + stepX, 0, bot.pos.z + stepZ, BOT_HEIGHT, 0.04)) {
      bot.pos.x += stepX;
      bot.pos.z += stepZ;
    } else if (!overlaps(bot.pos.x + stepX, 0, bot.pos.z, BOT_HEIGHT, 0.04)) {
      bot.pos.x += stepX;
    } else if (!overlaps(bot.pos.x, 0, bot.pos.z + stepZ, BOT_HEIGHT, 0.04)) {
      bot.pos.z += stepZ;
    } else {
      return false;
    }
    bot.yaw = angleTo(bot.pos.x - stepX, bot.pos.z - stepZ, bot.pos.x, bot.pos.z);
    return false;
  }

  function moveAlongPath(bot, dt, speed) {
    if (!bot.path.length) return true;
    const node = waypoints[bot.path[0]];
    const dx = node.x - bot.pos.x;
    const dz = node.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) {
      bot.path.shift();
      return bot.path.length === 0;
    }
    const stepX = (dx / dist) * speed * dt;
    const stepZ = (dz / dist) * speed * dt;
    const nextX = bot.pos.x + stepX;
    const nextZ = bot.pos.z + stepZ;
    if (!overlaps(nextX, bot.pos.y, nextZ, BOT_HEIGHT, 0.04)) {
      bot.pos.x = nextX;
      bot.pos.z = nextZ;
    } else if (!overlaps(nextX, bot.pos.y, bot.pos.z, BOT_HEIGHT, 0.04)) {
      bot.pos.x = nextX;
    } else if (!overlaps(bot.pos.x, bot.pos.y, nextZ, BOT_HEIGHT, 0.04)) {
      bot.pos.z = nextZ;
    } else {
      // Stuck on a corner: skip this waypoint and re-path from the next one.
      bot.path.shift();
      if (bot.path.length) setPath(bot, bot.path[bot.path.length - 1]);
      return false;
    }
    bot.yaw = angleTo(bot.pos.x - stepX, bot.pos.z - stepZ, bot.pos.x, bot.pos.z);
    return false;
  }

  function canSee(bot, pos, eyeY) {
    tmp.set(bot.pos.x, EYE_HEIGHT, bot.pos.z);
    tmp2.set(pos.x, eyeY, pos.z);
    const dist = tmp.distanceTo(tmp2);
    if (dist > VIEW_DISTANCE) return null;
    const dir = tmp2.clone().sub(tmp).normalize();
    const facing = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (dir.x * facing.x + dir.z * facing.z < Math.cos(VIEW_HALF_ANGLE)) return null;
    if (!los(tmp, tmp2)) return null;
    return dist;
  }

  function perceive(bot, ctx) {
    bot.thinkAt = ctx.time + 0.12;
    let best = null;
    let bestDist = Infinity;
    // The human player.
    if (ctx.playerAlive) {
      const dist = canSee(bot, ctx.playerPos, ctx.playerCrouching ? 1.0 : 1.35);
      if (dist !== null && dist < bestDist) {
        best = { kind: 'player', dist };
        bestDist = dist;
      }
    }
    // Enemy bots.
    for (const other of bots) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      tmp2.set(other.pos.x, 0, other.pos.z);
      const dist = canSee(bot, tmp2, 1.3);
      if (dist !== null && dist < bestDist) {
        best = { kind: 'bot', ref: other, dist };
        bestDist = dist;
      }
    }
    if (best) {
      bot.target = best;
      bot.lastSeen = best.kind === 'player'
        ? ctx.playerPos.clone()
        : best.ref.pos.clone();
      bot.lastSeenAt = ctx.time;
      if (bot.reactAt === 0) bot.reactAt = ctx.time + 0.4 + Math.random() * 0.4;
    } else if (ctx.time - bot.lastSeenAt > 1.2) {
      bot.target = null;
      bot.reactAt = 0;
    }
  }

  function fireAt(bot, ctx, targetPos, isPlayer) {
    const def = bot.weapon;
    const from = tmp.set(bot.pos.x, EYE_HEIGHT, bot.pos.z).clone();
    const to = targetPos.clone();
    const dist = from.distanceTo(to);
    // Aim error grows with distance and with a moving target.
    const error = 0.25 + dist * 0.02 + (isPlayer ? ctx.playerSpeed * 0.05 : 0);
    to.x += (Math.random() * 2 - 1) * error;
    to.y += (Math.random() * 2 - 1) * error * 0.7;
    to.z += (Math.random() * 2 - 1) * error;
    fx.tracer(from, to, bot.team === 'ember' ? 0xffb36b : 0x9cc4ff);
    audio.enemyShot(dist);
    const hitChance = Math.max(0.06, Math.min(0.45, 0.42 - dist * 0.014 - (isPlayer ? ctx.playerSpeed * 0.02 : 0)));
    if (Math.random() > hitChance) return;
    const headshot = Math.random() < 0.1;
    const falloff = Math.max(0.6, 1 - dist * 0.006);
    const damage = Math.round(def.damage * (headshot ? def.headMult : 1) * falloff);
    if (isPlayer) {
      deps.onDamagePlayer(damage, bot.name);
    } else {
      const victim = bot.target.ref;
      if (victim && victim.alive) damageBot(victim, damage, bot.name);
    }
  }

  function engage(bot, dt, ctx) {
    const target = bot.target;
    const targetPos = target.kind === 'player' ? ctx.playerPos : target.ref.pos;
    const aimYaw = angleTo(bot.pos.x, bot.pos.z, targetPos.x, targetPos.z);
    const diff = angleDiff(aimYaw, bot.yaw);
    bot.yaw += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, diff));
    const dist = Math.hypot(targetPos.x - bot.pos.x, targetPos.z - bot.pos.z);
    // Close the distance when far, plant feet and shoot when close.
    if (dist > 14 && Math.abs(diff) < 0.5) {
      const stepX = (-Math.sin(bot.yaw) * ENGAGE_SPEED * dt);
      const stepZ = (-Math.cos(bot.yaw) * ENGAGE_SPEED * dt);
      if (!overlaps(bot.pos.x + stepX, 0, bot.pos.z + stepZ, BOT_HEIGHT, 0.04)) {
        bot.pos.x += stepX;
        bot.pos.z += stepZ;
      }
    } else if (ctx.time >= bot.strafeAt) {
      bot.strafeAt = ctx.time + 1.2 + Math.random();
      bot.strafeDir *= -1;
      const sideX = Math.cos(bot.yaw) * bot.strafeDir * 0.8;
      const sideZ = -Math.sin(bot.yaw) * bot.strafeDir * 0.8;
      if (!overlaps(bot.pos.x + sideX, 0, bot.pos.z + sideZ, BOT_HEIGHT, 0.04)) {
        bot.pos.x += sideX;
        bot.pos.z += sideZ;
      }
    }
    if (ctx.time < bot.reactAt || Math.abs(diff) > 0.12) return;
    if (ctx.time < bot.pauseUntil) return;
    if (bot.burstLeft <= 0) {
      bot.burstLeft = bot.weapon.kind === 'smg' ? 5 : 3;
      bot.shotAt = ctx.time;
    }
    if (ctx.time - bot.shotAt >= bot.weapon.gap) {
      bot.shotAt = ctx.time;
      bot.burstLeft -= 1;
      const aim = tmp2.set(targetPos.x, targetPos.y + 1.3, targetPos.z);
      fireAt(bot, ctx, aim, target.kind === 'player');
      if (bot.burstLeft <= 0) bot.pauseUntil = ctx.time + 0.7 + Math.random() * 0.6;
    }
  }

  function objective(bot, dt, ctx) {
    bot.defusing = false;
    if (ctx.phase === 'buy') {
      // Attackers wait at the spawn; defenders walk to their holds before the round.
      if (bot.team === 'ember') {
        if (!bot.path.length) setPath(bot, bot.holdNode);
        moveAlongPath(bot, dt, WALK_SPEED);
      }
      return;
    }
    if (ctx.phase === 'planted') {
      const site = ctx.plantedSite === 'A' ? 15 : 16;
      const sitePos = waypoints[site];
      if (bot.team === 'cobalt') {
        const distToSite = Math.hypot(sitePos.x - bot.pos.x, sitePos.z - bot.pos.z);
        if (distToSite < 7) {
          moveToward(bot, dt, sitePos.x, sitePos.z, WALK_SPEED);
          return;
        }
        if (!bot.path.length || bot.path[bot.path.length - 1] !== site) setPath(bot, site);
        moveAlongPath(bot, dt, WALK_SPEED);
        return;
      }
      // Defenders rush the planted site; the closest one defuses when it gets there.
      if (!bot.path.length || bot.path[bot.path.length - 1] !== site) setPath(bot, site);
      const chargePos = ctx.chargePos;
      const distToCharge = Math.hypot(chargePos.x - bot.pos.x, chargePos.z - bot.pos.z);
      if (distToCharge < 2.5) {
        bot.defusing = true;
        return;
      }
      if (distToCharge < 7) {
        moveToward(bot, dt, chargePos.x, chargePos.z, WALK_SPEED);
        return;
      }
      moveAlongPath(bot, dt, WALK_SPEED);
      return;
    }
    // Live round, no plant yet.
    if (bot.team === 'cobalt') {
      const goal = ROLE_TARGET[bot.role];
      if (!bot.path.length || bot.path[bot.path.length - 1] !== goal) setPath(bot, goal);
      moveAlongPath(bot, dt, WALK_SPEED);
      return;
    }
    // Ember: hold, patrol, or investigate a noise.
    if (bot.investigate && ctx.time < bot.investigate.until) {
      const node = nearestWaypoint(waypoints, bot.investigate.x, bot.investigate.z);
      if (!bot.path.length || bot.path[bot.path.length - 1] !== node) setPath(bot, node);
      if (moveAlongPath(bot, dt, WALK_SPEED)) bot.investigate = null;
      return;
    }
    bot.investigate = null;
    if (bot.role === 'roam') {
      if (!bot.path.length) {
        const patrol = [17, 13, 14];
        const next = patrol[Math.floor(Math.random() * patrol.length)];
        setPath(bot, next);
      }
      moveAlongPath(bot, dt, WALK_SPEED * 0.8);
      return;
    }
    // Hold: stay near the hold node, sweeping the lane for anyone coming through.
    if (!bot.path.length) setPath(bot, bot.holdNode);
    if (moveAlongPath(bot, dt, WALK_SPEED)) {
      if (bot.scanBase === null) bot.scanBase = bot.yaw;
      bot.yaw = bot.scanBase + Math.sin(ctx.time * 0.45 + bot.scanPhase) * 1.1;
    }
  }

  function step(dt, ctx) {
    now = ctx.time;
    for (const bot of bots) {
      if (!bot.alive) {
        if (bot.fall < 1) {
          bot.fall = Math.min(1, bot.fall + dt / 0.5);
          bot.group.rotation.x = -bot.fall * 1.5;
          bot.group.position.y = -bot.fall * 0.1;
        }
        continue;
      }
      if (ctx.time >= bot.thinkAt) perceive(bot, ctx);
      // A dead target is no target: drop it at once instead of shooting a corpse.
      if (bot.target && bot.target.kind === 'bot' && !bot.target.ref.alive) {
        bot.target = null;
        bot.reactAt = 0;
      }
      // A fresh noise within earshot pulls a holding defender off its post.
      if (bot.team === 'ember' && bot.role !== 'roam' && !bot.target && ctx.noise.length) {
        for (const noise of ctx.noise) {
          const dist = Math.hypot(noise.x - bot.pos.x, noise.z - bot.pos.z);
          if (dist < HEAR_DISTANCE && ctx.time < noise.until) {
            bot.investigate = noise;
            break;
          }
        }
      }
      // When the charge is planted, a defender standing on it defuses instead of
      // fighting: the site, not the kill, is the job. Damage blocks the channel.
      // Otherwise a defender with a close enemy fights it, and one with only a
      // distant enemy keeps rotating to the site instead of standing to trade shots.
      const canDefuse = ctx.phase === 'planted' && bot.team === 'ember'
        && Math.hypot(ctx.chargePos.x - bot.pos.x, ctx.chargePos.z - bot.pos.z) < 2.5
        && ctx.time >= (bot.defuseBlockUntil ?? 0);
      if (canDefuse) {
        objective(bot, dt, ctx);
      } else if (bot.target && ctx.phase === 'planted' && bot.team === 'ember') {
        const targetPos = bot.target.kind === 'player' ? ctx.playerPos : bot.target.ref.pos;
        const dist = Math.hypot(targetPos.x - bot.pos.x, targetPos.z - bot.pos.z);
        if (dist < 12) engage(bot, dt, ctx);
        else objective(bot, dt, ctx);
      } else if (bot.target) {
        engage(bot, dt, ctx);
      } else {
        objective(bot, dt, ctx);
      }
      bot.group.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
      bot.group.rotation.y = bot.yaw;
    }
  }

  function reset() {
    for (const bot of bots) {
      const spawn = bot.homeSpawn;
      bot.pos.set(spawn.x, 0, spawn.z);
      bot.yaw = spawn.yaw;
      bot.hp = 100;
      bot.alive = true;
      bot.fall = 0;
      bot.path = [];
      bot.target = null;
      bot.lastSeen = null;
      bot.reactAt = 0;
      bot.burstLeft = 0;
      bot.pauseUntil = 0;
      bot.defusing = false;
      bot.investigate = null;
      bot.group.rotation.set(0, 0, 0);
      bot.group.position.set(bot.pos.x, 0, bot.pos.z);
      bot.group.rotation.y = bot.yaw;
    }
  }

  return {
    list: bots,
    step,
    reset,
    damageBot,
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    hitMeshes() {
      const meshes = [];
      for (const bot of bots) {
        if (!bot.alive) continue;
        meshes.push(bot.torsoMesh, bot.headMesh);
      }
      return meshes;
    },
    defuseActive() {
      return bots.some((b) => b.alive && b.team === 'ember' && b.defusing);
    },
    defuser() {
      return bots.find((b) => b.alive && b.team === 'ember' && b.defusing) ?? null;
    },
  };
}
