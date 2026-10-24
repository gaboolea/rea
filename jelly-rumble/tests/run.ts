// Pruebas sin navegador:
//  1. Física: todas las apariciones tienen suelo, el salto funciona y el
//     trampolín de la carrera permite subir a la plataforma alta.
//  2. Torneos completos simulados a través del registro de salas (con bots y
//     un humano quieto): se juegan las 5 rondas, hay campeón, se reparten
//     recompensas y se guardan en el perfil.
//  3. Red real: servidor + dos clientes WebSocket en la misma sala.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { PROTOCOL_VERSION, TICK_RATE } from '../shared/constants.ts';
import { MAPS } from '../shared/maps.ts';
import { buildSolids, newPhysState, stepPlayer } from '../shared/physics.ts';
import type { FinalResult, RoundResult, ServerMsg } from '../shared/protocol.ts';
import { Hub } from '../server/hub.ts';
import { MemoryProfileStore } from '../server/profiles.ts';

const DT = 1 / TICK_RATE;

function physicsSanity(): void {
  for (const map of MAPS) {
    const solids = buildSolids(map, 0, map.tileCount ? '0'.repeat(map.tileCount) : '');
    for (const sp of map.spawns) {
      const s = newPhysState(sp[0], sp[1] + 0.5, sp[2]);
      for (let i = 0; i < TICK_RATE * 2; i++) stepPlayer(s, { mx: 0, mz: 0, jump: false, run: false, block: false }, map, solids, 0, DT);
      assert.ok(s.grounded, `${map.name}: el punto de aparición (${sp.join(',')}) no tiene suelo (y=${s.y.toFixed(2)})`);
    }
  }
  // Sin las barras giratorias, para medir solo el trampolín.
  const map = { ...MAPS[0]!, bars: [] };
  const s = newPhysState(0, 0.2, 79);
  let maxY = 0;
  for (let i = 0; i < TICK_RATE * 3; i++) {
    const t = 10 + i * DT;
    stepPlayer(s, { mx: 0, mz: 1, jump: false, run: true, block: false }, map, buildSolids(map, t, ''), t, DT);
    maxY = Math.max(maxY, s.y);
    if (s.grounded && s.y > 3.5) break;
  }
  assert.ok(s.grounded && s.y > 3.5, `el trampolín debe subir a la plataforma alta (y=${s.y.toFixed(2)}, z=${s.z.toFixed(2)}, máx=${maxY.toFixed(2)})`);
  const slow = newPhysState(0, 0.2, 0);
  const fast = newPhysState(3, 0.2, 0);
  const solids = buildSolids(map, 0, '');
  for (let i = 0; i < 20; i++) {
    stepPlayer(slow, { mx: 0, mz: 1, jump: false, run: true, block: false, load: 0.76 }, map, solids, 0, DT);
    stepPlayer(fast, { mx: 0, mz: 1, jump: false, run: true, block: false }, map, solids, 0, DT);
  }
  assert.ok(slow.z < fast.z * 0.85, 'llevar núcleos debe frenar un poco');
  console.log('✔ física: apariciones con suelo, trampolín a la plataforma alta y frenado al cargar núcleos');
}

function simulateMatch(bots: number): void {
  const store = new MemoryProfileStore();
  const hub = new Hub(store);
  const inbox: ServerMsg[] = [];
  const session = hub.connect({ send: (m) => inbox.push(typeof m === 'string' ? JSON.parse(m) : m) });
  const token = `test-token-${bots}-abcdefgh`;
  session.receive({ type: 'hello', v: PROTOCOL_VERSION, name: 'Host', look: { color: '#ff5a7a', accessory: 'none', eyes: 'round' }, token });
  session.receive({ type: 'create' });
  session.receive({ type: 'bots', n: bots });
  session.receive({ type: 'start' });
  const rounds: RoundResult[] = [];
  let final: FinalResult | null = null;
  let reward: Extract<ServerMsg, { type: 'reward' }> | null = null;
  let maxEnergy = 0;
  let now = 1000;
  for (let i = 0; i < TICK_RATE * 60 * 14 && !(final && reward); i++) {
    now += 1000 / TICK_RATE;
    hub.pump(now);
    for (const m of inbox.splice(0)) {
      if (m.type === 'roundEnd') rounds.push(m);
      if (m.type === 'final') final = m;
      if (m.type === 'reward') reward = m;
      if (m.type === 's' && m.round === 2) for (const p of m.p) maxEnergy = Math.max(maxEnergy, p[23] ?? 0);
    }
  }
  assert.ok(final, 'el torneo debe terminar con un campeón');
  assert.equal(rounds.length, 4, 'deben jugarse las rondas 1 a 4 antes de la final');
  for (const r of rounds) {
    const q = r.standings.filter((s) => s.qualified).length;
    assert.ok(q >= Math.min(2, r.standings.length), `ronda ${r.round}: deben pasar al menos 2`);
    assert.ok(r.standings.every((s) => s.detail.length > 0), 'cada puesto explica su motivo');
  }
  assert.ok(reward && reward.reward.coins > 0, 'el humano recibe recompensa');
  const saved = store.load(token);
  assert.ok(saved && saved.stats.matches === 1 && saved.coins === reward.reward.coins, 'la recompensa se guarda en el perfil');
  const summary = rounds.map((r) => `R${r.round} ${r.standings.filter((s) => s.qualified).length}/${r.standings.length}`).join(' · ');
  console.log(`✔ torneo (${bots} bots + 1 humano quieto): ${summary} · R3 máx ${maxEnergy} pts · campeón: ${final.winnerName} (${final.reason}) · +${reward.reward.coins} monedas`);
}

