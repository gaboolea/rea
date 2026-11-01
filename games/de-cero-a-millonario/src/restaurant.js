// Restaurante: negocio comprable con comedor (mesas con sillas), cocina
// abierta con fogones, pase donde salen los platos y barra con caja.
//
// - Los platos se cocinan con ingredientes del Mayorista (RECIPES en
//   config.js), igual que el café sale de los granos: el jugador en los
//   fogones o el cocinero convierten los ingredientes del almacén en
//   platos del pase. En online el servidor valida cada conversión (cook).
// - Los comensales (Diner) entran, buscan mesa libre, se sientan, piden
//   un plato, esperan a que se lo lleve el camarero (o van a por él al
//   pase si no hay camarero), comen y pagan en la barra con la misma caja
//   y validación de venta que el resto de negocios.
import * as THREE from "three";
import { Business, LAYOUTS } from "./business.js";
import { Customer } from "./npc.js";
import { PRODUCTS, RECIPES } from "./config.js";
import { counter, tableSet } from "./props.js";
import { signMesh, mat, mesh, box, cylinder, roundedBox } from "./gfx.js";

const PI2 = Math.PI / 2;
const DISHES = ["hamburguesa", "ensalada", "pizza_casera", "menu"];
const DISH_EMOJI = {
  hamburguesa: "🍔",
  ensalada: "🥗",
  pizza_casera: "🍕",
  menu: "🍽️",
};
// Platos por tanda en los fogones (el doble con el horno de leña).
const BATCH = 3;

// Coordenadas locales del edificio (16 × 14 m, puerta hacia +z).
export const RESTAURANT_LAYOUT = {
  displays: [
    { id: "t1", kind: "pass", lx: 1.7, lz: -3.9, onCounter: true, dish: "hamburguesa" },
    { id: "t2", kind: "pass", lx: 3.1, lz: -3.9, onCounter: true, dish: "ensalada" },
    { id: "t3", kind: "pass", lx: 4.5, lz: -3.9, onCounter: true, dish: "pizza_casera" },
    { id: "t4", kind: "pass", lx: 5.9, lz: -3.9, onCounter: true, dish: "menu" },
  ],
  registers: [{ id: "r1", lx: 6.1, lz: 0.6, rot: PI2, queue: [0, 0.9] }],
  storage: { lx: 6.4, lz: -6.0, point: [5.0, -5.4] },
  // Fogones (y punto del cocinero delante).
  stove: { lx: -4.0, lz: -6.05, point: [-4.0, -4.95] },
  dining: [
    [-5.3, 3.8],
    [-1.6, 3.8],
    [-5.3, 0.4],
    [-1.6, 0.4],
  ],
  // Con la mejora «terraza» (mesas extra).
  extraTables: [
    [2.4, 3.8],
    [-5.3, -2.6],
  ],
  plants: [
    [-7.1, 6.1],
    [7.1, 6.1],
    [-7.1, -2.0],
  ],
  upgrades: ["terraza", "horno", "plantas", "letrero", "suelo"],
  offsetZ: 0,
  storageCap: 120,
  spawnEvery: 5,
};
LAYOUTS.restaurante = RESTAURANT_LAYOUT;

// Crea el negocio que corresponde a cada id (el restaurante tiene su
// propia clase).
export function makeBusiness(game, id, opts) {
  return id === "restaurante"
    ? new Restaurant(game, id, opts)
    : new Business(game, id, opts);
}

export class Restaurant extends Business {
  constructor(game, id, opts) {
    super(game, id, opts);
    this.seats = [];
    this.orders = [];
    this.stoveBuilt = false;
  }

  buildInterior() {
    super.buildInterior();
    this.buildKitchen();
    this.addTables(this.layout.dining);
    this.refreshFixtures();
    if (!this.remote) this.interactables.push(this.stoveInteractable());
  }

