import * as THREE from 'three';
import { DT, ANIMALS, VEHICLES, TREATS } from '../../shared/constants.js';
import { groundHeight } from '../../shared/world.js';
import { Game } from '../../shared/sim.js';
import { buildScene } from './scene.js';
import { buildAnimal, buildVehicle, buildTreat } from './models.js';
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

const EMOJI = { corgi: '🐶', bunny: '🐰', raccoon: '🦝', duck: '🐥', cat: '🐱', board: '🛹', leaf: '🍁', wagon: '🛒' };
const pick = { animal: 'corgi', vehicle: 'board' };
function choices(el, table, key, sub) {
  for (const [id, info] of Object.entries(table)) {
    const b = document.createElement('button');
    b.className = 'choice' + (pick[key] === id ? ' on' : '');
    b.innerHTML = `<span class="em">${EMOJI[id]}</span>${info.name}<small>${sub(info)}</small>`;
    b.onclick = () => {
      pick[key] = id;
      el.querySelectorAll('.choice').forEach((c) => c.classList.remove('on'));
      b.classList.add('on');
    };
    el.appendChild(b);
  }
}
choices($('animals'), ANIMALS, 'animal', (a) => a.species);
choices($('vehicles'), VEHICLES, 'vehicle', (v) => v.blurb);

// ---- session: solo (local sim) or online (server sim) -----------------------

let session = null;

$('solo').onclick = () => {
  const game = new Game({ seed: (Math.random() * 1e9) | 0 });
  const myId = game.addRider({ name: $('name').value.trim() || undefined, ...pick });
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
    const net = await connect({ name: $('name').value.trim(), ...pick, url: params.get('server') });
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
  const { group: ride, seat } = buildVehicle(r.vehicle);
  tilt.add(ride);
  const animal = buildAnimal(r.animal);
  animal.position.y = seat;
  tilt.add(animal);
  const stars = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    s.position.set(Math.cos(i * 2.1) * 1.2, 0, Math.sin(i * 2.1) * 1.2);
    stars.add(s);
  }
  stars.position.y = seat + 3.4;
  tilt.add(stars);
  const tag = nameTag(r.name);
  tag.position.y = seat + 4.2;
  root.add(tag);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  scene.add(root, shadow);
  return { root, tilt, animal, stars, tag, shadow, pos: new THREE.Vector3(r.x, r.y, r.z), heading: r.heading, puffT: 0 };
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
    v.animal.position.y = (v.animal.userData.baseY ??= v.animal.position.y) + (r.air ? 0 : Math.abs(Math.sin(now * 12)) * Math.min(r.speed, 30) * 0.004);
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
    p.scale.multiplyScalar(1 + dt * 2);
    p.material.opacity = Math.max(0, p.userData.life * 1.6);
    if (p.userData.life <= 0) { scene.remove(p); p.material.dispose(); puffs.splice(i, 1); }
  }
}

function syncTreats(snap, now) {
  const seen = new Set();
  for (const t of snap.treats) {
    seen.add(t.id);
    let v = treatViews.get(t.id);
    if (!v) { v = buildTreat(t.type); v.scale.setScalar(1.6); treatViews.set(t.id, v); scene.add(v); }
    v.position.set(t.x, t.y + Math.sin(now * 3 + t.id) * 0.3, t.z);
    v.rotation.y = now * 2 + t.id;
  }
  for (const [id, v] of treatViews) {
    if (!seen.has(id)) { scene.remove(v); treatViews.delete(id); }
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

function handleEvents(events, snap) {
  const me = session.myId;
  const nameOf = (id) => snap.riders.find((r) => r.id === id)?.name ?? '?';
  for (const e of events) {
    if (e.type === 'treat' && e.id === me) {
      hud.toast(`+ ${TREATS[e.treat].label}`, '#' + TREATS[e.treat].color.toString(16).padStart(6, '0'));
      sfx.treat();
    } else if (e.type === 'boost' && e.id === me) sfx.boost();
    else if (e.type === 'hit' && (e.by === me || e.id === me)) {
      hud.toast(e.by === me ? `BONK! ${nameOf(e.id)}` : `Ouch! ${nameOf(e.by)} bonked you`, e.by === me ? '#ffe066' : '#ff8fb1');
      sfx.bonk();
    } else if (e.type === 'ko') {
      if (e.by === me) { hud.toast(`KO! ${nameOf(e.id)} is seeing stars`, '#ffe066'); sfx.ko(); }
      else if (e.id === me) { hud.toast('You got bonked out!', '#ff8fb1'); sfx.ko(); }
    } else if (e.type === 'phase') {
      if (e.phase === 'brawl') { hud.toast('Everyone to the Backyard Brawl!', '#fff'); sfx.ko(); }
      if (e.phase === 'roam') hud.toast('New round! Eat treats, get strong!', '#fff');
    } else if (e.type === 'land' && e.id === me) sfx.land();
  }
}

function showResults(snap) {
  const el = $('results');
  if (snap.phase !== 'results') { el.classList.add('hidden'); return; }
  if (!el.classList.contains('hidden')) return;
  const winner = snap.standings[0];
  el.innerHTML = `<h2>${EMOJI[winner.animal]} ${winner.name} rules the block!</h2><ol>${snap.standings
    .map((s) => `<li class="${s.id === session.myId ? 'me' : ''}">${EMOJI[s.animal]} ${s.name} <small>(${s.kos} KOs)</small></li>`)
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
      syncTreats(snap, now);
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
