// Low-poly cute models built from primitives so the prototype needs no assets.
import * as THREE from 'three';
import { ANIMALS, TREATS, WEAPONS } from '../../shared/constants.js';

const matCache = new Map();
export function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshToonMaterial({ color }));
  return matCache.get(color);
}

function mesh(geo, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  return m;
}

function rot(m, x = 0, y = 0, z = 0) {
  m.rotation.set(x, y, z);
  return m;
}

const sphere = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);

function eye(x, y, z) {
  const g = new THREE.Group();
  g.add(mesh(sphere(0.16), 0x1d1424));
  g.add(mesh(sphere(0.06, 6, 4), 0xffffff, 0.05, 0.06, 0.12));
  g.position.set(x, y, z);
  return g;
}

// Animal faces +z, sitting with its bottom at y=0.
export function buildAnimal(id, { tint = 0, hat = 'none' } = {}) {
  const base = ANIMALS[id] || ANIMALS.corgi;
  const a = tint ? { ...base, fur: base.alt[tint - 1] } : base;
  const g = new THREE.Group();
  const body = mesh(sphere(0.95), a.fur, 0, 0.85, -0.1);
  body.scale.set(1, 0.95, 1.1);
  g.add(body);
  const belly = mesh(sphere(0.7), a.belly, 0, 0.8, 0.35);
  belly.scale.set(0.9, 0.9, 0.6);
  g.add(belly);

  const head = new THREE.Group();
  head.position.set(0, 1.95, 0.25);
  g.add(head);
  head.add(mesh(sphere(0.8), a.fur));
  head.add(eye(-0.3, 0.1, 0.66));
  head.add(eye(0.3, 0.1, 0.66));
  // Blush.
  head.add(mesh(sphere(0.12, 8, 6), 0xff9fb8, -0.5, -0.15, 0.55));
  head.add(mesh(sphere(0.12, 8, 6), 0xff9fb8, 0.5, -0.15, 0.55));

  if (id === 'duck') {
    const beak = mesh(sphere(0.32), a.accent, 0, -0.12, 0.78);
    beak.scale.set(1.2, 0.45, 1);
    head.add(beak);
    const tuft = mesh(new THREE.ConeGeometry(0.15, 0.45, 6), a.fur, 0, 0.85, 0);
    tuft.rotation.z = 0.3;
    head.add(tuft);
    for (const s of [-1, 1]) {
      const wing = mesh(sphere(0.45), a.fur, s * 0.9, 0.9, -0.1);
      wing.scale.set(0.35, 0.8, 1);
      g.add(wing);
    }
  } else {
    const muzzle = mesh(sphere(0.34), a.belly, 0, -0.18, 0.62);
    muzzle.scale.set(1.2, 0.8, 0.8);
    head.add(muzzle);
    head.add(mesh(sphere(0.1, 8, 6), 0x2a1a22, 0, -0.08, 0.92));
  }

  if (id === 'corgi') {
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(0.3, 0.75, 8), a.fur, s * 0.48, 0.75, -0.05);
      ear.rotation.z = -s * 0.35;
      head.add(ear);
    }
    const tail = mesh(sphere(0.25), a.fur, 0, 0.9, -1.15);
    g.add(tail);
  } else if (id === 'bunny') {
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.CapsuleGeometry(0.17, 1.0, 4, 8), a.fur, s * 0.28, 1.15, -0.1);
      ear.rotation.z = -s * 0.15;
      head.add(ear);
      const inner = mesh(new THREE.CapsuleGeometry(0.09, 0.8, 4, 8), a.accent, s * 0.28, 1.15, 0.02);
      inner.rotation.z = -s * 0.15;
      head.add(inner);
    }
    g.add(mesh(sphere(0.3), 0xffffff, 0, 0.7, -1.15));
  } else if (id === 'raccoon') {
    for (const s of [-1, 1]) {
      const ear = mesh(sphere(0.25), a.fur, s * 0.5, 0.65, -0.1);
      ear.scale.set(1, 1, 0.5);
      head.add(ear);
    }
    const mask = mesh(sphere(0.55), a.accent, 0, 0.1, 0.35);
    mask.scale.set(1.45, 0.42, 0.75);
    head.add(mask);
    // Re-add eyes on top of the mask.
    head.add(eye(-0.3, 0.1, 0.7));
    head.add(eye(0.3, 0.1, 0.7));
    const tail = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      tail.add(mesh(sphere(0.3), i % 2 ? a.accent : a.fur, 0, i * 0.3, -i * 0.35));
    }
    tail.position.set(0, 0.8, -1.1);
    g.add(tail);
  } else if (id === 'cat') {
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(0.26, 0.5, 4), a.fur, s * 0.45, 0.68, 0);
      ear.rotation.z = -s * 0.3;
      head.add(ear);
    }
    const tail = mesh(new THREE.CapsuleGeometry(0.12, 1.2, 4, 8), a.fur, 0, 1.3, -1.1);
    tail.rotation.x = -0.5;
    g.add(tail);
  }

  // Little paws gripping the ride.
  for (const s of [-1, 1]) g.add(mesh(sphere(0.22), a.belly, s * 0.55, 0.25, 0.75));
  const h = buildHat(hat);
  if (h) head.add(h);
  g.userData.head = head;
  return g;
}

