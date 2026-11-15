// The arsenal: four original weapons and one grenade. Each weapon owns its numbers —
// damage, headshot multiplier, fire rate, magazine, spread, recoil and price — so
// stopping to aim pays and spraying on the move does not. A grenade is a thrown object
// with gravity, one bounce and a fuse, not a hitscan.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sparrow', kind: 'pistol', price: 0, slot: 1,
    damage: 26, headMult: 4, mag: 12, reserve: 36, gap: 0.14, auto: false,
    reloadTime: 1.4, spreadStill: 0.004, spreadMove: 0.03, recoil: 0.007, range: 60,
  },
  smg: {
    id: 'smg', name: 'VX-9 Wasp', kind: 'smg', price: 1250, slot: 2,
    damage: 22, headMult: 4, mag: 28, reserve: 84, gap: 0.075, auto: true,
    reloadTime: 1.8, spreadStill: 0.006, spreadMove: 0.035, recoil: 0.005, range: 50,
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Kestrel', kind: 'rifle', price: 2700, slot: 2,
    damage: 34, headMult: 4, mag: 25, reserve: 75, gap: 0.1, auto: true,
    reloadTime: 2.2, spreadStill: 0.003, spreadMove: 0.03, recoil: 0.009, range: 80,
  },
  sniper: {
    id: 'sniper', name: 'LW-50 Heron', kind: 'sniper', price: 4750, slot: 2,
    damage: 110, headMult: 2, mag: 5, reserve: 15, gap: 1.15, auto: false,
    reloadTime: 3.0, spreadStill: 0.0008, spreadMove: 0.05, recoil: 0.028, range: 100,
  },
};

export const GRENADE = { price: 300, maxCarry: 2, fuse: 1.3, radius: 6.5, maxDamage: 120 };

const MOVE_REFERENCE = 5.2;

export function createArsenal(camera, audio) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.5, metalness: 0.4 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });

  function buildModel(def) {
    const model = new THREE.Group();
    model.scale.setScalar(0.72);
    const add = (w, h, d, x, y, z, mat = bodyMat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      model.add(mesh);
      return mesh;
    };
    if (def.kind === 'pistol') {
      add(0.07, 0.09, 0.24, 0, 0, -0.1);
      add(0.06, 0.12, 0.07, 0, -0.09, 0.02, grip);
      add(0.02, 0.03, 0.02, 0, 0.06, -0.2, accentMat);
      model.position.set(0.26, -0.28, -0.62);
    } else if (def.kind === 'smg') {
      add(0.08, 0.09, 0.34, 0, 0, -0.12);
      add(0.04, 0.04, 0.3, 0, 0.02, -0.36, grip);
      add(0.06, 0.14, 0.06, 0, -0.1, 0, grip);
      add(0.05, 0.05, 0.1, 0, 0.05, -0.1, accentMat);
      model.position.set(0.26, -0.28, -0.62);
    } else if (def.kind === 'rifle') {
      add(0.09, 0.1, 0.44, 0, 0, -0.14);
      add(0.045, 0.045, 0.42, 0, 0.025, -0.5, grip);
      add(0.075, 0.08, 0.22, 0, -0.02, 0.16, grip);
      add(0.06, 0.14, 0.06, 0, -0.11, -0.05, grip);
      add(0.03, 0.04, 0.16, 0, 0.07, -0.2, accentMat);
      model.position.set(0.27, -0.27, -0.64);
    } else {
      add(0.09, 0.11, 0.5, 0, 0, -0.16);
      add(0.05, 0.05, 0.55, 0, 0.03, -0.6, grip);
      add(0.08, 0.08, 0.2, 0, -0.02, 0.2, grip);
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 12), accentMat);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.09, -0.12);
      model.add(scope);
      model.position.set(0.27, -0.27, -0.66);
    }
    model.visible = false;
    camera.add(model);
    return model;
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.12, 0.12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.27, -0.22, -1.1);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const models = {};
  for (const def of Object.values(WEAPONS)) models[def.id] = buildModel(def);

  const ammo = {};
  for (const def of Object.values(WEAPONS)) ammo[def.id] = { mag: def.mag, reserve: def.reserve };

  const state = {
    primary: 'rifle',
    current: 'pistol',
    mag: WEAPONS.pistol.mag,
    reserve: WEAPONS.pistol.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    grenades: 0,
    scoped: false,
  };

  function saveAmmo() {
    ammo[state.current].mag = state.mag;
    ammo[state.current].reserve = state.reserve;
  }

  function def() {
    return WEAPONS[state.current];
  }

  function showModel() {
    for (const [id, model] of Object.entries(models)) model.visible = id === state.current;
  }
  showModel();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = (state.current === 'pistol' ? -0.62 : state.current === 'smg' ? -0.62 : state.current === 'rifle' ? -0.64 : -0.66) + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    canFire() {
      return state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = 0.06;
      state.kick = 0.055;
      audio.shot(def().kind);
    },
    takeRound() {
      if (state.mag <= 0) {
        audio.dryFire();
        return false;
      }
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def().mag || state.reserve === 0) return;
      state.reloadLeft = def().reloadTime;
      audio.reload();
    },
    spread(speed, crouched, walking) {
      const d = def();
      let spread = d.spreadStill + Math.min(1, speed / MOVE_REFERENCE) * d.spreadMove;
      if (crouched) spread *= 0.7;
      if (walking) spread *= 0.55;
      if (state.scoped) spread *= 0.4;
      return spread;
    },
    recoil() {
      return def().recoil;
    },
    equip(id) {
      if (!WEAPONS[id] || state.current === id) return false;
      if (WEAPONS[id].slot === 2 && state.primary !== id) return false;
      saveAmmo();
      state.current = id;
      state.mag = ammo[id].mag;
      state.reserve = ammo[id].reserve;
      state.cooldown = 0.25;
      state.reloadLeft = 0;
      state.scoped = false;
      showModel();
      audio.click();
      return true;
    },
    // Buying a primary replaces the old one; the pistol is always kept.
    buyPrimary(id) {
      saveAmmo();
      state.primary = id;
      state.current = id;
      ammo[id].mag = WEAPONS[id].mag;
      ammo[id].reserve = WEAPONS[id].reserve;
      state.mag = ammo[id].mag;
      state.reserve = ammo[id].reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.scoped = false;
      showModel();
    },
    buyGrenade() {
      if (state.grenades >= GRENADE.maxCarry) return false;
      state.grenades += 1;
      return true;
    },
    // Between rounds the reserve is topped up; the magazine stays as it was.
    refillAmmo() {
      saveAmmo();
      for (const id of ['pistol', state.primary]) ammo[id].reserve = WEAPONS[id].reserve;
      state.mag = ammo[state.current].mag;
      state.reserve = ammo[state.current].reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    resetToPistol() {
      for (const def of Object.values(WEAPONS)) {
        ammo[def.id].mag = def.mag;
        ammo[def.id].reserve = def.reserve;
      }
      state.primary = 'rifle';
      state.current = 'pistol';
      state.mag = WEAPONS.pistol.mag;
      state.reserve = WEAPONS.pistol.reserve;
      state.grenades = 0;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.scoped = false;
      showModel();
    },
    setScoped(scoped) {
      state.scoped = scoped && state.current === 'sniper';
    },
  };
}

