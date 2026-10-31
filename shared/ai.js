// Simple bot brains that produce the same {steer, button} input a player does.
import { DT, VEHICLES, FINALS } from './constants.js';
import { ARENA, LEAP_RAMP_END } from './world.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function aimAt(r, x, z) {
  return wrap(Math.atan2(x - r.x, z - r.z) - r.heading);
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

function steerTo(r, x, z) {
  const diff = aimAt(r, x, z);
  r.input.steer = Math.max(-1, Math.min(1, diff * 2.2));
  return diff;
}

export function botThink(game, r) {
  const ai = r.ai;
  ai.t -= DT;
  if (r.out) return;

  if (game.phase === 'final' && game.finalType === 'leap') return leapBot(game, r);

  // Unstick: if we've been crawling into a wall, swing around for a bit.
  if (!r.input.button && r.speed < 5 && !r.air && r.stun <= 0) ai.stuck += DT;
  else ai.stuck = Math.max(0, ai.stuck - DT * 2);
  if (ai.stuck > 0.7) { ai.turnAway = 0.9; ai.stuck = 0; }
  if (ai.turnAway > 0) {
    ai.turnAway -= DT;
    r.input.steer = 1;
    r.input.button = ai.turnAway > 0.5; // pivot in place first
    return;
  }

  const others = [...game.riders.values()].filter((o) => o !== r && !o.out);

  if (game.phase === 'final') {
    if (game.finalType === 'hill' && Math.hypot(r.x - ARENA.x, r.z - ARENA.z) > 8) {
      ai.tx = ARENA.x; ai.tz = ARENA.z; ai.foeD = Infinity;
    } else {
      const foe = nearest(others, r);
      if (foe) { ai.tx = foe.o.x; ai.tz = foe.o.z; ai.foeD = foe.d; }
    }
  } else if (ai.t <= 0) {
    ai.t = 0.8 + game.rng() * 1.2;
    ai.foeD = Infinity;
    ai.target = null;
    const onBox = VEHICLES[r.vehicle].starter;
    const ride = nearest(game.parked.values(), r);
    const foe = nearest(others, r);
    const item = nearest(game.items.values(), r, (t) => Math.abs(t.y - r.y) < 8);
    const crate = nearest(game.crates.values(), r);
    if (ride && (onBox ? ride.d < 260 : ride.d < 25 && game.rng() < 0.05)) {
      ai.target = 'ride'; ai.tx = ride.o.x; ai.tz = ride.o.z;
    } else if (foe && (r.weapon ? foe.d < 90 : foe.d < 35 && game.rng() < 0.35)) {
      ai.tx = foe.o.x; ai.tz = foe.o.z; ai.foeD = foe.d;
    } else if (game.event?.type === 'treatRain' && game.rng() < 0.5) {
      ai.tx = game.event.x; ai.tz = game.event.z;
    } else if (crate && (!item || crate.d < item.d * 0.8) && crate.d < 120) {
      ai.target = 'crate'; ai.tx = crate.o.x; ai.tz = crate.o.z;
    } else if (item && item.d < 150) {
      ai.tx = item.o.x; ai.tz = item.o.z;
    } else {
      const s = game.randomOpenSpot();
      ai.tx = s.x; ai.tz = s.z;
    }
  }

  // Chasing a moving foe: keep re-aiming at them.
  if (ai.foeD < Infinity) {
    const foe = nearest(others, r);
    if (foe) { ai.tx = foe.o.x; ai.tz = foe.o.z; }
  }

  const diff = steerTo(r, ai.tx, ai.tz);
  const d = Math.hypot(ai.tx - r.x, ai.tz - r.z);

  // Hop on: hold the button when we reach the parked ride.
  if (ai.target === 'ride' && d < 5 && !VEHICLES[r.vehicle].starter) { r.input.button = true; return; }

  // Charge-and-release: build up when lined up with a target some way off.
  if (ai.hold > 0) {
    ai.hold -= DT;
    r.input.button = ai.hold > 0;
  } else {
    r.input.button = false;
    const lined = Math.abs(diff) < 0.25;
    const wantsBonk = (ai.foeD < 45 || ai.target === 'crate') && d > 10 && d < 45;
    if (!r.air && lined && (wantsBonk ? game.rng() < 0.06 : d > 70 && game.rng() < 0.01)) {
      ai.hold = 0.5 + game.rng() * 0.6;
    } else if (Math.abs(diff) > 1.6 && r.speed > 15 && !r.air) {
      ai.hold = 0.25; // tight pivot for hairpins
    }
  }
}

// Big Leap: charge at the start, boost into the ramp, glide as far as possible.
function leapBot(game, r) {
  const ai = r.ai;
  ai.leapT = (ai.leapT ?? 0) + DT;
  r.input.steer = Math.max(-1, Math.min(1, wrap(0 - r.heading) * 2));
  const started = game.timer < FINALS.leap.seconds; // after the countdown
  if (!started) { ai.leapT = 0; r.input.button = false; return; }
  const before = r.z < LEAP_RAMP_END - 40;
  r.input.button = before && ai.leapT < 0.9 + (r.id % 3) * 0.2;
}
