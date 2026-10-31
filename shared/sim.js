// Authoritative game simulation. Pure JS with a fixed timestep and a seeded
// RNG, so the same code runs in the browser (solo play) and on the server
// (multiplayer). Nothing in here touches rendering or networking.
import {
  DT, GRAVITY, RIDER_RADIUS, MAX_STAT, STATS, TREATS, VEHICLES, SPAWN_RIDES, WEAPONS,
  EVENTS, FINALS, ANIMALS, HATS, effective, derive,
  ROAM_SECONDS, FINAL_COUNTDOWN, FINAL_ANNOUNCE_AT, RESULTS_SECONDS,
  MAX_TREATS, MAX_CRATES, MAX_PARKED_RIDES, EVENT_GAP,
} from './constants.js';
import {
  WORLD, BOUNDS, ARENA, HILL_ZONE, LEAP, LEAP_RAMP_END, SPOTS, groundHeight, ringPoint,
} from './world.js';
import { makeRng } from './rng.js';
import { botThink } from './ai.js';

const STEP_UP = 2.2;   // tallest ledge you can roll up without being blocked
const TREAT_TYPES = Object.keys(TREATS);
const WEAPON_TYPES = Object.keys(WEAPONS);
const EVENT_TYPES = Object.keys(EVENTS);
const FINAL_TYPES = Object.keys(FINALS);
const CRATE_RADIUS = 2.6;
const CRATE_HP = 30;
const HOP_RADIUS = 5;

export class Game {
  constructor({ seed = 1 } = {}) {
    this.rng = makeRng(seed);
    this.riders = new Map();
    this.items = new Map();       // treats and weapon pickups on the ground
    this.crates = new Map();
    this.parked = new Map();      // rides waiting for someone to hop on
    this.shots = new Map();       // acorn projectiles
    this.hazards = new Map();     // falling acorns during the storm
    this.truck = null;
    this.event = null;
    this.nextId = 1;
    this.tick = 0;
    this.events = [];
    this.setPhase('roam');
  }

  id() { return this.nextId++; }

  // ---- lifecycle -----------------------------------------------------------

  setPhase(phase) {
    this.phase = phase;
    if (phase === 'roam') {
      this.timer = ROAM_SECONDS;
      this.finalType = this.rng.pick(FINAL_TYPES);
      this.finalAnnounced = false;
      this.nextEventIn = this.rng.range(...EVENT_GAP) * 0.6;
      this.clearField();
      for (let i = 0; i < MAX_TREATS; i++) this.spawnItem();
      for (let i = 0; i < MAX_CRATES; i++) this.spawnCrate();
      for (let i = 0; i < MAX_PARKED_RIDES; i++) this.spawnParked();
      for (const r of this.riders.values()) this.resetRider(r, true);
    } else if (phase === 'final') {
      this.timer = FINALS[this.finalType].seconds + FINAL_COUNTDOWN;
      this.clearField();
      const list = [...this.riders.values()];
      list.forEach((r, i) => this.placeForFinal(r, i, list.length));
    } else if (phase === 'results') {
      this.timer = RESULTS_SECONDS;
      this.standings = this.rankFinal();
    }
    this.events.push({ type: 'phase', phase, final: this.finalType });
  }

  clearField() {
    this.items.clear(); this.crates.clear(); this.parked.clear();
    this.shots.clear(); this.hazards.clear();
    this.truck = null; this.event = null;
  }

  placeForFinal(r, i, n) {
    r.speed = 0; r.vy = 0; r.kx = 0; r.kz = 0; r.charge = 0; r.boost = 0;
    r.out = false; r.stun = 0; r.weapon = null; r.score = 0; r.leap = null; r.air = false;
    r.hp = derive(effective(r.stats, r.vehicle), r.vehicle).maxHp;
    if (this.finalType === 'leap') {
      const lane = n > 1 ? (i / (n - 1) - 0.5) : 0;
      r.x = LEAP.x + lane * (LEAP.wid - 16);
      r.z = LEAP.startZ;
      r.heading = 0;
    } else {
      const a = (i / n) * Math.PI * 2;
      r.x = ARENA.x + Math.sin(a) * (ARENA.r - 12);
      r.z = ARENA.z + Math.cos(a) * (ARENA.r - 12);
      r.heading = a + Math.PI;
    }
    r.y = groundHeight(r.x, r.z);
  }

