// Builds the static neighbourhood from shared/world.js.
import * as THREE from 'three';
import { WORLD, BOUNDS, RING, ROAD_W, ARENA, hillHeight } from '../../shared/world.js';
import { mat } from './models.js';

export function buildScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ad8ff);
  scene.fog = new THREE.Fog(0x9ad8ff, 180, 520);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x88b070, 1.6));
  const sun = new THREE.DirectionalLight(0xfff2d6, 1.8);
  sun.position.set(120, 200, 80);
  scene.add(sun);

  scene.add(buildGround());
  scene.add(buildRoads());
  for (const h of WORLD.houses) scene.add(buildHouse(h));
  for (const t of WORLD.trees) scene.add(buildTree(t));
  for (const r of WORLD.ramps) scene.add(buildRamp(r));
  scene.add(buildFences());
  scene.add(buildArena());
  scene.add(buildClouds());
  return scene;
}

function buildGround() {
  const size = 1200, seg = 240;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, 100);
  const pos = geo.attributes.position;
  const colors = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = hillHeight(x, z);
    pos.setY(i, h);
    const n = Math.sin(x * 0.11) * Math.cos(z * 0.13) * 0.5 + 0.5;
    c.setHSL(0.27 + n * 0.04, 0.5, 0.52 + n * 0.06 + Math.min(h, 30) * 0.004);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true }));
}

function strip(x, z, w, d) {
  const geo = new THREE.PlaneGeometry(w, d, Math.ceil(w / 6), Math.ceil(d / 6));
  geo.rotateX(-Math.PI / 2);
  geo.translate(x, 0, z);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, hillHeight(pos.getX(i), pos.getZ(i)) + 0.08);
  geo.computeVertexNormals();
  return geo;
}

function buildRoads() {
  const g = new THREE.Group();
  const road = new THREE.MeshToonMaterial({ color: 0x7d7a8c });
  const line = new THREE.MeshToonMaterial({ color: 0xfff1b8 });
  const span = RING * 2 + ROAD_W;
  for (const s of [-1, 1]) {
    g.add(new THREE.Mesh(strip(0, s * RING, span, ROAD_W), road));
    g.add(new THREE.Mesh(strip(s * RING, 0, ROAD_W, span), road));
  }
  g.add(new THREE.Mesh(strip(0, 0, span, ROAD_W - 4), road));
  g.add(new THREE.Mesh(strip(0, 0, ROAD_W - 4, span), road));
  // Dashed centre lines.
  for (let t = -RING + 10; t < RING; t += 16) {
    for (const s of [-1, 0, 1]) {
      const zOff = s * RING;
      const a = new THREE.Mesh(strip(t, zOff, 7, 0.6), line);
      a.position.y = 0.02;
      g.add(a);
      const b = new THREE.Mesh(strip(zOff, t, 0.6, 7), line);
      b.position.y = 0.02;
      g.add(b);
    }
  }
  return g;
}

function buildHouse(h) {
  const g = new THREE.Group();
  g.position.set(h.x, 0, h.z);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(h.w, h.h, h.d), mat(h.color));
  walls.position.y = h.h / 2;
  g.add(walls);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(h.w + 1.6, 1.0, h.d + 1.6), mat(h.roof));
  roof.position.y = h.h + 0.2;
  g.add(roof);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), mat(0xb5655a));
  chimney.position.set(h.w / 2 - 3, h.h + 1.5, -h.d / 2 + 3);
  g.add(chimney);
  // Windows and door on all four sides.
  const win = mat(0x8fd3ff), door = mat(0x8a5a44), trim = mat(0xffffff);
  for (const [ax, az, len, rot] of [[0, h.d / 2, h.w, 0], [0, -h.d / 2, h.w, Math.PI], [h.w / 2, 0, h.d, Math.PI / 2], [-h.w / 2, 0, h.d, -Math.PI / 2]]) {
    const side = new THREE.Group();
    side.position.set(ax, 0, az);
    side.rotation.y = rot;
    g.add(side);
    for (const wx of [-len / 4, len / 4]) {
      const fr = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.6, 0.3), trim);
      fr.position.set(wx, h.h * 0.62, 0.1);
      side.add(fr);
      const w = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 0.4), win);
      w.position.set(wx, h.h * 0.62, 0.12);
      side.add(w);
    }
    if (rot === 0) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4.6, 0.4), door);
      d.position.set(0, 2.3, 0.12);
      side.add(d);
    }
  }
  return g;
}

