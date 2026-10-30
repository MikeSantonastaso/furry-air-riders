// Shared tuning and content tables. Used by both the browser client and the
// authoritative server, so keep this file free of DOM / Node specifics.

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const GRAVITY = 32;
export const RIDER_RADIUS = 2.2;
export const MAX_STAT = 16;

// Match flow: free-roam the neighbourhood powering up, then everyone is
// dropped into the backyard brawl ring. Last rider rolling wins.
export const ROAM_SECONDS = 120;
export const BRAWL_COUNTDOWN = 3;
export const BRAWL_SECONDS = 60;
export const RESULTS_SECONDS = 10;
export const MAX_TREATS = 45;

export const STATS = ['speed', 'turn', 'glide', 'charge', 'power', 'hp'];

// Each treat bumps one stat. Colours drive both the pickup mesh and the HUD.
export const TREATS = {
  speed:  { label: 'Zoom Carrot',   color: 0xff8a3d },
  turn:   { label: 'Twisty Pretzel', color: 0xd9a066 },
  glide:  { label: 'Fluffy Feather', color: 0x9ee7ff },
  charge: { label: 'Fizzy Berry',   color: 0xc678ff },
  power:  { label: 'Bonk Bone',     color: 0xfff4e0 },
  hp:     { label: 'Cozy Cookie',   color: 0xffd36b },
};

export const VEHICLES = {
  board: {
    name: 'Zoom Board',
    blurb: 'Fast and twitchy. Falls like a rock.',
    base: { speed: 4, turn: 3, glide: 0, charge: 2, power: 1, hp: 1 },
  },
  leaf: {
    name: 'Maple Glider',
    blurb: 'Slow on the street, floats forever.',
    base: { speed: 1, turn: 2, glide: 6, charge: 1, power: 0, hp: 1 },
  },
  wagon: {
    name: 'Red Wagon',
    blurb: 'Heavy, tough, hits like a truck.',
    base: { speed: 2, turn: 0, glide: 0, charge: 3, power: 4, hp: 4 },
  },
};

export const ANIMALS = {
  corgi:   { name: 'Biscuit', species: 'Corgi',   fur: 0xf2a65a, belly: 0xfff3e2, accent: 0x5a3a22 },
  bunny:   { name: 'Clover',  species: 'Bunny',   fur: 0xf4f0ec, belly: 0xffd6e0, accent: 0xff9fb8 },
  raccoon: { name: 'Bandit',  species: 'Raccoon', fur: 0x8d8f99, belly: 0xd8d8de, accent: 0x2d2d35 },
  duck:    { name: 'Puddles', species: 'Duckling', fur: 0xffe066, belly: 0xfff3a8, accent: 0xff8c1a },
  cat:     { name: 'Mochi',   species: 'Cat',     fur: 0x3a3a44, belly: 0xf5f5f5, accent: 0xff9fb8 },
};

// Derived numbers from stat levels. Kept here so client HUD and sim agree.
export function derive(stats) {
  return {
    topSpeed: 26 + stats.speed * 1.6,
    turnRate: 1.7 + stats.turn * 0.12,
    // Fraction of gravity felt while gliding (lower = floatier).
    glideGravity: Math.max(0.18, 0.8 - stats.glide * 0.04),
    // Terminal fall speed while gliding (button released in the air).
    glideFall: Math.max(2.5, 22 - stats.glide * 1.6),
    chargeRate: 0.8 + stats.charge * 0.1,
    boostPower: 20 + stats.charge * 1.4,
    damage: 7 + stats.power * 1.8,
    maxHp: 60 + stats.hp * 8,
  };
}
