// Servidor multijugador de De Cero a Millonario.
//
// - Sirve el juego por HTTP (para abrirlo desde otros dispositivos).
// - WebSocket en /ws: ciudades (salas) de hasta 4 jugadores, sincronización
//   de movimiento, apariencia, gestos, chat, tiendas y clientes del juego.
// - Es la autoridad de la economía: dinero, inventario (libro de unidades),
//   compras, mejoras, propiedad de locales y transacciones entre jugadores.
// - Guarda los perfiles en data/db.json.
//
// Uso: npm install && npm start   (PORT=8080 por defecto)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { Store } from "./store.js";
import * as eco from "./economy.js";
import {
  PLOTS,
  ROOM_MAX_PLAYERS,
  PRODUCTS,
  CART_CAPACITY,
  VEHICLES,
  WORLD,
  DISTRICT,
  TEST_TRACK,
} from "../src/config.js";
import { ITEMS, SKINS, STARTER_ITEMS, defaultLook } from "../src/look.js";
import { insideHomeLot } from "../src/homelayout.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME_ROOT = path.resolve(HERE, "..");
const PORT = Number(process.env.PORT ?? 8080);
const store = new Store(process.env.DATA_DIR ?? path.join(HERE, "data"));
const PROTOCOL = 2;
const MAX_CITIES_PER_PLAYER = 5;
// Velocidad máxima a pie (correr con el impulso del gimnasio y margen).
const FOOT_SPEED = 10;

// ---------- HTTP: archivos del juego ----------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const THREE_DIR = path.join(HERE, "node_modules", "three");
const hasLocalThree = fs.existsSync(
  path.join(THREE_DIR, "build", "three.module.js"),
);

function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end("No encontrado");
      return;
    }
    let body = data;
    // Si three.js está instalado en el servidor, el juego funciona sin internet.
    if (hasLocalThree && file.endsWith("index.html"))
      body = data
        .toString("utf8")
        .replaceAll(
          "https://cdn.jsdelivr.net/npm/three@0.170.0/",
          "/vendor/three/",
        );
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(body);
  });
}

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" }).end(
      JSON.stringify({
        ok: true,
        players: sessions.size,
        cities: Object.keys(store.data.cities).length,
      }),
    );
    return;
  }
  if (url.pathname.startsWith("/vendor/three/") && hasLocalThree) {
    const file = path.normalize(
      path.join(THREE_DIR, url.pathname.slice("/vendor/three/".length)),
    );
    if (!file.startsWith(THREE_DIR)) return res.writeHead(403).end();
    return serveFile(res, file);
  }
  const rel = decodeURIComponent(
    url.pathname === "/" ? "/index.html" : url.pathname,
  );
  const file = path.normalize(path.join(GAME_ROOT, rel));
  // Solo el cliente: nada del servidor ni de node_modules.
  if (!file.startsWith(GAME_ROOT) || file.startsWith(HERE))
    return res.writeHead(403).end("Prohibido");
  serveFile(res, file);
});

// ---------- Utilidades ----------

const sessions = new Map(); // ws -> sesión
const cityOnline = new Map(); // código -> Set(sesiones)
const hashKey = (key) => crypto.createHash("sha256").update(key).digest("hex");
const cleanText = (s, max) =>
  String(s ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
const num = (v, min, max) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

function cityProfile(session) {
  return eco.upgradeProfile(
    store.data.profiles[session.pid].cities[session.city],
  );
}

function broadcast(code, msg, except) {
  for (const s of cityOnline.get(code) ?? []) if (s !== except) send(s.ws, msg);
}

function newCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do
    code = Array.from(
      { length: 5 },
      () => chars[crypto.randomInt(chars.length)],
    ).join("");
  while (store.data.cities[code]);
  return code;
}

// El look se valida contra el catálogo y el armario del jugador.
function validLook(look, wardrobe) {
  if (!look || typeof look !== "object") return null;
  const out = defaultLook();
  const owned = new Set([...STARTER_ITEMS, ...wardrobe]);
  if (SKINS.some((s) => s.id === look.skin) && owned.has(look.skin))
    out.skin = look.skin;
  for (const slot of Object.keys(ITEMS)) {
    const v = look[slot];
    if (!v || !ITEMS[slot].some((i) => i.id === v.id) || !owned.has(v.id))
      continue;
    out[slot] = {
      id: v.id,
      color: typeof v.color === "string" ? v.color.slice(0, 12) : undefined,
    };
  }
  return out;
}