function buildHat(hat) {
  const g = new THREE.Group();
  if (hat === 'party') {
    const cone = mesh(new THREE.ConeGeometry(0.38, 1.0, 12), 0xff6fa5, 0, 1.15, 0);
    cone.rotation.z = 0.25;
    g.add(cone);
    g.add(mesh(sphere(0.16), 0xffe066, -0.14, 1.68, 0));
  } else if (hat === 'bow') {
    for (const s of [-1, 1]) {
      const loop = mesh(new THREE.ConeGeometry(0.26, 0.5, 8), 0xff4d88, s * 0.28, 0.85, 0.15);
      loop.rotation.z = s * Math.PI / 2;
      g.add(loop);
    }
    g.add(mesh(sphere(0.13), 0xff4d88, 0, 0.85, 0.15));
    g.position.x = 0.35;
  } else if (hat === 'flower') {
    const cols = [0xff9fb8, 0xffe066, 0xb5a8ff, 0xffffff];
    for (let i = 0; i < 9; i++) {
      const t = (i / 9) * Math.PI * 2;
      g.add(mesh(sphere(0.17, 8, 6), cols[i % 4], Math.cos(t) * 0.62, 0.55, Math.sin(t) * 0.62));
    }
  } else if (hat === 'shades') {
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.42, 0.26, 0.08), 0x1d1424, s * 0.3, 0.12, 0.8));
    g.add(mesh(new THREE.BoxGeometry(0.25, 0.06, 0.06), 0x1d1424, 0, 0.17, 0.8));
  } else if (hat === 'beanie') {
    const cap = mesh(new THREE.SphereGeometry(0.84, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), 0x4fb3bf, 0, 0.12, 0);
    g.add(cap);
    g.add(rot(mesh(new THREE.TorusGeometry(0.78, 0.12, 6, 18), 0x3a8f99, 0, 0.2, 0), Math.PI / 2));
    g.add(mesh(sphere(0.2), 0xffffff, 0, 0.98, 0));
  } else if (hat === 'crown') {
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12, 1, true), 0xffc93c, 0, 0.88, 0));
    for (let i = 0; i < 5; i++) {
      const t = (i / 5) * Math.PI * 2;
      g.add(mesh(new THREE.ConeGeometry(0.1, 0.3, 4), 0xffc93c, Math.cos(t) * 0.4, 1.15, Math.sin(t) * 0.4));
    }
  } else {
    return null;
  }
  return g;
}

function wheel(x, z, r = 0.32) {
  const w = mesh(new THREE.CylinderGeometry(r, r, 0.3, 12), 0x333040, x, r, z);
  w.rotation.z = Math.PI / 2;
  return w;
}