  addRider({ name, animal = 'corgi', hat = 'none', tint = 0, bot = false }) {
    const id = this.id();
    const r = {
      id, bot,
      name: String(name || ANIMALS[animal]?.name || 'Rider').slice(0, 14),
      animal: ANIMALS[animal] ? animal : 'corgi',
      hat: HATS.includes(hat) ? hat : 'none',
      tint: Math.max(0, Math.min(3, tint | 0)),
      input: { steer: 0, button: false },
      ai: bot ? { t: 0, tx: 0, tz: 0, hold: 0, stuck: 0 } : null,
    };
    this.resetRider(r, true);
    if (this.phase === 'final') this.placeForFinal(r, 0, 1);
    if (this.phase === 'final' && this.finalType === 'brawl') r.out = true;
    this.riders.set(id, r);
    return id;
  }

  removeRider(id) { this.riders.delete(id); }

  // Top the match up with bots, preferring animals nobody is riding yet.
  fillBots(total) {
    const ids = Object.keys(ANIMALS);
    while (this.riders.size < total) {
      const used = [...this.riders.values()].map((r) => r.animal);
      const free = ids.filter((a) => !used.includes(a));
      const animal = free.length ? free[0] : this.rng.pick(ids);
      const name = ANIMALS[animal].name + (free.length ? '' : ' Jr.');
      this.addRider({
        name, animal, bot: true,
        hat: this.rng.pick(HATS), tint: this.rng() < 0.5 ? 0 : Math.floor(this.rng() * 4),
      });
    }
  }

  // Drop one bot to make room for a human. Returns true if one was removed.
  removeOneBot() {
    for (const r of this.riders.values()) {
      if (r.bot) { this.riders.delete(r.id); return true; }
    }
    return false;
  }

  setInput(id, input) {
    const r = this.riders.get(id);
    if (!r) return;
    r.input.steer = Math.max(-1, Math.min(1, Number(input.steer) || 0));
    r.input.button = !!input.button;
  }

  resetRider(r, fresh) {
    if (fresh) {
      r.stats = Object.fromEntries(STATS.map((s) => [s, 0]));
      r.kos = 0; r.treatsEaten = 0; r.ridesWrecked = 0;
      r.vehicle = 'box';
    }
    const spot = this.randomOpenSpot();
    r.x = spot.x; r.z = spot.z; r.y = groundHeight(r.x, r.z);
    r.heading = this.rng.range(0, Math.PI * 2);
    r.speed = 0; r.vy = 0; r.kx = 0; r.kz = 0;
    r.charge = 0; r.boost = 0; r.stun = 0; r.air = false; r.diving = false;
    r.hp = this.maxHp(r);
    r.out = false; r.hitCooldown = 0; r.hopCooldown = 0;
    r.weapon = null; r.score = 0; r.leap = null;
  }

  eff(r) { return effective(r.stats, r.vehicle); }
  maxHp(r) { return derive(this.eff(r), r.vehicle).maxHp; }

  randomOpenSpot(cx = 0, cz = 0, radius = BOUNDS - 15) {
    for (let i = 0; i < 50; i++) {
      const x = cx + this.rng.range(-radius, radius);
      const z = cz + this.rng.range(-radius, radius);
      if (Math.abs(x) > BOUNDS - 10 || Math.abs(z) > BOUNDS - 10) continue;
      const nearTree = WORLD.trees.some((t) => Math.hypot(t.x - x, t.z - z) < 6);
      if (groundHeight(x, z) < 1 && !nearTree) return { x, z };
    }
    return { x: 0, z: 0 };
  }

  // ---- spawning --------------------------------------------------------------

  spawnItem(x, z, type) {
    if (x === undefined) {
      // Most treats on the street, some on rooftops and the hill for gliders.
      x = this.rng.range(-BOUNDS + 10, BOUNDS - 10);
      z = this.rng.range(-BOUNDS + 10, BOUNDS - 10);
    }
    x = Math.max(-BOUNDS + 4, Math.min(BOUNDS - 4, x));
    z = Math.max(-BOUNDS + 4, Math.min(BOUNDS - 4, z));
    type ??= this.rng() < 0.06 ? this.rng.pick(WEAPON_TYPES) : this.rng.pick(TREAT_TYPES);
    const id = this.id();
    const kind = WEAPONS[type] ? 'weapon' : 'treat';
    this.items.set(id, { id, kind, type, x, z, y: groundHeight(x, z) + 1.6 });
  }