// Lo que los demás ven de la casa de un jugador (muebles y si se puede
// entrar); nada de su dinero ni de sus muebles guardados.
function homeView(cp) {
  const h = cp ? eco.upgradeProfile(cp).home : null;
  return h?.owned ? { owned: true, layout: h.layout, open: h.open } : null;
}

function memberView(city, pid) {
  const p = store.data.profiles[pid];
  const online = [...(cityOnline.get(city.code) ?? [])].find(
    (s) => s.pid === pid,
  );
  return {
    id: pid,
    name: p.name,
    look: p.look,
    plot: city.members[pid].plot,
    online: !!online,
    shops: city.shops[pid] ?? {},
    state: online?.state ?? null,
    home: homeView(p.cities[city.code]),
  };
}

function cityList() {
  return Object.values(store.data.cities)
    .filter((c) => c.public)
    .map((c) => ({
      code: c.code,
      name: c.name,
      members: Object.keys(c.members).length,
      online: cityOnline.get(c.code)?.size ?? 0,
      max: ROOM_MAX_PLAYERS,
    }))
    .sort((a, b) => b.online - a.online || b.members - a.members)
    .slice(0, 30);
}

// ---------- Ciudades ----------

function joinCity(s, code) {
  const city = store.data.cities[code];
  if (!city)
    return { ok: false, error: "No existe ninguna ciudad con ese código" };
  if (s.city) leaveCity(s);
  const profile = store.data.profiles[s.pid];
  if (!city.members[s.pid]) {
    const used = new Set(Object.values(city.members).map((m) => m.plot));
    const plot = PLOTS.find((p) => !used.has(p));
    if (!plot)
      return {
        ok: false,
        error: `Ciudad llena (${ROOM_MAX_PLAYERS} empresarios)`,
      };
    city.members[s.pid] = { plot, joinedAt: Date.now() };
  }
  profile.cities[code] ??= eco.newCityProfile();
  eco.upgradeProfile(profile.cities[code]);
  // Lo que ganó la tienda automática mientras no estaba.
  eco.accrueIdle(profile.cities[code]);
  s.city = code;
  s.state = null;
  if (!cityOnline.has(code)) cityOnline.set(code, new Set());
  cityOnline.get(code).add(s);
  store.save();
  const cp = profile.cities[code];
  const owners = {};
  for (const [biz, pid] of Object.entries(city.exclusive))
    owners[biz] = { id: pid, name: store.data.profiles[pid]?.name ?? "?" };
  broadcast(code, { t: "playerJoined", player: memberView(city, s.pid) }, s);
  return {
    ok: true,
    city: { code, name: city.name, public: city.public },
    you: { id: s.pid, name: profile.name, plot: city.members[s.pid].plot },
    profile: cp,
    wardrobe: profile.wardrobe,
    look: profile.look,
    members: Object.keys(city.members)
      .filter((pid) => pid !== s.pid)
      .map((pid) => memberView(city, pid)),
    owners,
    warehouse: city.warehouse,
  };
}

function leaveCity(s) {
  if (!s.city) return;
  const code = s.city;
  cityOnline.get(code)?.delete(s);
  const cp = store.data.profiles[s.pid]?.cities[code];
  if (cp) cp.lastSeen = Date.now();
  broadcast(code, { t: "playerLeft", id: s.pid });
  s.city = null;
  s.state = null;
  store.save();
}

// ---------- Mensajes ----------

