// The neighbourhood map: pure data plus a height query. Both the renderer and
// the simulation read from here, so what you see is what you collide with.
import { makeRng } from './rng.js';

export const BOUNDS = 250;            // neighbourhood is a square of +-BOUNDS
export const RING = 180;              // ring road centre line
export const ROAD_W = 22;
export const ARENA = { x: 0, z: 430, r: 72 }; // fenced ring off-map (brawl, hill)
export const HILL_ZONE = 14;          // radius of the King of the Hill zone
// Big Leap: a long field west of the neighbourhood with a mega ramp.
export const LEAP = { x: -420, startZ: -250, rampZ: -170, len: 60, wid: 80, h: 30, endZ: 320, halfW: 40 };
export const LEAP_RAMP_END = LEAP.rampZ + LEAP.len / 2;

// Places neighbourhood events can happen, with names for announcements.
export const SPOTS = [
  { name: 'the park', x: 92, z: -92 },
  { name: 'the skate yard', x: -90, z: 90 },
  { name: 'Maple Street', x: 90, z: 90 },
  { name: 'Acorn Avenue', x: -90, z: -90 },
  { name: 'the big crossroads', x: 0, z: 0 },
];

const HOUSE_COLORS = [0xffc8a2, 0xb5e3d8, 0xfff1a8, 0xd7c4f2, 0xf9b8c8, 0xc9e4a6, 0xa8d4ff];
const ROOF_COLORS = [0xd9534f, 0x5b7db1, 0x6b8e4e, 0x8a5a44, 0xe08a3c];

function buildWorld() {
  const rng = makeRng(20261030);
  const houses = [];
  const trees = [];
  const ramps = [];
  const hills = [];

  const addHouse = (x, z, w, d) => {
    houses.push({
      x, z, w, d,
      h: rng.range(9, 15),
      color: rng.pick(HOUSE_COLORS),
      roof: rng.pick(ROOF_COLORS),
    });
  };

  // Four blocks inside the ring, split by the two cross streets.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const park = sx === 1 && sz === -1;
      const skate = sx === -1 && sz === 1;
      const c = (v) => v * 1; // readability
      if (park) {
        hills.push({ x: 92, z: -92, r: 42, h: 30 });
        hills.push({ x: 140, z: -45, r: 18, h: 8 });
        for (let i = 0; i < 14; i++) {
          const a = rng.range(0, Math.PI * 2);
          const d = rng.range(52, 70);
          trees.push({ x: 92 + Math.cos(a) * d, z: -92 + Math.sin(a) * d, r: 1.4, s: rng.range(0.9, 1.4) });
        }
        continue;
      }
      // Houses along the edges of each block, leaving gaps to ride through.
      const inner = 36, mid = 90, outer = 144;
      for (const along of [inner, mid, outer]) {
        addHouse(c(sx * along), sz * 30, 24, 20);
        addHouse(c(sx * along), sz * 150, 24, 20);
      }
      addHouse(sx * 30, sz * mid, 20, 24);
      addHouse(sx * 150, sz * mid, 20, 24);
      if (skate) {
        // Skate yard in the middle of this block.
        ramps.push({ x: -90, z: 90, dir: 0, len: 26, wid: 14, h: 9 });
        ramps.push({ x: -90, z: 108, dir: Math.PI, len: 14, wid: 14, h: 5 });
      } else {
        for (let i = 0; i < 5; i++) {
          trees.push({ x: sx * rng.range(58, 122), z: sz * rng.range(58, 122), r: 1.4, s: rng.range(0.9, 1.4) });
        }
      }
    }
  }

  // Outer ring of houses with gaps, plus trees by the fence.
  for (let t = -210; t <= 210; t += 52) {
    if (Math.abs(t) < 20) continue;
    if (rng() < 0.8) addHouse(t, 222, 26, 20);
    if (rng() < 0.8) addHouse(t, -222, 26, 20);
    if (rng() < 0.8) addHouse(222, t, 20, 26);
    if (rng() < 0.8) addHouse(-222, t, 20, 26);
  }
  for (let i = 0; i < 40; i++) {
    const t = rng.range(-240, 240);
    const side = Math.floor(rng() * 4);
    const off = rng.range(256, 266); // just outside the fence, purely scenery
    const [x, z] = [[t, off], [t, -off], [off, t], [-off, t]][side];
    trees.push({ x, z, r: 1.4, s: rng.range(1, 1.6) });
  }

  // Street ramps on the ring road.
  ramps.push({ x: 90, z: RING, dir: Math.PI / 2, len: 20, wid: 16, h: 8 });
  ramps.push({ x: -90, z: -RING, dir: -Math.PI / 2, len: 20, wid: 16, h: 8 });
  ramps.push({ x: RING, z: 60, dir: Math.PI, len: 20, wid: 16, h: 8 });
  ramps.push({ x: -RING, z: -60, dir: 0, len: 20, wid: 16, h: 8 });
  // Launch ramp pointing off the big park hill area.
  ramps.push({ x: 40, z: -40, dir: Math.PI * 0.75, len: 30, wid: 12, h: 12 });

  // Brawl arena: a central bump and four small kickers.
  const arenaHills = [{ x: ARENA.x, z: ARENA.z, r: 16, h: 6 }];
  const arenaRamps = [0, 1, 2, 3].map((i) => {
    const a = i * Math.PI / 2 + Math.PI / 4;
    return { x: ARENA.x + Math.sin(a) * 45, z: ARENA.z + Math.cos(a) * 45, dir: a + Math.PI / 2, len: 14, wid: 10, h: 4 };
  });

  const leapRamp = { x: LEAP.x, z: LEAP.rampZ, dir: 0, len: LEAP.len, wid: LEAP.wid, h: LEAP.h, big: true };

  return { houses, trees, ramps: ramps.concat(arenaRamps, [leapRamp]), hills: hills.concat(arenaHills) };
}

