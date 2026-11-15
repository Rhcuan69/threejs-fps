// Yard 7, a decommissioned freight terminal: three lanes (west, mid, east) join the two
// bomb sites, Crane Bay (A, west) and Silo Row (B, east). Every box is a collider for
// players and bots and a surface a bullet stops on. Plain geometry only, no models,
// no textures, no network. The waypoint graph is what the bots navigate on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoints: [x, z, links...] — hand-placed at every junction, lane mouth, wall gap and
// site. Links are symmetric; every node is reachable from the attacker spawn (0).
const WAYPOINTS = [
  [0, 15, [1, 2, 3]], // 0 attacker spawn
  [-14, 13, [0, 4, 7]], // 1 west lane mouth
  [0, 10, [0, 3, 5]], // 2 mid mouth
  [13, 13, [0, 2, 6]], // 3 east lane mouth
  [-14.5, 6, [1, 7]], // 4 west lane low
  [0, 5, [2, 8, 9]], // 5 mid low
  [14.5, 6, [3, 10]], // 6 east lane low
  [-14, -2, [4, 8, 11, 13]], // 7 west connector
  [-8.5, 2, [5, 7, 13]], // 8 west wall gap
  [8.5, 2, [5, 10, 14]], // 9 east wall gap
  [14, -2, [6, 9, 12, 14]], // 10 east connector
  [-16, -8, [7, 13, 15]], // 11 site A approach
  [16, -8, [10, 14, 16]], // 12 site B approach
  [-8, -6, [7, 8, 11, 15, 17]], // 13 west-mid cross
  [8, -6, [9, 10, 12, 16, 17]], // 14 east-mid cross
  [-16, -12, [11, 13, 17, 18]], // 15 site A
  [16, -12, [12, 14, 17, 19]], // 16 site B
  [0, -12, [13, 14, 15, 16, 20]], // 17 north mid
  [-8, -15, [15, 17, 20]], // 18 defender west
  [8, -15, [16, 17, 20]], // 19 defender east
  [0, -16, [17, 18, 19]], // 20 defender spawn
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const containerBlue = new THREE.MeshStandardMaterial({ color: 0x2e4a63, roughness: 0.8, metalness: 0.15 });
  const containerRust = new THREE.MeshStandardMaterial({ color: 0x6b3a24, roughness: 0.85, metalness: 0.1 });
  const containerGreen = new THREE.MeshStandardMaterial({ color: 0x3d5240, roughness: 0.8, metalness: 0.12 });
  const containerYellow = new THREE.MeshStandardMaterial({ color: 0x8a6d2f, roughness: 0.8, metalness: 0.12 });
  // The yard floor: worn concrete, a shade lighter than the walls so the ground reads.
  materials.concrete = new THREE.MeshStandardMaterial({ color: 0x4d525a, roughness: 0.95, metalness: 0.02 });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function container(x, z, rotated, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(rotated ? 2.5 : 6.1, 2.6, rotated ? 6.1 : 2.5), material);
    mesh.position.set(x, 1.3, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and the yard wall: 44 x 36 m, 5 m walls, open to a dusk sky.
  box(44.4, 0.4, 36.4, 0, -0.2, 0, 'concrete');
  box(0.4, 5, 36.4, -22.2, 2.5, 0, 'surface');
  box(0.4, 5, 36.4, 22.2, 2.5, 0, 'surface');
  box(44.4, 5, 0.4, 0, 2.5, -18.2, 'surface');
  box(44.4, 5, 0.4, 0, 2.5, 18.2, 'surface');

  // Painted lane dashes on the ground: short muted strips, never a line across the view.
  function dash(x, z, rotated) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(rotated ? 0.16 : 1.3, 0.02, rotated ? 1.3 : 0.16),
      materials.muted,
    );
    mesh.position.set(x, 0.02, z);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const z of [10, 6, 2, -2, -6]) {
    dash(-14.5, z, true);
    dash(14.5, z, true);
  }
  for (const z of [8, 4, 0, -4, -8]) dash(0, z, true);

  // Mid wall with three gaps, so mid is a risk: cross it in the open or flank wide.
  box(6, 3.4, 0.6, -14, 1.7, 2, 'surface');
  box(6, 3.4, 0.6, 14, 1.7, 2, 'surface');
  box(12, 3.4, 0.6, 0, 1.7, 2, 'surface');
  // Low crates guarding the mid-wall gaps, set back from the gaps themselves.
  box(2.2, 1.1, 0.6, -9, 0.55, 4.5, 'hairline');
  box(2.2, 1.1, 0.6, 9, 0.55, 4.5, 'hairline');

  // West lane cover: containers and crates down to Crane Bay.
  container(-18, 8, false, containerBlue);
  container(-12, 4, true, containerRust);
  box(1.2, 1.1, 1.2, -17, 0.55, -1, 'hairline');
  box(1.2, 1.1, 1.2, -13, 0.55, -4, 'hairline');
  container(-19, -7, true, containerGreen);
  // East lane cover: the mirror, in different colours so the lanes read apart.
  container(18, 8, false, containerRust);
  container(12, 4, true, containerYellow);
  box(1.2, 1.1, 1.2, 17, 0.55, -1, 'hairline');
  box(1.2, 1.1, 1.2, 13, 0.55, -4, 'hairline');
  container(19, -7, true, containerBlue);

  // Mid cover: a low wall and two crates, sightline broken but never safe.
  box(3.2, 1.2, 0.8, 0, 0.6, -4, 'hairline');
  box(1.2, 1.1, 1.2, -5, 0.55, 7, 'hairline');
  box(1.2, 1.1, 1.2, 5, 0.55, 7, 'hairline');
  box(1.2, 1.1, 1.2, -5.5, 0.55, -9, 'hairline');
  box(1.2, 1.1, 1.2, 5.5, 0.55, -9, 'hairline');

  // Crane Bay (site A): a gantry crane over the plant zone, containers as walls.
  box(0.5, 6.4, 0.5, -19.5, 3.2, -12, 'hairline');
  box(0.5, 6.4, 0.5, -12.5, 3.2, -12, 'hairline');
  box(7.5, 0.6, 0.8, -16, 6.4, -12, 'hairline');
  box(1.0, 0.8, 2.2, -16, 5.6, -12, 'accent');
  container(-20, -15, false, containerGreen);
  container(-12, -15, true, containerBlue);
  box(2.4, 0.9, 1.2, -16, 0.45, -6.5, 'hairline');

  // Silo Row (site B): three silos, one tipped crate, a low wall to plant behind.
  function silo(x, z) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 5.2, 20), containerRust);
    mesh.position.set(x, 2.6, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.1, 20), materials.accent);
    cap.position.set(x, 5.75, z);
    cap.castShadow = true;
    group.add(cap);
    shootables.push(cap);
  }
  silo(19.5, -14.5);
  silo(19.5, -9.5);
  silo(14.5, -16.5);
  box(2.4, 0.9, 1.2, 16, 0.45, -6.5, 'hairline');
  container(11.5, -14, false, containerGreen);

  // Defender spawn cover: two crates, clear of the north-mid waypoint lines.
  box(1.2, 1.1, 1.2, -5, 0.55, -15, 'hairline');
  box(1.2, 1.1, 1.2, 5, 0.55, -15, 'hairline');

  // Site markers: a flat ring on the ground plus a floating beacon that bobs.
  const sites = [];
  const siteDefs = [
    { id: 'A', name: 'Crane Bay', x: -16, z: -12 },
    { id: 'B', name: 'Silo Row', x: 16, z: -12 },
  ];
  for (const def of siteDefs) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.1, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(def.x, 0.03, def.z);
    group.add(ring);
    const beacon = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.35),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9 }),
    );
    beacon.position.set(def.x, 3.4, def.z);
    group.add(beacon);
    const label = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.02, 0.5),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
    );
    label.position.set(def.x, 0.04, def.z + 3.9);
    group.add(label);
    sites.push({ ...def, radius: 3.1, ring, beacon });
  }

  // The charge itself: a small amber case that appears where it is planted.
  const charge = new THREE.Group();
  const chargeBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.34), new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 }));
  chargeBody.castShadow = true;
  const chargeLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 8);
  chargeLight.position.y = 0.4;
  charge.add(chargeBody, chargeLight);
  charge.visible = false;
  scene.add(charge);

  // Light: a low amber sun from the west, a cool fill from the east, dusk haze.
  const sky = new THREE.HemisphereLight(new THREE.Color(0x8a94a8), new THREE.Color(0x3a2f22), 1.9);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color(0xffc98a), 3.0);
  key.position.set(-16, 18, 10);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(0x5a7396), 1.0);
  fill.position.set(14, 10, 12);
  scene.add(fill);

  const waypoints = WAYPOINTS.map(([x, z, links]) => ({ x, z, links }));

  function step(dt, time) {
    for (const site of sites) {
      site.beacon.position.y = 3.4 + Math.sin(time * 1.4 + site.x) * 0.25;
      site.beacon.rotation.y = time * 0.8;
      site.ring.material.opacity = 0.4 + Math.sin(time * 2 + site.x) * 0.15;
    }
  }

  return {
    colliders,
    shootables,
    group,
    sites,
    waypoints,
    charge,
    spawns: {
      // yaw 0 faces -z: Cobalt spawns in the south and looks north, Ember the reverse.
      cobalt: [
        { x: -3, z: 15.5, yaw: 0 },
        { x: 0, z: 16.5, yaw: 0 },
        { x: 3, z: 15.5, yaw: 0 },
        { x: -1.5, z: 14, yaw: 0 },
      ],
      ember: [
        { x: -6, z: -15.5, yaw: Math.PI },
        { x: 6, z: -15.5, yaw: Math.PI },
        { x: 0, z: -16.5, yaw: Math.PI },
        // -14 would put the bot inside the site container; -11 stands clear of it.
        { x: -12, z: -11, yaw: Math.PI },
        { x: 12, z: -11, yaw: Math.PI },
      ],
    },
    step,
  };
}