  refreshFixtures() {
    super.refreshFixtures();
    if (this.upgrades.has("terraza") && this.seats.length && !this.extraDone)
      this.addTables(this.layout.extraTables);
    if (this.upgrades.has("horno") && this.stoveBuilt && !this.oven) {
      // Horno de leña con su boca encendida, junto a los fogones.
      const g = new THREE.Group();
      g.add(mesh(roundedBox(1.6, 1.3, 1.1, 0.2), mat(0xb5532c), 0, 0.65, 0));
      g.add(mesh(cylinder(0.75, 0.8, 0.5, 14), mat(0xa04424), 0, 1.45, 0));
      const fire = mesh(
        box(0.7, 0.4, 0.05),
        new THREE.MeshStandardMaterial({
          color: 0xff8a3d,
          emissive: 0xff5a1a,
          emissiveIntensity: 1.2,
        }),
        0,
        0.55,
        0.56,
      );
      g.add(fire);
      this.place(g, -0.9, -6.1);
      this.collider(-0.9, -6.1, 1.6, 1.1);
      this.oven = g;
    }
  }

  buildKitchen() {
    if (this.stoveBuilt) return;
    this.stoveBuilt = true;
    const st = this.layout.stove;
    // Encimera con fogones, campana y cazuelas.
    this.place(counter(5.2, 0.9, 0x5d6d7e, 0xdfe6ec), st.lx, st.lz);
    this.collider(st.lx, st.lz, 5.2, 0.9);
    const steel = mat(0x2b2f36);
    for (const dx of [-1.6, -0.5, 0.6, 1.7]) {
      const burner = mesh(cylinder(0.22, 0.22, 0.03, 14), steel, 0, 0, 0);
      this.place(burner, st.lx + dx, st.lz, 0, 0.93);
    }
    const pot = mesh(cylinder(0.24, 0.2, 0.3, 14), mat(0xc0c7cf), 0, 0, 0);
    this.place(pot, st.lx - 1.6, st.lz, 0, 1.1);
    const pan = mesh(cylinder(0.26, 0.22, 0.08, 14), mat(0x30343b), 0, 0, 0);
    this.place(pan, st.lx + 0.6, st.lz, 0, 0.99);
    const hood = mesh(box(5.0, 0.5, 1.0), mat(0xb8c2cc), 0, 0, 0);
    this.place(hood, st.lx, st.lz - 0.05, 0, 2.6);
    // Pase: barra entre la cocina y el comedor con los platos.
    this.place(counter(5.8, 0.9), 3.8, -3.9);
    this.collider(3.8, -3.9, 5.8, 0.9);
    const sign = signMesh("PASE · PLATOS LISTOS", 2.6, 0.45, {
      bg: "#c0392b",
      fg: "#ffffff",
    });
    this.place(sign, 3.8, -4.4, 0, 2.5);
    const menu = signMesh(
      "MENÚ\n🍔 Hamburguesa\n🥗 Ensalada\n🍕 Pizza\n🍽️ Menú del día",
      1.6,
      1.6,
      { bg: "#2d3436", fg: "#ffffff", font: "bold 30px" },
    );
    this.place(menu, -7.66, 2.2, PI2, 1.9);
    this.cookPoint = this.local(...st.point);
    this.stovePos = this.local(st.lx, st.lz);
  }

  addTables(list) {
    if (list === this.layout.extraTables) {
      if (this.extraDone) return;
      this.extraDone = true;
    }
    const plateMat = mat(0xffffff);
    for (const [lx, lz] of list) {
      this.place(tableSet(), lx, lz);
      this.collider(lx, lz, 2.3, 1.1);
      const center = this.local(lx, lz);
      for (const s of [-1, 1]) {
        const pos = this.local(lx + s * 0.85, lz);
        // Se llega por delante de la silla (hacia la puerta) y se sienta.
        const approach = this.local(lx + s * 0.85, lz + 0.95);
        const plate = new THREE.Group();
        plate.add(mesh(cylinder(0.2, 0.16, 0.04, 16), plateMat, 0, 0, 0));
        const food = mesh(cylinder(0.13, 0.12, 0.09, 12), mat(0xb5651d), 0, 0.06, 0);
        plate.add(food);
        this.place(plate, lx + s * 0.35, lz, 0, 0.8);
        plate.visible = false;
        this.seats.push({
          pos,
          approach,
          heading: Math.atan2(center.x - pos.x, center.z - pos.z),
          taken: null,
          plate,
          food,
        });
      }
    }
  }