// Vehicles face +z. Returns { group, seat } where seat is the rider's base height.
export function buildVehicle(id) {
  const g = new THREE.Group();
  let seat = 0.6;
  if (id === 'board') {
    const deck = mesh(new THREE.BoxGeometry(1.7, 0.2, 4.2), 0x3ec1b5, 0, 0.55, 0);
    g.add(deck);
    g.add(mesh(new THREE.BoxGeometry(1.72, 0.05, 1.0), 0xffd166, 0, 0.67, 0.6));
    for (const [x, z] of [[-0.6, 1.4], [0.6, 1.4], [-0.6, -1.4], [0.6, -1.4]]) g.add(wheel(x, z, 0.25));
    seat = 0.65;
  } else if (id === 'leaf') {
    const shape = new THREE.Shape();
    const pts = 60;
    for (let i = 0; i <= pts; i++) {
      const t = (i / pts) * Math.PI * 2;
      // Five-lobed leaf outline.
      const r = 2.3 * (0.62 + 0.38 * Math.abs(Math.cos(t * 2.5))) * (0.75 + 0.25 * Math.cos(t));
      const x = Math.sin(t) * r * 0.9, y = Math.cos(t) * r;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    const leaf = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false }), 0xe8572f);
    leaf.rotation.x = -Math.PI / 2;
    leaf.position.y = 0.5;
    g.add(leaf);
    const vein = mesh(new THREE.BoxGeometry(0.08, 0.05, 3.6), 0xffb07a, 0, 0.68, 0);
    g.add(vein);
    const stem = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 6), 0x7a4a2a, 0, 0.55, -2.4);
    stem.rotation.x = Math.PI / 2;
    g.add(stem);
    seat = 0.6;
  } else if (id === 'box') {
    g.add(mesh(new THREE.BoxGeometry(2.6, 1.1, 3.0), 0xc8955c, 0, 0.55, 0));
    g.add(mesh(new THREE.BoxGeometry(2.3, 0.1, 2.7), 0x8a6238, 0, 1.06, 0));
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.02, 3.02), 0xd9c3a0, 0, 1.11, 0));
    for (const [x, z, rz, rx] of [[-1.5, 0, 0.6, 0], [1.5, 0, -0.6, 0], [0, 1.7, 0, -0.6], [0, -1.7, 0, 0.6]]) {
      const flap = mesh(new THREE.BoxGeometry(x ? 0.8 : 2.6, 0.06, z ? 0.8 : 3.0), 0xb98549, x * 0.95, 1.2, z * 0.95);
      flap.rotation.set(rx, 0, rz);
      g.add(flap);
    }
    seat = 0.3;
  } else if (id === 'mower') {
    g.add(mesh(new THREE.BoxGeometry(2.4, 0.8, 3.2), 0x3fae5a, 0, 0.9, 0));
    g.add(mesh(new THREE.BoxGeometry(2.6, 0.2, 3.4), 0x2e8c46, 0, 0.5, 0));
    const engine = mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.8, 12), 0x333040, 0, 1.6, 1.0);
    g.add(engine);
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8), 0xffd166, 0, 2.1, 1.0));
    for (const [x, z] of [[-1.2, 1.1], [1.2, 1.1], [-1.2, -1.1], [1.2, -1.1]]) g.add(wheel(x, z, 0.4));
    for (const s of [-1, 1]) {
      const bar = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6), 0x333040, s * 0.8, 1.9, -1.9);
      bar.rotation.x = -0.6;
      g.add(bar);
    }
    g.add(rot(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.7, 6), 0x333040, 0, 2.7, -2.45), 0, 0, Math.PI / 2));
    seat = 1.0;
  } else {
    g.add(mesh(new THREE.BoxGeometry(2.4, 0.9, 3.4), 0xe63946, 0, 0.95, 0));
    g.add(mesh(new THREE.BoxGeometry(2.0, 0.2, 3.0), 0x9e1b28, 0, 1.35, 0));
    g.add(mesh(new THREE.BoxGeometry(2.5, 0.12, 0.2), 0xffffff, 0, 1.3, 1.65));
    for (const [x, z] of [[-1.15, 1.1], [1.15, 1.1], [-1.15, -1.1], [1.15, -1.1]]) g.add(wheel(x, z, 0.45));
    const handle = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), 0x333040, 0, 1.2, 2.6);
    handle.rotation.x = 1.1;
    g.add(handle);
    seat = 1.0;
  }
  return { group: g, seat };
}