const ECONOMY = {
  buy: (s, cp, city, m) => eco.buySupplies(cp, city, m),
  sale: (s, cp, city, m) => eco.sale(cp, m),
  brew: (s, cp, city, m) => eco.brew(cp, m),
  upgrade: (s, cp, city, m) => eco.buyUpgrade(cp, m),
  hire: (s, cp, city, m) => eco.hire(cp, m),
  fire: (s, cp, city, m) => eco.fire(cp, m),
  business: (s, cp, city, m) => eco.buyBusiness(cp, city, s.pid, m),
  item: (s, cp, city, m) => eco.buyItem(cp, city, s.pid, m),
  tow: (s, cp, city, m) => eco.tow(cp, m),
  home: (s, cp) => eco.buyHome(cp),
  furniture: (s, cp, city, m) => eco.buyFurniture(cp, m),
  layout: (s, cp, city, m) => eco.setHome(cp, m),
  unlock: (s, cp, city, m) => eco.unlock(cp, m),
  goal: (s, cp, city, m) => eco.claimGoal(cp, m),
  gym: (s, cp) => eco.gym(cp),
  clothing: (s, cp, city, m) =>
    eco.buyClothing(cp, store.data.profiles[s.pid], m),
  mission: (s, cp, city, m) => eco.claimMission(cp, m),
  coin: (s, cp) => eco.claimCoin(cp),
  discover: (s, cp, city, m) => eco.discover(cp, m),
  encargo: (s, cp, city, m) => eco.encargo(cp, m),
  p2p: p2pBuy,
  idle: (s, cp) => eco.accrueIdle(cp),
  collect: (s, cp) => eco.collectVault(cp),
};

function p2pBuy(s, cp, city, m) {
  if (m.seller === s.pid)
    return { ok: false, error: "No puedes comprarte a ti mismo" };
  const sellerSession = [...(cityOnline.get(city.code) ?? [])].find(
    (x) => x.pid === m.seller,
  );
  if (!sellerSession) return { ok: false, error: "El dueño no está conectado" };
  const seller = store.data.profiles[m.seller].cities[city.code];
  const shop = city.shops[m.seller]?.[m.biz];
  const r = eco.p2pBuy(cp, seller, shop, m);
  if (r.ok) {
    send(sellerSession.ws, {
      t: "taken",
      biz: m.biz,
      display: m.display,
      units: m.units,
      product: r.product,
      total: r.total,
      buyer: store.data.profiles[s.pid].name,
      money: seller.money,
    });
    broadcast(city.code, { t: "shop", id: m.seller, biz: m.biz, shop });
  }
  return r;
}

function handleEconomy(s, m) {
  const city = store.data.cities[s.city];
  const cp = cityProfile(s);
  const fn = ECONOMY[m.t];
  const r = fn(s, cp, city, m);
  if (r.ok) {
    store.save();
    if (m.t === "buy")
      broadcast(s.city, { t: "warehouse", stock: city.warehouse });
    if (m.t === "home" || m.t === "layout")
      broadcast(s.city, { t: "home", id: s.pid, home: homeView(cp) }, s);
    if (m.t === "business" || (m.t === "item" && m.id === "casa")) {
      const biz = m.t === "business" ? m.biz : "casa";
      broadcast(
        s.city,
        { t: "owner", biz, id: s.pid, name: store.data.profiles[s.pid].name },
        s,
      );
    }
  }
  send(s.ws, {
    t: "res",
    rid: m.rid,
    ...r,
    money: cp.money,
    revenue: cp.stats.revenue,
    mission: cp.mission,
    ledger: cp.ledger,
  });
}

const onTrack = (x, z, pad = 3) =>
  x >= TEST_TRACK.minX - pad &&
  x <= TEST_TRACK.maxX + pad &&
  z >= TEST_TRACK.minZ - pad &&
  z <= TEST_TRACK.maxZ + pad;

// Prueba en la pista del concesionario: el cliente avisa al empezar (salta
// a la salida de la pista) y al terminar (vuelve a la tienda, cerca).
function handleTestDrive(s, m) {
  const now = Date.now();
  if (m.on) {
    if (!Object.hasOwn(VEHICLES, m.id) || VEHICLES[m.id].zone) return;
    s.test = { id: m.id, warp: true, until: now + 95000 };
  } else if (s.test) s.test = { ...s.test, back: true, until: now + 5000 };
}

// Vehículo con el que se mueve: propio, o el de la prueba en la pista.
function rideOf(s, cp, m) {
  if (typeof m.r !== "string" || !Object.hasOwn(VEHICLES, m.r)) return "";
  if (cp.items[m.r]) return m.r;
  const t = s.test;
  if (t && t.id === m.r && Date.now() < t.until && onTrack(m.x, m.z))
    return m.r;
  return "";
}

