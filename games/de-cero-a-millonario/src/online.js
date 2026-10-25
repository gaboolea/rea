// Sesión online en el cliente: avatares de otros jugadores (interpolados),
// nombres, gestos, chat, tiendas ajenas (solo se dibujan), clientes y
// empleados compartidos por cada dueño, compras entre jugadores y
// sincronización con la economía autoritativa del servidor.
import * as THREE from "three";
import { ToyCharacter } from "./character.js";
import { toyScooter } from "./vehicles.js";
import { randomLook, workerLook } from "./look.js";
import { VIP_LOOK } from "./npc.js";
import { Business } from "./business.js";
import { PRODUCTS, PLOTS, BUSINESSES, BOX_UNITS } from "./config.js";

const DELAY = 0.15; // s de retraso de interpolación de jugadores
const NPC_DELAY = 0.35;
const WORKER_LOOKS = { "-1": "menta", "-2": "azul", "-3": "marron" };

function labelSprite(
  text,
  bg = "rgba(29,43,68,0.8)",
  width = 2.2,
  fg = "#fff",
) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 112;
  const ctx = c.getContext("2d");
  ctx.font = 'bold 50px "Baloo 2", sans-serif';
  const w = Math.min(500, ctx.measureText(text).width + 60);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(256 - w / 2, 10, w, 92, 40);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 58, 480);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false }),
  );
  sp.scale.set(width, width * (112 / 512), 1);
  sp.renderOrder = 15;
  return sp;
}

// Interpola entre instantáneas recibidas (posición y orientación).
function sample(buf, t) {
  if (!buf.length) return null;
  while (buf.length > 2 && buf[1].t <= t) buf.shift();
  const a = buf[0];
  const b = buf[1];
  if (!b || t <= a.t) return a;
  const k = Math.min(1, (t - a.t) / Math.max(0.001, b.t - a.t));
  let dh = b.h - a.h;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    z: a.z + (b.z - a.z) * k,
    h: a.h + dh * k,
    s: b.s,
    c: b.c,
    r: b.r,
  };
}

class RemoteAvatar {
  constructor(game, info) {
    this.game = game;
    this.id = info.id;
    this.name = info.name;
    this.char = new ToyCharacter({ look: info.look, scale: 1.08 });
    this.buf = [];
    this.pos = { x: 0, y: 0, z: 0 };
    this.tag = labelSprite(info.name, "rgba(123,92,255,0.88)", 1.6);
    this.tag.position.y = 2.75;
    this.char.root.add(this.tag);
    this.scooter = toyScooter(0x7b5cff);
    this.scooter.visible = false;
    this.char.root.add(this.scooter);
    this.char.root.visible = false;
    game.scene.add(this.char.root);
    if (info.state) this.push(info.state, performance.now() / 1000);
  }

  push(st, t) {
    this.buf.push({
      t,
      x: st.x,
      y: st.y ?? 0.12,
      z: st.z,
      h: st.h,
      s: st.s ?? 0,
      c: st.c ?? [],
      r: !!st.r,
    });
    if (this.buf.length > 30) this.buf.shift();
    this.char.root.visible = true;
  }

  say(text) {
    if (this.bubble) this.char.root.remove(this.bubble);
    this.bubble = labelSprite(
      text.length > 34 ? `${text.slice(0, 33)}…` : text,
      "rgba(255,255,255,0.95)",
      2.6,
      "#1d2b44",
    );
    this.bubble.position.y = 3.2;
    this.char.root.add(this.bubble);
    this.bubbleTime = 5;
  }

  update(dt, now) {
    const st = sample(this.buf, now - DELAY);
    if (!st) return;
    this.pos.x = st.x;
    this.pos.y = st.y;
    this.pos.z = st.z;
    this.char.root.position.set(st.x, st.y, st.z);
    this.char.root.rotation.y = st.h;
    this.char.setCarry(st.c);
    this.scooter.visible = st.r;
    this.char.animate(dt, st.r ? 0 : st.s, true);
    if (st.r) this.char.rig.position.y = 0.42;
    if (this.bubbleTime > 0) {
      this.bubbleTime -= dt;
      if (this.bubbleTime <= 0) this.char.root.remove(this.bubble);
    }
  }