function buildTree(t) {
  const g = new THREE.Group();
  const y = hillHeight(t.x, t.z);
  g.position.set(t.x, y, t.z);
  g.scale.setScalar(t.s);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 6, 8), mat(0x8a5a3c));
  trunk.position.y = 3;
  g.add(trunk);
  const leafColors = [0x6cc26c, 0x5bb36a, 0x8fd16b, 0xf2a3c4];
  const col = leafColors[Math.abs(Math.floor(t.x * 7 + t.z * 3)) % leafColors.length];
  for (const [x, yy, z, r] of [[0, 8, 0, 3.6], [1.8, 6.8, 0.8, 2.4], [-1.6, 7, -0.6, 2.5]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat(col));
    b.position.set(x, yy, z);
    g.add(b);
  }
  return g;
}

function wedgeGeometry(l, w, h) {
  const A = [-w / 2, 0, -l / 2], B = [w / 2, 0, -l / 2], C = [-w / 2, 0, l / 2], D = [w / 2, 0, l / 2];
  const E = [-w / 2, h, l / 2], F = [w / 2, h, l / 2];
  const tris = [A, E, F, A, F, B, C, D, F, C, F, E, A, C, E, B, F, D];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  geo.computeVertexNormals();
  return geo;
}

function buildRamp(r) {
  const g = new THREE.Group();
  g.position.set(r.x, hillHeight(r.x, r.z), r.z);
  g.rotation.y = r.dir;
  g.add(new THREE.Mesh(wedgeGeometry(r.len, r.wid, r.h), mat(0xffb347)));
  // Stripes so the ramp reads as a ramp.
  const stripe = mat(0xffffff);
  for (let i = 1; i < 4; i++) {
    const t = i / 4;
    const s = new THREE.Mesh(new THREE.BoxGeometry(r.wid * 0.98, 0.1, 0.8), stripe);
    s.position.set(0, t * r.h + 0.1, -r.len / 2 + t * r.len);
    s.rotation.x = -Math.atan2(r.h, r.len);
    g.add(s);
  }
  return g;
}

function picketRun(g, x1, z1, x2, z2) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.floor(len / 3);
  const picket = new THREE.BoxGeometry(0.8, 3, 0.4);
  const inst = new THREE.InstancedMesh(picket, mat(0xffffff), n);
  const m = new THREE.Matrix4();
  const ang = Math.atan2(x2 - x1, z2 - z1);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
    m.makeRotationY(ang);
    m.setPosition(x, hillHeight(x, z) + 1.5, z);
    inst.setMatrixAt(i, m);
  }
  g.add(inst);
}

function buildFences() {
  const g = new THREE.Group();
  const b = BOUNDS;
  picketRun(g, -b, -b, b, -b);
  picketRun(g, b, -b, b, b);
  picketRun(g, b, b, -b, b);
  picketRun(g, -b, b, -b, -b);
  return g;
}

function buildArena() {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA.r, 48), mat(0xd9b38c));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(ARENA.x, 0.05, ARENA.z);
  g.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(ARENA.r - 6, ARENA.r - 4, 48), mat(0xffffff));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(ARENA.x, 0.1, ARENA.z);
  g.add(ring);
  const n = 48;
  for (let i = 0; i < n; i++) {
    const a1 = (i / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2;
    picketRun(g,
      ARENA.x + Math.sin(a1) * ARENA.r, ARENA.z + Math.cos(a1) * ARENA.r,
      ARENA.x + Math.sin(a2) * ARENA.r, ARENA.z + Math.cos(a2) * ARENA.r);
  }
  // Bunting poles.
  const flagCols = [0xff8fb1, 0xffd166, 0x8fd3ff, 0xb5e48c];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 14, 6), mat(0xffffff));
    pole.position.set(ARENA.x + Math.sin(a) * (ARENA.r + 3), 7, ARENA.z + Math.cos(a) * (ARENA.r + 3));
    g.add(pole);
    const flag = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3, 3), mat(flagCols[i % 4]));
    flag.position.set(pole.position.x, 12.5, pole.position.z);
    flag.rotation.z = Math.PI;
    g.add(flag);
  }
  return g;
}

function buildClouds() {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 18; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(8 + k * 2, 10, 8), m);
      b.position.set(k * 10 - 15, (k % 2) * 3, (k % 3) * 4);
      c.add(b);
    }
    const a = (i / 18) * Math.PI * 2;
    c.position.set(Math.cos(a) * 320, 110 + (i % 4) * 15, Math.sin(a) * 320 + 100);
    g.add(c);
  }
  return g;
}
