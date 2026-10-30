// Simple bot brains that produce the same {steer, button} input a player does.
import { DT } from './constants.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function aimAt(r, x, z) {
  const want = Math.atan2(x - r.x, z - r.z);
  return wrap(want - r.heading);
}

function nearest(list, r, filter = () => true) {
  let best = null, bestD = Infinity;
  for (const o of list) {
    if (!filter(o)) continue;
    const d = Math.hypot(o.x - r.x, o.z - r.z);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best ? { o: best, d: bestD } : null;
}

export function botThink(game, r) {
  const ai = r.ai;
  ai.t -= DT;
  if (r.out) return;

  // Unstick: if we've been crawling into a wall, swing around for a bit.
  if (!r.input.button && r.speed < 5 && !r.air && r.stun <= 0) ai.stuck += DT;
  else ai.stuck = Math.max(0, ai.stuck - DT * 2);
  if (ai.stuck > 0.7) {
    ai.turnAway = 0.9;
    ai.stuck = 0;
  }
  if (ai.turnAway > 0) {
    ai.turnAway -= DT;
    r.input.steer = 1;
    r.input.button = ai.turnAway > 0.5; // pivot in place first
    return;
  }

  const others = [...game.riders.values()].filter((o) => o !== r && !o.out);

  if (game.phase === 'brawl') {
    const foe = nearest(others, r);
    if (foe) { ai.tx = foe.o.x; ai.tz = foe.o.z; ai.foeD = foe.d; }
  } else if (ai.t <= 0) {
    ai.t = 1 + game.rng() * 1.5;
    ai.foeD = Infinity;
    const foe = nearest(others, r);
    const treat = nearest(game.treats.values(), r, (t) => Math.abs(t.y - r.y) < 8);
    if (foe && foe.d < 35 && game.rng() < 0.35) {
      ai.tx = foe.o.x; ai.tz = foe.o.z; ai.foeD = foe.d;
    } else if (treat && treat.d < 150) {
      ai.tx = treat.o.x; ai.tz = treat.o.z;
    } else {
      const s = game.randomOpenSpot();
      ai.tx = s.x; ai.tz = s.z;
    }
  }

  const diff = aimAt(r, ai.tx, ai.tz);
  r.input.steer = Math.max(-1, Math.min(1, diff * 2.2));

  // Charge-and-release: build up when lined up with a target some way off.
  if (ai.hold > 0) {
    ai.hold -= DT;
    r.input.button = ai.hold > 0;
  } else {
    r.input.button = false;
    const lined = Math.abs(diff) < 0.25;
    const d = Math.hypot(ai.tx - r.x, ai.tz - r.z);
    const wantsBonk = ai.foeD < 45 && d > 10;
    if (!r.air && lined && (wantsBonk ? game.rng() < 0.05 : d > 70 && game.rng() < 0.01)) {
      ai.hold = 0.5 + game.rng() * 0.6;
    } else if (Math.abs(diff) > 1.6 && r.speed > 15 && !r.air) {
      ai.hold = 0.25; // tight pivot for hairpins
    }
  }
}
