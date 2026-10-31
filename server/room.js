// One match: an authoritative Game plus the sockets playing in it.
import { Game } from '../shared/sim.js';
import { DT } from '../shared/constants.js';

const RIDERS_PER_ROOM = 6;
const SNAPSHOT_HZ = 20;

export class Room {
  constructor(id) {
    this.id = id;
    this.game = new Game({ seed: (Math.random() * 1e9) | 0 });
    this.game.fillBots(RIDERS_PER_ROOM);
    this.clients = new Map(); // ws -> riderId
    this.events = [];
    this.acc = 0;
    this.sinceSnap = 0;
  }

  get humans() { return this.clients.size; }

  join(ws, { name, animal, tint, hat }) {
    this.game.removeOneBot();
    const id = this.game.addRider({ name: String(name || '').slice(0, 14) || undefined, animal, tint, hat });
    this.clients.set(ws, id);
    ws.send(JSON.stringify({ t: 'welcome', id, room: this.id }));
    return id;
  }

  leave(ws) {
    const id = this.clients.get(ws);
    if (id === undefined) return;
    this.clients.delete(ws);
    this.game.removeRider(id);
    this.game.fillBots(RIDERS_PER_ROOM);
  }

  input(ws, msg) {
    const id = this.clients.get(ws);
    if (id !== undefined) this.game.setInput(id, msg);
  }

  // Advance by real elapsed seconds; broadcast snapshots at SNAPSHOT_HZ.
  update(elapsed) {
    this.acc = Math.min(this.acc + elapsed, 0.25);
    while (this.acc >= DT) {
      this.game.step();
      this.events.push(...this.game.drainEvents());
      this.acc -= DT;
    }
    this.sinceSnap += elapsed;
    if (this.sinceSnap >= 1 / SNAPSHOT_HZ) {
      this.sinceSnap = Math.min(this.sinceSnap - 1 / SNAPSHOT_HZ, 1 / SNAPSHOT_HZ);
      const msg = JSON.stringify({ t: 'snap', s: this.game.snapshot(), e: this.events });
      this.events = [];
      for (const ws of this.clients.keys()) if (ws.readyState === 1) ws.send(msg);
    }
  }
}
