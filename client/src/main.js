import * as THREE from 'three';
import { DT, VEHICLES, TREATS, WEAPONS, FINALS } from '../../shared/constants.js';
import { groundHeight } from '../../shared/world.js';
import { Game } from '../../shared/sim.js';
import { buildScene } from './scene.js';
import { buildAnimal, buildVehicle, buildTreat, buildCrate, buildTruck } from './models.js';
import { createMenu, EMOJI } from './menu.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { connect } from './net.js';
import { sfx } from './sound.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = buildScene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.5, 900);
const input = createInput(canvas);
const hud = createHud();

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---- menu ------------------------------------------------------------------

const menu = createMenu();
const pick = menu.pick;
const look = () => ({ animal: pick.animal, tint: pick.tint, hat: pick.hat, name: $('name').value.trim() || undefined });

// ---- session: solo (local sim) or online (server sim) -----------------------

let session = null;

$('solo').onclick = () => {
  const game = new Game({ seed: (Math.random() * 1e9) | 0 });
  const myId = game.addRider(look());
  game.fillBots(6);
  let acc = 0;
  session = {
    myId,
    game,
    update(dt, inp) {
      game.setInput(myId, inp);
      acc = Math.min(acc + dt, 0.25);
      while (acc >= DT) { game.step(); acc -= DT; }
      return { snap: game.snapshot(), events: game.drainEvents() };
    },
  };
  start();
};

$('online').onclick = async () => {
  $('netmsg').textContent = 'Connecting…';
  try {
    const params = new URLSearchParams(location.search);
    const net = await connect({ ...look(), url: params.get('server') });
    session = {
      myId: net.myId,
      update(dt, inp) {
        net.sendInput(inp);
        if (net.closed) $('netmsg').textContent = 'Disconnected from server.';
        return { snap: net.latest, events: net.drainEvents() };
      },
    };
    start();
  } catch (e) {
    $('netmsg').textContent = `${e.message}. Start one with "npm run server".`;
  }
};

function start() {
  sfx.unlock();
  menu.stop();
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  canvas.focus();
}

// ---- rider and treat views ---------------------------------------------------

const riderViews = new Map();
const treatViews = new Map();
const puffs = [];
const puffGeo = new THREE.SphereGeometry(0.6, 6, 4);
const shadowGeo = new THREE.CircleGeometry(2.8, 16);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });

function nameTag(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px Trebuchet MS, sans-serif';
  g.textAlign = 'center';
  g.lineWidth = 6; g.strokeStyle = 'rgba(59,42,74,.8)';
  g.strokeText(text, 128, 44);
  g.fillStyle = '#fff'; g.fillText(text, 128, 44);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.set(7, 1.75, 1);
  return s;
}

function makeRiderView(r) {
  const root = new THREE.Group();
  root.scale.setScalar(1.45); // a touch chunkier than the physics radius reads better
  const tilt = new THREE.Group();
  root.add(tilt);
  const rideSlot = new THREE.Group();
  tilt.add(rideSlot);
  const animal = buildAnimal(r.animal, r);
  tilt.add(animal);
  const aura = new THREE.Mesh(
    new THREE.TorusGeometry(9 / 1.45, 0.25, 6, 40),
    new THREE.MeshBasicMaterial({ color: WEAPONS.sprinkler.color, transparent: true, opacity: 0.6 }),
  );
  aura.rotation.x = Math.PI / 2;
  aura.position.y = 1;
  for (let i = 0; i < 12; i++) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4), aura.material);
    const a = (i / 12) * Math.PI * 2;
    drop.position.set(Math.cos(a) * 9 / 1.45, Math.sin(a) * 9 / 1.45, 0);
    aura.add(drop);
  }
  root.add(aura);
  const stars = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    s.position.set(Math.cos(i * 2.1) * 1.2, 0, Math.sin(i * 2.1) * 1.2);
    stars.add(s);
  }
  tilt.add(stars);
  const tag = nameTag(r.name);
  root.add(tag);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  scene.add(root, shadow);
  const v = { root, tilt, rideSlot, animal, stars, tag, aura, shadow, pos: new THREE.Vector3(r.x, r.y, r.z), heading: r.heading, puffT: 0 };
  setRide(v, r.vehicle);
  return v;
}

