// Pruebas sin navegador: (1) simula partidas completas con bots en el servidor
// para comprobar que las cinco rondas avanzan y siempre hay un ganador; (2)
// arranca el servidor real y conecta dos clientes WebSocket a la misma sala.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { PROTOCOL_VERSION, TICK_RATE } from '../shared/constants.ts';
import { MAPS } from '../shared/maps.ts';
import { buildSolids, newPhysState, stepPlayer } from '../shared/physics.ts';
import type { ServerMsg } from '../shared/protocol.ts';
import { Player, Room, allocId } from '../server/room.ts';

function physicsSanity(): void {
  for (const map of MAPS) {
    const solids = buildSolids(map, 0, map.tileCount ? '0'.repeat(map.tileCount) : '');
    for (const sp of map.spawns) {
      const s = newPhysState(sp[0], sp[1] + 0.5, sp[2]);
      for (let i = 0; i < TICK_RATE * 2; i++) stepPlayer(s, { mx: 0, mz: 0, jump: false, run: false, block: false }, map, solids, 0, 1 / TICK_RATE);
      assert.ok(s.grounded, `${map.name}: el punto de aparición (${sp.join(',')}) no tiene suelo (y=${s.y.toFixed(2)})`);
    }
  }
  // Salto: sube y vuelve a aterrizar.
  const map = MAPS[0]!;
  const solids = buildSolids(map, 0, '');
  const s = newPhysState(5, 0.5, 5);
  let maxY = 0;
  let jumped = false;
  for (let i = 0; i < 60; i++) {
    const ev = stepPlayer(s, { mx: 0, mz: 0, jump: i === 10, run: false, block: false }, map, solids, 0, 1 / TICK_RATE);
    jumped ||= ev.jumped;
    maxY = Math.max(maxY, s.y);
  }
  assert.ok(jumped && maxY > 1.5 && s.grounded, 'el salto debe elevar y aterrizar');
  console.log('✔ física: apariciones con suelo y salto correcto en los 5 mapas');
}

function simulateMatch(bots: number): void {
  const msgs: string[] = [];
  const room = new Room('TEST', false);
  const host = new Player(allocId(), 'Host', { color: '#ff0000', accessory: 'none', eyes: 'round' }, { send: (m) => msgs.push(typeof m === 'string' ? m : JSON.stringify(m)) });
  room.addHuman(host);
  assert.equal(room.setBots(host.id, bots), null);
  // El anfitrión humano se queda quieto: debe caer o sobrevivir según el mapa.
  assert.equal(room.requestStart(host.id), null);
  const rounds = new Set<number>();
  let ticks = 0;
  let final: any = null;
  while (ticks < TICK_RATE * 60 * 12) {
    room.tick();
    room.sendState();
    ticks++;
    if (room.phase === 'playing') rounds.add(room.round);
    for (const m of msgs.splice(0)) {
      const o = JSON.parse(m) as ServerMsg;
      if (o.type === 'final') final = o;
    }
    if (final && room.phase === 'lobby') break;
  }
  assert.ok(final, 'la partida debe terminar con un ganador');
  assert.equal(room.phase, 'lobby', 'tras la victoria la sala vuelve a la espera');
  console.log(`✔ partida simulada (${bots} bots + 1 humano quieto): rondas jugadas ${[...rounds].map((r) => r + 1).join(',')} · campeón: ${final.winnerName} (${final.reason}) · ${(ticks / TICK_RATE / 60).toFixed(1)} min de juego`);
}

async function networkTest(): Promise<void> {
  const port = 27000 + Math.floor(Math.random() * 1000);
  const srv = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise<void>((res) => srv.stdout!.on('data', (d) => String(d).includes('escuchando') && res()));
  const open = (name: string) => new Promise<{ ws: WebSocket; inbox: ServerMsg[]; id: () => number }>((res) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const inbox: ServerMsg[] = [];
    let id = -1;
    ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as ServerMsg;
      if (m.type === 'welcome') id = m.id;
      inbox.push(m);
    });
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION, name, look: { color: '#3bb4ff', accessory: 'crown', eyes: 'happy' } }));
      res({ ws, inbox, id: () => id });
    });
  });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    const a = await open('Ana');
    const b = await open('Beto');
    await wait(200);
    a.ws.send(JSON.stringify({ type: 'create' }));
    await wait(200);
    const roomA = a.inbox.filter((m) => m.type === 'room').pop() as any;
    assert.ok(roomA?.code, 'Ana recibe el código de sala');
    b.ws.send(JSON.stringify({ type: 'join', code: roomA.code }));
    await wait(200);
    a.ws.send(JSON.stringify({ type: 'start' }));
    await wait(5000 + 4200);
    // Beto se mueve hacia +x durante 1 s.
    let seq = 0;
    const before = (b.inbox.filter((m) => m.type === 's').pop() as any).p.find((p: number[]) => p[0] === b.id());
    for (let i = 0; i < 30; i++) {
      b.ws.send(JSON.stringify({ type: 'in', s: ++seq, mx: 1, mz: 0, yaw: 0, b: 0 }));
      await wait(33);
    }
    await wait(300);
    const snapA = a.inbox.filter((m) => m.type === 's').pop() as any;
    const after = snapA.p.find((p: number[]) => p[0] === b.id());
    assert.equal(snapA.phase, 'playing');
    assert.ok(after[1] - before[1] > 3, `Ana ve a Beto moverse (dx=${(after[1] - before[1]).toFixed(2)})`);
    // Un cliente no puede iniciar si no es anfitrión.
    b.ws.send(JSON.stringify({ type: 'start' }));
    await wait(150);
    assert.ok(b.inbox.some((m) => m.type === 'error'), 'el servidor rechaza acciones no autorizadas');
    console.log(`✔ red: 2 clientes en la sala ${roomA.code}, ronda en juego, posiciones sincronizadas (dx=${(after[1] - before[1]).toFixed(2)}), servidor valida permisos`);
    a.ws.close();
    b.ws.close();
  } finally {
    srv.kill();
  }
}

physicsSanity();
for (const n of [1, 3, 7, 11]) simulateMatch(n);
await networkTest();
console.log('Todas las pruebas pasaron');