  dispose() {
    this.game.scene.remove(this.char.root);
  }
}

// Cliente o empleado del negocio de otro jugador (solo visual).
class NpcProxy {
  constructor(game, seed) {
    const look =
      seed === -9
        ? VIP_LOOK
        : seed < 0
          ? workerLook(WORKER_LOOKS[seed] ?? "azul")
          : randomLook(seed);
    this.char = new ToyCharacter({
      look,
      scale: seed < 0 && seed !== -9 ? 1 : 0.9,
      apron: seed < 0 && seed !== -9 ? 0xffffff : null,
    });
    this.buf = [];
    this.seen = 0;
    this.pos = { x: 0, z: 0 };
    game.scene.add(this.char.root);
  }
}

export class Online {
  constructor(game, net, join) {
    this.game = game;
    this.net = net;
    this.join = join;
    this.code = join.city.code;
    this.me = join.you;
    this.members = new Map(join.members.map((m) => [m.id, m]));
    this.avatars = new Map();
    this.proxies = new Map();
    this.remoteShops = new Map(); // "pid:biz" -> Business remoto
    this.owners = join.owners; // negocios exclusivos -> { id, name }
    this.warehouseStock = join.warehouse;
    this.muted = new Set(game.settings.mutedPlayers ?? []);
    this.sendTimer = 0;
    this.npcTimer = 0;
    this.shopTimer = 0;
    this.saveTimer = 10;
    this.lastSent = null;
    this.shopKeys = {};
    this.bind();
  }

  // ---------- Consultas ----------

  plotOwner(plot) {
    for (const m of this.members.values()) if (m.plot === plot) return m.name;
    return null;
  }

  remoteOwnerOf(buildingId) {
    if (PLOTS.includes(buildingId))
      return buildingId !== this.me.plot ? this.plotOwner(buildingId) : null;
    const o = this.owners[buildingId];
    return o && o.id !== this.me.id ? o.name : null;
  }

  remotePlayers() {
    return [...this.avatars.values()]
      .filter((a) => a.char.root.visible)
      .map((a) => a.pos);
  }

  positions() {
    return [
      ...this.remotePlayers(),
      ...[...this.proxies.values()].map((p) => p.pos),
    ];
  }

  onlineCount() {
    return 1 + [...this.members.values()].filter((m) => m.online).length;
  }

  // ---------- Mensajes del servidor ----------

  bind() {
    const n = this.net;
    n.on("snap", (m) => {
      const t = performance.now() / 1000;
      for (const [id, x, y, z, h, s, c, r] of m.players) {
        let av = this.avatars.get(id);
        if (!av) {
          const info = this.members.get(id);
          if (!info) continue;
          av = new RemoteAvatar(this.game, info);
          this.avatars.set(id, av);
        }
        av.push({ x, y, z, h, s, c, r }, t);
      }
    });
    n.on("playerJoined", (m) => {
      const p = m.player;
      const known = this.members.has(p.id);
      this.members.set(p.id, { ...p, online: true });
      if (!known) this.addRemotePlot(p);
      this.game.ui.chatLine(`${p.name} entró en la ciudad`, true);
      this.game.setupGuides();
      this.game.ui.refreshHud(true);
    });
    n.on("playerLeft", (m) => {
      const p = this.members.get(m.id);
      if (p) p.online = false;
      this.avatars.get(m.id)?.dispose();
      this.avatars.delete(m.id);
      for (const [key, proxy] of this.proxies) {
        if (key.startsWith(`${m.id}:`)) {
          this.game.scene.remove(proxy.char.root);
          this.proxies.delete(key);
        }
      }
      if (p) this.game.ui.chatLine(`${p.name} salió de la ciudad`, true);
      this.game.ui.refreshHud(true);
    });
    n.on("look", (m) => {
      const p = this.members.get(m.id);
      if (p) p.look = m.look;
      this.avatars.get(m.id)?.char.setLook(m.look);
    });
    n.on("emote", (m) =>
      this.avatars.get(m.id)?.char.playAction(m.k, m.k === "dance" ? 2.4 : 1.2),
    );
    n.on("chat", (m) => {
      if (m.system) return this.game.ui.chatLine(m.text, true);
      if (this.muted.has(m.from) || !this.game.settings.chat) return;
      this.game.ui.chatLine(m.text, false, m.name, m.from);
      this.avatars.get(m.from)?.say(m.text);
      this.game.audio.sfx("hover");
    });
    n.on("shop", (m) => {
      const shop = this.remoteShops.get(`${m.id}:${m.biz}`);
      const member = this.members.get(m.id);
      if (member) member.shops = { ...member.shops, [m.biz]: m.shop };
      shop?.applySnapshot(m.shop);
    });
    n.on("npcs", (m) => this.receiveNpcs(m));
    n.on("owner", (m) => {
      this.owners[m.biz] = { id: m.id, name: m.name };
      this.game.onRemoteOwner(m.biz, m.name, m.id);
    });
    n.on("warehouse", (m) => (this.warehouseStock = m.stock));
    n.on("taken", (m) => this.onTaken(m));
    n.on("day", (m) => this.game.onServerDay(m.report, m.money));
    n.on("correct", (m) => this.game.player.teleport(m.x, m.z));
    n.on("leaderboard", (m) => this.game.ui.showLeaderboard(m));
    n.on("kicked", (m) => this.game.ui.toast(m.error, "bad"));
  }