  spawnCrate(x, z) {
    if (x === undefined) ({ x, z } = this.randomOpenSpot());
    const id = this.id();
    this.crates.set(id, { id, x, z, y: groundHeight(x, z), hp: CRATE_HP, hit: 0 });
  }

  spawnParked(x, z, vehicle) {
    if (x === undefined) ({ x, z } = this.randomOpenSpot());
    vehicle ??= this.rng.pick(SPAWN_RIDES);
    const id = this.id();
    this.parked.set(id, { id, vehicle, x, z, y: groundHeight(x, z), heading: this.rng.range(0, 6.28) });
  }

  // ---- main step -----------------------------------------------------------

  step() {
    this.tick++;
    this.timer -= DT;

    const final = this.phase === 'final';
    const live = this.phase === 'roam' || (final && this.timer < FINALS[this.finalType].seconds);
    for (const r of this.riders.values()) {
      if (r.bot) botThink(this, r);
      if (live && !r.out) this.moveRider(r);
    }
    if (live) {
      if (!(final && this.finalType === 'leap')) this.collideRiders();
      this.collectItems();
      this.crateHits();
      this.hopOn();
      this.updateWeapons();
      this.updateShots();
    }

    if (this.phase === 'roam') {
      this.updateEvent();
      if (this.items.size < MAX_TREATS && this.tick % 45 === 0) this.spawnItem();
      if (this.crates.size < MAX_CRATES && this.tick % 240 === 0) this.spawnCrate();
      if (this.parked.size < MAX_PARKED_RIDES && this.tick % 420 === 0) this.spawnParked();
      if (!this.finalAnnounced && this.timer <= FINAL_ANNOUNCE_AT) {
        this.finalAnnounced = true;
        this.events.push({ type: 'finalSoon', final: this.finalType });
      }
      if (this.timer <= 0) this.setPhase('final');
    } else if (final) {
      if (live) this.updateFinal();
      if (this.timer <= 0 || this.finalOver()) this.setPhase('results');
    } else if (this.phase === 'results' && this.timer <= 0) {
      this.setPhase('roam');
    }
  }

  moveRider(r) {
    const d = derive(this.eff(r), r.vehicle);
    const { steer, button } = r.input;
    r.boost = Math.max(0, r.boost - DT);
    r.hitCooldown = Math.max(0, r.hitCooldown - DT);
    r.hopCooldown = Math.max(0, r.hopCooldown - DT);

    if (r.leap?.landed) { r.speed *= 0.9; return; }

    if (r.stun > 0) {
      r.stun -= DT;
      r.speed *= 0.95;
      r.heading += 8 * DT; // dizzy spin
    } else if (!r.air) {
      // One-button riding: auto-accelerate, hold to brake and charge, let go to boost.
      if (button) {
        r.speed = Math.max(0, r.speed - 40 * DT);
        r.charge = Math.min(1, r.charge + d.chargeRate * DT);
      } else {
        if (r.charge > 0.15) {
          r.speed += d.boostPower * r.charge;
          r.boost = 0.5 + r.charge * 0.4;
          this.events.push({ type: 'boost', id: r.id });
        }
        r.charge = 0;
        if (r.speed < d.topSpeed) r.speed += (d.topSpeed - r.speed) * 1.1 * DT + 4 * DT;
        else r.speed -= (r.speed - d.topSpeed) * 0.9 * DT;
      }
      // Charging lets you pivot tighter, like a handbrake drift.
      const grip = button ? 1.5 : 1.0;
      r.heading += steer * d.turnRate * grip * DT;
    } else {
      r.charge = 0;
      r.heading += steer * d.turnRate * 0.75 * DT;
      r.speed -= r.speed * 0.05 * DT;
    }

    // Horizontal movement with wall sliding.
    const fx = Math.sin(r.heading), fz = Math.cos(r.heading);
    const vx = fx * r.speed + r.kx, vz = fz * r.speed + r.kz;
    r.kx *= 0.9; r.kz *= 0.9;
    const nx = r.x + vx * DT, nz = r.z + vz * DT;
    if (this.canEnter(r, nx, nz)) { r.x = nx; r.z = nz; }
    else if (this.canEnter(r, nx, r.z)) { r.x = nx; r.speed *= 0.985; }
    else if (this.canEnter(r, r.x, nz)) { r.z = nz; r.speed *= 0.985; }
    else {
      r.speed *= 0.3;
      r.kx = -vx * 0.15; r.kz = -vz * 0.15;
      this.events.push({ type: 'thud', id: r.id });
    }
    this.pushOutOfTrees(r);
    this.pushOutOfCrates(r);
    this.clampToBounds(r);

    // Vertical: everything is ballistic; the ground just catches you.
    const gh = groundHeight(r.x, r.z);
    r.diving = r.air && button;
    let g = GRAVITY;
    if (r.air && r.vy < 0) g *= button ? 2.4 : d.glideGravity;
    r.vy -= g * DT;
    if (r.air && r.vy < 0 && !button) r.vy = Math.max(r.vy, -d.glideFall);
    if (r.diving) r.speed += 6 * DT;
    const prevY = r.y;
    r.y += r.vy * DT;
    if (r.y <= gh) {
      if (r.air && prevY - gh > 3) this.events.push({ type: 'land', id: r.id });
      const slopeVy = (gh - prevY) / DT;
      r.y = gh;
      r.vy = Math.max(0, Math.min(slopeVy, 30));
      r.air = false;
    } else {
      r.air = r.y - gh > 0.4;
    }

    if (r.y < -30) this.resetRider(r, false);
  }

