import { STATS, TREATS, WEAPONS, EVENTS, FINALS, VEHICLES, MAX_STAT, ANIMALS, effective } from '../../shared/constants.js';
import { WORLD, BOUNDS, RING, ARENA, HILL_ZONE, LEAP, LEAP_RAMP_END } from '../../shared/world.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const STAT_LABEL = { speed: 'Speed', turn: 'Turn', glide: 'Glide', charge: 'Charge', power: 'Power', hp: 'Health' };
const STAT_MAX = MAX_STAT + 7; // treats plus the best ride bonus
const EVENT_ICON = { treatRain: '🍬', iceCream: '🍦', acornStorm: '🌰', garbageDay: '🗑️', yardSale: '🏷️' };
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function createHud() {
  const statsEl = $('stats');
  const bars = {};
  for (const s of STATS) {
    const row = document.createElement('div');
    row.className = 'stat';
    row.innerHTML = `<span>${STAT_LABEL[s]}</span><div class="bar"><i style="background:${hex(TREATS[s].color)}"></i></div>`;
    statsEl.appendChild(row);
    bars[s] = row.querySelector('i');
  }
  const mm = $('minimap').getContext('2d');

  function toast(text, color = '#fff') {
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.color = color;
    t.textContent = text;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 1600);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }

  function drawMinimap(snap, me) {
    const W = 180;
    const final = snap.phase !== 'roam' ? snap.finalType : null;
    let cx = 0, cz = 0, span = BOUNDS * 2.1;
    if (final === 'leap') { cx = LEAP.x; cz = (LEAP.startZ + LEAP.endZ) / 2; span = LEAP.endZ - LEAP.startZ + 20; }
    else if (final) { cx = ARENA.x; cz = ARENA.z; span = ARENA.r * 2.4; }
    const k = W / span;
    const P = (x, z) => [W / 2 + (x - cx) * k, W / 2 + (z - cz) * k];
    const dot = (x, z, r, fill, stroke, lw = 1.5) => {
      const [px, py] = P(x, z);
      mm.fillStyle = fill; mm.beginPath(); mm.arc(px, py, r, 0, Math.PI * 2); mm.fill();
      if (stroke) { mm.strokeStyle = stroke; mm.lineWidth = lw; mm.stroke(); }
    };
    mm.clearRect(0, 0, W, W);
    mm.save();
    mm.beginPath(); mm.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); mm.clip();
    if (final === 'leap') {
      mm.fillStyle = 'rgba(159,220,124,.8)';
      mm.fillRect(...P(LEAP.x - LEAP.halfW, LEAP.startZ), LEAP.halfW * 2 * k, (LEAP.endZ - LEAP.startZ) * k);
      mm.fillStyle = 'rgba(255,179,71,.9)';
      mm.fillRect(...P(LEAP.x - LEAP.wid / 2, LEAP.rampZ - LEAP.len / 2), LEAP.wid * k, LEAP.len * k);
      mm.fillStyle = '#fff';
      for (let d = 50; LEAP_RAMP_END + d < LEAP.endZ; d += 50) mm.fillRect(...P(LEAP.x - LEAP.halfW, LEAP_RAMP_END + d), LEAP.halfW * 2 * k, 1);
    } else if (final) {
      dot(ARENA.x, ARENA.z, ARENA.r * k, 'rgba(217,179,140,.8)');
      if (final === 'hill') dot(ARENA.x, ARENA.z, HILL_ZONE * k, 'rgba(255,209,102,.8)');
    } else {
      mm.strokeStyle = 'rgba(80,70,100,.6)'; mm.lineWidth = 22 * k;
      mm.strokeRect(...P(-RING, -RING), RING * 2 * k, RING * 2 * k);
      mm.beginPath(); mm.moveTo(...P(-RING, 0)); mm.lineTo(...P(RING, 0));
      mm.moveTo(...P(0, -RING)); mm.lineTo(...P(0, RING)); mm.stroke();
      mm.fillStyle = 'rgba(255,255,255,.6)';
      for (const h of WORLD.houses) { const [x, y] = P(h.x - h.w / 2, h.z - h.d / 2); mm.fillRect(x, y, h.w * k, h.d * k); }
      if (snap.event?.type === 'treatRain') dot(snap.event.x, snap.event.z, 45 * k, 'rgba(255,143,177,.35)');
      for (const t of snap.items) {
        mm.fillStyle = hex((TREATS[t.type] || WEAPONS[t.type]).color);
        const [x, y] = P(t.x, t.z); mm.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
      for (const c of snap.crates) { const [x, y] = P(c.x, c.z); mm.fillStyle = '#ff8fb1'; mm.fillRect(x - 2.5, y - 2.5, 5, 5); }
      for (const p of snap.parked) dot(p.x, p.z, 4, 'rgba(255,255,255,.95)', '#ff3d7f', 2);
      if (snap.truck) dot(snap.truck.x, snap.truck.z, 6, '#fff3f8', '#ff8fb1', 3);
    }
    for (const r of snap.riders) {
      if (r.out) continue;
      const mine = r.id === me?.id;
      dot(r.x, r.z, mine ? 6 : 4.5, hex(ANIMALS[r.animal].fur), mine ? '#ff3d7f' : '#3b2a4a', mine ? 3 : 1.5);
    }
    mm.restore();
  }

  return {
    toast,
    update(snap, me) {
      const final = FINALS[snap.finalType];
      const inFinal = snap.phase === 'final';
      $('phase-name').textContent = snap.phase === 'roam' ? 'Neighbourhood Roam' : inFinal ? final.label : 'Results';
      const t = Math.max(0, inFinal ? Math.min(snap.timer, final.seconds) : snap.timer);
      $('timer').textContent = fmt(t);
      const countdown = inFinal && snap.timer > final.seconds ? Math.ceil(snap.timer - final.seconds) : 0;
      $('big').textContent = countdown ? String(countdown) : (me?.out && inFinal ? 'Spectating…' : '');

      let line = '';
      if (snap.phase === 'roam' && snap.event) line = `${EVENT_ICON[snap.event.type]} ${EVENTS[snap.event.type].label} · ${Math.ceil(snap.event.timer)}s`;
      else if (snap.phase === 'roam' && snap.finalAnnounced) line = `🏁 Final event: ${final.label}`;
      else if (inFinal && snap.finalType === 'hill' && me) line = `👑 Your hill time: ${me.score.toFixed(1)}s`;
      else if (inFinal && snap.finalType === 'leap' && me) line = me.score > 0 ? `📏 You flew ${Math.round(me.score)}m` : 'Charge up, boost into the ramp, glide!';
      $('eventline').textContent = line;

      if (me) {
        const eff = effective(me.stats, me.vehicle);
        for (const s of STATS) bars[s].style.width = `${Math.min(1, eff[s] / STAT_MAX) * 100}%`;
        $('hpbar').style.width = `${Math.max(0, me.hp / me.maxHp) * 100}%`;
        $('chargefill').style.width = `${me.charge * 100}%`;
        $('speed').textContent = `${Math.round(me.speed * 1.6)} mph`;
        const v = VEHICLES[me.vehicle];
        $('ride').textContent = v.starter && snap.phase === 'roam' ? `📦 ${v.name}: drive into a parked ride to hop on!` : `Riding: ${v.name}` + (snap.phase === 'roam' ? ' · hold Space by another ride to swap' : '');
        const w = me.weapon;
        $('weapon').classList.toggle('on', !!w);
        if (w) {
          $('weapon-name').textContent = `⚡ ${WEAPONS[w.type].label}`;
          $('weapon-bar').firstChild.style.width = `${(w.time / WEAPONS[w.type].seconds) * 100}%`;
        }
      }
      drawMinimap(snap, me);
    },
  };
}
