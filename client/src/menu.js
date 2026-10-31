// Main menu: pick an animal, fur colour and hat, with a spinning 3D preview.
// Choices are remembered in localStorage between visits.
import * as THREE from 'three';
import { ANIMALS, HATS } from '../../shared/constants.js';
import { buildAnimal, buildVehicle } from './models.js';

const $ = (id) => document.getElementById(id);
export const EMOJI = { corgi: '🐶', bunny: '🐰', raccoon: '🦝', duck: '🐥', cat: '🐱' };
const HAT_LABEL = {
  none: ['🚫', 'None'], party: ['🥳', 'Party'], bow: ['🎀', 'Bow'], flower: ['🌸', 'Flowers'],
  shades: ['😎', 'Shades'], beanie: ['🧢', 'Beanie'], crown: ['👑', 'Crown'],
};
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

function load() {
  try { return JSON.parse(localStorage.getItem('far-look')) || {}; } catch { return {}; }
}
function save(pick) {
  try { localStorage.setItem('far-look', JSON.stringify(pick)); } catch { /* private mode */ }
}

export function createMenu() {
  const saved = load();
  const pick = {
    animal: ANIMALS[saved.animal] ? saved.animal : 'corgi',
    tint: Number.isInteger(saved.tint) ? saved.tint : 0,
    hat: HATS.includes(saved.hat) ? saved.hat : 'none',
  };
  if (saved.name) $('name').value = saved.name;
  $('name').addEventListener('input', () => { pick.name = $('name').value.trim(); save(pick); });

  // Preview renderer.
  const canvas = $('preview');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x88b070, 1.8));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(3, 6, 5);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(35, canvas.width / canvas.height, 0.1, 50);
  cam.position.set(0, 3.2, 9.5);
  cam.lookAt(0, 1.6, 0);
  const turntable = new THREE.Group();
  scene.add(turntable);

  function rebuild() {
    turntable.clear();
    const { group, seat } = buildVehicle('box');
    turntable.add(group);
    const a = buildAnimal(pick.animal, pick);
    a.position.y = seat;
    turntable.add(a);
    save(pick);
  }

  function group(el, entries, key, render) {
    el.innerHTML = '';
    for (const [value, html] of entries) {
      const b = document.createElement('button');
      b.className = 'choice' + (pick[key] === value ? ' on' : '');
      b.innerHTML = html;
      render?.(b, value);
      b.onclick = () => {
        pick[key] = value;
        el.querySelectorAll('.choice').forEach((c) => c.classList.remove('on'));
        b.classList.add('on');
        if (key === 'animal') drawTints();
        rebuild();
      };
      el.appendChild(b);
    }
  }

  function drawTints() {
    const a = ANIMALS[pick.animal];
    const cols = [a.fur, ...a.alt];
    group($('tints'), cols.map((c, i) => [i, '']), 'tint', (b, i) => { b.style.background = hex(cols[i]); b.title = i ? `Colour ${i + 1}` : 'Classic'; });
  }

  group($('animals'), Object.entries(ANIMALS).map(([id, a]) => [id, `<span class="em">${EMOJI[id]}</span>${a.name}<small>${a.species}</small>`]), 'animal');
  drawTints();
  group($('hats'), HATS.map((h) => [h, `<span class="em">${HAT_LABEL[h][0]}</span>${HAT_LABEL[h][1]}`]), 'hat');
  rebuild();

  let running = true;
  (function spin(t) {
    if (!running) return;
    turntable.rotation.y = t / 1400;
    renderer.render(scene, cam);
    requestAnimationFrame(spin);
  })(0);

  return {
    pick,
    stop() { running = false; },
  };
}