// Treats and weapon pickups: small, colourful, readable from a distance.
export function buildTreat(type) {
  const c = (TREATS[type] || WEAPONS[type]).color;
  const g = new THREE.Group();
  if (type === 'sprinkler') {
    g.add(mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.5, 12), c));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8), 0xdddddd, 0, 0.6, 0));
    const arm = mesh(new THREE.BoxGeometry(1.2, 0.12, 0.12), 0xdddddd, 0, 1.0, 0);
    g.add(arm);
  } else if (type === 'acorn') {
    g.add(mesh(sphere(0.5), c, 0, -0.1, 0));
    g.add(mesh(new THREE.SphereGeometry(0.55, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x6b3e1f, 0, 0.1, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 6), 0x6b3e1f, 0, 0.6, 0));
  } else if (type === 'bark') {
    const horn = mesh(new THREE.ConeGeometry(0.6, 1.3, 12, 1, true), c);
    horn.rotation.z = Math.PI / 2;
    g.add(horn);
    g.add(rot(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 8), 0x333040, -0.75, 0, 0), 0, 0, Math.PI / 2));
  } else if (type === 'speed') {
    const carrot = mesh(new THREE.ConeGeometry(0.45, 1.6, 8), c);
    carrot.rotation.x = Math.PI;
    g.add(carrot);
    for (const s of [-1, 0, 1]) {
      const leaf = mesh(new THREE.ConeGeometry(0.12, 0.6, 4), 0x5cc45c, s * 0.15, 1.0, 0);
      leaf.rotation.z = s * 0.4;
      g.add(leaf);
    }
  } else if (type === 'turn') {
    g.add(mesh(new THREE.TorusKnotGeometry(0.5, 0.15, 40, 6, 2, 3), c));
  } else if (type === 'glide') {
    const f = mesh(sphere(0.6), c);
    f.scale.set(0.35, 1.4, 0.15);
    f.rotation.z = 0.4;
    g.add(f);
  } else if (type === 'charge') {
    g.add(mesh(sphere(0.55), c));
    g.add(mesh(new THREE.ConeGeometry(0.15, 0.3, 5), 0x5cc45c, 0, 0.6, 0));
  } else if (type === 'power') {
    const shaft = mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.3, 8), c);
    shaft.rotation.z = Math.PI / 2;
    g.add(shaft);
    for (const x of [-0.7, 0.7]) for (const y of [-0.17, 0.17]) g.add(mesh(sphere(0.24), c, x, y, 0));
  } else {
    const ck = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.2, 16), c);
    ck.rotation.x = Math.PI / 2;
    g.add(ck);
    for (const [x, y] of [[0.2, 0.2], [-0.25, 0.05], [0.05, -0.3]]) g.add(mesh(sphere(0.09, 6, 4), 0x5a3a22, x, y, 0.1));
  }
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.2, 24),
    new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -1.4;
  g.add(glow);
  g.userData.glow = glow;
  if (WEAPONS[type]) {
    // Weapons get a spiky red-and-white halo so they stand out from treats.
    const star = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 1.9, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    star.position.y = 0;
    g.add(star);
    g.userData.weapon = star;
  }
  return g;
}

// Gift-wrapped crate. Ram it (or shoot it) to break it open.
export function buildCrate() {
  const g = new THREE.Group();
  const cols = [0x8fd3ff, 0xffb3c6, 0xb5e48c, 0xd7c4f2];
  const c = cols[Math.floor(Math.random() * cols.length)];
  g.add(mesh(new THREE.BoxGeometry(4, 4, 4), c, 0, 2, 0));
  g.add(mesh(new THREE.BoxGeometry(4.05, 4.05, 0.7), 0xffffff, 0, 2, 0));
  g.add(mesh(new THREE.BoxGeometry(0.7, 4.05, 4.05), 0xffffff, 0, 2, 0));
  for (const s of [-1, 1]) {
    const loop = mesh(new THREE.TorusGeometry(0.55, 0.18, 6, 12), 0xffffff, s * 0.5, 4.4, 0);
    loop.rotation.y = Math.PI / 2;
    loop.rotation.x = s * 0.5;
    g.add(loop);
  }
  return g;
}

export function buildTruck() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(6, 5.5, 9), 0xfff3f8, 0, 3.6, -1.5));
  g.add(mesh(new THREE.BoxGeometry(6.05, 1.2, 9.05), 0xff8fb1, 0, 2.2, -1.5));
  g.add(mesh(new THREE.BoxGeometry(5.6, 4, 3.5), 0xff8fb1, 0, 2.8, 4.5));
  g.add(mesh(new THREE.BoxGeometry(5.2, 1.6, 0.2), 0x8fd3ff, 0, 3.8, 6.3));
  for (const [x, z] of [[-2.8, 4], [2.8, 4], [-2.8, -4], [2.8, -4]]) g.add(wheel(x, z, 1.0));
  const cone = mesh(new THREE.ConeGeometry(1.4, 3.5, 12), 0xe0b07a, 0, 7.7, -1.5);
  cone.rotation.x = Math.PI;
  g.add(cone);
  g.add(mesh(sphere(1.6), 0xffc0d9, 0, 9.8, -1.5));
  g.add(mesh(sphere(0.35), 0xe63946, 0, 11.5, -1.5));
  return g;
}