  // ---------- Tiendas de otros jugadores ----------

  addRemotePlot(member) {
    const key = `${member.id}:tienda`;
    if (this.remoteShops.has(key)) return;
    const b = this.game.world.buildings[member.plot];
    b.setLocked(false, null);
    const shop = new Business(this.game, "tienda", {
      building: member.plot,
      remote: true,
      name: `Tienda de ${member.name}`,
    });
    shop.ownerId = member.id;
    shop.ownerName = member.name;
    shop.setupRemote(member.shops?.tienda);
    b.setSignText(`TIENDA DE ${member.name.toUpperCase()}`);
    this.remoteShops.set(key, shop);
  }

  addRemoteExclusive(biz, owner) {
    const key = `${owner.id}:${biz}`;
    if (this.remoteShops.has(key)) return;
    const member = this.members.get(owner.id);
    const shop = new Business(this.game, biz, {
      remote: true,
      name: `${BUSINESSES[biz].name} · de ${owner.name}`,
    });
    shop.ownerId = owner.id;
    shop.ownerName = owner.name;
    shop.setupRemote(member?.shops?.[biz]);
    this.remoteShops.set(key, shop);
  }

  // Estanterías ajenas: comprar unidades al dueño (si lo permite).
  interactables() {
    const list = [];
    for (const shop of this.remoteShops.values()) {
      for (const entry of shop.displays) {
        if (entry.def.kind === "coffee") continue;
        list.push({
          x: entry.approach.x,
          z: entry.approach.z,
          alt: entry.pos,
          radius: 1.4,
          label: () => {
            const d = entry.display;
            if (!d.product || d.stock <= 0)
              return {
                text: `Estantería de ${shop.ownerName}: vacía`,
                enabled: false,
              };
            if (!shop.openToPlayers)
              return {
                text: `${shop.ownerName} no vende a otros jugadores ahora`,
                enabled: false,
              };
            const units = Math.min(5, d.stock);
            const price =
              (shop.prices[d.product] ?? PRODUCTS[d.product].base) * units;
            if (this.game.state.carried.length >= this.game.carryCapacity())
              return { text: "Tienes las manos llenas", enabled: false };
            return {
              text: `Comprar ${units} × ${PRODUCTS[d.product].name} a ${shop.ownerName} ($${price.toFixed(2)})`,
              enabled: true,
            };
          },
          action: () => this.buyFrom(shop, entry),
        });
      }
    }
    return list;
  }

  async buyFrom(shop, entry) {
    const g = this.game;
    const units = Math.min(5, entry.display.stock);
    const r = await this.net.request("p2p", {
      seller: shop.ownerId,
      biz: shop.id,
      display: entry.def.id,
      units,
    });
    if (!r.ok) {
      g.ui.toast(r.error, "bad");
      g.audio.sfx("error");
      return;
    }
    g.applyServerMoney(r);
    g.state.carried.push({ product: r.product, units });
    g.onCarryChanged();
    g.player.char.playAction("pickup", 0.5);
    g.audio.sfx("cash");
    g.ui.floatMoney(-r.total);
    g.ui.toast(
      `Compraste ${units} × ${PRODUCTS[r.product].name} a ${shop.ownerName}`,
      "good",
    );
  }

