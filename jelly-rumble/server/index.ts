// Punto de entrada del servidor: sirve el cliente compilado (dist/) por HTTP y
// gestiona las salas multijugador por WebSocket en /ws.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { DT, PROTOCOL_VERSION, sanitizeLook, sanitizeName } from '../shared/constants.ts';
import type { ClientMsg, ServerMsg } from '../shared/protocol.ts';
import { Player, Room, allocId } from './room.ts';

const PORT = Number(process.env.PORT ?? 2567);
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

const rooms = new Map<string, Room>();

const http = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.humans().length, 0) }));
    return;
  }
  if (!existsSync(ROOT)) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Servidor de Jelly Rumble activo. Compila el cliente con "npm run build" o usa "npm run dev" y abre http://localhost:5173');
    return;
  }
  let file = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });

function makeCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c = '';
  do {
    c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  } while (rooms.has(c));
  return c;
}

wss.on('connection', (ws: WebSocket) => {
  let player: Player | null = null;
  let room: Room | null = null;
  const conn = {
    send(msg: ServerMsg | string) {
      if (ws.readyState === ws.OPEN) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    },
  };
  const fail = (msg: string) => conn.send({ type: 'error', msg });

  const leaveRoom = () => {
    if (room && player) {
      room.removePlayer(player.id);
      if (room.isEmpty()) rooms.delete(room.code);
    }
    room = null;
  };

  const enter = (r: Room) => {
    if (!player) return;
    leaveRoom();
    room = r;
    r.addHuman(player);
    conn.send(r.roomInfo());
  };

  ws.on('message', (data) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(data)) as ClientMsg;
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'hello') {
      if (msg.v !== PROTOCOL_VERSION) return fail('Versión del cliente incompatible: recarga la página');
      player = new Player(allocId(), sanitizeName(msg.name), sanitizeLook(msg.look), conn);
      conn.send({ type: 'welcome', id: player.id, v: PROTOCOL_VERSION });
      return;
    }
    if (!player) return;
    switch (msg.type) {
      case 'profile':
        player.name = sanitizeName(msg.name);
        player.look = sanitizeLook(msg.look);
        room?.markDirty();
        break;
      case 'quick': {
        const open = [...rooms.values()].find((r) => r.isPublic && (r.phase === 'lobby' || r.phase === 'countdown') && r.canJoin());
        if (open) {
          enter(open);
        } else {
          const r = new Room(makeCode(), true);
          rooms.set(r.code, r);
          enter(r);
        }
        break;
      }
      case 'create': {
        const r = new Room(makeCode(), false);
        rooms.set(r.code, r);
        enter(r);
        break;
      }
      case 'join': {
        const code = String(msg.code ?? '').toUpperCase().trim();
        const r = rooms.get(code);
        if (!r) return fail(`No existe ninguna sala con el código ${code}`);
        if (!r.canJoin()) return fail('La sala está llena');
        enter(r);
        break;
      }
      case 'leave':
        leaveRoom();
        conn.send({ type: 'left' });
        break;
      case 'start': {
        const err = room?.requestStart(player.id);
        if (err) fail(err);
        break;
      }
      case 'bots': {
        const err = room?.setBots(player.id, Number(msg.n));
        if (err) fail(err);
        break;
      }
      case 'in':
        room?.queueInput(player.id, { s: Number(msg.s), mx: Number(msg.mx), mz: Number(msg.mz), yaw: Number(msg.yaw), b: Number(msg.b) | 0 });
        break;
      case 'ping':
        conn.send({ type: 'pong', t: Number(msg.t) });
        break;
    }
  });

  ws.on('close', leaveRoom);
  ws.on('error', leaveRoom);
});

// Bucle de simulación a tasa fija.
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += (now - last) / 1000;
  last = now;
  let steps = 0;
  while (acc >= DT && steps < 5) {
    acc -= DT;
    steps++;
    for (const r of rooms.values()) r.tick();
  }
  if (steps === 5) acc = 0;
  if (steps > 0) for (const r of rooms.values()) r.sendState();
}, 1000 / 120);

http.listen(PORT, () => {
  console.log(`Jelly Rumble escuchando en http://localhost:${PORT} (WebSocket en /ws)`);
});
