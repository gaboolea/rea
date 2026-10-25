// Actividades y sorpresas: ofertas flash del Mayorista, hora punta,
// clientes VIP, lluvia de monedas, encargos de otros comerciantes y lugares
// por descubrir. Todo tiene efecto real en el dinero o el inventario.
import * as THREE from "three";
import { PRODUCTS } from "./config.js";
import { ToyCharacter } from "./character.js";
import {
  mat,
  mesh,
  cylinder,
  roundedBox,
  box,
  sphere,
  signMesh,
} from "./gfx.js";

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const rand = (a, b) => a + Math.random() * (b - a);

const MERCHANTS = [
  {
    id: "chef",
    name: "Chef Paco",
    x: -48.6,
    z: 8.2,
    wants: ["fruta", "pasta", "leche", "refresco"],
    look: {
      skin: "canela",
      top: { id: "chaqueta", color: "blanco" },
      bottom: { id: "pantalon", color: "negro" },
      shoes: { id: "zapatos" },
      hat: { id: "gorro", color: "blanco" },
      glasses: { id: "none" },
      back: { id: "none" },
      neck: { id: "pajarita", color: "rojo" },
    },
  },
  {
    id: "florista",
    name: "Rosa la florista",
    x: 22.5,
    z: 30.4,
    wants: ["agua"],
    look: {
      skin: "melocoton",
      top: { id: "sudadera", color: "rosa" },
      bottom: { id: "shorts", color: "menta" },
      shoes: { id: "botas" },
      hat: { id: "sombrero" },
      glasses: { id: "none" },
      back: { id: "none" },
      neck: { id: "bufanda", color: "amarillo" },
    },
  },
  {
    id: "quiosco",
    name: "Leo del quiosco",
    x: 9.6,
    z: 24.2,
    wants: ["refresco", "galletas", "cereal", "agua"],
    look: {
      skin: "cacao",
      top: { id: "camiseta", color: "amarillo" },
      bottom: { id: "vaqueros" },
      shoes: { id: "altas", color: "rojo" },
      hat: { id: "gorra", color: "azul" },
      glasses: { id: "redondas", color: "azul" },
      back: { id: "none" },
      neck: { id: "none" },
    },
  },
];

const PLACES = [
  { id: "tienda", name: "Mi Tiendita" },
  { id: "mayorista", name: "el Mayorista" },
  { id: "cafeteria", name: "Café Aroma" },
  { id: "boutique", name: "la Boutique" },
  { id: "minimercado", name: "Minimercado Sol" },
  { id: "supermercado", name: "Súper Millonario" },
  { id: "casagrande", name: "Villa Bonita" },
  { id: "parque", name: "el Parque", rect: [10, 28, 50, 48] },
  { id: "concesionario", name: "el Concesionario", rect: [49, 12, 67, 28] },
  { id: "bus", name: "la parada de autobús", rect: [30.5, -10, 36, -6.5] },
];

