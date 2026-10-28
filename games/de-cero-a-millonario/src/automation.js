// Tienda automática: nivel de automatización, camión propio que repone
// solo, ganancia por minuto, monedas que llegan volando cuando vendes lejos
// y la caja fuerte con lo ganado mientras no juegas (con un límite que
// sube con las mejoras; en online lo calcula el servidor).
import * as THREE from "three";
import {
  PRODUCTS,
  BOX_UNITS,
  automationLevel,
  idleEarnings,
  IDLE,
} from "./config.js";
import { mat, mesh, roundedBox, cylinder } from "./gfx.js";

// Cada cuánto mira el camión el almacén y cuántas cajas lleva por viaje.
const TRUCK_CHECK = 15;
const TRUCK_BOXES = 10;
// Dinero que el camión deja siempre en la cuenta.
const RESERVE = 20;
// Ventana para la ganancia por minuto (segundos de juego).
const RATE_WINDOW = 120;
// Ausencias más cortas no cuentan como «fuera».
const MIN_AWAY_MINUTES = 2;
// Caja fuerte de la tienda (coordenadas del negocio).
const SAFE_AT = [6.35, 3.5];

export class Automation {
  constructor(game) {
    this.game = game;
    this.log = [];
    this.truckTimer = 5;
    this.coinAt = -1;
    this.time = 0; // segundos de juego (avanza con la simulación)
    document.addEventListener("visibilitychange", () => this.onVisibility());
  }

  get state() {
    return this.game.state.auto;
  }

  get shop() {
    return this.game.businesses.tienda;
  }

  level(b = this.shop) {
    if (!b?.owned) return 0;
    return automationLevel({
      roles: b.employees.map((e) => e.role),
      upgrades: [...b.upgrades],
    });
  }

  // Al cargar o entrar en una ciudad: caja fuerte y ganancias de fuera.
  setup() {
    this.buildSafe();
    if (this.game.online) {
      if (this.state.vault > 0) this.announceVault();
      return;
    }
    this.accrueOffline(this.state.savedAt);
  }

  // Sin conexión: lo ganado desde el último guardado (partida cerrada).
  accrueOffline(since) {
    if (!since) return;
    const minutes = (Date.now() - since) / 60000;
    if (minutes < MIN_AWAY_MINUTES) return;
    const level = this.level();
    const gained = idleEarnings(level, minutes);
    if (gained <= 0) return;
    const cap = idleEarnings(level, IDLE.capMinutes[level]);
    this.state.vault = Math.min(cap, (this.state.vault ?? 0) + gained);
    this.state.savedAt = Date.now();
    this.announceVault();
    this.game.save();
  }

  async onVisibility() {
    const g = this.game;
    if (g.mode !== "play") return;
    if (document.hidden) {
      this.hiddenAt = Date.now();
      return;
    }
    if (!this.hiddenAt) return;
    const since = this.hiddenAt;
    this.hiddenAt = null;
    if (!g.online) return this.accrueOffline(since);
    // En online el servidor calcula lo ganado desde la última vez que te vio.
    const r = await g.serverAction("idle", {}, true);
    if (r.ok && r.vault > (this.state.vault ?? 0)) {
      this.state.vault = r.vault;
      this.announceVault();
    }
  }

  announceVault() {
    const v = this.state.vault;
    this.game.ui.toast(
      `💰 Tu tienda ganó ${fmt(v)} mientras no estabas · ve a la caja fuerte a cobrarlo`,
      "event",
    );
  }

  async collect() {
    const g = this.game;
    const v = this.state.vault ?? 0;
    if (v <= 0) return;
    if (g.online) {
      const r = await g.serverAction("collect", {});
      if (!r.ok) return;
    } else g.state.money += v;
    this.state.vault = 0;
    g.ui.floatMoney(v);
    g.ui.coinBurst(8);
    g.audio.sfx("cash");
    g.player.char.playAction("cheer", 1);
    g.save();
  }

  // Caja fuerte junto al almacén: brilla cuando hay ganancias que cobrar.
  buildSafe() {
    const b = this.shop;
    if (!b?.owned || this.safeFor === b) return;
    this.safeFor = b;
    const g = new THREE.Group();
    g.add(mesh(roundedBox(0.6, 0.75, 0.55, 0.05), mat(0x3e4a59), 0, 0.37, 0));
    const dial = mesh(
      cylinder(0.11, 0.11, 0.04, 16),
      mat(0xf2c230),
      0,
      0.45,
      0.28,
    );
    dial.rotation.x = Math.PI / 2;
    g.add(dial);
    this.safeGlow = new THREE.Mesh(
      cylinder(0.32, 0.32, 0.05, 20),
      new THREE.MeshStandardMaterial({
        color: 0xffe066,
        emissive: 0xffc22e,
        emissiveIntensity: 0.9,
      }),
    );
    this.safeGlow.position.y = 0.78;
    g.add(this.safeGlow);
    b.place(g, SAFE_AT[0], SAFE_AT[1], -Math.PI / 2);
    b.collider(SAFE_AT[0], SAFE_AT[1], 0.6, 0.6);
    this.safePoint = b.local(SAFE_AT[0] - 0.85, SAFE_AT[1]);
  }

