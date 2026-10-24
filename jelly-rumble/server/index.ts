// Punto de entrada del servidor: sirve el cliente compilado (dist/) por HTTP y
// gestiona las salas multijugador por WebSocket en /ws.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ServerMsg } from '../shared/protocol.ts';
import { FileProfileStore } from './fileStore.ts';
import { Hub } from './hub.ts';

const PORT = Number(process.env.PORT ?? 2567);
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

const store = new FileProfileStore();
const hub = new Hub(store);

const http = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: hub.rooms.size, players: hub.playerCount() }));
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

wss.on('connection', (ws: WebSocket) => {
  const session = hub.connect({
    send(msg: ServerMsg | string) {
      if (ws.readyState === ws.OPEN) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    },
  });
  ws.on('message', (data) => {
    try {
      session.receive(JSON.parse(String(data)));
    } catch {
      /* mensaje mal formado: se ignora */
    }
  });
  ws.on('close', () => session.close());
  ws.on('error', () => session.close());
});

setInterval(() => hub.pump(performance.now()), 1000 / 120);

http.listen(PORT, () => {
  console.log(`Jelly Rumble escuchando en http://localhost:${PORT} (WebSocket en /ws)`);
});

// Guardar perfiles pendientes antes de salir.
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    store.flush();
    process.exit(0);
  });
}