  freeSeat() {
    const free = this.seats.filter((s) => !s.taken);
    return free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  // Platos del menú que se pueden servir ahora (por etapa).
  menu() {
    const stage = this.game.stageIndex?.() ?? 0;
    return DISHES.filter((d) => (PRODUCTS[d].stage ?? 0) <= stage);
  }

  trayFor(dish) {
    return this.displays.find((e) => e.def.dish === dish);
  }

  dishReady(dish) {
    return (this.trayFor(dish)?.display.stock ?? 0) > 0;
  }

  takeDish(dish) {
    const t = this.trayFor(dish);
    if (!t || t.display.stock <= 0) return false;
    t.display.setStock(t.display.stock - 1);
    return true;
  }

  returnDish(dish) {
    const t = this.trayFor(dish);
    if (t && t.display.stock < t.display.capacity) {
      if (!t.display.product) t.display.setProduct(dish);
      t.display.setStock(t.display.stock + 1);
    }
  }

  // Cuántos platos se pueden hacer ahora con los ingredientes del almacén.
  canCook(dish) {
    let n = Infinity;
    for (const [ing, k] of Object.entries(RECIPES[dish]))
      n = Math.min(n, Math.floor((this.storage[ing] ?? 0) / k));
    return n;
  }

  // Lo siguiente que conviene cocinar: lo que piden las mesas y no está en
  // el pase; si no, el plato con menos existencias.
  nextCookJob() {
    const batch = BATCH * (this.upgrades.has("horno") ? 2 : 1);
    const options = this.menu()
      .map((dish) => {
        const tray = this.trayFor(dish);
        if (!tray) return null;
        const room = tray.display.capacity - tray.display.stock;
        const can = Math.min(this.canCook(dish), room, batch);
        const wanted = this.orders.filter(
          (o) => o.dish === dish && o.state === "waitFood",
        ).length;
        return can > 0 ? { dish, units: can, score: wanted * 10 - tray.display.stock } : null;
      })
      .filter(Boolean)
      .filter((o) => o.score > -4);
    options.sort((a, b) => b.score - a.score);
    return options[0] ?? null;
  }

  // Convierte ingredientes del almacén en platos del pase.
  cook(dish, units) {
    const tray = this.trayFor(dish);
    units = Math.min(units, this.canCook(dish), tray.display.capacity - tray.display.stock);
    if (units <= 0) return 0;
    for (const [ing, k] of Object.entries(RECIPES[dish])) {
      this.storage[ing] -= k * units;
      if (this.storage[ing] <= 0) delete this.storage[ing];
    }
    this.updateStoragePile();
    // En online el servidor hace la misma conversión en tu inventario.
    if (this.game.online) this.game.net.request("cook", { dish, units });
    if (!tray.display.product) tray.display.setProduct(dish);
    tray.display.setStock(tray.display.stock + units);
    return units;
  }

  stoveInteractable() {
    const game = this.game;
    return {
      x: this.cookPoint.x,
      z: this.cookPoint.z,
      alt: this.stovePos,
      radius: 1.6,
      label: () => {
        if (this.employees.some((e) => e.role === "cocinero"))
          return { text: "👩‍🍳 Fogones · el cocinero se encarga", enabled: false };
        const job = this.nextCookJob();
        if (job)
          return {
            text: `🍳 Cocinar ${job.units} × ${PRODUCTS[job.dish].name}`,
            enabled: true,
          };
        return {
          text: "Fogones · faltan ingredientes (Mayorista → COCINA) o el pase está lleno",
          enabled: false,
        };
      },
      action: () => {
        const job = this.nextCookJob();
        if (!job) return;
        const made = this.cook(job.dish, job.units);
        if (made) {
          game.player.char.playAction("brew", 1.0);
          game.audio.sfx("place");
          game.ui.toast(`${DISH_EMOJI[job.dish]} ${made} × ${PRODUCTS[job.dish].name} en el pase`);
        }
      },
    };
  }

  hire(role) {
    const e = super.hire(role);
    if (role === "camarero") e.speed = 3.2;
    return e;
  }

  cookTick(e) {
    const job = this.nextCookJob();
    if (!job) {
      e.idle = 1.5;
      if (Math.hypot(e.pos.x - this.cookPoint.x, e.pos.z - this.cookPoint.z) > 0.8)
        e.moveTo(this.cookPoint, () => e.face(this.stovePos.x, this.stovePos.z));
      return;
    }
    e.busy = true;
    e.moveTo(this.cookPoint, () => {
      e.face(this.stovePos.x, this.stovePos.z);
      e.char.playAction("brew", 2.4);
      e.char.think(DISH_EMOJI[job.dish], "#c0392b", 2);
      this.game.timers.push({
        t: 2.4,
        fn: () => {
          this.cook(job.dish, job.units);
          e.busy = false;
        },
      });
    });
  }

  // Camarero: lleva platos a las mesas y cobra en la barra (si hay cola
  // en la caja, primero cobra).
  waiterTick(e) {
    const queue = this.registers[0]?.queue ?? [];
    const o = this.orders.find(
      (d) => d.state === "waitFood" && !d.claimed && this.dishReady(d.dish),
    );
    if (!o || (queue[0]?.ready && (queue.length >= 2 || o.waited < 6))) {
      this.cashierTick(e);
      return;
    }
    o.claimed = e;
    e.busy = true;
    const tray = this.trayFor(o.dish);
    e.moveTo(tray.approach, () => {
      if (!this.takeDish(o.dish)) {
        o.claimed = null;
        e.busy = false;
        return;
      }
      e.char.setCarry([o.dish]);
      e.moveTo(o.seat.approach, () => {
        e.char.setCarry([]);
        e.char.playAction("stock", 0.5);
        if (o.state === "waitFood" && o.seated) o.receive();
        else this.returnDish(o.dish);
        e.busy = false;
      });
    });
  }

  // Lo que no se llegó a cobrar vuelve al pase (no al almacén).
  returnItems(items) {
    for (const it of items) this.returnDish(it.product);
  }

  rollWants() {
    const menu = this.menu();
    const ready = menu.filter((d) => this.dishReady(d) || this.canCook(d) > 0);
    const pool = ready.length && Math.random() < 0.9 ? ready : menu;
    return [pool[Math.floor(Math.random() * pool.length)]];
  }

  makeCustomer(spawn, seed, street) {
    return new Diner(this.game, this, spawn, seed, street);
  }

  maxCustomers() {
    return this.seats.length + 2;
  }
}

// Comensal: se sienta, pide, come y paga en la barra.
export class Diner extends Customer {
  constructor(game, business, spawn, seed, street) {
    super(game, business, spawn, false, seed, street);
    this.patience = 70 + Math.random() * 20;
    this.seat = null;
    this.dish = null;
    this.seated = false;
    this.eaten = false;
  }

