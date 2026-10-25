// Mayorista vivo: existencias disponibles por producto, pedidos que se
// preparan durante unos segundos y operarios que llevan cajas de las
// estanterías a la zona B (Recogida).
import { Agent } from "./npc.js";
import { ToyCharacter } from "./character.js";
import { workerLook } from "./look.js";
import { PRODUCTS, CATEGORIES } from "./config.js";

export const WAREHOUSE_MAX = 30; // cajas por producto
const REGEN_SECONDS = 20;

const CAT_INDEX = Object.keys(CATEGORIES);

export class Warehouse {
  constructor(game) {
    this.game = game;
    this.regen = 0;
    const spots = game.world.warehouseSpots;
    this.workers = ["naranja", "amarillo"].map((color, i) => {
      const start = spots.racks[i * 2];
      const a = new Agent(
        game,
        new ToyCharacter({ look: workerLook(color), apron: 0x3e4a59 }),
        start.x,
        start.z,
      );
      a.speed = 1.8;
      a.busy = false;
      a.idleT = i * 2;
      return a;
    });
  }

  // Cajas disponibles (en online las da el servidor y son compartidas).
  available(product) {
    const net = this.game.online?.warehouseStock;
    if (net) return net[product] ?? 0;
    return this.game.state.warehouse[product] ?? WAREHOUSE_MAX;
  }

  take(product, boxes) {
    if (this.game.online) return;
    const s = this.game.state.warehouse;
    s[product] = Math.max(0, (s[product] ?? WAREHOUSE_MAX) - boxes);
  }

  // Un pedido tarda 2 s + 0,6 s por caja en estar listo en la zona B.
  queueOrder(items) {
    const seconds = 2 + items.length * 0.6;
    this.game.state.pendingPickup.push({ items, readyIn: seconds });
    for (const it of items) this.toBring.push(it.product);
  }

  get toBring() {
    this._toBring ??= [];
    return this._toBring;
  }

  pendingSeconds() {
    const list = this.game.state.pendingPickup;
    return list.length ? Math.max(...list.map((o) => o.readyIn)) : 0;
  }

  update(dt) {
    const g = this.game;
    const s = g.state;
    // Reposición lenta del almacén (modo un jugador).
    this.regen -= dt;
    if (this.regen <= 0) {
      this.regen = REGEN_SECONDS;
      for (const p of Object.keys(s.warehouse))
        s.warehouse[p] = Math.min(WAREHOUSE_MAX, s.warehouse[p] + 1);
    }
    for (let i = s.pendingPickup.length - 1; i >= 0; i--) {
      const o = s.pendingPickup[i];
      o.readyIn -= dt;
      if (o.readyIn <= 0) {
        s.pendingPickup.splice(i, 1);
        s.pickup.push(...o.items);
        g.world.pickupPile.setCount(s.pickup.length);
        g.ui.toast("📦 ¡Pedido listo en la zona B · RECOGER PEDIDO!", "good");
        g.audio.sfx("place");
      }
    }
    for (const w of this.workers) this.work(w, dt);
  }

  // Operario: lleva cajas (de pedidos o de reposición) entre estanterías y palé.
  work(w, dt) {
    w.update(dt);
    if (w.busy || w.target) return;
    w.idleT -= dt;
    if (w.idleT > 0) return;
    const spots = this.game.world.warehouseSpots;
    const product = this.toBring.shift();
    const cat = product
      ? CAT_INDEX.indexOf(PRODUCTS[product].cat)
      : Math.floor(Math.random() * 5);
    const rack = spots.racks[Math.max(0, Math.min(4, cat))];
    w.busy = true;
    w.moveTo(rack, () => {
      w.char.playAction("pickup", 0.5);
      w.char.setCarry([product ?? "agua"]);
      w.waitTimer = 0.4;
      w.moveTo(
        { x: spots.pallet.x + (Math.random() - 0.5) * 1.4, z: spots.pallet.z },
        () => {
          w.char.setCarry([]);
          w.char.playAction("stock", 0.5);
          w.busy = false;
          w.idleT = product ? 0.2 : 2 + Math.random() * 3;
        },
      );
    });
  }

  positions() {
    return this.workers.map((w) => w.pos);
  }
}