  canEnter(r, x, z) {
    return groundHeight(x, z) - r.y <= STEP_UP;
  }

  pushOutOfTrees(r) {
    for (const t of WORLD.trees) {
      const dx = r.x - t.x, dz = r.z - t.z;
      const min = t.r + RIDER_RADIUS;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && r.y < 10 * t.s) {
        const d = Math.sqrt(d2) || 0.01;
        r.x = t.x + (dx / d) * min;
        r.z = t.z + (dz / d) * min;
        r.speed *= 0.8;
      }
    }
  }

  pushOutOfCrates(r) {
    for (const c of this.crates.values()) {
      const dx = r.x - c.x, dz = r.z - c.z;
      const min = CRATE_RADIUS + RIDER_RADIUS;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && r.y < c.y + 4) {
        const d = Math.sqrt(d2) || 0.01;
        r.x = c.x + (dx / d) * min;
        r.z = c.z + (dz / d) * min;
      }
    }
  }

  clampToBounds(r) {
    if (this.phase === 'final' && this.finalType === 'leap') {
      r.x = Math.max(LEAP.x - LEAP.halfW, Math.min(LEAP.x + LEAP.halfW, r.x));
      r.z = Math.max(LEAP.startZ - 10, Math.min(LEAP.endZ, r.z));
      return;
    }
    if (this.phase === 'final') {
      const dx = r.x - ARENA.x, dz = r.z - ARENA.z;
      const d = Math.hypot(dx, dz);
      const max = ARENA.r - RIDER_RADIUS;
      if (d > max) {
        r.x = ARENA.x + (dx / d) * max;
        r.z = ARENA.z + (dz / d) * max;
        r.speed *= 0.6;
        // Bounce back toward the middle so you don't hug the fence.
        r.heading = Math.atan2(-dx, -dz) + ((r.heading % 1) - 0.5) * 0.6;
      }
      return;
    }
    const m = BOUNDS - RIDER_RADIUS;
    if (Math.abs(r.x) > m || Math.abs(r.z) > m) {
      r.x = Math.max(-m, Math.min(m, r.x));
      r.z = Math.max(-m, Math.min(m, r.z));
      r.speed *= 0.5;
    }
  }

  // Bumping: whoever is boosting (or simply faster) bonks the other.
  collideRiders() {
    const list = [...this.riders.values()].filter((r) => !r.out);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dz = b.z - a.z, dy = b.y - a.y;
        const min = RIDER_RADIUS * 2;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || Math.abs(dy) > 3) continue;
        const d = Math.sqrt(d2) || 0.01;
        const nx = dx / d, nz = dz / d;
        const overlap = min - d;
        a.x -= nx * overlap / 2; a.z -= nz * overlap / 2;
        b.x += nx * overlap / 2; b.z += nz * overlap / 2;

        const score = (r, n) => (r.boost > 0 ? 25 : 0) + r.speed * Math.max(0, n);
        const sa = score(a, nx * Math.sin(a.heading) + nz * Math.cos(a.heading));
        const sb = score(b, -nx * Math.sin(b.heading) - nz * Math.cos(b.heading));
        if (Math.abs(sa - sb) < 6) {
          a.kx -= nx * 6; a.kz -= nz * 6; b.kx += nx * 6; b.kz += nz * 6;
          continue;
        }
        const [atk, vic, dir] = sa > sb ? [a, b, 1] : [b, a, -1];
        if (vic.hitCooldown > 0) continue;
        const dmg = derive(this.eff(atk), atk.vehicle).damage * (atk.boost > 0 ? 1.6 : 1);
        this.hurt(vic, dmg, atk, { kx: nx * dir * 28, kz: nz * dir * 28, spill: atk.boost > 0 ? 0.3 : 0 });
        vic.hitCooldown = 0.5;
        atk.speed *= 0.8;
      }
    }
  }

  // Damage the victim's ride. `spill` is the chance a treat gets knocked loose.
  hurt(vic, dmg, atk, { kx = 0, kz = 0, spill = 0 } = {}) {
    if (vic.out) return;
    vic.hp -= dmg;
    vic.kx += kx; vic.kz += kz;
    this.events.push({ type: 'hit', id: vic.id, by: atk?.id ?? 0, dmg: Math.round(dmg) });
    if (this.phase === 'roam' && this.rng() < spill) this.spillTreats(vic, 1);
    if (vic.hp > 0) return;
    if (atk) atk.kos++;
    if (this.phase === 'final') {
      if (this.finalType === 'brawl') {
        vic.out = true;
        vic.outAt = this.tick;
        this.events.push({ type: 'ko', id: vic.id, by: atk?.id ?? 0 });
      } else {
        vic.stun = 1.2;
        vic.hp = this.maxHp(vic);
      }
      return;
    }
    // Roam: your ride is wrecked. Spill treats and fall back to a box.
    this.spillTreats(vic, 3);
    const wrecked = vic.vehicle;
    if (!VEHICLES[wrecked].starter && atk) atk.ridesWrecked++;
    vic.vehicle = 'box';
    vic.stun = 1.4;
    vic.weapon = null;
    vic.hp = this.maxHp(vic);
    this.events.push({ type: 'wreck', id: vic.id, by: atk?.id ?? 0, ride: wrecked });
  }

  spillTreats(r, n) {
    for (let k = 0; k < n; k++) {
      const owned = STATS.filter((s) => r.stats[s] > 0);
      if (!owned.length) return;
      const s = owned[Math.floor(this.rng() * owned.length)];
      r.stats[s]--;
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(6, 12);
      this.spawnItem(r.x + Math.sin(a) * d, r.z + Math.cos(a) * d, s);
    }
    if (n > 0) this.events.push({ type: 'spill', id: r.id });
  }

  collectItems() {
    for (const r of this.riders.values()) {
      if (r.out) continue;
      for (const t of this.items.values()) {
        const dx = t.x - r.x, dz = t.z - r.z, dy = t.y - r.y;
        if (dx * dx + dz * dz < 12 && Math.abs(dy) < 4) {
          this.items.delete(t.id);
          if (t.kind === 'weapon') {
            r.weapon = { type: t.type, time: WEAPONS[t.type].seconds, cd: 0 };
            this.events.push({ type: 'weapon', id: r.id, weapon: t.type });
            continue;
          }
          if (r.stats[t.type] < MAX_STAT) r.stats[t.type]++;
          if (t.type === 'hp') r.hp = Math.min(this.maxHp(r), r.hp + 15);
          r.treatsEaten++;
          this.events.push({ type: 'treat', id: r.id, treat: t.type });
        }
      }
    }
  }

  // Ram crates to break them open. Boosting smashes them in one go.
  crateHits() {
    for (const c of this.crates.values()) {
      c.hit = Math.max(0, c.hit - DT);
      for (const r of this.riders.values()) {
        if (r.out || c.hit > 0) continue;
        const d = Math.hypot(r.x - c.x, r.z - c.z);
        if (d > CRATE_RADIUS + RIDER_RADIUS + 0.6 || r.y > c.y + 4) continue;
        const power = derive(this.eff(r), r.vehicle).damage;
        this.damageCrate(c, (r.boost > 0 ? 30 : 0) + r.speed * 0.5 + power * 0.5, r);
        r.speed *= 0.6;
      }
    }
  }

  damageCrate(c, dmg, r) {
    if (c.hit > 0) return;
    c.hp -= dmg;
    c.hit = 0.3;
    this.events.push({ type: 'crateHit', crate: c.id, id: r?.id ?? 0 });
    if (c.hp > 0) return;
    this.crates.delete(c.id);
    this.events.push({ type: 'crateBreak', x: c.x, z: c.z, id: r?.id ?? 0 });
    const roll = this.rng();
    const near = () => {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(3, 8);
      return [c.x + Math.sin(a) * d, c.z + Math.cos(a) * d];
    };
    if (roll < 0.15) this.spawnParked(c.x, c.z);
    else if (roll < 0.4) this.spawnItem(...near(), this.rng.pick(WEAPON_TYPES));
    else for (let i = 0; i < 3 + Math.floor(this.rng() * 3); i++) this.spawnItem(...near(), this.rng.pick(TREAT_TYPES));
  }

  // Riding a box, you hop on any ride you touch. Already on a ride, hold the
  // button next to another to swap; your old ride stays parked.
  hopOn() {
    for (const r of this.riders.values()) {
      if (r.out || r.air || r.hopCooldown > 0) continue;
      if (!VEHICLES[r.vehicle].starter && (!r.input.button || r.charge < 0.2)) continue;
      for (const p of this.parked.values()) {
        if (Math.hypot(p.x - r.x, p.z - r.z) > HOP_RADIUS) continue;
        this.parked.delete(p.id);
        if (!VEHICLES[r.vehicle].starter) this.spawnParked(r.x, r.z, r.vehicle);
        r.vehicle = p.vehicle;
        r.hp = this.maxHp(r);
        r.charge = 0;
        r.hopCooldown = 1.2;
        this.events.push({ type: 'hop', id: r.id, ride: p.vehicle });
        break;
      }
    }
  }

  // ---- weapons ----------------------------------------------------------------

  updateWeapons() {
    for (const r of this.riders.values()) {
      const w = r.weapon;
      if (!w || r.out) continue;
      w.time -= DT;
      w.cd -= DT;
      if (w.time <= 0) { r.weapon = null; continue; }
      if (w.cd > 0 || r.stun > 0) continue;
      const power = this.eff(r).power;
      if (w.type === 'sprinkler') {
        w.cd = 0.4;
        this.areaHit(r, 9, Math.PI, 4 + power * 0.5, 10, 0.25);
      } else if (w.type === 'bark') {
        w.cd = 1.2;
        this.events.push({ type: 'bark', id: r.id });
        this.areaHit(r, 24, Math.PI / 3, 12 + power, 40, 1);
      } else if (w.type === 'acorn') {
        w.cd = 0.3;
        const sp = r.speed + 70;
        const id = this.id();
        this.shots.set(id, {
          id, owner: r.id, x: r.x + Math.sin(r.heading) * 3, z: r.z + Math.cos(r.heading) * 3, y: r.y + 1.5,
          vx: Math.sin(r.heading) * sp, vz: Math.cos(r.heading) * sp, life: 1.1,
        });
      }
    }
  }

  // Hit every rider (and crate) within range and a cone in front of `r`.
  areaHit(r, range, halfAngle, dmg, knock, spill) {
    const fx = Math.sin(r.heading), fz = Math.cos(r.heading);
    const inCone = (x, z) => {
      const dx = x - r.x, dz = z - r.z, d = Math.hypot(dx, dz);
      if (d > range || d < 0.01) return null;
      if ((dx * fx + dz * fz) / d < Math.cos(halfAngle)) return null;
      return [dx / d, dz / d];
    };
    for (const o of this.riders.values()) {
      if (o === r || o.out || o.hitCooldown > 0 || Math.abs(o.y - r.y) > 6) continue;
      const n = inCone(o.x, o.z);
      if (!n) continue;
      this.hurt(o, dmg, r, { kx: n[0] * knock, kz: n[1] * knock, spill });
      o.hitCooldown = 0.35;
    }
    for (const c of [...this.crates.values()]) if (inCone(c.x, c.z)) this.damageCrate(c, dmg * 1.5, r);
  }

  updateShots() {
    for (const s of this.shots.values()) {
      s.life -= DT;
      s.x += s.vx * DT; s.z += s.vz * DT;
      let done = s.life <= 0 || groundHeight(s.x, s.z) > s.y;
      for (const o of this.riders.values()) {
        if (done || o.id === s.owner || o.out) continue;
        if (Math.hypot(o.x - s.x, o.z - s.z) < RIDER_RADIUS + 1 && Math.abs(o.y + 1.5 - s.y) < 3) {
          const owner = this.riders.get(s.owner);
          const power = owner ? this.eff(owner).power : 0;
          this.hurt(o, 6 + power * 0.7, owner, { kx: s.vx * 0.12, kz: s.vz * 0.12, spill: 0.3 });
          done = true;
        }
      }
      for (const c of [...this.crates.values()]) {
        if (!done && Math.hypot(c.x - s.x, c.z - s.z) < CRATE_RADIUS + 0.5) {
          this.damageCrate(c, 12, this.riders.get(s.owner));
          done = true;
        }
      }
      if (done) this.shots.delete(s.id);
    }
  }

  // ---- neighbourhood events -----------------------------------------------------

  updateEvent() {
    if (!this.event) {
      this.nextEventIn -= DT;
      if (this.nextEventIn <= 0 && this.timer > FINAL_ANNOUNCE_AT + 5) this.startEvent(this.rng.pick(EVENT_TYPES));
      return;
    }
    const e = this.event;
    e.timer -= DT;
    e.acc = (e.acc || 0) + DT;
    if (e.type === 'treatRain' && e.acc > 0.12) {
      e.acc = 0;
      const a = this.rng.range(0, Math.PI * 2), d = Math.sqrt(this.rng()) * 45;
      this.spawnItem(e.x + Math.sin(a) * d, e.z + Math.cos(a) * d);
    } else if (e.type === 'iceCream') {
      const t = this.truck;
      t.s += 24 * DT;
      Object.assign(t, ringPoint(t.s));
      if (e.acc > 0.45) {
        e.acc = 0;
        this.spawnItem(t.x - Math.sin(t.heading) * 8 + this.rng.range(-4, 4), t.z - Math.cos(t.heading) * 8 + this.rng.range(-4, 4), this.rng.pick(TREAT_TYPES));
      }
      for (const r of this.riders.values()) {
        const dx = r.x - t.x, dz = r.z - t.z, d = Math.hypot(dx, dz);
        if (d < 7 && r.y < 8 && r.hitCooldown <= 0) {
          this.hurt(r, 10, null, { kx: (dx / d) * 45, kz: (dz / d) * 45, spill: 0.5 });
          r.hitCooldown = 1;
        }
      }
    } else if (e.type === 'acornStorm') {
      if (e.acc > 0.2) {
        e.acc = 0;
        const riders = [...this.riders.values()].filter((r) => !r.out);
        const near = this.rng.pick(riders);
        if (near) {
          const id = this.id();
          const x = near.x + Math.sin(near.heading) * near.speed * 1.1 + this.rng.range(-25, 25);
          const z = near.z + Math.cos(near.heading) * near.speed * 1.1 + this.rng.range(-25, 25);
          this.hazards.set(id, { id, x, z, y: groundHeight(x, z), t: 1.3 });
        }
      }
    }
    for (const h of this.hazards.values()) {
      h.t -= DT;
      if (h.t > 0) continue;
      this.hazards.delete(h.id);
      this.events.push({ type: 'impact', x: h.x, z: h.z });
      for (const r of this.riders.values()) {
        const dx = r.x - h.x, dz = r.z - h.z, d = Math.hypot(dx, dz) || 0.1;
        if (d < 7 && r.y - h.y < 6) this.hurt(r, 14, null, { kx: (dx / d) * 30, kz: (dz / d) * 30, spill: 0.5 });
      }
      for (const c of [...this.crates.values()]) if (Math.hypot(c.x - h.x, c.z - h.z) < 7) this.damageCrate(c, 40, null);
    }
    if (e.timer <= 0) {
      this.event = null;
      this.truck = null;
      this.nextEventIn = this.rng.range(...EVENT_GAP);
      this.events.push({ type: 'eventEnd' });
    }
  }

  startEvent(type) {
    const e = { type, timer: EVENTS[type].seconds };
    if (type === 'treatRain') {
      const spot = this.rng.pick(SPOTS);
      Object.assign(e, { x: spot.x, z: spot.z, where: spot.name });
    } else if (type === 'iceCream') {
      this.truck = { s: this.rng.range(0, 1440), x: 0, z: 0, heading: 0 };
      Object.assign(this.truck, ringPoint(this.truck.s));
    } else if (type === 'garbageDay') {
      for (let i = 0; i < 10; i++) this.spawnCrate();
    } else if (type === 'yardSale') {
      const spot = this.rng.pick(SPOTS);
      e.where = spot.name;
      for (let i = 0; i < 5; i++) {
        const p = this.randomOpenSpot(spot.x, spot.z, 35);
        this.spawnParked(p.x, p.z);
      }
    }
    this.event = e;
    this.events.push({ type: 'event', event: type, where: e.where });
  }

  // ---- finals -----------------------------------------------------------------

  updateFinal() {
    if (this.finalType === 'hill') {
      for (const r of this.riders.values()) {
        if (Math.hypot(r.x - ARENA.x, r.z - ARENA.z) < HILL_ZONE && !r.out) r.score += DT;
      }
    } else if (this.finalType === 'leap') {
      for (const r of this.riders.values()) {
        r.leap ??= { launched: false, landed: false };
        if (!r.leap.launched && r.air && r.z > LEAP_RAMP_END - 2) r.leap.launched = true;
        if (r.leap.launched && !r.leap.landed && !r.air) {
          r.leap.landed = true;
          r.score = Math.max(0, r.z - LEAP_RAMP_END);
          this.events.push({ type: 'leapLand', id: r.id, dist: Math.round(r.score) });
        }
        // Rolled off the end without ever getting air: score where you stopped.
        if (!r.leap.launched && r.z > LEAP_RAMP_END + 5) {
          r.leap.launched = r.leap.landed = true;
          r.score = r.z - LEAP_RAMP_END;
        }
      }
    }
  }

  finalOver() {
    if (this.riders.size < 2) return false;
    const list = [...this.riders.values()];
    if (this.finalType === 'brawl') return list.filter((r) => !r.out).length <= 1;
    if (this.finalType === 'leap') return list.every((r) => r.leap?.landed);
    return false;
  }

  rankFinal() {
    const list = [...this.riders.values()];
    const t = this.finalType;
    list.sort((a, b) => {
      if (t === 'brawl') {
        if (a.out !== b.out) return a.out ? 1 : -1;
        if (a.out && b.out) return b.outAt - a.outAt;
        return b.hp / this.maxHp(b) - a.hp / this.maxHp(a);
      }
      return b.score - a.score;
    });
    return list.map((r) => ({
      id: r.id, name: r.name, animal: r.animal, kos: r.kos,
      score: t === 'brawl' ? r.kos : Math.round(r.score * 10) / 10,
    }));
  }

  // ---- networking helpers --------------------------------------------------

  snapshot() {
    const round = (v) => Math.round(v * 100) / 100;
    const e = this.event;
    return {
      tick: this.tick,
      phase: this.phase,
      timer: round(this.timer),
      finalType: this.finalType,
      finalAnnounced: this.finalAnnounced,
      event: e ? { type: e.type, timer: round(e.timer), where: e.where, x: e.x, z: e.z } : null,
      standings: this.phase === 'results' ? this.standings : undefined,
      riders: [...this.riders.values()].map((r) => ({
        id: r.id, name: r.name, animal: r.animal, hat: r.hat, tint: r.tint, vehicle: r.vehicle, bot: r.bot,
        x: round(r.x), y: round(r.y), z: round(r.z), heading: round(r.heading),
        speed: round(r.speed), charge: round(r.charge), boost: r.boost > 0, air: r.air,
        diving: r.diving, stun: r.stun > 0, out: r.out, hp: Math.round(r.hp), maxHp: this.maxHp(r),
        stats: r.stats, kos: r.kos, score: round(r.score),
        weapon: r.weapon ? { type: r.weapon.type, time: round(r.weapon.time) } : null,
      })),
      items: [...this.items.values()],
      crates: [...this.crates.values()].map((c) => ({ id: c.id, x: c.x, y: c.y, z: c.z, hp: c.hp, hit: c.hit > 0 })),
      parked: [...this.parked.values()],
      shots: [...this.shots.values()].map((s) => ({ id: s.id, x: round(s.x), y: s.y, z: round(s.z) })),
      hazards: [...this.hazards.values()].map((h) => ({ id: h.id, x: h.x, y: h.y, z: h.z, t: round(h.t) })),
      truck: this.truck ? { x: round(this.truck.x), z: round(this.truck.z), heading: this.truck.heading } : null,
    };
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