// Thrown grenades: a sphere with gravity and one bounce, then a fuse. On detonation the
// callback receives the blast point; the caller applies the damage.
export function createGrenades(scene, colliders, fx, audio, onDetonate) {
  const geometry = new THREE.SphereGeometry(0.09, 12, 10);
  const material = new THREE.MeshStandardMaterial({ color: 0x2c323a, roughness: 0.6, metalness: 0.4 });
  const live = [];

  function throwGrenade(origin, direction) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    scene.add(mesh);
    const velocity = direction.clone().multiplyScalar(13);
    velocity.y += 3.2;
    live.push({ mesh, velocity, fuse: GRENADE.fuse, bounced: false });
  }

  function pointBlocked(x, y, z) {
    for (const box of colliders) {
      if (x >= box.min.x && x <= box.max.x && y >= box.min.y && y <= box.max.y && z >= box.min.z && z <= box.max.z) return true;
    }
    return false;
  }

  function step(dt) {
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const g = live[i];
      g.fuse -= dt;
      g.velocity.y -= 14 * dt;
      const next = g.mesh.position.clone().addScaledVector(g.velocity, dt);
      if (next.y < 0.09) {
        next.y = 0.09;
        if (Math.abs(g.velocity.y) > 2 && !g.bounced) {
          g.velocity.y *= -0.45;
          g.velocity.x *= 0.7;
          g.velocity.z *= 0.7;
          g.bounced = true;
        } else {
          g.velocity.y = 0;
          g.velocity.x *= 0.9;
          g.velocity.z *= 0.9;
        }
      } else if (pointBlocked(next.x, next.y, next.z)) {
        g.velocity.multiplyScalar(-0.4);
        next.copy(g.mesh.position);
      }
      g.mesh.position.copy(next);
      if (g.fuse <= 0) {
        const point = g.mesh.position.clone();
        scene.remove(g.mesh);
        live.splice(i, 1);
        fx.explosion(point);
        audio.explosion();
        onDetonate(point);
      }
    }
  }

  return { throwGrenade, step, count: () => live.length };
}