function intoClosedHome(s, x, z) {
  const city = store.data.cities[s.city];
  for (const [pid, member] of Object.entries(city.members)) {
    if (pid === s.pid) continue;
    if (!insideHomeLot(PLOTS.indexOf(member.plot), x, z)) continue;
    const home = homeView(store.data.profiles[pid]?.cities[s.city]);
    return !home?.open;
  }
  return false;
}

function handleState(s, m) {
  if (
    !num(m.x, WORLD.minX - 5, WORLD.maxX + 5) ||
    !num(m.z, WORLD.minZ - 5, WORLD.maxZ + 5) ||
    !num(m.h, -50, 50) ||
    !num(m.y ?? 0, -5, 20)
  )
    return;
  const now = Date.now();
  const prev = s.state;
  const cp = cityProfile(s);
  cp.lastSeen = now;
  const ride = rideOf(s, cp, m);
  const correct = () =>
    prev && send(s.ws, { t: "correct", x: prev.x, z: prev.z });
  // Sin desbloquear, nadie pasa las obras del distrito financiero.
  if (!cp.unlocked.financiero && m.x < DISTRICT.barrierX - 1.5)
    return correct();
  // En casa ajena solo se entra si su dueño deja visitas.
  if (intoClosedHome(s, m.x, m.z)) return correct();
  if (prev) {
    const dt = Math.max(0.05, (now - prev.at) / 1000);
    const dist = Math.hypot(m.x - prev.x, m.z - prev.z);
    const max = ride ? VEHICLES[ride].speed * 1.15 + 2 : FOOT_SPEED;
    // Saltos permitidos: a la salida de la pista al empezar una prueba, y
    // de la pista a la tienda al terminarla.
    const t = s.test;
    const warp =
      t &&
      now < t.until &&
      ((t.warp &&
        Math.hypot(m.x - TEST_TRACK.start.x, m.z - TEST_TRACK.start.z) < 4) ||
        (t.back && onTrack(prev.x, prev.z) && onTrack(m.x, m.z, 45)));
    if (warp) {
      if (t.back) s.test = null;
      else t.warp = false;
    } else if (dist > max * dt + 3) {
      // Movimiento imposible: se ignora y se corrige al cliente.
      return correct();
    }
  }
  s.state = {
    x: m.x,
    y: m.y ?? 0,
    z: m.z,
    h: m.h,
    s: num(m.s, 0, 20) ? m.s : 0,
    c: Array.isArray(m.c)
      ? m.c.filter((p) => PRODUCTS[p]).slice(0, CART_CAPACITY)
      : [],
    r: ride,
    k: !!m.k,
    at: now,
  };
  s.dirty = true;
}

function handleShop(s, m) {
  const cp = cityProfile(s);
  if (!cp.businesses[m.biz] || !Array.isArray(m.displays)) return;
  const displays = m.displays
    .slice(0, 30)
    .filter(
      (d) =>
        Array.isArray(d) &&
        typeof d[0] === "string" &&
        (d[1] === null || PRODUCTS[d[1]]) &&
        Number.isInteger(d[2]),
    )
    .map((d) => [d[0].slice(0, 8), d[1], Math.max(0, Math.min(40, d[2]))]);
  const prices = {};
  for (const [p, v] of Object.entries(m.prices ?? {}))
    if (PRODUCTS[p] && num(v, 0, PRODUCTS[p].base * eco.PRICE_CAP))
      prices[p] = Math.round(v * 100) / 100;
  const city = store.data.cities[s.city];
  city.shops[s.pid] ??= {};
  city.shops[s.pid][m.biz] = {
    displays,
    prices,
    open: !!m.open,
    upgrades: cp.businesses[m.biz].upgrades,
  };
  store.save();
  broadcast(
    s.city,
    { t: "shop", id: s.pid, biz: m.biz, shop: city.shops[s.pid][m.biz] },
    s,
  );
}

