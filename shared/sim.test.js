import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './sim.js';
import { ROAM_SECONDS, TICK_RATE, FINALS } from './constants.js';

function botMatch(seed, finalType) {
  const g = new Game({ seed });
  g.fillBots(6);
  if (finalType) g.finalType = finalType;
  const counts = {};
  const seen = new Set();
  for (let i = 0; i < TICK_RATE * (ROAM_SECONDS + 75); i++) {
    g.step();
    seen.add(g.phase);
    for (const e of g.drainEvents()) counts[e.type] = (counts[e.type] || 0) + 1;
    for (const r of g.riders.values()) {
      assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z), 'finite position');
    }
    if (g.phase === 'results') break;
  }
  return { g, counts, seen };
}

for (const final of Object.keys(FINALS)) {
  test(`a full bot match reaches results via ${final}`, () => {
    const { g, counts, seen } = botMatch(7, final);
    assert.ok(seen.has('final') && seen.has('results'), 'reached final and results');
    assert.equal(g.standings.length, 6);
    assert.ok(counts.treat > 20, `bots eat treats (${counts.treat})`);
    assert.ok(counts.hop > 0, 'bots hop onto rides');
    assert.ok(counts.crateBreak > 0, 'bots break crates');
    assert.ok(counts.event > 0, 'neighbourhood events happen');
    if (final === 'leap') assert.ok(g.standings[0].score > 0, 'someone leaped');
  });
}

test('everyone starts in a cardboard box', () => {
  const g = new Game({ seed: 1 });
  g.fillBots(3);
  for (const r of g.riders.values()) assert.equal(r.vehicle, 'box');
});

test('same seed gives the same match', () => {
  const run = () => {
    const g = new Game({ seed: 3 });
    g.fillBots(4);
    for (let i = 0; i < 3000; i++) g.step();
    return JSON.stringify(g.snapshot());
  };
  assert.equal(run(), run());
});
