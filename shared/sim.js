// Authoritative game simulation. Pure JS with a fixed timestep and a seeded
// RNG, so the same code runs in the browser (solo play) and on the server
// (multiplayer). Nothing in here touches rendering or networking.
import {
  DT, GRAVITY, RIDER_RADIUS, MAX_STAT, STATS, TREATS, VEHICLES, ANIMALS, derive,
  ROAM_SECONDS, BRAWL_SECONDS, BRAWL_COUNTDOWN, RESULTS_SECONDS, MAX_TREATS,
} from './constants.js';
import { WORLD, BOUNDS, ARENA, groundHeight } from './world.js';
import { makeRng } from './rng.js';
import { botThink } from './ai.js';

const STEP_UP = 2.2;   // tallest ledge you can roll up without being blocked
const TREAT_TYPES = Object.keys(TREATS);

export class Game {
  constructor({ seed = 1 } = {}) {
    this.rng = makeRng(seed);
    this.riders = new Map();
    this.treats = new Map();
    this.nextId = 1;
    this.tick = 0;
    this.events = [];
    this.setPhase('roam');
  }

  // ---- lifecycle -----------------------------------------------------------

  setPhase(phase) {
    this.phase = phase;
    if (phase === 'roam') {
      this.timer = ROAM_SECONDS;
      this.treats.clear();
      for (let i = 0; i < MAX_TREATS; i++) this.spawnTreat();
      for (const r of this.riders.values()) this.resetRider(r, true);
    } else if (phase === 'brawl') {
      this.timer = BRAWL_SECONDS + BRAWL_COUNTDOWN;
      this.treats.clear();
      const list = [...this.riders.values()];
      list.forEach((r, i) => {
        const a = (i / list.length) * Math.PI * 2;
        r.x = ARENA.x + Math.sin(a) * (ARENA.r - 12);
        r.z = ARENA.z + Math.cos(a) * (ARENA.r - 12);
        r.y = groundHeight(r.x, r.z);
        r.heading = a + Math.PI;
        r.speed = 0; r.vy = 0; r.kx = 0; r.kz = 0; r.charge = 0;
        r.hp = derive(r.stats).maxHp;
        r.out = false; r.stun = 0;
      });
    } else if (phase === 'results') {
      this.timer = RESULTS_SECONDS;
      this.standings = this.rankBrawl();
    }
    this.events.push({ type: 'phase', phase });
  }

  addRider({ name, animal = 'corgi', vehicle = 'board', bot = false }) {
    const id = this.nextId++;
    const r = {
      id, bot,
      name: name || ANIMALS[animal]?.name || 'Rider',
      animal: ANIMALS[animal] ? animal : 'corgi',
      vehicle: VEHICLES[vehicle] ? vehicle : 'board',
      input: { steer: 0, button: false },
      ai: bot ? { t: 0, tx: 0, tz: 0, hold: 0, stuck: 0 } : null,
    };
    this.resetRider(r, true);
    if (this.phase === 'brawl') { r.out = true; }
    this.riders.set(id, r);
    return id;
  }

  removeRider(id) { this.riders.delete(id); }

  // Top the match up with bots, preferring animals nobody is riding yet.
  fillBots(total) {
    const ids = Object.keys(ANIMALS);
    const vehicles = Object.keys(VEHICLES);
    while (this.riders.size < total) {
      const used = [...this.riders.values()].map((r) => r.animal);
      const free = ids.filter((a) => !used.includes(a));
      const animal = free.length ? free[0] : this.rng.pick(ids);
      const name = ANIMALS[animal].name + (free.length ? '' : ' Jr.');
      this.addRider({ name, animal, vehicle: this.rng.pick(vehicles), bot: true });
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
      r.stats = { ...VEHICLES[r.vehicle].base };
      r.kos = 0; r.treatsEaten = 0;
    }
    const spot = this.randomOpenSpot();
    r.x = spot.x; r.z = spot.z; r.y = groundHeight(r.x, r.z);
    r.heading = this.rng.range(0, Math.PI * 2);
    r.speed = 0; r.vy = 0; r.kx = 0; r.kz = 0;
    r.charge = 0; r.boost = 0; r.stun = 0; r.air = false; r.diving = false;
    r.hp = derive(r.stats).maxHp;
    r.out = false; r.lastHitBy = 0; r.hitCooldown = 0;
  }

  randomOpenSpot() {
    for (let i = 0; i < 50; i++) {
      const x = this.rng.range(-BOUNDS + 15, BOUNDS - 15);
      const z = this.rng.range(-BOUNDS + 15, BOUNDS - 15);
      const nearTree = WORLD.trees.some((t) => Math.hypot(t.x - x, t.z - z) < 6);
      if (groundHeight(x, z) < 1 && !nearTree) return { x, z };
    }
    return { x: 0, z: 0 };
  }

  spawnTreat(x, z) {
    if (x === undefined) {
      // Most treats on the street, some on rooftops and the hill for gliders.
      x = this.rng.range(-BOUNDS + 10, BOUNDS - 10);
      z = this.rng.range(-BOUNDS + 10, BOUNDS - 10);
    }
    const id = this.nextId++;
    const type = this.rng.pick(TREAT_TYPES);
    this.treats.set(id, { id, type, x, z, y: groundHeight(x, z) + 1.6 });
  }

  // ---- main step -----------------------------------------------------------