export class Events {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.timer = 45;
    this.encargoTimer = 50;
    this.coins = [];
    this.coinTimer = 2;
    this.merchants = MERCHANTS.map((m) => this.buildMerchant(m));
    this.coinMat = mat(0xffd23f, {
      metalness: 0.5,
      roughness: 0.25,
      emissive: 0x7a5a00,
    });
  }

  buildMerchant(def) {
    const g = this.game;
    const char = new ToyCharacter({ look: def.look });
    char.root.position.set(def.x, 0.12, def.z);
    char.root.rotation.y = Math.PI * 0.85;
    g.scene.add(char.root);
    g.world.physics.addCentered(def.x, def.z, 0.6, 0.6);
    if (def.id === "florista") {
      const cart = new THREE.Group();
      cart.add(mesh(roundedBox(1.6, 0.7, 0.9, 0.08), mat(0x8bd17c), 0, 0.6, 0));
      const colors = [0xff5d8f, 0xffd23f, 0x9b5de5, 0xffffff, 0xff8c42];
      for (let i = 0; i < 12; i++)
        cart.add(
          mesh(
            sphere(0.12, 8),
            mat(colors[i % 5]),
            -0.6 + (i % 6) * 0.24,
            1.05,
            -0.2 + Math.floor(i / 6) * 0.4,
            false,
          ),
        );
      for (const s of [-1, 1])
        cart.add(
          mesh(
            cylinder(0.25, 0.25, 0.08, 16),
            mat(0x3e4a59),
            s * 0.6,
            0.25,
            0.5,
          ),
        );
      cart.children.slice(-2).forEach((w) => (w.rotation.x = Math.PI / 2));
      cart.position.set(def.x - 1.6, 0, def.z);
      g.scene.add(cart);
      g.world.physics.addCentered(def.x - 1.6, def.z, 1.6, 1.0);
    } else if (def.id === "quiosco") {
      const k = new THREE.Group();
      k.add(mesh(roundedBox(2.2, 2.2, 1.6, 0.1), mat(0x3d8bff), 0, 1.1, 0));
      k.add(mesh(roundedBox(2.6, 0.2, 2.0, 0.08), mat(0xffd23f), 0, 2.3, 0));
      for (let i = 0; i < 6; i++)
        k.add(
          mesh(
            box(0.3, 0.4, 0.04),
            mat([0xff5a4e, 0xffffff, 0x5bd47a][i % 3]),
            -0.8 + i * 0.32,
            1.4,
            0.82,
            false,
          ),
        );
      const sign = signMesh("QUIOSCO", 1.8, 0.4, {
        bg: "#ffd23f",
        fg: "#1d2b44",
      });
      sign.position.set(0, 2.65, 0.6);
      k.add(sign);
      k.position.set(def.x + 1.9, 0, def.z - 0.4);
      g.scene.add(k);
      g.world.physics.addCentered(def.x + 1.9, def.z - 0.4, 2.2, 1.6);
    }
    return { ...def, char, request: null };
  }

  // ---------- Consultas de otros sistemas ----------

  rushFactor() {
    return this.active?.type === "rush" ? 2.2 : 1;
  }

  discount(product) {
    return this.active?.type === "sale" && this.active.product === product
      ? 0.6
      : 1;
  }

  onSold(items) {
    const a = this.active;
    if (a?.type !== "sale") return;
    a.sold += items.filter((i) => i.product === a.product).length;
    if (a.sold >= a.goal && !a.won) {
      a.won = true;
      this.reward(
        a.reward,
        `¡Reto cumplido! Vendiste ${a.goal} ${PRODUCTS[a.product].name}`,
      );
    }
  }

  reward(amount, text) {
    const g = this.game;
    g.state.money += amount;
    g.state.stats.revenueBonus = (g.state.stats.revenueBonus ?? 0) + amount;
    g.ui.toast(`${text} · +$${amount}`, "good");
    g.audio.sfx("mission");
    g.ui.floatMoney(amount);
  }

  // ---------- Eventos temporales ----------

  start() {
    const g = this.game;
    // La oferta flash no existe en online: el precio lo fija el servidor.
    const types = g.online
      ? ["rush", "coins", "vip"]
      : ["sale", "rush", "coins", "vip"];
    const type = pick(types);
    if (type === "sale") {
      const fridge = g.businesses.tienda.displays.some(
        (d) => d.def.kind === "fridge",
      );
      const options = Object.keys(PRODUCTS).filter(
        (p) =>
          PRODUCTS[p].kind === "grocery" &&
          (!PRODUCTS[p].cold || fridge) &&
          (PRODUCTS[p].stage ?? 0) <= g.stageIndex(),
      );
      const product = pick(options);
      this.active = {
        type,
        product,
        goal: 12,
        sold: 0,
        reward: 30,
        time: 150,
        total: 150,
        icon: "🏷️",
        title: `Oferta flash: ${PRODUCTS[product].name} −40% en el Mayorista`,
      };
      g.ui.toast(
        `🏷️ ¡${PRODUCTS[product].name} a mitad de precio en el Mayorista! Vende 12 y gana $30`,
        "event",
      );
    } else if (type === "rush") {
      this.active = {
        type,
        time: 60,
        total: 60,
        icon: "🔥",
        title: "¡Hora punta! Llegan más clientes",
      };
      g.ui.toast("🔥 ¡Hora punta! Prepárate para atender", "event");
    } else if (type === "coins") {
      for (let i = 0; i < 10; i++) this.spawnCoin(true);
      this.active = {
        type,
        time: 60,
        total: 60,
        icon: "🪙",
        title: "¡Monedas perdidas por la ciudad!",
      };
      g.ui.toast(
        "🪙 Alguien perdió monedas por las calles. ¡Búscalas!",
        "event",
      );
    } else {
      const owned = Object.values(g.businesses).filter(
        (b) => b.owned && b.displays.length,
      );
      const biz = pick(owned);
      const c = biz.spawnVip();
      this.active = {
        type,
        time: 120,
        total: 120,
        icon: "★",
        title: `Cliente VIP en camino a ${biz.name}`,
        customer: c,
      };
      g.ui.toast(`★ Un cliente VIP va a ${biz.name}: ¡paga el doble!`, "event");
    }
    g.audio.sfx("event");
  }

  // ---------- Encargos de comerciantes ----------

  newRequest() {
    const free = this.merchants.filter((m) => !m.request);
    if (!free.length) return;
    const m = pick(free);
    const product = pick(
      m.wants.filter(
        (p) =>
          !PRODUCTS[p].cold ||
          this.game.businesses.tienda.upgrades.has("refrigerador"),
      ),
    );
    if (!product) return;
    const units = pick([10, 10, 20]);
    const pay = Math.round(units * PRODUCTS[product].base * 1.5);
    m.request = {
      product,
      units,
      delivered: 0,
      pay,
      time: 210,
      accepted: false,
      expires: 90,
    };
    m.char.think("!", "#e67e22", 90);
  }

  merchantInteractables() {
    return this.merchants.map((m) => ({
      x: m.x,
      z: m.z + 1.1,
      alt: m,
      radius: 2.0,
      label: () => {
        const r = m.request;
        if (!r)
          return {
            text: `${m.name}: «¡Qué buen día para los negocios!»`,
            enabled: false,
          };
        const name = PRODUCTS[r.product].name;
        if (!r.accepted)
          return {
            text: `Encargo de ${m.name}: ${r.units} × ${name} → $${r.pay}`,
            enabled: true,
          };
        const box = this.game.state.carried.find(
          (b) => b.product === r.product,
        );
        if (box)
          return {
            text: `Entregar ${name} a ${m.name} (${r.delivered}/${r.units})`,
            enabled: true,
          };
        return {
          text: `${m.name} espera ${r.units - r.delivered} × ${name}`,
          enabled: false,
        };
      },
      action: () => this.handleMerchant(m),
    }));
  }

  handleMerchant(m) {
    const g = this.game;
    const r = m.request;
    if (!r) return;
    m.char.root.rotation.y = Math.atan2(
      g.player.pos.x - m.x,
      g.player.pos.z - m.z,
    );
    if (!r.accepted) {
      r.accepted = true;
      m.char.playAction("wave", 1);
      m.char.think("✓", "#2e8a43", 2);
      g.audio.sfx("click");
      g.ui.toast(
        `Encargo aceptado: lleva ${r.units} × ${PRODUCTS[r.product].name} a ${m.name}`,
        "event",
      );
      return;
    }
    const box = g.state.carried.find((b) => b.product === r.product);
    if (!box) return;
    const moved = Math.min(box.units, r.units - r.delivered);
    box.units -= moved;
    r.delivered += moved;
    if (box.units <= 0) g.state.carried.splice(g.state.carried.indexOf(box), 1);
    g.onCarryChanged();
    g.audio.sfx("place");
    if (r.delivered >= r.units) {
      g.state.stats.encargos = (g.state.stats.encargos ?? 0) + 1;
      g.state.stats.grossProfit += r.pay * 0.3;
      m.request = null;
      m.char.playAction("cheer", 1);
      m.char.think("♥", "#e84393", 2);
      if (g.online) {
        g.serverAction("encargo", { product: r.product, units: r.units }).then(
          (res) => {
            if (!res.ok) return;
            g.ui.toast(
              `Encargo de ${m.name} completado · +$${res.pay}`,
              "good",
            );
            g.audio.sfx("mission");
            g.ui.floatMoney(res.pay);
            g.unlockRewards();
          },
        );
      } else {
        this.reward(r.pay, `Encargo de ${m.name} completado`);
        g.unlockRewards();
      }
    }
  }

  // ---------- Monedas ----------

  spawnCoin(burst = false) {
    const p = burst
      ? this.game.crowd.randomSidewalkPoint()
      : this.game.crowd.randomSidewalkPoint();
    const coin = mesh(
      cylinder(0.22, 0.22, 0.06, 18),
      this.coinMat,
      p.x,
      0.7,
      p.z,
      false,
    );
    coin.rotation.x = Math.PI / 2;
    this.game.scene.add(coin);
    this.coins.push({
      mesh: coin,
      value: burst ? Math.ceil(rand(1, 4)) : Math.ceil(rand(1, 3)),
      base: p,
    });
  }

  updateCoins(dt, time) {
    const p = this.game.player.pos;
    this.coinTimer -= dt;
    if (this.coinTimer <= 0) {
      this.coinTimer = 35;
      if (this.coins.length < 4) this.spawnCoin();
    }
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.mesh.rotation.z = time * 3;
      c.mesh.position.y = 0.7 + Math.sin(time * 3 + i) * 0.1;
      if (Math.hypot(c.base.x - p.x, c.base.z - p.z) < 1.0) {
        this.game.scene.remove(c.mesh);
        this.coins.splice(i, 1);
        this.game.state.stats.coins = (this.game.state.stats.coins ?? 0) + 1;
        this.game.audio.sfx("coin");
        if (this.game.online) {
          this.game.net.request("coin").then((r) => {
            this.game.applyServerMoney(r);
            if (r.ok) this.game.ui.floatMoney(r.value);
          });
        } else {
          this.game.state.money += c.value;
          this.game.ui.floatMoney(c.value);
        }
      }
    }
  }

  // ---------- Descubrimientos ----------

  checkDiscovery() {
    const g = this.game;
    const p = g.player.pos;
    const found = g.state.discovered;
    for (const place of PLACES) {
      if (found.includes(place.id)) continue;
      const inside = place.rect
        ? p.x >= place.rect[0] &&
          p.x <= place.rect[2] &&
          p.z >= place.rect[1] &&
          p.z <= place.rect[3]
        : g.world.buildings[place.id]?.contains(p.x, p.z, 0.3);
      if (!inside) continue;
      found.push(place.id);
      if (place.id === "tienda") continue;
      if (g.online)
        g.net
          .request("discover", { place: place.id })
          .then((r) => g.applyServerMoney(r));
      else g.state.money += 10;
      g.ui.toast(`📍 ¡Descubriste ${place.name}! +$10`, "good");
      g.ui.floatMoney(10);
      g.audio.sfx("sparkle");
    }
  }

  // ---------- Bucle ----------

  update(dt, time) {
    const g = this.game;
    this.updateCoins(dt, time);
    this.checkDiscovery();
    for (const m of this.merchants) {
      m.char.animate(dt, 0);
      const r = m.request;
      if (!r) continue;
      if (r.accepted) r.time -= dt;
      else r.expires -= dt;
      if (r.time <= 0 || r.expires <= 0) {
        if (r.accepted)
          g.ui.toast(`${m.name} ya no necesita el encargo`, "bad");
        m.request = null;
        m.char.think("☹", "#7f8c8d", 2);
      } else if (!m.char.bubble.visible)
        m.char.think(r.accepted ? "⏳" : "!", "#e67e22", 3);
    }
    // Los eventos empiezan cuando el tutorial ya enseñó lo básico.
    if (g.state.mission < 4) return;
    this.encargoTimer -= dt;
    if (this.encargoTimer <= 0) {
      this.encargoTimer = rand(70, 120);
      this.newRequest();
    }
    if (this.active) {
      this.active.time -= dt;
      const vipGone =
        this.active.type === "vip" &&
        (!this.active.customer ||
          this.active.customer.done ||
          this.active.customer.state === "exit");
      if (this.active.time <= 0 || vipGone || this.active.won) {
        if (this.active.type === "sale" && !this.active.won)
          g.ui.toast("Terminó la oferta flash del Mayorista");
        if (this.active.type === "coins") this.clearBurstCoins();
        this.active = null;
        this.timer = rand(60, 100);
      }
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) this.start();
  }

  clearBurstCoins() {
    while (this.coins.length > 4) {
      const c = this.coins.pop();
      this.game.scene.remove(c.mesh);
    }
  }

  // Encargo aceptado más urgente, para el HUD.
  hudEncargo() {
    const m = this.merchants.find((x) => x.request?.accepted);
    if (!m) return null;
    const r = m.request;
    return {
      icon: "📦",
      title: `${m.name}: ${r.delivered}/${r.units} ${PRODUCTS[r.product].name}`,
      time: r.time,
      total: 210,
      target: m,
    };
  }
}