// Swap the ride model under a rider (they hopped on something new or got wrecked).
function setRide(v, vehicle) {
  v.vehicle = vehicle;
  v.rideSlot.clear();
  const { group, seat } = buildVehicle(vehicle);
  v.rideSlot.add(group);
  v.seat = seat;
  v.animal.position.y = seat;
  v.stars.position.y = seat + 3.4;
  v.tag.position.y = seat + 4.2;
}

function lerpAngle(a, b, t) {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}

function syncRiders(snap, dt, now) {
  const seen = new Set();
  for (const r of snap.riders) {
    seen.add(r.id);
    let v = riderViews.get(r.id);
    if (!v) { v = makeRiderView(r); riderViews.set(r.id, v); }
    if (v.vehicle !== r.vehicle) setRide(v, r.vehicle);
    v.aura.visible = r.weapon?.type === 'sprinkler';
    v.aura.rotation.z = now * 4;
    // Smooth toward the authoritative state (a no-op in solo, helps online).
    const k = Math.min(1, dt * 18);
    const target = new THREE.Vector3(r.x, r.y, r.z);
    if (v.pos.distanceTo(target) > 30) v.pos.copy(target); else v.pos.lerp(target, k);
    v.heading = lerpAngle(v.heading, r.heading, k);
    v.root.visible = v.shadow.visible = !r.out;
    v.root.position.copy(v.pos);
    v.root.rotation.y = v.heading;
    v.tag.visible = r.id !== session.myId;

    // Bank into turns, pitch when diving, squish while charging.
    const steer = r.id === session.myId ? input.read().steer : 0;
    v.tilt.rotation.z = THREE.MathUtils.lerp(v.tilt.rotation.z, -steer * 0.25, k);
    v.tilt.rotation.x = THREE.MathUtils.lerp(v.tilt.rotation.x, r.diving ? 0.45 : r.air ? -0.1 : 0, k);
    v.animal.scale.set(1 + r.charge * 0.15, 1 - r.charge * 0.3, 1 + r.charge * 0.15);
    v.animal.position.y = v.seat + (r.air ? 0 : Math.abs(Math.sin(now * 12)) * Math.min(r.speed, 30) * 0.004);
    v.stars.visible = r.stun;
    v.stars.rotation.y = now * 6;

    const gh = groundHeight(v.pos.x, v.pos.z);
    v.shadow.position.set(v.pos.x, gh + 0.15, v.pos.z);
    const s = Math.max(0.4, 1 - (v.pos.y - gh) * 0.03);
    v.shadow.scale.setScalar(s);

    v.puffT -= dt;
    if ((r.boost || r.charge > 0.95) && v.puffT <= 0 && !r.out) {
      v.puffT = r.boost ? 0.03 : 0.12;
      const p = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: r.boost ? 0xfff1b8 : 0xffb347, transparent: true, opacity: 0.8 }));
      p.position.copy(v.pos).add(new THREE.Vector3(-Math.sin(v.heading) * 2.5, 0.8, -Math.cos(v.heading) * 2.5));
      p.userData.life = 0.5;
      scene.add(p);
      puffs.push(p);
    }
  }
  for (const [id, v] of riderViews) {
    if (!seen.has(id)) { scene.remove(v.root, v.shadow); riderViews.delete(id); }
  }
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.userData.life -= dt;
    if (p.userData.vx !== undefined) {
      p.position.x += p.userData.vx * dt; p.position.y += p.userData.vy * dt; p.position.z += p.userData.vz * dt;
      p.userData.vy -= 30 * dt;
    }
    p.scale.multiplyScalar(1 + dt * 2);
    p.material.opacity = Math.max(0, p.userData.life * 1.6);
    if (p.userData.life <= 0) { scene.remove(p); p.material.dispose(); puffs.splice(i, 1); }
  }
}

