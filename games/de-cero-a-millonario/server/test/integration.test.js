// Prueba de extremo a extremo: servidor real + varios clientes WebSocket.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import WebSocket from "ws";
import * as eco from "../economy.js";

const PORT = 18000 + Math.floor(Math.random() * 1000);
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "dcam-"));
const KEYS = ["a".repeat(32), "b".repeat(32), "c".repeat(32)];
const pid = (k) =>
  crypto.createHash("sha256").update(k).digest("hex").slice(0, 12);
let server;

// Ciudad sembrada con dos jugadores ricos para probar la carrera por un local.
before(async () => {
  const profiles = {};
  for (const k of KEYS.slice(0, 2)) {
    const id = pid(k);
    const cp = eco.newCityProfile();
    cp.money = 5000;
    cp.stats.revenue = 3000;
    profiles[id] = {
      id,
      keyHash: crypto.createHash("sha256").update(k).digest("hex"),
      name: id,
      look: null,
      wardrobe: [],
      cities: { RICH1: cp },
      createdAt: 0,
    };
  }
  const cities = {
    RICH1: {
      code: "RICH1",
      name: "Rica",
      public: false,
      members: {
        [pid(KEYS[0])]: { plot: "tienda" },
        [pid(KEYS[1])]: { plot: "oeste" },
      },
      exclusive: {},
      shops: {},
      warehouse: eco.newWarehouse(),
    },
  };
  fs.writeFileSync(
    path.join(DIR, "db.json"),
    JSON.stringify({ profiles, cities }),
  );
  server = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DIR },
    stdio: "pipe",
  });
  await new Promise((resolve) =>
    server.stdout.on(
      "data",
      (d) => String(d).includes("servidor en") && resolve(),
    ),
  );
});

after(() => server.kill());

function client(key, name) {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const inbox = [];
  const waiters = [];
  let nextId = 1;
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    inbox.push(m);
    for (const w of [...waiters])
      if (w.match(m)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(m);
      }
  });
  const c = {
    ws,
    inbox,
    open: () => new Promise((r) => ws.on("open", r)),
    send: (t, p = {}) => ws.send(JSON.stringify({ t, ...p })),
    wait: (match, ms = 3000) =>
      new Promise((resolve, reject) => {
        const found = inbox.find(match);
        if (found) return resolve(found);
        const timer = setTimeout(() => reject(new Error("tiempo agotado")), ms);
        waiters.push({
          match,
          resolve: (m) => (clearTimeout(timer), resolve(m)),
        });
      }),
    req: (t, p = {}) => {
      const id = nextId++;
      c.send(t, { id, ...p });
      return c.wait((m) => m.t === "res" && m.id === id);
    },
    hello: () => {
      c.send("hello", { v: 1, key, name });
      return c.wait((m) => m.t === "welcome");
    },
  };
  return c;
}