  // Al entrar (y al terminar de comer): mesa o pagar.
  nextWant() {
    if (this.eaten) {
      this.goPay();
      return;
    }
    const seat = this.business.freeSeat();
    if (!seat) {
      this.state = "waitSeat";
      this.waitTimer = 2;
      return;
    }
    seat.taken = this;
    this.seat = seat;
    this.state = "toSeat";
    this.moveTo(seat.approach, () => this.sitDown());
  }

  sitDown() {
    this.seated = true;
    this.target = null;
    this.path = [];
    this.pos.x = this.seat.pos.x;
    this.pos.z = this.seat.pos.z;
    this.heading = this.seat.heading;
    if (this.state === "fetching") {
      this.receive();
      return;
    }
    this.state = "ordering";
    this.timer = 1.2 + Math.random();
  }

  order() {
    const b = this.business;
    const menu = b.menu();
    let dish = this.wants[0];
    if (!b.dishReady(dish) && b.canCook(dish) <= 0)
      dish = menu.find((d) => b.dishReady(d)) ?? menu.find((d) => b.canCook(d) > 0);
    if (!dish) {
      this.char.think("❌", "#c0392b", 2);
      b.disappoint(2);
      b.today.lost++;
      this.standUp();
      this.leave();
      return;
    }
    this.dish = dish;
    this.char.think(DISH_EMOJI[dish], "#c0392b", 2.2);
    this.state = "waitFood";
    this.waited = 0;
    b.orders.push(this);
  }

