# Furry Air Riders

A cozy arena riding game: cute animals on backyard rides (skateboards, maple
leaves, red wagons) zooming around a neighbourhood, gobbling treats to power
up, and bonking each other, then a final showdown in the Backyard Brawl ring.

This is the first playable prototype. It runs in the browser with bots, and
already has an authoritative Node server so we can test real multiplayer on a
DigitalOcean droplet next.

## Play it

**In the browser:** https://mikesantonastaso.github.io/furry-air-riders/
(click "Ride solo"). Every push to `main` redeploys it via GitHub Actions.
Online play needs the server below, so it doesn't work on the github.io page.

**Locally:**

```bash
npm install
npm run dev          # http://localhost:5173, click "Ride solo"
```

To try online play locally, run the server in a second terminal:

```bash
npm run server       # ws://localhost:8080/ws (Vite proxies /ws to it)
```

Then open two browser tabs and click **Ride online** in each.

## How it plays

**One button.** Your ride always rolls forward on its own.

| Input | On the ground | In the air |
| --- | --- | --- |
| A / D or arrow keys | steer | steer |
| **Space** (hold) | brake and charge up, pivots tighter | dive fast |
| **Space** (let go) | boost: the longer the charge, the bigger it is | glide |

Touch: hold anywhere to charge, drag left or right to steer.

**A round:**

1. **Neighbourhood Roam (2:30).** Everyone starts in a **Cardboard Box**.
   - **Rides** are parked around the neighbourhood. Drive into one to hop on.
     Already riding? Hold Space next to another ride to swap.
   - **Treats** lie on the ground and each raises a stat: Zoom Carrot (speed),
     Twisty Pretzel (turn), Fluffy Feather (glide), Fizzy Berry (charge),
     Bonk Bone (power), Cozy Cookie (health).
   - **Gift crates** break open when you ram them (boost to smash them in one
     hit). Inside: a pile of treats, a weapon, or sometimes a ride.
   - **Weapons** last a few seconds and fire on their own: Sprinkler Spin (hits
     everyone around you), Acorn Popper (shoots forward), Big Bark (big cone
     blast). Hits knock treats loose, and enough damage **wrecks a ride**,
     dropping its rider back into a box.
   - **Neighbourhood events** pop up at random: Ice Cream Truck (drives the
     ring road dropping treats, don't get run over), Acorn Storm (dodge the
     red circles), Treat Shower, Garbage Day (crates everywhere), Yard Sale
     (free rides).
2. **Final event**, picked at random and revealed 20 seconds before the roam
   ends: **Backyard Brawl** (last rider rolling), **Big Leap** (farthest
   landing off a mega ramp) or **King of the Hill** (most time on the hilltop).
3. **Results**, then a new round starts.

**Riders:** Biscuit the Corgi, Clover the Bunny, Bandit the Raccoon, Puddles
the Duckling and Mochi the Cat, each with four fur colours and seven hats.
The menu remembers your look.

**Rides:** Cardboard Box (starter), Zoom Board (fast, falls like a rock),
Maple Glider (slow, floats forever), Red Wagon (heavy, hits hard), Putt-Putt
Mower (huge charge, tanky).

## Code layout

```
shared/   Game rules. Pure JS, no DOM or Node APIs, fixed 60 Hz step, seeded RNG.
  sim.js        the authoritative simulation (movement, gliding, bonks, treats, phases)
  world.js      the map as data plus groundHeight() for collision
  ai.js         bots that press the same "buttons" a player does
  constants.js  tuning: stats, rides, animals, round timings
client/   Three.js renderer, HUD, input, sounds. Runs the sim locally for solo play.
server/   Node + ws. Runs the same sim per room and streams snapshots at 20 Hz.
```

Solo play and online play share the exact same simulation code, so the server
is the source of truth in multiplayer and nothing gets re-implemented.

`npm test` runs a full bot-only match through every phase and checks that the
simulation is deterministic for a given seed.

## Multiplayer on a DigitalOcean droplet (next step)

The server is one process that serves the built game and the WebSocket on the
same port, so a droplet only needs Node 20+:

```bash
git clone https://github.com/MikeSantonastaso/furry-air-riders.git
cd furry-air-riders
npm ci && npm run build
PORT=8080 npm run server     # then visit http://<droplet-ip>:8080
```

Still to do for real deployment: a process manager (systemd or pm2), HTTPS
via Caddy or nginx in front (so the game uses `wss://`), and client-side
prediction so your own ride feels instant over the internet. You can also
point a local dev build at a remote server with `?server=wss://host/ws`.

## Prototype status

- [x] One-button riding, charging, boosting, diving and gliding
- [x] Neighbourhood map with rooftops, ramps, park hill and skate yard
- [x] Starter box, ride spawns and ride swapping
- [x] Treats, gift crates, timed weapons, ride wrecking, bots
- [x] Random neighbourhood events during the roam
- [x] Random final event: Brawl, Big Leap, King of the Hill
- [x] Character menu with fur colours and hats
- [x] Authoritative server with rooms that fill empty seats with bots
- [ ] Client-side prediction and interpolation tuning for online play
- [ ] More rides, finals and events; per-animal abilities
- [ ] Real art and audio
