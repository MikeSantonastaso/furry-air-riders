// Authoritative multiplayer server. Serves the built client from dist/ and
// runs matches over WebSocket at /ws. Designed to run as a single process on
// a small droplet: `npm run build && PORT=8080 npm run server`.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';

const PORT = Number(process.env.PORT) || 8080;
const MAX_HUMANS_PER_ROOM = 6;
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.end('ok'); return; }
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found. Did you run "npm run build"?');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const rooms = [];
let nextRoomId = 1;
function findRoom() {
  let room = rooms.find((r) => r.humans < MAX_HUMANS_PER_ROOM);
  if (!room) { room = new Room(nextRoomId++); rooms.push(room); }
  return room;
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', (ws) => {
  let room = null;
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.t === 'join' && !room) {
      room = findRoom();
      room.join(ws, msg);
      console.log(`room ${room.id}: ${room.humans} player(s)`);
    } else if (msg.t === 'input' && room) {
      room.input(ws, msg);
    }
  });
  ws.on('close', () => {
    if (!room) return;
    room.leave(ws);
    if (room.humans === 0) rooms.splice(rooms.indexOf(room), 1);
  });
});

let last = process.hrtime.bigint();
setInterval(() => {
  const now = process.hrtime.bigint();
  const elapsed = Number(now - last) / 1e9;
  last = now;
  for (const room of rooms) room.update(elapsed);
}, 1000 / 60);

server.listen(PORT, () => console.log(`Furry Air Riders server on http://localhost:${PORT}`));