// Keep a pool of meshes in sync with a list of entities by id.
function syncPool(pool, list, make, place) {
  const seen = new Set();
  for (const e of list) {
    seen.add(e.id);
    let v = pool.get(e.id);
    if (!v) { v = make(e); pool.set(e.id, v); scene.add(v); }
    place(v, e);
  }
  for (const [id, v] of pool) {
    if (!seen.has(id)) { scene.remove(v); pool.delete(id); }
  }
}

const crateViews = new Map(), parkedViews = new Map(), shotViews = new Map(), hazardViews = new Map();
const VEHICLE_EMOJI = { board: '🛹', leaf: '🍁', wagon: '🛒', mower: '🚜', box: '📦' };
let truckView = null;
const acornGeo = new THREE.SphereGeometry(0.6, 8, 6);
const acornMat = new THREE.MeshToonMaterial({ color: 0x8b5a2b });

function syncWorldBits(snap, now) {
  syncPool(treatViews, snap.items, (t) => { const v = buildTreat(t.type); v.scale.setScalar(1.6); return v; }, (v, t) => {
    v.position.set(t.x, t.y + Math.sin(now * 3 + t.id) * 0.3, t.z);
    v.rotation.y = now * (t.kind === 'weapon' ? 4 : 2) + t.id;
  });
  syncPool(crateViews, snap.crates, () => buildCrate(), (v, c) => {
    v.position.set(c.x, c.y, c.z);
    const shake = c.hit ? Math.sin(now * 60) * 0.12 : 0;
    v.rotation.set(shake, c.id, shake);
  });
  syncPool(parkedViews, snap.parked, (p) => {
    const g = new THREE.Group();
    const { group } = buildVehicle(p.vehicle);
    group.scale.setScalar(1.45);
    group.rotation.y = p.heading;
    g.add(group);
    const ring = new THREE.Mesh(new THREE.RingGeometry(4, 4.6, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.2;
    g.add(ring);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 4), new THREE.MeshBasicMaterial({ color: 0xff8fb1 }));
    arrow.rotation.x = Math.PI;
    g.add(arrow);
    const tag = nameTag(`${VEHICLE_EMOJI[p.vehicle]} ${VEHICLES[p.vehicle].name}`);
    tag.position.y = 7;
    g.add(tag);
    g.userData = { arrow, ring };
    return g;
  }, (v, p) => {
    v.position.set(p.x, p.y, p.z);
    v.userData.arrow.position.y = 5 + Math.sin(now * 4 + p.id) * 0.5;
    v.userData.ring.scale.setScalar(1 + Math.sin(now * 3) * 0.08);
  });
  syncPool(shotViews, snap.shots, () => new THREE.Mesh(acornGeo, acornMat), (v, s) => v.position.set(s.x, s.y, s.z));
  syncPool(hazardViews, snap.hazards, () => {
    const g = new THREE.Group();
    const warn = new THREE.Mesh(new THREE.RingGeometry(5.5, 7, 32), new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    warn.rotation.x = -Math.PI / 2;
    warn.position.y = 0.3;
    g.add(warn);
    const nut = buildTreat('acorn');
    nut.scale.setScalar(4);
    nut.children.forEach((c) => { if (c.geometry?.type === 'RingGeometry') c.visible = false; });
    g.add(nut);
    g.userData = { nut, warn };
    return g;
  }, (v, h) => {
    v.position.set(h.x, h.y, h.z);
    v.userData.nut.position.y = h.t * 45 + 2;
    v.userData.warn.material.opacity = 0.3 + (1.3 - h.t) * 0.5;
  });
  if (snap.truck && !truckView) { truckView = buildTruck(); scene.add(truckView); }
  if (!snap.truck && truckView) { scene.remove(truckView); truckView = null; }
  if (truckView) {
    truckView.position.set(snap.truck.x, 0, snap.truck.z);
    truckView.rotation.y = snap.truck.heading;
  }
}

function burst(x, y, z, color, n = 12, size = 1) {
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    p.position.set(x, y, z);
    p.scale.setScalar(size);
    const a = (i / n) * Math.PI * 2;
    p.userData = { life: 0.6, vx: Math.sin(a) * 18, vy: 8 + Math.random() * 8, vz: Math.cos(a) * 18 };
    scene.add(p);
    puffs.push(p);
  }
}