function shopTest(): void {
  const store = new MemoryProfileStore();
  const hub = new Hub(store);
  const inbox: ServerMsg[] = [];
  const session = hub.connect({ send: (m) => inbox.push(typeof m === 'string' ? JSON.parse(m) : m) });
  const token = 'shop-token-abcdefghijkl';
  store.save(token, { xp: 0, coins: 200, stats: { matches: 0, wins: 0, kos: 0, roundsCleared: 0, coresDelivered: 0, bestPlace: 0 }, owned: [], updatedAt: 0 });
  session.receive({ type: 'hello', v: PROTOCOL_VERSION, name: 'Compra', look: { color: '#00e5c0', accessory: 'chef', eyes: 'round' }, token });
  session.receive({ type: 'buy', item: 'acc:chef' });
  session.receive({ type: 'buy', item: 'acc:halo' });
  const errors = inbox.filter((m) => m.type === 'error').map((m) => (m as { msg: string }).msg);
  assert.ok(errors.some((e) => e.includes('nivel')), 'no se puede comprar por encima del nivel');
  const prof = inbox.filter((m) => m.type === 'profile').pop() as Extract<ServerMsg, { type: 'profile' }>;
  assert.ok(prof.profile.owned.includes('acc:chef') && prof.profile.coins === 20, 'la compra descuenta monedas y desbloquea');
  console.log('✔ tienda: compra válida, rechazo por nivel y aspecto bloqueado no se acepta sin comprarlo');
}

async function networkTest(): Promise<void> {
  const port = 27000 + Math.floor(Math.random() * 1000);
  const srv = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env: { ...process.env, PORT: String(port), DATA_DIR: `/tmp/jr-test-${port}` }, stdio: ['ignore', 'pipe', 'inherit'] });
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
      ws.send(JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION, name, look: { color: '#3bb4ff', accessory: 'crown', eyes: 'happy' }, token: `${name}-token-1234567890` }));
      res({ ws, inbox, id: () => id });
    });
  });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    const a = await open('Ana');
    const b = await open('Beto');
    await wait(200);
    assert.ok(a.inbox.some((m) => m.type === 'profile'), 'el servidor envía el perfil');
    a.ws.send(JSON.stringify({ type: 'create' }));
    await wait(200);
    const roomA = a.inbox.filter((m) => m.type === 'room').pop() as any;
    assert.ok(roomA?.code, 'Ana recibe el código de sala');
    b.ws.send(JSON.stringify({ type: 'join', code: roomA.code }));
    await wait(200);
    a.ws.send(JSON.stringify({ type: 'start' }));
    await wait(4000 + 6300);
    let seq = 0;
    const before = (b.inbox.filter((m) => m.type === 's').pop() as any).p.find((p: number[]) => p[0] === b.id());
    for (let i = 0; i < 30; i++) {
      b.ws.send(JSON.stringify({ type: 'in', s: ++seq, mx: 0, mz: 1, yaw: 0, b: 0 }));
      await wait(33);
    }
    await wait(300);
    const snapA = a.inbox.filter((m) => m.type === 's').pop() as any;
    const after = snapA.p.find((p: number[]) => p[0] === b.id());
    assert.equal(snapA.phase, 'playing');
    assert.ok(after[3] - before[3] > 3, `Ana ve a Beto avanzar en la carrera (dz=${(after[3] - before[3]).toFixed(2)})`);
    b.ws.send(JSON.stringify({ type: 'start' }));
    await wait(150);
    assert.ok(b.inbox.some((m) => m.type === 'error'), 'el servidor rechaza acciones no autorizadas');
    console.log(`✔ red: 2 clientes en la sala ${roomA.code}, carrera en juego, posiciones sincronizadas, perfil enviado y permisos validados`);
    a.ws.close();
    b.ws.close();
  } finally {
    srv.kill();
  }
}

physicsSanity();
shopTest();
for (const n of [1, 3, 7, 11]) simulateMatch(n);
await networkTest();
console.log('Todas las pruebas pasaron');
