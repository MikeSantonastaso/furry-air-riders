// Tiny synth blips so the prototype has feedback without audio files.
let ctx = null;
function tone(freq, dur, type = 'sine', vol = 0.15, slide = 0) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, ctx.currentTime + dur);
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + dur);
}

export const sfx = {
  unlock() {
    try { ctx ??= new AudioContext(); ctx.resume(); } catch { ctx = null; }
  },
  treat() { tone(660, 0.08, 'triangle'); setTimeout(() => tone(990, 0.1, 'triangle'), 60); },
  boost() { tone(220, 0.35, 'sawtooth', 0.06, 3); },
  bonk() { tone(160, 0.18, 'square', 0.12, 0.5); },
  ko() { tone(520, 0.5, 'triangle', 0.15, 0.3); },
  land() { tone(90, 0.12, 'sine', 0.2); },
};