  // Alguien compró en mi tienda: el servidor ya movió el dinero.
  onTaken(m) {
    const g = this.game;
    const b = g.businesses[m.biz];
    const entry = b?.displays.find((d) => d.def.id === m.display);
    if (entry) {
      const from = Math.min(entry.display.stock, m.units);
      entry.display.setStock(entry.display.stock - from);
      if (from < m.units && b.storage[m.product])
        b.storage[m.product] = Math.max(
          0,
          b.storage[m.product] - (m.units - from),
        );
    }
    g.state.money = m.money;
    g.state.stats.revenue += m.total;
    g.ui.floatMoney(m.total);
    g.audio.sfx("cash");
    g.ui.toast(
      `🛒 ${m.buyer} te compró ${m.units} × ${PRODUCTS[m.product].name} (+$${m.total.toFixed(2)})`,
      "good",
    );
    this.shopKeys = {};
  }

  // ---------- Clientes y empleados compartidos ----------

  sendNpcs() {
    const list = [];
    for (const b of Object.values(this.game.businesses)) {
      if (!b.owned) continue;
      for (const a of [...b.customers, ...b.employees]) {
        if (!a.char.root.visible) continue;
        list.push([
          a.netId,
          Math.round(a.pos.x * 100) / 100,
          Math.round(a.pos.z * 100) / 100,
          Math.round(a.heading * 100) / 100,
          Math.round(a.char.speed * 10) / 10,
          a.seed,
          a.char.carrying ? 1 : 0,
          Math.round(a.pos.y * 100) / 100,
        ]);
        if (list.length >= 40) break;
      }
    }
    this.net.send("npcs", { list });
  }

  receiveNpcs(m) {
    const t = performance.now() / 1000;
    for (const [id, x, z, h, s, seed, carry, y] of m.list) {
      const key = `${m.id}:${id}`;
      let p = this.proxies.get(key);
      if (!p) {
        p = new NpcProxy(this.game, seed);
        this.proxies.set(key, p);
      }
      p.buf.push({
        t,
        x,
        y: y ?? 0.12,
        z,
        h,
        s,
        c: carry ? ["agua"] : [],
        r: false,
      });
      if (p.buf.length > 20) p.buf.shift();
      p.seen = t;
    }
  }

  updateProxies(dt, now) {
    for (const [key, p] of this.proxies) {
      if (now - p.seen > 2) {
        this.game.scene.remove(p.char.root);
        this.proxies.delete(key);
        continue;
      }
      const st = sample(p.buf, now - NPC_DELAY);
      if (!st) continue;
      p.pos.x = st.x;
      p.pos.z = st.z;
      p.char.root.position.set(st.x, st.y, st.z);
      p.char.root.rotation.y = st.h;
      p.char.setCarry(st.c);
      p.char.animate(dt, st.s);
    }
  }

  // ---------- Envío del estado propio ----------

  sendState() {
    const g = this.game;
    const p = g.player.pos;
    const st = {
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      z: Math.round(p.z * 100) / 100,
      h: Math.round(g.player.heading * 100) / 100,
      s: Math.round(g.player.speedNow * 10) / 10,
      c: g.state.carried.map((b) => b.product),
      r: g.player.riding,
    };
    const key = JSON.stringify(st);
    // Solo si cambió algo (o cada segundo como latido).
    if (key === this.lastSent && this.idleTimer > 0) return;
    this.idleTimer = 1;
    this.lastSent = key;
    this.net.send("state", st);
  }

  sendShops() {
    for (const b of Object.values(this.game.businesses)) {
      if (!b.owned || b.remote) continue;
      const snap = b.snapshot();
      const key = JSON.stringify(snap);
      if (this.shopKeys[b.id] === key) continue;
      this.shopKeys[b.id] = key;
      this.net.send("shop", { biz: b.id, ...snap });
    }
  }

