// Shared tuning and content tables. Used by both the browser client and the
// authoritative server, so keep this file free of DOM / Node specifics.

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const GRAVITY = 32;
export const RIDER_RADIUS = 2.2;
export const MAX_STAT = 16;

// Match flow: free-roam the neighbourhood powering up, then a random final
// event tests what you built. Neighbourhood events pop up during the roam.
export const ROAM_SECONDS = 150;
export const FINAL_COUNTDOWN = 3;
export const FINAL_ANNOUNCE_AT = 20;  // roam seconds left when the final is revealed
export const RESULTS_SECONDS = 10;
export const MAX_TREATS = 40;
export const MAX_CRATES = 12;
export const MAX_PARKED_RIDES = 8;
export const EVENT_GAP = [25, 35];    // seconds between neighbourhood events

export const STATS = ['speed', 'turn', 'glide', 'charge', 'power', 'hp'];

// Each treat bumps one stat. Colours drive both the pickup mesh and the HUD.
export const TREATS = {
  speed:  { label: 'Zoom Carrot',    color: 0xff8a3d },
  turn:   { label: 'Twisty Pretzel', color: 0xd9a066 },
  glide:  { label: 'Fluffy Feather', color: 0x9ee7ff },
  charge: { label: 'Fizzy Berry',    color: 0xc678ff },
  power:  { label: 'Bonk Bone',      color: 0xfff4e0 },
  hp:     { label: 'Cozy Cookie',    color: 0xffd36b },
};

// Rides add their base stats on top of the treats you've eaten. Everyone
// starts in a Cardboard Box and has to find something better.
export const VEHICLES = {
  box: {
    name: 'Cardboard Box', starter: true, speedMul: 0.82,
    blurb: 'Everyone starts here. Find a real ride!',
    base: { speed: 0, turn: 2, glide: 0, charge: 1, power: 0, hp: 0 },
  },
  board: {
    name: 'Zoom Board', speedMul: 1,
    blurb: 'Fast and twitchy. Falls like a rock.',
    base: { speed: 5, turn: 4, glide: 0, charge: 2, power: 1, hp: 1 },
  },
  leaf: {
    name: 'Maple Glider', speedMul: 1,
    blurb: 'Slow on the street, floats forever.',
    base: { speed: 1, turn: 2, glide: 7, charge: 1, power: 0, hp: 1 },
  },
  wagon: {
    name: 'Red Wagon', speedMul: 1,
    blurb: 'Heavy, tough, hits like a truck.',
    base: { speed: 2, turn: 0, glide: 0, charge: 3, power: 5, hp: 4 },
  },
  mower: {
    name: 'Putt-Putt Mower', speedMul: 1,
    blurb: 'Slow to start, huge charge, tanky.',
    base: { speed: 3, turn: 1, glide: 1, charge: 6, power: 3, hp: 5 },
  },
};
export const SPAWN_RIDES = Object.keys(VEHICLES).filter((v) => !VEHICLES[v].starter);

// Timed weapons fire on their own; you just steer.
export const WEAPONS = {
  sprinkler: { label: 'Sprinkler Spin', seconds: 6, color: 0x4fc3f7 },
  acorn:     { label: 'Acorn Popper',   seconds: 7, color: 0xa0522d },
  bark:      { label: 'Big Bark',       seconds: 7, color: 0xffd166 },
};

export const EVENTS = {
  treatRain:  { label: 'Treat Shower', seconds: 14 },
  iceCream:   { label: 'Ice Cream Truck', seconds: 25 },
  acornStorm: { label: 'Acorn Storm', seconds: 14 },
  garbageDay: { label: 'Garbage Day', seconds: 4 },
  yardSale:   { label: 'Yard Sale', seconds: 4 },
};

export const FINALS = {
  brawl: { label: 'Backyard Brawl', seconds: 60, blurb: 'Last rider rolling wins.' },
  leap:  { label: 'Big Leap', seconds: 18, blurb: 'Launch off the mega ramp. Farthest landing wins.' },
  hill:  { label: 'King of the Hill', seconds: 45, blurb: 'Hold the hilltop the longest.' },
};

export const ANIMALS = {
  corgi:   { name: 'Biscuit', species: 'Corgi',    fur: 0xf2a65a, belly: 0xfff3e2, accent: 0x5a3a22, alt: [0xe0c9a6, 0x3b2b25, 0xd96f3c] },
  bunny:   { name: 'Clover',  species: 'Bunny',    fur: 0xf4f0ec, belly: 0xffd6e0, accent: 0xff9fb8, alt: [0xbfa58a, 0x9c9c9c, 0xffc9de] },
  raccoon: { name: 'Bandit',  species: 'Raccoon',  fur: 0x8d8f99, belly: 0xd8d8de, accent: 0x2d2d35, alt: [0xa58a6f, 0x6b7ea8, 0xc9a0dc] },
  duck:    { name: 'Puddles', species: 'Duckling', fur: 0xffe066, belly: 0xfff3a8, accent: 0xff8c1a, alt: [0xffffff, 0xa8e6a1, 0xffb3c6] },
  cat:     { name: 'Mochi',   species: 'Cat',      fur: 0x3a3a44, belly: 0xf5f5f5, accent: 0xff9fb8, alt: [0xf0a35e, 0xd9d9d9, 0x8a7f9c] },
};

export const HATS = ['none', 'party', 'bow', 'flower', 'shades', 'beanie', 'crown'];

// Rider stats = treats eaten + the ride's base.
export function effective(stats, vehicle) {
  const base = VEHICLES[vehicle]?.base || VEHICLES.box.base;
  const out = {};
  for (const s of STATS) out[s] = stats[s] + base[s];
  return out;
}

// Derived numbers from stat levels. Kept here so client HUD and sim agree.
export function derive(stats, vehicle = 'board') {
  const mul = VEHICLES[vehicle]?.speedMul ?? 1;
  return {
    topSpeed: (26 + stats.speed * 1.5) * mul,
    turnRate: 1.7 + stats.turn * 0.11,
    glideGravity: Math.max(0.18, 0.8 - stats.glide * 0.035),
    // Terminal fall speed while gliding (button released in the air).
    glideFall: Math.max(2.5, 22 - stats.glide * 1.4),
    chargeRate: 0.8 + stats.charge * 0.09,
    boostPower: 20 + stats.charge * 1.3,
    damage: 7 + stats.power * 1.6,
    maxHp: 50 + stats.hp * 7,
  };
}