  step() {
    this.tick++;
    this.timer -= DT;

    const live = this.phase === 'roam' || (this.phase === 'brawl' && this.timer < BRAWL_SECONDS);
    for (const r of this.riders.values()) {
      if (r.bot) botThink(this, r);
      if (live && !r.out) this.moveRider(r);
    }
    if (live) {
      this.collideRiders();
      this.collectTreats();
    }

    if (this.phase === 'roam') {
      if (this.treats.size < MAX_TREATS && this.tick % 40 === 0) this.spawnTreat();
      if (this.timer <= 0) this.setPhase('brawl');
    } else if (this.phase === 'brawl') {
      const alive = [...this.riders.values()].filter((r) => !r.out);
      if (this.timer <= 0 || (this.riders.size > 1 && alive.length <= 1)) this.setPhase('results');
    } else if (this.phase === 'results' && this.timer <= 0) {
      this.setPhase('roam');
    }
  }

  moveRider(r) {
    const d = derive(r.stats);
    const { steer, button } = r.input;
    r.boost = Math.max(0, r.boost - DT);
    r.hitCooldown = Math.max(0, r.hitCooldown - DT);

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
    const h = groundHeight(x, z);
    return h - r.y <= STEP_UP;
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

  clampToBounds(r) {
    if (this.phase === 'brawl') {
      const dx = r.x - ARENA.x, dz = r.z - ARENA.z;
      const d = Math.hypot(dx, dz);
      const max = ARENA.r - RIDER_RADIUS;
      if (d > max) {
        r.x = ARENA.x + (dx / d) * max;
        r.z = ARENA.z + (dz / d) * max;
        r.speed *= 0.6;
        // Bounce back toward the middle so you don't hug the fence.
        r.heading = Math.atan2(-dx, -dz) + (r.heading % 1 - 0.5) * 0.6;
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
        const dmg = derive(atk.stats).damage * (atk.boost > 0 ? 1.6 : 1);
        this.hurt(vic, dmg, atk);
        vic.kx += nx * dir * 28; vic.kz += nz * dir * 28;
        vic.hitCooldown = 0.5;
        atk.speed *= 0.8;
      }
    }
  }

  hurt(vic, dmg, atk) {
    vic.hp -= dmg;
    vic.lastHitBy = atk.id;
    this.events.push({ type: 'hit', id: vic.id, by: atk.id, dmg: Math.round(dmg) });
    if (vic.hp > 0) return;
    atk.kos++;
    this.events.push({ type: 'ko', id: vic.id, by: atk.id });
    if (this.phase === 'brawl') {
      vic.out = true;
      vic.outAt = this.tick;
      return;
    }
    // Roam KO: spill a few treats you'd eaten, spin out, then get back up.
    const owned = STATS.filter((s) => vic.stats[s] > VEHICLES[vic.vehicle].base[s]);
    for (let k = 0; k < 3 && owned.length; k++) {
      const s = owned[Math.floor(this.rng() * owned.length)];
      if (vic.stats[s] <= VEHICLES[vic.vehicle].base[s]) continue;
      vic.stats[s]--;
      const id = this.nextId++;
      const x = vic.x + this.rng.range(-10, 10), z = vic.z + this.rng.range(-10, 10);
      this.treats.set(id, { id, type: s, x, z, y: groundHeight(x, z) + 1.6 });
    }
    vic.stun = 1.6;
    vic.hp = derive(vic.stats).maxHp;
  }

  collectTreats() {
    for (const r of this.riders.values()) {
      if (r.out) continue;
      for (const t of this.treats.values()) {
        const dx = t.x - r.x, dz = t.z - r.z, dy = t.y - r.y;
        if (dx * dx + dz * dz < 12 && Math.abs(dy) < 4) {
          this.treats.delete(t.id);
          if (r.stats[t.type] < MAX_STAT) r.stats[t.type]++;
          if (t.type === 'hp') r.hp = Math.min(derive(r.stats).maxHp, r.hp + 15);
          r.treatsEaten++;
          this.events.push({ type: 'treat', id: r.id, treat: t.type });
        }
      }
    }
  }

  rankBrawl() {
    return [...this.riders.values()]
      .sort((a, b) => {
        if (a.out !== b.out) return a.out ? 1 : -1;
        if (a.out && b.out) return b.outAt - a.outAt;
        return b.hp / derive(b.stats).maxHp - a.hp / derive(a.stats).maxHp;
      })
      .map((r) => ({ id: r.id, name: r.name, animal: r.animal, kos: r.kos }));
  }

  // ---- networking helpers --------------------------------------------------

  snapshot() {
    const round = (v) => Math.round(v * 100) / 100;
    return {
      tick: this.tick,
      phase: this.phase,
      timer: round(this.timer),
      standings: this.phase === 'results' ? this.standings : undefined,
      riders: [...this.riders.values()].map((r) => ({
        id: r.id, name: r.name, animal: r.animal, vehicle: r.vehicle, bot: r.bot,
        x: round(r.x), y: round(r.y), z: round(r.z), heading: round(r.heading),
        speed: round(r.speed), charge: round(r.charge), boost: r.boost > 0, air: r.air,
        diving: r.diving, stun: r.stun > 0, out: r.out, hp: Math.round(r.hp),
        stats: r.stats, kos: r.kos,
      })),
      treats: [...this.treats.values()],
    };
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