  // Le traen el plato (o lo trae él del pase): a comer.
  receive() {
    this.state = "eating";
    this.timer = 5 + Math.random() * 3;
    this.seat.plate.visible = true;
    this.seat.food.material = mat(PRODUCTS[this.dish].color);
    this.char.think("😋", "#2e8a43", 2);
    this.business.orders = this.business.orders.filter((o) => o !== this);
  }

  standUp() {
    if (!this.seat) return;
    this.seated = false;
    this.seat.plate.visible = false;
    this.pos.x = this.seat.approach.x;
    this.pos.z = this.seat.approach.z;
    this.seat.taken = null;
    this.seat = null;
    this.business.orders = this.business.orders.filter((o) => o !== this);
  }

  finishEating() {
    const b = this.business;
    this.basket = [{ product: this.dish, price: b.priceOf(this.dish) }];
    this.eaten = true;
    this.standUp();
    this.goPay();
  }

  // Sin camarero: va a por el plato al pase y vuelve a su mesa.
  fetch() {
    const b = this.business;
    const tray = b.trayFor(this.dish);
    const seat = this.seat;
    this.seated = false;
    this.state = "fetching";
    this.moveTo(tray.approach, () => {
      if (!b.takeDish(this.dish)) {
        this.state = "waitFood";
        this.moveTo(seat.approach, () => {
          this.sitDown();
          this.state = "waitFood";
        });
        return;
      }
      this.char.setCarry([this.dish]);
      this.moveTo(seat.approach, () => {
        this.char.setCarry([]);
        this.sitDown();
      });
    });
  }

  giveUp() {
    this.char.think("!", "#c0392b", 3);
    this.business.disappoint(3);
    this.standUp();
    this.leave();
  }

  update(dt) {
    if (!this.seated) {
      super.update(dt);
      if (this.state === "waitSeat") {
        this.waited += dt;
        if (this.waited > 25) {
          this.char.think("☹", "#7f8c8d", 2);
          this.leave();
        } else if (this.waitTimer <= 0) this.nextWant();
      }
      return;
    }
    // Sentado: quieto en la silla, con las piernas dobladas.
    const s = this.seat;
    this.pos.y = 0.12;
    this.char.root.position.set(s.pos.x, 0.12, s.pos.z);
    this.char.root.rotation.y = s.heading;
    this.char.animate(dt, 0, true);
    this.char.legs.forEach((l) => (l.rotation.x = -1.45));
    if (this.state === "ordering") {
      this.timer -= dt;
      if (this.timer <= 0) this.order();
    } else if (this.state === "waitFood") {
      this.waited += dt;
      const waiter = this.business.employees.some((e) => e.role === "camarero");
      if (this.waited > this.patience) this.giveUp();
      // Sin camarero (o si tarda mucho) va él mismo a por el plato al pase.
      else if (
        this.waited > (waiter ? 15 : 4) &&
        !this.claimed &&
        this.business.dishReady(this.dish)
      )
        this.fetch();
    } else if (this.state === "eating") {
      this.timer -= dt;
      if (this.timer <= 0) this.finishEating();
    }
  }
}