// ---- camera ------------------------------------------------------------------

const camPos = new THREE.Vector3(0, 60, 120);
const camLook = new THREE.Vector3();
function updateCamera(snap, dt) {
  let me = snap.riders.find((r) => r.id === session.myId);
  if (!me || me.out) me = snap.riders.find((r) => !r.out) || me;
  if (!me) return;
  const v = riderViews.get(me.id);
  const h = v.heading;
  const fwd = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
  const back = 13 - me.charge * 2;
  const want = v.pos.clone().addScaledVector(fwd, -back).add(new THREE.Vector3(0, 5.5 + (me.air ? 2 : 0), 0));
  // Don't let houses or hills get between the camera and the rider: march
  // out from the rider and stop just before the first blocked sample.
  const eye = v.pos.clone().add(new THREE.Vector3(0, 3, 0));
  const p = new THREE.Vector3();
  for (let i = 1; i <= 12; i++) {
    p.lerpVectors(eye, want, i / 12);
    if (groundHeight(p.x, p.z) > p.y - 1) { want.lerpVectors(eye, want, (i - 1) / 12); break; }
  }
  const k = Math.min(1, dt * 6);
  if (camPos.distanceTo(want) > 60) camPos.copy(want); else camPos.lerp(want, k);
  camLook.lerp(v.pos.clone().addScaledVector(fwd, 6).add(new THREE.Vector3(0, 2, 0)), Math.min(1, dt * 10));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  camera.fov = THREE.MathUtils.lerp(camera.fov, 68 + Math.min(me.speed, 60) * 0.25, k);
  camera.updateProjectionMatrix();
}

// ---- events ------------------------------------------------------------------

const EVENT_TEXT = {
  treatRain: (e) => `🍬 Treat Shower over ${e.where}!`,
  iceCream: () => '🍦 The Ice Cream Truck is cruising the ring road!',
  acornStorm: () => '🌰 Acorn Storm! Dodge the red circles!',
  garbageDay: () => '🗑️ Garbage Day! Crates everywhere!',
  yardSale: (e) => `🏷️ Yard Sale at ${e.where}! Free rides!`,
};
const hexc = (c) => '#' + c.toString(16).padStart(6, '0');