  update(dt) {
    const now = performance.now() / 1000;
    for (const av of this.avatars.values()) av.update(dt, now);
    this.updateProxies(dt, now);
    for (const shop of this.remoteShops.values()) shop.updateRemote(dt);
    this.idleTimer = (this.idleTimer ?? 0) - dt;
    this.sendTimer -= dt;
    if (this.sendTimer <= 0) {
      this.sendTimer = 0.1;
      this.sendState();
    }
    const others = [...this.members.values()].some((m) => m.online);
    this.npcTimer -= dt;
    if (this.npcTimer <= 0 && others) {
      this.npcTimer = 0.25;
      this.sendNpcs();
    }
    this.shopTimer -= dt;
    if (this.shopTimer <= 0) {
      this.shopTimer = 1;
      this.sendShops();
    }
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 15;
      this.game.save();
    }
  }

  // ---------- Inventario autoritativo ----------

  // Ajusta el género repartido por la tienda al libro del servidor (solo al
  // entrar o reconectar, cuando no hay ventas en curso).
  reconcile(ledger) {
    const g = this.game;
    const own = Object.values(g.businesses).filter((b) => b.owned && !b.remote);
    const count = {};
    const add = (p, n) => p && n > 0 && (count[p] = (count[p] ?? 0) + n);
    for (const b of own) {
      for (const e of b.displays) add(e.display.product, e.display.stock);
      for (const [p, n] of Object.entries(b.storage)) add(p, n);
      if (b.machine) add("granos", b.machine.granos);
    }
    for (const box of [
      ...g.state.carried,
      ...g.state.pickup,
      ...g.state.pendingPickup.flatMap((o) => o.items),
      ...g.state.deliveries.flatMap((d) => d.items),
    ])
      add(box.product, box.units);
    const main = g.businesses.tienda;
    for (const p of new Set([...Object.keys(count), ...Object.keys(ledger)])) {
      let diff = (ledger[p] ?? 0) - (count[p] ?? 0);
      if (diff > 0) {
        diff -= main.addToStorage(p, diff);
        while (diff > 0) {
          const u = Math.min(diff, BOX_UNITS);
          g.state.pickup.push({ product: p, units: u });
          diff -= u;
        }
      }
      if (diff < 0) this.removeUnits(own, p, -diff);
    }
    g.world.pickupPile.setCount(g.state.pickup.length);
    for (const b of own) b.updateStoragePile();
  }

  removeUnits(own, p, n) {
    const g = this.game;
    for (const b of own) {
      const s = Math.min(n, b.storage[p] ?? 0);
      if (s) {
        b.storage[p] -= s;
        n -= s;
      }
      for (const e of b.displays) {
        if (n <= 0) break;
        if (e.display.product !== p) continue;
        const k = Math.min(n, e.display.stock);
        e.display.setStock(e.display.stock - k);
        n -= k;
      }
      if (p === "granos" && b.machine) {
        const k = Math.min(n, b.machine.granos);
        b.machine.granos -= k;
        n -= k;
      }
    }
    for (const list of [g.state.pickup, g.state.carried]) {
      for (let i = list.length - 1; i >= 0 && n > 0; i--) {
        if (list[i].product !== p) continue;
        const k = Math.min(n, list[i].units);
        list[i].units -= k;
        n -= k;
        if (list[i].units <= 0) list.splice(i, 1);
      }
    }
  }

  // ---------- Social ----------

  emote(kind) {
    this.game.player.char.playAction(kind, kind === "dance" ? 2.4 : 1.2);
    this.net.send("emote", { k: kind });
  }

  chat(text) {
    this.net.send("chat", { text });
  }

  toggleMute(id) {
    if (this.muted.has(id)) this.muted.delete(id);
    else this.muted.add(id);
    this.game.settings.mutedPlayers = [...this.muted];
    this.game.applySettings();
    return this.muted.has(id);
  }

  status() {
    return {
      status: this.net.status,
      online: this.onlineCount(),
      name: this.join.city.name,
      code: this.code,
    };
  }

  leave() {
    this.net.send("leave");
    this.net.close();
  }
}