function handleChat(s, m) {
  const cp = cityProfile(s);
  const text = cleanText(m.text, 120);
  if (!text) return;
  if (!eco.allow(cp, "chat", 1 / 1.2, 3))
    return send(s.ws, {
      t: "chat",
      system: true,
      text: "Vas muy rápido: espera un momento antes de escribir.",
    });
  if (text === s.lastChat && Date.now() - s.lastChatAt < 10000) return;
  s.lastChat = text;
  s.lastChatAt = Date.now();
  broadcast(s.city, {
    t: "chat",
    from: s.pid,
    name: store.data.profiles[s.pid].name,
    text,
  });
}

function leaderboard(s) {
  const city = store.data.cities[s.city];
  const rows = Object.keys(city.members).map((pid) => {
    const p = store.data.profiles[pid];
    const cp = p.cities[s.city];
    return {
      id: pid,
      name: p.name,
      worth: eco.netWorth(cp),
      revenue: Math.round(cp.stats.revenue),
      online: [...(cityOnline.get(s.city) ?? [])].some((x) => x.pid === pid),
    };
  });
  const global = [];
  for (const p of Object.values(store.data.profiles)) {
    let best = 0;
    for (const cp of Object.values(p.cities))
      best = Math.max(best, eco.netWorth(cp));
    global.push({ id: p.id, name: p.name, worth: best });
  }
  rows.sort((a, b) => b.worth - a.worth);
  global.sort((a, b) => b.worth - a.worth);
  send(s.ws, { t: "leaderboard", city: rows, global: global.slice(0, 10) });
}

function onMessage(s, raw) {
  let m;
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  if (!m || typeof m.t !== "string") return;
  if (m.t === "hello") return hello(s, m);
  if (!s.pid) return send(s.ws, { t: "error", error: "Primero identifícate" });
  switch (m.t) {
    case "cities":
      return send(s.ws, { t: "cities", list: cityList() });
    case "create": {
      // Límite por jugador: evita llenar el disco creando ciudades vacías.
      const created = Object.values(store.data.cities).filter(
        (c) => c.creator === s.pid,
      ).length;
      if (created >= MAX_CITIES_PER_PLAYER)
        return send(s.ws, {
          t: "res",
          rid: m.rid,
          ok: false,
          error: `Ya creaste ${MAX_CITIES_PER_PLAYER} ciudades; únete a una existente`,
        });
      const code = newCode();
      store.data.cities[code] = {
        code,
        name: cleanText(m.name, 24) || "Ciudad sin nombre",
        public: m.public !== false,
        creator: s.pid,
        createdAt: Date.now(),
        members: {},
        exclusive: {},
        shops: {},
        warehouse: eco.newWarehouse(),
      };
      return send(s.ws, { t: "res", rid: m.rid, ...joinCity(s, code) });
    }
    case "join":
      return send(s.ws, {
        t: "res",
        rid: m.rid,
        ...joinCity(s, cleanText(m.code, 8).toUpperCase()),
      });
    case "ping":
      return send(s.ws, { t: "pong", at: m.at });
  }
  if (!s.city) return;
  switch (m.t) {
    case "leave":
      return leaveCity(s);
    case "state":
      return handleState(s, m);
    case "test":
      return handleTestDrive(s, m);
    case "look": {
      const p = store.data.profiles[s.pid];
      const look = validLook(m.look, p.wardrobe);
      if (!look) return;
      p.look = look;
      store.save();
      return broadcast(s.city, { t: "look", id: s.pid, look });
    }
    case "emote":
      if (
        ["wave", "cheer", "dance"].includes(m.k) &&
        eco.allow(cityProfile(s), "emote", 1, 2)
      )
        broadcast(s.city, { t: "emote", id: s.pid, k: m.k }, s);
      return;
    case "chat":
      return handleChat(s, m);
    case "shop":
      return handleShop(s, m);
    case "npcs":
      if (
        Array.isArray(m.list) &&
        m.list.length <= 40 &&
        eco.allow(cityProfile(s), "npcs", 6, 6)
      )
        broadcast(s.city, { t: "npcs", id: s.pid, list: m.list }, s);
      return;
    case "save":
      if (JSON.stringify(m.blob ?? null).length < 200000) {
        cityProfile(s).blob = m.blob;
        store.save();
      }
      return;
    case "leaderboard":
      return leaderboard(s);
  }
  if (ECONOMY[m.t]) handleEconomy(s, m);
}