  interactables() {
    if (!this.safePoint) return [];
    return [
      {
        ...this.safePoint,
        radius: 1.1,
        label: () => {
          const v = this.state.vault ?? 0;
          if (v > 0)
            return { text: `💰 COBRAR GANANCIAS · ${fmt(v)}`, enabled: true };
          const lvl = this.level();
          return {
            text:
              lvl >= 2
                ? `💰 Caja fuerte · guarda hasta ${IDLE.capMinutes[lvl] / 60} h de ganancias mientras no juegas`
                : "💰 Caja fuerte · con un cajero, tu tienda gana aunque no juegues",
            enabled: false,
          };
        },
        action: () => this.collect(),
      },
    ];
  }

  // Cada venta: para la ganancia por minuto y, si estás lejos de la
  // tienda, monedas volando hacia tu dinero.
  recordSale(profit, business) {
    const g = this.game;
    this.log.push({ t: this.time, profit });
    const p = g.player.pos;
    if (
      !business.building.contains(p.x, p.z) &&
      this.time - this.coinAt > 0.5
    ) {
      this.coinAt = this.time;
      g.ui.coinBurst(3);
    }
  }

  perMinute() {
    const now = this.time;
    while (this.log.length && now - this.log[0].t > RATE_WINDOW)
      this.log.shift();
    const sum = this.log.reduce((a, e) => a + e.profit, 0);
    const span = Math.min(
      RATE_WINDOW,
      Math.max(30, now - (this.log[0]?.t ?? now)),
    );
    return (sum / span) * 60;
  }

  update(dt) {
    this.time += dt;
    if (this.safeGlow) {
      const on = (this.state.vault ?? 0) > 0;
      this.safeGlow.visible = on;
      if (on) this.safeGlow.rotation.y += dt * 2;
    }
    this.truckTimer -= dt;
    if (this.truckTimer > 0) return;
    this.truckTimer = TRUCK_CHECK;
    this.autoRestock();
  }

  // Camión propio: cuando el almacén baja del nivel elegido, compra en el
  // Mayorista lo que falta (lo que menos queda primero) y lo trae.
  async autoRestock() {
    const g = this.game;
    const b = this.shop;
    if (!b?.owned || !b.upgrades.has("camion") || this.ordering) return;
    if (g.state.deliveries.some((d) => d.biz === b.id)) return;
    const cap = b.storageCap();
    if (b.storageUnits() > cap * this.state.threshold) return;
    const stage = g.stageIndex();
    const have = (p) => (b.storage[p] ?? 0) + b.shelfStock(p);
    const products = b
      .catalog()
      .filter(
        (p) =>
          (PRODUCTS[p].stage ?? 0) <= stage &&
          b.displays.some((d) => d.display.accepts(p)),
      )
      .sort((x, y) => have(x) - have(y));
    const per = (p) => PRODUCTS[p].boxUnits ?? BOX_UNITS;
    const room = cap - b.storageUnits();
    const order = {};
    let units = 0;
    let boxes = 0;
    for (let pass = 0; pass < TRUCK_BOXES && boxes < TRUCK_BOXES; pass++)
      for (const p of products) {
        if (boxes >= TRUCK_BOXES || units + per(p) > room) continue;
        if ((order[p] ?? 0) + 1 > g.warehouse.available(p)) continue;
        order[p] = (order[p] ?? 0) + 1;
        units += per(p);
        boxes++;
      }
    // Solo lo que se puede pagar sin dejar la cuenta vacía.
    while (boxes && g.supplyCost(order) > g.state.money - RESERVE) {
      const last = Object.keys(order).at(-1);
      units -= per(last);
      boxes--;
      if (--order[last] === 0) delete order[last];
    }
    if (!boxes) {
      if (!this.warnedMoney) {
        this.warnedMoney = true;
        g.ui.toast(
          "🚚 Tu camión no tiene dinero para comprar mercadería",
          "bad",
        );
      }
      return;
    }
    this.warnedMoney = false;
    this.ordering = true;
    let cost = g.supplyCost(order);
    if (g.online) {
      const r = await g.serverAction("buy", { order, deliver: b.id }, true);
      this.ordering = false;
      if (!r.ok) return;
      cost = r.cost;
    } else {
      this.ordering = false;
      g.state.money -= cost;
      for (const [p, n] of Object.entries(order)) g.warehouse.take(p, n);
    }
    const items = [];
    for (const [p, n] of Object.entries(order))
      for (let i = 0; i < n; i++) items.push({ product: p, units: per(p) });
    g.state.stats.unitsBought += units;
    g.state.stats.expenses += cost;
    const delivery = { biz: b.id, items };
    g.state.deliveries.push(delivery);
    g.dispatchTruck(delivery);
    g.ui.toast(
      `🚚 Tu camión compró ${boxes} cajas en el Mayorista (−${fmt(cost)})`,
      "event",
    );
    g.save();
  }
}

const fmt = (n) => `$${(Math.round(n * 100) / 100).toLocaleString("es")}`;