export const WORLD = buildWorld();

// Ramp height at a point, or -1 if outside its footprint. A ramp rises along
// its `dir` (forward = (sin dir, cos dir)) from 0 to h over len.
function rampHeight(r, x, z) {
  const fx = Math.sin(r.dir), fz = Math.cos(r.dir);
  const dx = x - r.x, dz = z - r.z;
  const along = dx * fx + dz * fz;          // -len/2 .. len/2
  const side = dx * fz - dz * fx;
  if (Math.abs(side) > r.wid / 2 || Math.abs(along) > r.len / 2) return -1;
  return ((along + r.len / 2) / r.len) * r.h;
}

export function hillHeight(x, z) {
  let h = 0;
  for (const hl of WORLD.hills) {
    const dx = x - hl.x, dz = z - hl.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < hl.r * hl.r * 6) h += hl.h * Math.exp(-d2 / (hl.r * hl.r));
  }
  return h;
}

// Highest solid surface under (x, z): terrain, ramps and flat rooftops.
export function groundHeight(x, z) {
  let h = hillHeight(x, z);
  for (const r of WORLD.ramps) {
    const rh = rampHeight(r, x, z);
    if (rh > h) h = rh;
  }
  for (const b of WORLD.houses) {
    if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2 && b.h > h) h = b.h;
  }
  return h;
}

// Point on the ring road loop at distance s (clockwise), used by the ice cream truck.
export function ringPoint(s) {
  const side = RING * 2, per = side * 4;
  s = ((s % per) + per) % per;
  const k = Math.floor(s / side), t = s - k * side;
  if (k === 0) return { x: -RING + t, z: RING, heading: Math.PI / 2 };
  if (k === 1) return { x: RING, z: RING - t, heading: Math.PI };
  if (k === 2) return { x: RING - t, z: -RING, heading: -Math.PI / 2 };
  return { x: -RING, z: -RING + t, heading: 0 };
}
