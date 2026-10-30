import { STATS, TREATS, MAX_STAT, ANIMALS, derive } from '../../shared/constants.js';
import { WORLD, BOUNDS, RING, ARENA } from '../../shared/world.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const STAT_LABEL = { speed: 'Speed', turn: 'Turn', glide: 'Glide', charge: 'Charge', power: 'Power', hp: 'Health' };

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
    const W = 180, inArena = snap.phase === 'brawl';
    const cx = inArena ? ARENA.x : 0, cz = inArena ? ARENA.z : 0;
    const span = inArena ? ARENA.r * 2.4 : BOUNDS * 2.1;
    const k = W / span;
    const P = (x, z) => [W / 2 + (x - cx) * k, W / 2 + (z - cz) * k];
    mm.clearRect(0, 0, W, W);
    mm.save();
    mm.beginPath(); mm.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); mm.clip();
    if (inArena) {
      mm.fillStyle = 'rgba(217,179,140,.8)';
      mm.beginPath(); mm.arc(W / 2, W / 2, ARENA.r * k, 0, Math.PI * 2); mm.fill();
    } else {
      mm.strokeStyle = 'rgba(80,70,100,.6)'; mm.lineWidth = 22 * k;
      mm.strokeRect(...P(-RING, -RING), RING * 2 * k, RING * 2 * k);
      mm.beginPath(); mm.moveTo(...P(-RING, 0)); mm.lineTo(...P(RING, 0));
      mm.moveTo(...P(0, -RING)); mm.lineTo(...P(0, RING)); mm.stroke();
      mm.fillStyle = 'rgba(255,255,255,.75)';
      for (const h of WORLD.houses) { const [x, y] = P(h.x - h.w / 2, h.z - h.d / 2); mm.fillRect(x, y, h.w * k, h.d * k); }
      for (const t of snap.treats) {
        mm.fillStyle = hex(TREATS[t.type].color);
        const [x, y] = P(t.x, t.z); mm.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }
    for (const r of snap.riders) {
      if (r.out) continue;
      const [x, y] = P(r.x, r.z);
      mm.fillStyle = hex(ANIMALS[r.animal].fur);
      mm.strokeStyle = r.id === me?.id ? '#ff3d7f' : '#3b2a4a';
      mm.lineWidth = r.id === me?.id ? 3 : 1.5;
      mm.beginPath(); mm.arc(x, y, r.id === me?.id ? 6 : 4.5, 0, Math.PI * 2); mm.fill(); mm.stroke();
    }
    mm.restore();
  }

  return {
    toast,
    update(snap, me) {
      const phaseName = { roam: 'Neighbourhood Roam', brawl: 'Backyard Brawl', results: 'Results' }[snap.phase];
      $('phase-name').textContent = phaseName;
      const t = Math.max(0, snap.phase === 'brawl' ? Math.min(snap.timer, 60) : snap.timer);
      $('timer').textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
      const countdown = snap.phase === 'brawl' && snap.timer > 60 ? Math.ceil(snap.timer - 60) : 0;
      $('big').textContent = countdown ? String(countdown) : (me?.out && snap.phase === 'brawl' ? 'Spectating…' : '');
      if (me) {
        for (const s of STATS) bars[s].style.width = `${(me.stats[s] / MAX_STAT) * 100}%`;
        $('hpbar').style.width = `${Math.max(0, me.hp / derive(me.stats).maxHp) * 100}%`;
        $('chargefill').style.width = `${me.charge * 100}%`;
        $('speed').textContent = `${Math.round(me.speed * 1.6)} mph`;
      }
      drawMinimap(snap, me);
    },
  };
}