function hello(s, m) {
  if (m.v !== PROTOCOL)
    return send(s.ws, {
      t: "error",
      error: "Versión del juego distinta a la del servidor: recarga la página",
    });
  if (typeof m.key !== "string" || !/^[a-f0-9]{32,64}$/.test(m.key))
    return send(s.ws, { t: "error", error: "Identificador no válido" });
  const keyHash = hashKey(m.key);
  const pid = keyHash.slice(0, 12);
  // Una sola conexión por jugador: la anterior se cierra.
  for (const other of sessions.values()) {
    if (other.pid === pid && other !== s) {
      send(other.ws, {
        t: "kicked",
        error: "Te conectaste desde otra ventana o dispositivo",
      });
      other.ws.close();
    }
  }
  const profiles = store.data.profiles;
  profiles[pid] ??= {
    id: pid,
    keyHash,
    name: "Empresario",
    look: defaultLook(),
    wardrobe: [...STARTER_ITEMS],
    cities: {},
    createdAt: Date.now(),
  };
  const p = profiles[pid];
  if (p.keyHash !== keyHash)
    return send(s.ws, { t: "error", error: "Identificador no válido" });
  p.name = cleanText(m.name, 16) || p.name;
  const look = validLook(m.look, p.wardrobe);
  if (look) p.look = look;
  s.pid = pid;
  store.save();
  send(s.ws, {
    t: "welcome",
    id: pid,
    name: p.name,
    wardrobe: p.wardrobe,
    cities: cityList(),
  });
}

// ---------- WebSocket y bucles ----------

const wss = new WebSocketServer({
  server: httpServer,
  path: "/ws",
  maxPayload: 256 * 1024,
});
wss.on("connection", (ws) => {
  const s = { ws, pid: null, city: null, state: null, alive: true };
  sessions.set(ws, s);
  ws.on("pong", () => (s.alive = true));
  ws.on("message", (data) => onMessage(s, data.toString()));
  ws.on("close", () => {
    leaveCity(s);
    sessions.delete(ws);
  });
});

// 10 veces por segundo: posiciones de los demás jugadores de la ciudad.
setInterval(() => {
  for (const set of cityOnline.values()) {
    if (set.size < 2) continue;
    const players = [];
    for (const s of set)
      if (s.state)
        players.push([
          s.pid,
          s.state.x,
          s.state.y,
          s.state.z,
          s.state.h,
          s.state.s,
          s.state.c,
          s.state.r,
          s.state.k ? 1 : 0,
        ]);
    for (const s of set)
      send(s.ws, {
        t: "snap",
        at: Date.now(),
        players: players.filter((p) => p[0] !== s.pid),
      });
  }
}, 100);

// Cada segundo: reloj del día (gastos) y reposición del almacén compartido.
let regen = 0;
setInterval(() => {
  regen++;
  for (const [code, set] of cityOnline) {
    const city = store.data.cities[code];
    if (regen % 20 === 0 && set.size) {
      eco.regenWarehouse(city.warehouse);
      broadcast(code, { t: "warehouse", stock: city.warehouse });
    }
    for (const s of set) {
      const cp = cityProfile(s);
      const report = eco.tickDay(cp, 1);
      if (report) {
        send(s.ws, { t: "day", report, money: cp.money });
        store.save();
      }
    }
  }
}, 1000);

// Conexiones caídas: ping cada 15 s.
setInterval(() => {
  for (const s of sessions.values()) {
    if (!s.alive) {
      s.ws.terminate();
      continue;
    }
    s.alive = false;
    s.ws.ping();
  }
}, 15000);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    store.flush();
    process.exit(0);
  });
}

httpServer.listen(PORT, () => {
  console.log(
    `De Cero a Millonario · servidor en http://localhost:${PORT}  (WebSocket: ws://localhost:${PORT}/ws)`,
  );
  if (!hasLocalThree)
    console.log(
      "Aviso: three.js se cargará desde jsDelivr (los jugadores necesitan internet).",
    );
});
