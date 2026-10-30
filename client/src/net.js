// Thin WebSocket client for the authoritative server (server/index.js).
// The server owns the simulation; we send inputs and render its snapshots.
export function connect({ name, animal, vehicle, url }) {
  const wsUrl = url || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const net = {
      myId: null,
      latest: null,
      events: [],
      closed: false,
      lastSent: '',
      sendInput(input) {
        const msg = JSON.stringify({ t: 'input', steer: input.steer, button: input.button });
        if (msg !== this.lastSent && ws.readyState === 1) { ws.send(msg); this.lastSent = msg; }
      },
      drainEvents() { const e = this.events; this.events = []; return e; },
      close() { ws.close(); },
    };
    const timeout = setTimeout(() => { ws.close(); reject(new Error('Server did not answer')); }, 5000);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, animal, vehicle }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.t === 'welcome') { net.myId = msg.id; clearTimeout(timeout); resolve(net); }
      else if (msg.t === 'snap') { net.latest = msg.s; if (msg.e?.length) net.events.push(...msg.e); }
    };
    ws.onerror = () => { clearTimeout(timeout); reject(new Error(`Could not reach ${wsUrl}`)); };
    ws.onclose = () => { net.closed = true; };
  });
}