function handleEvents(events, snap) {
  const me = session.myId;
  const nameOf = (id) => snap.riders.find((r) => r.id === id)?.name ?? '?';
  const rider = (id) => riderViews.get(id);
  for (const e of events) {
    if (e.type === 'treat' && e.id === me) {
      hud.toast(`+ ${TREATS[e.treat].label}`, hexc(TREATS[e.treat].color));
      sfx.treat();
    } else if (e.type === 'weapon' && e.id === me) {
      hud.toast(`⚡ ${WEAPONS[e.weapon].label}! Go get 'em`, hexc(WEAPONS[e.weapon].color));
      sfx.ko();
    } else if (e.type === 'hop') {
      const v = rider(e.id);
      if (v) burst(v.pos.x, v.pos.y + 2, v.pos.z, 0xffffff, 10, 0.7);
      if (e.id === me) { hud.toast(`Hopped on a ${VEHICLES[e.ride].name}!`, '#fff'); sfx.treat(); }
    } else if (e.type === 'boost' && e.id === me) sfx.boost();
    else if (e.type === 'hit' && (e.by === me || e.id === me)) {
      if (e.by === me) hud.toast(`BONK! ${nameOf(e.id)}`, '#ffe066');
      else hud.toast(e.by ? `Ouch! ${nameOf(e.by)} got you` : 'Ouch!', '#ff8fb1');
      sfx.bonk();
    } else if (e.type === 'wreck') {
      const v = rider(e.id);
      if (v) burst(v.pos.x, v.pos.y + 1, v.pos.z, 0xc8955c, 16, 1.2);
      if (e.by === me && !VEHICLES[e.ride].starter) { hud.toast(`💥 You wrecked ${nameOf(e.id)}'s ${VEHICLES[e.ride].name}!`, '#ffe066'); sfx.ko(); }
      else if (e.id === me) { hud.toast(VEHICLES[e.ride].starter ? 'Bonked! You dropped some treats' : 'Your ride got wrecked! Back in the box…', '#ff8fb1'); sfx.ko(); }
    } else if (e.type === 'ko') {
      if (e.by === me) { hud.toast(`KO! ${nameOf(e.id)} is out`, '#ffe066'); sfx.ko(); }
      else if (e.id === me) { hud.toast('You got bonked out!', '#ff8fb1'); sfx.ko(); }
    } else if (e.type === 'crateBreak') {
      burst(e.x, 3, e.z, 0xffffff, 14, 1);
      if (e.id === me) sfx.bonk();
    } else if (e.type === 'impact') {
      burst(e.x, groundHeight(e.x, e.z) + 1, e.z, 0x8b5a2b, 10, 1.2);
      const v = rider(me);
      if (v && v.pos.distanceTo(new THREE.Vector3(e.x, v.pos.y, e.z)) < 60) sfx.land();
    } else if (e.type === 'bark') {
      const v = rider(e.id);
      if (v) {
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        for (let i = 0; i < 9; i++) {
          const a = v.heading + (i - 4) * 0.13;
          const p = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9 }));
          p.position.set(v.pos.x + fx * 3, v.pos.y + 2, v.pos.z + fz * 3);
          p.userData = { life: 0.45, vx: Math.sin(a) * 50, vy: 0, vz: Math.cos(a) * 50 };
          scene.add(p); puffs.push(p);
        }
        if (e.id === me) sfx.bonk();
      }
    } else if (e.type === 'event') {
      hud.toast(EVENT_TEXT[e.event](e), '#fff');
      sfx.ko();
    } else if (e.type === 'finalSoon') {
      hud.toast(`🏁 Final event: ${FINALS[e.final].label}! ${FINALS[e.final].blurb}`, '#ffd166');
    } else if (e.type === 'phase') {
      if (e.phase === 'final') { hud.toast(`${FINALS[e.final].label}! ${FINALS[e.final].blurb}`, '#fff'); sfx.ko(); }
      if (e.phase === 'roam') hud.toast('New round! You start in a box: find a ride!', '#fff');
    } else if (e.type === 'leapLand') {
      if (e.id === me) { hud.toast(`Landed! ${e.dist}m`, '#ffe066'); sfx.land(); }
    } else if (e.type === 'land' && e.id === me) sfx.land();
  }
}

function showResults(snap) {
  const el = $('results');
  if (snap.phase !== 'results') { el.classList.add('hidden'); return; }
  if (!el.classList.contains('hidden')) return;
  const winner = snap.standings[0];
  const unit = { brawl: (s) => `${s.score} KOs`, leap: (s) => `${s.score}m`, hill: (s) => `${s.score}s on the hill` }[snap.finalType];
  el.innerHTML = `<h2>${EMOJI[winner.animal]} ${winner.name} wins ${FINALS[snap.finalType].label}!</h2><ol>${snap.standings
    .map((s) => `<li class="${s.id === session.myId ? 'me' : ''}">${EMOJI[s.animal]} ${s.name} <small>(${unit(s)})</small></li>`)
    .join('')}</ol><p>Next round starts soon…</p>`;
  el.classList.remove('hidden');
}

// ---- main loop -----------------------------------------------------------------

let last = performance.now();
function frame(nowMs) {
  const dt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  const now = nowMs / 1000;
  if (session) {
    const { snap, events } = session.update(dt, input.read());
    if (snap) {
      syncRiders(snap, dt, now);
      syncWorldBits(snap, now);
      updateCamera(snap, dt);
      handleEvents(events, snap);
      hud.update(snap, snap.riders.find((r) => r.id === session.myId));
      showResults(snap);
    }
  } else {
    // Menu backdrop: slow orbit over the neighbourhood.
    camera.position.set(Math.cos(now * 0.08) * 230, 110, Math.sin(now * 0.08) * 230);
    camera.lookAt(0, 0, 0);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for debugging and automated tests.
window.__far = { get session() { return session; }, scene, camera };
