import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './sim.js';
import { ROAM_SECONDS, TICK_RATE } from './constants.js';

test('a full match runs roam -> brawl -> results without blowing up', () => {
  const g = new Game({ seed: 7 });
  for (const a of ['corgi', 'bunny', 'raccoon', 'duck', 'cat', 'corgi']) {
    g.addRider({ animal: a, vehicle: ['board', 'leaf', 'wagon'][g.riders.size % 3], bot: true });
  }
  const seen = new Set();
  let eaten = 0;
  for (let i = 0; i < TICK_RATE * (ROAM_SECONDS + 75); i++) {
    g.step();
    seen.add(g.phase);
    for (const e of g.drainEvents()) if (e.type === 'treat') eaten++;
    for (const r of g.riders.values()) {
      assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z), 'finite position');
    }
  }
  assert.ok(seen.has('brawl') && seen.has('results'), 'reached brawl and results');
  assert.ok(eaten > 20, `bots should eat treats (ate ${eaten})`);
});

test('same seed gives the same match', () => {
  const run = () => {
    const g = new Game({ seed: 3 });
    g.addRider({ bot: true }); g.addRider({ bot: true, vehicle: 'wagon' });
    for (let i = 0; i < 2000; i++) g.step();
    return JSON.stringify(g.snapshot());
  };
  assert.equal(run(), run());
});
