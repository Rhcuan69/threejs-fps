// Short-lived visuals: bullet tracers, impact sparks and the blast ring. Everything is
// pre-allocated and reused; nothing is created per frame except when an event fires.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_SPARKS = 8;

export function createFx(scene) {
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({
      color: 0xffe9a8,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }

  const sparks = [];
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 14), 3));
  for (let i = 0; i < MAX_SPARKS; i += 1) {
    const material = new THREE.PointsMaterial({
      color: 0xffc861,
      size: 0.09,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const points = new THREE.Points(sparkGeometry.clone(), material);
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    sparks.push({ points, velocities: new Float32Array(3 * 14), life: 0 });
  }

  const blastGeometry = new THREE.RingGeometry(0.4, 0.55, 40);
  const blastMaterial = new THREE.MeshBasicMaterial({
    color: 0xffa63d,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const blast = new THREE.Mesh(blastGeometry, blastMaterial);
  blast.rotation.x = -Math.PI / 2;
  blast.visible = false;
  scene.add(blast);
  let blastLife = 0;

  const tmp = new THREE.Vector3();

  function tracer(from, to, color = 0xffe9a8) {
    const slot = tracers.find((t) => t.life <= 0) ?? tracers[0];
    const positions = slot.line.geometry.attributes.position.array;
    positions[0] = from.x;
    positions[1] = from.y;
    positions[2] = from.z;
    positions[3] = to.x;
    positions[4] = to.y;
    positions[5] = to.z;
    slot.line.geometry.attributes.position.needsUpdate = true;
    slot.line.material.color.setHex(color);
    slot.line.material.opacity = 0.9;
    slot.line.visible = true;
    slot.life = 0.09;
  }

  function impact(point, normal) {
    const slot = sparks.find((s) => s.life <= 0) ?? sparks[0];
    const positions = slot.points.geometry.attributes.position.array;
    for (let i = 0; i < 14; i += 1) {
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
      tmp.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      if (normal) tmp.add(normal).normalize();
      slot.velocities[i * 3] = tmp.x * (2 + Math.random() * 3);
      slot.velocities[i * 3 + 1] = Math.abs(tmp.y) * 3 + 1;
      slot.velocities[i * 3 + 2] = tmp.z * (2 + Math.random() * 3);
    }
    slot.points.geometry.attributes.position.needsUpdate = true;
    slot.points.material.opacity = 1;
    slot.points.visible = true;
    slot.life = 0.35;
  }

  function explosion(point) {
    blast.position.set(point.x, 0.06, point.z);
    blast.scale.setScalar(0.5);
    blast.material.opacity = 0.9;
    blast.visible = true;
    blastLife = 0.5;
    impact(point, null);
  }

  function step(dt) {
    for (const slot of tracers) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.line.material.opacity = Math.max(0, slot.life / 0.09) * 0.9;
      if (slot.life <= 0) slot.line.visible = false;
    }
    for (const slot of sparks) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      const positions = slot.points.geometry.attributes.position.array;
      for (let i = 0; i < 14; i += 1) {
        positions[i * 3] += slot.velocities[i * 3] * dt;
        positions[i * 3 + 1] += slot.velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += slot.velocities[i * 3 + 2] * dt;
        slot.velocities[i * 3 + 1] -= 9 * dt;
      }
      slot.points.geometry.attributes.position.needsUpdate = true;
      slot.points.material.opacity = Math.max(0, slot.life / 0.35);
      if (slot.life <= 0) slot.points.visible = false;
    }
    if (blastLife > 0) {
      blastLife -= dt;
      blast.scale.setScalar(0.5 + (0.5 - blastLife) * 16);
      blast.material.opacity = Math.max(0, blastLife / 0.5) * 0.9;
      if (blastLife <= 0) blast.visible = false;
    }
  }

  return { tracer, impact, explosion, step };
}
