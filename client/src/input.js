// Keyboard + touch into the game's one-button input: { steer, button }.
// steer is +1 for left, -1 for right (matches the sim's heading convention).
export function createInput(canvas) {
  const keys = new Set();
  const touch = { active: false, startX: 0, x: 0 };

  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    keys.add(e.code);
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (e) => {
    touch.active = true; touch.startX = touch.x = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => { if (touch.active) touch.x = e.clientX; });
  const end = () => { touch.active = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  return {
    read() {
      let steer = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) steer += 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) steer -= 1;
      let button = keys.has('Space') || keys.has('KeyW') || keys.has('ArrowUp');
      if (touch.active) {
        button = true;
        steer = Math.max(-1, Math.min(1, -(touch.x - touch.startX) / 60));
      }
      return { steer, button };
    },
  };
}