test("dos jugadores se ven, chatean y no pueden hacer trampas", async () => {
  const a = client(KEYS[2], "Ana");
  await a.open();
  await a.hello();
  const created = await a.req("create", { name: "Prueba", public: true });
  assert.equal(created.ok, true);
  assert.equal(created.you.plot, "tienda");
  const code = created.city.code;

  const b = client("d".repeat(32), "Beto");
  await b.open();
  const w = await b.hello();
  assert.ok(
    w.cities.some((c) => c.code === code),
    "la ciudad pública aparece en la lista",
  );
  const joined = await b.req("join", { code });
  assert.equal(joined.ok, true);
  assert.equal(joined.you.plot, "oeste");
  assert.equal(joined.members[0].name, "Ana");
  await a.wait((m) => m.t === "playerJoined" && m.player.name === "Beto");

  // Movimiento: A envía su posición y B la recibe en las instantáneas.
  a.send("state", { x: -22, y: 0.12, z: -7, h: 0, s: 0, c: [] });
  const snap = await b.wait(
    (m) => m.t === "snap" && m.players.some((p) => p[1] === -22),
  );
  assert.ok(snap);
  // Teletransporte imposible: el servidor lo corrige.
  await new Promise((r) => setTimeout(r, 120));
  a.send("state", { x: 60, y: 0.12, z: 40, h: 0, s: 0, c: [] });
  const corr = await a.wait((m) => m.t === "correct");
  assert.equal(corr.x, -22);

  // Chat validado y difundido.
  a.send("chat", { text: "  hola <b>Beto</b>  " });
  const chat = await b.wait((m) => m.t === "chat" && m.name === "Ana");
  assert.equal(chat.text, "hola bBeto/b");

  // Trampas: venta sin existencias, precio absurdo, misión repetida.
  const r1 = await b.req("sale", {
    biz: "tienda",
    items: [{ p: "cereal", price: 4 }],
  });
  assert.equal(r1.ok, false);
  const r2 = await b.req("sale", {
    biz: "tienda",
    items: [{ p: "agua", price: 999 }],
  });
  assert.equal(r2.ok, false);
  const m1 = await b.req("mission", { index: 0 });
  const m2 = await b.req("mission", { index: 0 });
  assert.equal(m1.ok, true);
  assert.equal(m2.ok, false);
  const money = m2.money;
  const r3 = await b.req("buy", { order: { agua: 1000 } });
  assert.equal(r3.ok, false);
  assert.equal(r3.money, money);

  // Compra entre jugadores: B vende agua en su estantería y A la compra.
  b.send("shop", {
    biz: "tienda",
    displays: [["s1", "agua", 12]],
    prices: { agua: 2.5 },
    open: true,
  });
  await a.wait((m) => m.t === "shop" && m.biz === "tienda");
  const before = (await a.req("coin")).money ?? 0;
  const p2p = await a.req("p2p", {
    seller: joined.you.id,
    biz: "tienda",
    display: "s1",
    units: 5,
  });
  assert.equal(p2p.ok, true, p2p.error);
  assert.equal(p2p.ledger.agua, 12 + 5);
  const taken = await b.wait((m) => m.t === "taken");
  assert.equal(taken.units, 5);
  assert.ok(p2p.money <= before - 12.5 + 0.001);

  // Desconexión: el otro jugador recibe "playerLeft".
  b.ws.close();
  await a.wait((m) => m.t === "playerLeft");
  a.ws.close();
});

test("solo un jugador puede comprar un local exclusivo aunque lo pidan a la vez", async () => {
  const a = client(KEYS[0], "Rica A");
  const b = client(KEYS[1], "Rica B");
  await Promise.all([a.open(), b.open()]);
  await Promise.all([a.hello(), b.hello()]);
  await Promise.all([
    a.req("join", { code: "RICH1" }),
    b.req("join", { code: "RICH1" }),
  ]);
  const [ra, rb] = await Promise.all([
    a.req("business", { biz: "cafeteria" }),
    b.req("business", { biz: "cafeteria" }),
  ]);
  assert.equal([ra.ok, rb.ok].filter(Boolean).length, 1);
  const loser = ra.ok ? rb : ra;
  assert.equal(loser.money, 5000);
  a.ws.close();
  b.ws.close();
});

test("el progreso se guarda y se recupera al volver a conectar", async () => {
  const a = client(KEYS[0], "Rica A");
  await a.open();
  await a.hello();
  const j = await a.req("join", { code: "RICH1" });
  const r = await a.req("buy", { order: { agua: 1 } });
  assert.equal(r.ok, true);
  a.ws.close();
  await new Promise((res) => setTimeout(res, 2500));
  const again = client(KEYS[0], "Rica A");
  await again.open();
  await again.hello();
  const j2 = await again.req("join", { code: "RICH1" });
  assert.equal(j2.profile.money, r.money);
  assert.equal(j2.profile.ledger.agua, (j.profile.ledger.agua ?? 0) + 10);
  again.ws.close();
});
