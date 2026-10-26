// Negocios del jugador: mobiliario según mejoras, existencias reales en
// estanterías y almacén, cajas registradoras con filas, clientes y empleados.
import { BUSINESSES, PRODUCTS, UPGRADES, STAFF, BOX_UNITS } from "./config.js";
import {
  ProductDisplay,
  StoragePile,
  registerCounter,
  coffeeMachine,
  counter,
  pottedPlant,
  tableSet,
} from "./props.js";
import { Customer, Employee } from "./npc.js";
import { signMesh } from "./gfx.js";
import * as decor from "./decor.js";
import { cardboardBox } from "./props.js";
import * as THREE from "three";

const PI2 = Math.PI / 2;

const DISPLAY_NAMES = {
  shelf: "Estantería",
  fridge: "Refrigerador",
  freezer: "Congelador",
  produce: "Frutas y verduras",
  vitrina: "Vitrina",
  coffee: "Barra de cafés",
};

// Coordenadas locales al área principal del local (puerta hacia +z).
const GROCERY = {
  displays: [
    { id: "s1", kind: "shelf", lx: -5, lz: -6.2 },
    { id: "s2", kind: "shelf", lx: -1.2, lz: -6.2 },
    { id: "e1", kind: "shelf", lx: 2.6, lz: -6.2, req: "estanteria1" },
    { id: "s3", kind: "shelf", lx: -5, lz: -2.0 },
    { id: "e2", kind: "shelf", lx: -1.2, lz: -2.0, req: "estanteria2" },
    {
      id: "f1",
      kind: "fridge",
      lx: -7.25,
      lz: 1.8,
      rot: PI2,
      req: "refrigerador",
    },
  ],
  registers: [
    { id: "r1", lx: 5.4, lz: 0.5, queue: [-0.9, 0] },
    { id: "r2", lx: 5.4, lz: -3.5, queue: [-0.9, 0], req: "caja2" },
  ],
  storage: { lx: 6.3, lz: 4.6 },
  plants: [
    [-7.2, 6.2],
    [7.2, -6.3],
    [-7.2, -6.6],
  ],
  upgrades: [
    "estanteria1",
    "estanteria2",
    "refrigerador",
    "caja2",
    "plantas",
    "letrero",
    "suelo",
  ],
  offsetZ: 0,
  storageCap: 120,
  spawnEvery: 7,
};

// Tienda inicial (y locales de jugadores online): sala de 14×12 m con
// pasillos de 2,5 m, estanterías murales y centrales, frescos, frío, dos
// cajas junto a la entrada y almacén pequeño. offsetZ: la sala delantera
// está centrada 3 m por delante del centro del edificio.
const STARTER = {
  displays: [
    { id: "s1", kind: "shelf", lx: -4.6, lz: -5.35 },
    { id: "s2", kind: "shelf", lx: -1.4, lz: -5.35 },
    { id: "f1", kind: "fridge", lx: 1.75, lz: -5.3, req: "refrigerador" },
    { id: "z1", kind: "freezer", lx: 4.65, lz: -5.25, req: "congelador" },
    { id: "s3", kind: "shelf", lx: -2.6, lz: -1.8 },
    { id: "e1", kind: "shelf", lx: 1.0, lz: -1.8, req: "estanteria1" },
    { id: "p1", kind: "produce", lx: 6.25, lz: -1.6, rot: -PI2 },
    {
      id: "e2",
      kind: "shelf",
      lx: -6.4,
      lz: -1.4,
      rot: PI2,
      req: "estanteria2",
    },
    { id: "a1", kind: "shelf", lx: -4.6, lz: -11.3, req: "ampliacion" },
    { id: "a2", kind: "shelf", lx: -1.4, lz: -11.3, req: "estanteria3" },
    { id: "a3", kind: "shelf", lx: 1.8, lz: -11.3, req: "estanteria4" },
  ],
  registers: [
    { id: "r1", lx: -4.2, lz: 3.3, rot: PI2, front: true, queue: [0.95, 0] },
    {
      id: "r2",
      lx: 4.2,
      lz: 3.3,
      rot: PI2,
      front: true,
      queue: [-0.95, 0],
      req: "caja2",
    },
  ],
  storage: { lx: 5.8, lz: 1.5 },
  plants: [
    [-6.4, -5.3],
    [6.4, -3.6],
    [3.25, -5.5],
  ],
  // Decoración estática: [tipo, lx, lz, rotación, altura, colisión w, d]
  decor: [
    ["mat", 0, 5.25],
    ["baskets", -2.5, 5.3, 0, 0, 0.6, 0.45],
    ["cart", 2.5, 5.2, Math.PI, 0, 0.6, 0.9],
    ["clock", 0.3, -5.83, 0, 2.55],
    ["poster:¡OFERTA 2×1!", -6.66, 2.0, PI2, 1.8],
    ["poster:¡PRECIOS BAJOS!", 6.66, 3.4, -PI2, 1.9],
    ["picture", -6.66, 4.2, PI2, 1.9],
    ["trash", -6.2, 3.1, 0, 0, 0.45, 0.45],
    ["boxes", 6.3, 4.9, 0, 0, 0.7, 0.7],
    ["candy", -5.0, 3.3, 0, 1.04],
    ["plant", -6.4, 4.9, 0, 0, 0.5, 0.5],
    ["lamp", -3, -3.6, 0, 3.4],
    ["lamp", 2.2, -3.6, 0, 3.4],
    ["lamp", -3, 1.4, 0, 3.4],
    ["lamp", 2.2, 1.4, 0, 3.4],
  ],
  upgrades: [
    "estanteria1",
    "estanteria2",
    "refrigerador",
    "congelador",
    "caja2",
    "ampliacion",
    "estanteria3",
    "estanteria4",
    "plantas",
    "letrero",
    "suelo",
  ],
  offsetZ: 3,
  storageCap: 120,
  spawnEvery: 7,
};

const LAYOUTS = {
  tienda: STARTER,
  minimercado: { ...GROCERY, spawnEvery: 6 },
  supermercado: {
    displays: [
      ...[-6.5, -3, 0.5, 4].map((lx, i) => ({
        id: `b${i}`,
        kind: "shelf",
        lx,
        lz: -9.2,
      })),
      ...[-6.5, -3, 0.5].map((lx, i) => ({
        id: `m${i}`,
        kind: "shelf",
        lx,
        lz: -5,
      })),
      ...[-6.5, -3, 0.5].map((lx, i) => ({
        id: `n${i}`,
        kind: "shelf",
        lx,
        lz: -1,
      })),
      { id: "f1", kind: "fridge", lx: -9.25, lz: 3.5, rot: PI2 },
      { id: "f2", kind: "fridge", lx: -9.25, lz: 6.5, rot: PI2 },
    ],
    registers: [
      { id: "r1", lx: 7.0, lz: 1.5, queue: [-0.9, 0] },
      { id: "r2", lx: 7.0, lz: -3.0, queue: [-0.9, 0] },
      { id: "r3", lx: 7.0, lz: 6.0, queue: [-0.9, 0], req: "caja2" },
    ],
    storage: { lx: 8, lz: -7.6 },
    plants: [
      [-9.2, 9.2],
      [9.2, 9.2],
      [-9.2, -1],
    ],
    upgrades: ["caja2", "plantas", "letrero", "suelo"],
    offsetZ: 0,
    storageCap: 300,
    spawnEvery: 3.5,
  },
  cafeteria: {
    displays: [
      { id: "v1", kind: "vitrina", lx: -3.5, lz: -5.0 },
      {
        id: "v2",
        kind: "vitrina",
        lx: -6.3,
        lz: -1.0,
        rot: PI2,
        req: "vitrina2",
      },
      { id: "cc", kind: "coffee", lx: 5.2, lz: -2.6, onCounter: true },
    ],
    registers: [{ id: "r1", lx: 1.4, lz: -2.6, queue: [0, 0.9], rot: PI2 }],
    storage: { lx: 5.6, lz: 3.8 },
    machine: { lx: 3.5, lz: -5.45 },
    plants: [
      [-6.3, 5.2],
      [6.3, -0.8],
    ],
    tables: [
      [-3.4, 3.0],
      [-3.0, -0.4],
    ],
    upgrades: ["vitrina2", "plantas", "letrero", "suelo"],
    offsetZ: 0,
    storageCap: 120,
    spawnEvery: 9,
  },
};

export class Business {
  // opts.building: edificio donde se instala (en online, la tienda inicial
  // de cada jugador ocupa un local distinto). opts.remote: negocio de otro
  // jugador que solo se dibuja con los datos que llegan del servidor.
  constructor(game, id, opts = {}) {
    this.game = game;
    this.id = id;
    this.def = BUSINESSES[id];
    this.name = opts.name ?? this.def.name;
    this.building = game.world.buildings[opts.building ?? id];
    this.layout = LAYOUTS[id];
    this.remote = !!opts.remote;
    this.openToPlayers = true;
    this.colliderTag = `biz:${this.building.id}`;
    this.owned = !!this.def.owned;
    this.upgrades = new Set();
    this.prices = {};
    for (const p of this.catalog()) this.prices[p] = PRODUCTS[p].base;
    this.storage = {};
    this.displays = [];
    this.registers = [];
    this.customers = [];
    this.employees = [];
    this.decor = [];
    this.machine = null;
    this.spawnTimer = 2;
    this.reputation = 50;
    this.today = { revenue: 0, profit: 0, sales: 0, lost: 0 };
    this.interactables = [];
    this.saleInteractable = null;
  }

  catalog() {
    return Object.keys(PRODUCTS).filter(
      (p) => PRODUCTS[p].kind === this.def.type && !PRODUCTS[p].ingredient,
    );
  }

  // Productos que este negocio puede recibir del proveedor.
  supplies() {
    return Object.keys(PRODUCTS).filter(
      (p) => PRODUCTS[p].kind === this.def.type && !PRODUCTS[p].crafted,
    );
  }

  setup() {
    if (this.owned) {
      this.building.setLocked(false, null);
      this.buildInterior();
    } else {
      this.building.setLocked(
        true,
        `SE VENDE\n$${this.def.price.toLocaleString("es")}`,
      );
    }
  }

  buy() {
    this.owned = true;
    this.setup();
  }

  local(lx, lz) {
    return this.building.toWorld(lx, lz + this.layout.offsetZ);
  }

  place(obj, lx, lz, rot = 0, y) {
    this.building.place(obj, lx, lz + this.layout.offsetZ, rot, y);
    this.building.interior.add(obj);
    return obj;
  }

  collider(lx, lz, w, d) {
    return this.building.addLocalCollider(
      lx,
      lz + this.layout.offsetZ,
      w,
      d,
      this.colliderTag,
    );
  }

  buildInterior() {
    const L = this.layout;
    const st = L.storage;
    this.storagePile = new StoragePile(12);
    this.place(this.storagePile.group, st.lx, st.lz);
    this.collider(st.lx, st.lz, 2.0, 1.4);
    this.storagePoint = this.local(st.lx - 1.6, st.lz);
    if (this.def.type === "cafe") this.buildCafeFixtures();
    for (const [lx, lz] of L.tables ?? []) {
      this.place(tableSet(), lx, lz);
      this.collider(lx, lz, 2.3, 1.1);
    }
    this.buildDecor();
    this.refreshFixtures();
    if (!this.remote) this.interactables.push(this.storageInteractable());
    this.updateStoragePile();
  }

  buildDecor() {
    this.clocks = [];
    for (const [kind, lx, lz, rot = 0, y, cw, cd] of this.layout.decor ?? []) {
      let obj;
      const [type, text] = kind.split(":");
      if (type === "mat") obj = decor.doorMat();
      else if (type === "baskets") obj = decor.basketStack();
      else if (type === "cart") obj = decor.shoppingCart();
      else if (type === "clock") {
        obj = decor.wallClock();
        this.clocks.push(obj);
      } else if (type === "poster") obj = decor.poster(text);
      else if (type === "picture") obj = decor.pictureFrame(0x5bd47a);
      else if (type === "trash") obj = decor.trashBin();
      else if (type === "candy") obj = decor.candyJars();
      else if (type === "plant") obj = pottedPlant(1);
      else if (type === "lamp") obj = decor.pendantLamp();
      else if (type === "boxes") {
        obj = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const b = cardboardBox(0xd9a066, [0x3d8bff, 0xff8a3d, 0x5bd47a][i]);
          b.position.set(0, i * 0.43, 0);
          b.rotation.y = i * 0.3;
          obj.add(b);
        }
      }
      if (!obj) continue;
      this.place(obj, lx, lz, rot, y ? y + 0.12 : undefined);
      if (cw) this.collider(lx, lz, cw, cd);
    }
  }

  buildCafeFixtures() {
    // Mostrador frontal y encimera trasera con la máquina de café.
    this.place(counter(4.4, 0.9), 4.65, -2.6);
    this.collider(4.65, -2.6, 4.4, 0.9);
    this.place(counter(5.8, 0.8, 0x6b4a3a), 3.9, -5.45);
    this.collider(3.9, -5.45, 5.8, 0.8);
    const m = this.layout.machine;
    this.place(coffeeMachine(), m.lx, m.lz);
    this.machine = {
      granos: 0,
      cap: 60,
      point: this.local(m.lx, m.lz + 1.2),
      pos: this.local(m.lx, m.lz),
    };
    this.interactables.push(this.machineInteractable());
    const sign = signMesh("CAFÉ  $", 1.6, 0.4, {
      bg: "#8b5a3c",
      fg: "#fff3e0",
    });
    this.place(sign, 5.2, -5.84, 0, 2.6);
  }

  // Construye las piezas cuyos requisitos ya se cumplen (idempotente).
  refreshFixtures() {
    for (const def of this.layout.displays) {
      if (this.displays.some((d) => d.def.id === def.id)) continue;
      if (def.req && !this.upgrades.has(def.req)) continue;
      this.addDisplay(def);
    }
    for (const def of this.layout.registers) {
      if (this.registers.some((r) => r.def.id === def.id)) continue;
      if (def.req && !this.upgrades.has(def.req)) continue;
      this.addRegister(def);
    }
    if (this.upgrades.has("ampliacion") && this.building.partition) {
      const p = this.building.partition;
      this.building.group.remove(p.mesh);
      this.game.world.occluders.splice(
        this.game.world.occluders.indexOf(p.mesh),
        1,
      );
      this.game.world.physics.remove(p.collider);
      this.building.partition = null;
    }
    if (this.upgrades.has("plantas") && !this.decor.includes("plantas")) {
      this.decor.push("plantas");
      for (const [lx, lz] of this.layout.plants) {
        this.place(pottedPlant(1.1), lx, lz);
        this.collider(lx, lz, 0.5, 0.5);
      }
    }
    if (this.upgrades.has("suelo") && !this.decor.includes("suelo")) {
      this.decor.push("suelo");
      this.building.setFloor(["#ffffff", "#9fe3dc"]);
    }
    if (this.upgrades.has("letrero") && !this.decor.includes("letrero")) {
      this.decor.push("letrero");
      const neon = signMesh(`★ ${this.name.toUpperCase()} ★`, 4.2, 0.7, {
        bg: "#2b2140",
        fg: "#ffe066",
        font: "bold 50px",
        border: "#ff6fd8",
      });
      neon.material.emissive = new THREE.Color(0xffffff);
      neon.material.emissiveMap = neon.material.map;
      neon.material.emissiveIntensity = 0.6;
      this.building.place(neon, 0, this.building.d / 2 + 0.25, 0, 2.95 + 0.85);
      this.building.group.add(neon);
    }
  }

  addDisplay(def) {
    const d = new ProductDisplay(
      def.kind,
      this.id === "supermercado" ? 0x7aa7e8 : 0xe9a54a,
    );
    const rot = def.rot ?? 0;
    this.place(d.group, def.lx, def.lz, rot);
    const rotated = Math.abs(Math.sin(rot)) > 0.5;
    if (!def.onCounter)
      this.collider(
        def.lx,
        def.lz,
        rotated ? d.spec.d : d.spec.w,
        rotated ? d.spec.w : d.spec.d,
      );
    const reach = d.spec.d / 2 + (def.onCounter ? 0.55 : 0.6);
    const entry = {
      def,
      display: d,
      pos: this.local(def.lx, def.lz),
      approach: this.local(
        def.lx + Math.sin(rot) * reach,
        def.lz + Math.cos(rot) * reach,
      ),
    };
    this.displays.push(entry);
    if (def.kind !== "coffee")
      this.interactables.push(this.displayInteractable(entry));
    return entry;
  }

  addRegister(def) {
    const rot = def.rot ?? 0;
    const g = registerCounter();
    this.place(g, def.lx, def.lz, rot);
    const rotated = Math.abs(Math.sin(rot)) > 0.5;
    this.collider(def.lx, def.lz, rotated ? 2.2 : 1.0, rotated ? 1.0 : 2.2);
    // Lado del cliente: -x local para cajas en z; +z para cajas giradas
    // (o -z si la caja está junto a la fachada: def.front).
    const side = def.front ? -1 : 1;
    const cust = rotated ? [0, 1.05 * side] : [-1.0, 0];
    const staff = rotated ? [0, -1.15 * side] : [1.2, 0];
    const reg = {
      def,
      pos: this.local(def.lx, def.lz),
      service: this.local(def.lx + cust[0], def.lz + cust[1]),
      cashierPoint: this.local(def.lx + staff[0], def.lz + staff[1]),
      dir: this.building.dirToWorld(def.queue[0], def.queue[1]),
      queue: [],
      cashier: null,
      serveTimer: 0,
    };
    this.registers.push(reg);
    this.interactables.push(this.registerInteractable(reg));
    return reg;
  }

  queueSpot(reg, idx) {
    return {
      x: reg.service.x + reg.dir.x * idx * 0.9,
      z: reg.service.z + reg.dir.z * idx * 0.9,
    };
  }

  // Cuántas personas caben en la fila sin salir del local ni chocar con
  // muebles (se calcula una vez, con la rejilla ya construida).
  queueCapacity(reg) {
    if (reg.capacity) return reg.capacity;
    const grid = this.game.world.physics.navGrid();
    let n = 0;
    while (n < 8) {
      const p = this.queueSpot(reg, n);
      if (
        !this.building.contains(p.x, p.z, 0.5) ||
        !grid.free(grid.toCellX(p.x), grid.toCellZ(p.z))
      )
        break;
      n++;
    }
    reg.capacity = Math.max(2, n);
    return reg.capacity;
  }

  // ---------- Interacciones del jugador ----------

  displayInteractable(entry) {
    const game = this.game;
    return {
      x: entry.approach.x,
      z: entry.approach.z,
      alt: entry.pos,
      radius: 1.4,
      label: () => {
        const d = entry.display;
        const box = game.state.carried.find((b) => d.accepts(b.product));
        const what = d.product
          ? `${PRODUCTS[d.product].name} ${d.stock}/${d.capacity}`
          : "vacía";
        if (box && d.stock < d.capacity)
          return {
            text: `Reponer ${PRODUCTS[box.product].name} (${box.units})`,
            enabled: true,
          };
        if (game.state.carried.length)
          return {
            text: `${DISPLAY_NAMES[d.kind]}: ${what} · no admite esa caja`,
            enabled: false,
          };
        return {
          text: `${DISPLAY_NAMES[d.kind]}: ${what}`,
          enabled: false,
        };
      },
      action: () => {
        const d = entry.display;
        const box = game.state.carried.find((b) => d.accepts(b.product));
        if (!box) return;
        const moved = this.stockDisplay(entry, box.product, box.units);
        box.units -= moved;
        if (box.units <= 0)
          game.state.carried.splice(game.state.carried.indexOf(box), 1);
        game.state.stats.unitsStocked += moved;
        game.player.char.playAction("stock", 0.6);
        game.audio.sfx("place");
        game.ui.toast(
          `+${moved} ${PRODUCTS[box.product].name} en la estantería`,
        );
        game.onCarryChanged();
      },
    };
  }

  stockDisplay(entry, product, units) {
    const d = entry.display;
    if (!d.accepts(product)) return 0;
    if (!d.product) d.setProduct(product);
    const moved = Math.min(units, d.capacity - d.stock);
    d.setStock(d.stock + moved);
    return moved;
  }

  registerInteractable(reg) {
    const game = this.game;
    return {
      x: reg.cashierPoint.x,
      z: reg.cashierPoint.z,
      alt: reg.pos,
      radius: 1.8,
      label: () => {
        const c = reg.queue[0];
        if (c && c.ready)
          return {
            text: `Cobrar ($${basketTotal(c.basket).toFixed(2)})`,
            enabled: true,
          };
        if (reg.queue.length)
          return {
            text: "Caja registradora · el cliente se acerca…",
            enabled: false,
          };
        return { text: "Caja registradora · sin clientes", enabled: false };
      },
      action: () => {
        if (this.serve(reg)) game.player.char.playAction("register", 0.5);
      },
    };
  }

  storageInteractable() {
    const game = this.game;
    return {
      x: this.storagePoint.x,
      z: this.storagePoint.z,
      radius: 1.6,
      label: () => {
        const boxes = game.state.carried.filter((b) =>
          this.supplies().includes(b.product),
        );
        if (boxes.length > 1 && game.state.cart)
          return {
            text: `Descargar el carro: ${boxes.length} cajas (${this.storageUnits()}/${this.storageCap()})`,
            enabled: true,
          };
        if (boxes.length)
          return {
            text: `Dejar caja en el almacén (${this.storageUnits()}/${this.storageCap()})`,
            enabled: true,
          };
        const best = this.bestStorageProduct();
        if (best && game.state.carried.length < game.carryCapacity())
          return {
            text: `Tomar caja de ${PRODUCTS[best].name} (${this.storage[best]} uds.)`,
            enabled: true,
          };
        return { text: `Almacén: ${this.storageUnits()} uds.`, enabled: false };
      },
      action: () => {
        const boxes = game.state.carried.filter((b) =>
          this.supplies().includes(b.product),
        );
        // Con carro se descarga todo de una vez; en brazos, caja a caja.
        const unload = game.state.cart ? boxes : boxes.slice(0, 1);
        const box = unload[0];
        if (box) {
          let total = 0;
          for (const b of unload) {
            const accepted = this.addToStorage(b.product, b.units);
            b.units -= accepted;
            total += accepted;
            if (b.units <= 0)
              game.state.carried.splice(game.state.carried.indexOf(b), 1);
          }
          if (!total) return game.ui.toast("El almacén está lleno", "bad");
          game.state.stats.unitsStored += total;
          game.ui.toast(
            game.state.carried.some((b) => this.supplies().includes(b.product))
              ? `Guardadas ${total} uds. · el almacén está lleno`
              : `Guardadas ${total} uds. en el almacén`,
          );
        } else {
          const best = this.bestStorageProduct();
          if (!best) return;
          const units = Math.min(
            this.storage[best],
            PRODUCTS[best].boxUnits ?? BOX_UNITS,
          );
          this.storage[best] -= units;
          game.state.carried.push({ product: best, units });
        }
        game.player.char.playAction("pickup", 0.5);
        game.audio.sfx(box ? "place" : "pickup");
        this.updateStoragePile();
        game.onCarryChanged();
      },
    };
  }

  machineInteractable() {
    const game = this.game;
    const m = this.machine;
    return {
      x: m.point.x,
      z: m.point.z,
      alt: m.pos,
      radius: 1.4,
      label: () => {
        const beans = game.state.carried.find((b) => b.product === "granos");
        if (beans && m.granos < m.cap)
          return {
            text: `Cargar granos de café (${m.granos}/${m.cap})`,
            enabled: true,
          };
        const cc = this.coffeeDisplay();
        if (m.granos > 0 && cc && cc.display.stock < cc.display.capacity)
          return { text: `Preparar café (granos: ${m.granos})`, enabled: true };
        if (m.granos <= 0)
          return {
            text: "Máquina de café sin granos · cómpralos en el Mayorista",
            enabled: false,
          };
        return { text: "La barra de cafés está llena", enabled: false };
      },
      action: () => {
        const beans = game.state.carried.find((b) => b.product === "granos");
        if (beans && m.granos < m.cap) {
          const moved = Math.min(beans.units, m.cap - m.granos);
          m.granos += moved;
          beans.units -= moved;
          if (beans.units <= 0)
            game.state.carried.splice(game.state.carried.indexOf(beans), 1);
          game.onCarryChanged();
          game.player.char.playAction("stock", 0.6);
          return;
        }
        const made = this.brew();
        if (made) {
          game.player.char.playAction("brew", 1.0);
          game.ui.toast(`☕ ${made} cafés listos en la barra`);
        }
      },
    };
  }

  coffeeDisplay() {
    return this.displays.find((d) => d.def.kind === "coffee");
  }

  brew() {
    const cc = this.coffeeDisplay();
    if (!cc || !this.machine) return 0;
    const made = Math.min(
      this.machine.granos,
      cc.display.capacity - cc.display.stock,
      6,
    );
    if (made <= 0) return 0;
    this.machine.granos -= made;
    // En online el servidor convierte también los granos del inventario.
    if (this.game.online) this.game.net.request("brew", { units: made });
    if (!cc.display.product) cc.display.setProduct("cafe");
    cc.display.setStock(cc.display.stock + made);
    return made;
  }

  // ---------- Inventario ----------

  storageCap() {
    return this.layout.storageCap + (this.upgrades.has("ampliacion") ? 60 : 0);
  }

  storageUnits() {
    return Object.values(this.storage).reduce((a, b) => a + b, 0);
  }

  addToStorage(product, units) {
    const accepted = Math.max(
      0,
      Math.min(units, this.storageCap() - this.storageUnits()),
    );
    if (accepted)
      this.storage[product] = (this.storage[product] ?? 0) + accepted;
    this.updateStoragePile();
    return accepted;
  }

  bestStorageProduct() {
    let best = null;
    for (const [p, n] of Object.entries(this.storage))
      if (n > 0 && (!best || n > this.storage[best])) best = p;
    return best;
  }

  updateStoragePile() {
    this.storagePile?.setCount(Math.ceil(this.storageUnits() / BOX_UNITS));
  }

  shelfStock(product) {
    return this.displays.reduce(
      (a, d) => a + (d.display.product === product ? d.display.stock : 0),
      0,
    );
  }

  // ---------- Clientes ----------

  rollWants(count = 0) {
    const stocked = this.catalog().filter((p) => this.shelfStock(p) > 0);
    const all = this.catalog().filter((p) =>
      this.displays.some((d) => d.display.spec.accepts(PRODUCTS[p])),
    );
    const n =
      count ||
      1 + Math.floor(Math.random() * (this.def.type === "cafe" ? 2 : 3.4));
    const wants = [];
    for (let i = 0; i < n; i++) {
      const pool = stocked.length && Math.random() < 0.88 ? stocked : all;
      const p = pool[Math.floor(Math.random() * pool.length)];
      if (!wants.includes(p)) wants.push(p);
    }
    return wants;
  }

  findDisplayFor(product) {
    const options = this.displays.filter(
      (d) => d.display.product === product && d.display.stock > 0,
    );
    return options.length
      ? options[Math.floor(Math.random() * options.length)]
      : null;
  }

  randomDisplay() {
    const list = this.displays.filter((d) => d.def.kind !== "coffee");
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }

  willingness(product) {
    const r = this.prices[product] / PRODUCTS[product].base;
    if (r <= 0.85) return 1;
    if (r <= 1.0) return 0.97;
    return Math.max(0, 1 - (r - 1) * 1.4);
  }

  tryTake(entry, product) {
    const d = entry.display;
    if (d.product !== product || d.stock <= 0) {
      this.disappoint(1);
      this.today.lost++;
      return { ok: false, reason: "stock" };
    }
    if (Math.random() > this.willingness(product)) {
      this.disappoint(0.6);
      return { ok: false, reason: "price" };
    }
    const qty = Math.min(d.stock, Math.random() < 0.25 ? 2 : 1);
    d.setStock(d.stock - qty);
    const items = [];
    for (let i = 0; i < qty; i++)
      items.push({ product, price: this.prices[product] });
    return { ok: true, items };
  }

  returnItems(items) {
    for (const it of items)
      this.storage[it.product] = (this.storage[it.product] ?? 0) + 1;
    this.updateStoragePile();
  }

  disappoint(amount) {
    this.reputation = Math.max(0, this.reputation - amount);
  }

  // Caja con la fila más corta que aún tenga sitio (null si están llenas).
  pickRegister() {
    const open = this.registers.filter(
      (r) => r.queue.length < this.queueCapacity(r),
    );
    if (!open.length) return null;
    return open.reduce((a, b) => (b.queue.length < a.queue.length ? b : a));
  }

  abandonQueue(customer) {
    const reg = customer.register;
    if (reg) {
      reg.queue.splice(reg.queue.indexOf(customer), 1);
      reg.queue.forEach((c) => c.goToQueueSpot());
    }
    customer.register = null;
    this.returnItems(customer.basket);
    customer.basket = [];
    this.disappoint(3);
    customer.leave();
  }

  // Completa la venta del primer cliente de la fila.
  serve(reg) {
    const c = reg.queue[0];
    if (!c || !c.ready) return false;
    reg.queue.shift();
    // Los clientes VIP pagan el doble y dejan buena fama.
    const total = basketTotal(c.basket) * (c.vip ? 2 : 1);
    const cost = c.basket.reduce(
      (a, it) =>
        a +
        (it.product === "cafe"
          ? PRODUCTS.granos.cost
          : PRODUCTS[it.product].cost),
      0,
    );
    this.game.earn(total, total - cost, c.basket, this, c.vip);
    if (c.basket.some((i) => i.product === "cafe"))
      this.game.state.stats.coffeeSold += c.basket.filter(
        (i) => i.product === "cafe",
      ).length;
    this.today.revenue += total;
    this.today.profit += total - cost;
    this.today.sales++;
    this.reputation = Math.min(100, this.reputation + 0.6);
    c.paid();
    reg.queue.forEach((q) => q.goToQueueSpot());
    this.game.fx.coins(reg.pos, total);
    this.game.onSale(this, c, total);
    return true;
  }

  priceFactor() {
    const list = this.catalog();
    const avg =
      list.reduce((a, p) => a + this.prices[p] / PRODUCTS[p].base, 0) /
      list.length;
    return Math.max(0.5, Math.min(1.3, 1.6 - 0.6 * avg));
  }

  maxCustomers() {
    return (
      3 +
      this.registers.length * 2 +
      (this.upgrades.has("ampliacion") ? 2 : 0) +
      (this.id === "supermercado" ? 6 : 0)
    );
  }

  spawnInterval() {
    const stocked = this.displays.filter((d) => d.display.stock > 0).length;
    const stockFactor = stocked ? 0.35 + 0.2 * stocked : 0.2;
    const repFactor =
      0.6 +
      this.reputation / 100 +
      (this.upgrades.has("plantas") ? 0.05 : 0) +
      (this.upgrades.has("suelo") ? 0.1 : 0);
    const sign = this.upgrades.has("letrero") ? 1.15 : 1;
    const rush = this.game.events?.rushFactor(this) ?? 1;
    return (
      this.layout.spawnEvery /
      (stockFactor * repFactor * sign * this.priceFactor() * rush)
    );
  }

  // ---------- Empleados ----------

  hire(role) {
    const e = new Employee(this.game, this, role);
    this.employees.push(e);
    return e;
  }

  fire(role) {
    const idx = this.employees.findIndex((e) => e.role === role);
    if (idx < 0) return;
    const [e] = this.employees.splice(idx, 1);
    for (const r of this.registers) if (r.cashier === e) r.cashier = null;
    if (e.carry) this.addToStorage(e.carry.product, e.carry.units);
    e.dispose();
  }

  salaries() {
    return this.employees.reduce((a, e) => a + STAFF[e.role].salary, 0);
  }

  cashierTick(e) {
    let reg = this.registers.find((r) => r.cashier === e);
    if (!reg) {
      reg = this.registers.find((r) => !r.cashier);
      if (!reg) {
        e.idle = 2;
        return;
      }
      reg.cashier = e;
    }
    const d = Math.hypot(
      e.pos.x - reg.cashierPoint.x,
      e.pos.z - reg.cashierPoint.z,
    );
    if (d > 0.4) {
      e.moveTo(reg.cashierPoint, () => e.face(reg.pos.x, reg.pos.z));
      return;
    }
    const c = reg.queue[0];
    if (c && c.ready) {
      e.busy = true;
      e.char.playAction("register", 1.8);
      setTimeoutGame(this.game, 1.8, () => {
        e.busy = false;
        this.serve(reg);
      });
    } else e.idle = 0.3;
  }

  stockerTick(e) {
    if (
      this.machine &&
      this.machine.granos < 20 &&
      (this.storage.granos ?? 0) > 0
    ) {
      const units = Math.min(
        this.storage.granos,
        this.machine.cap - this.machine.granos,
        20,
      );
      this.carryTrip(e, "granos", units, this.machine.point, () => {
        this.machine.granos += units;
      });
      return;
    }
    for (const entry of this.displays) {
      const d = entry.display;
      if (entry.def.kind === "coffee" || d.stock >= d.capacity * 0.5) continue;
      const product = d.product ?? this.bestStorageFor(d);
      if (!product || !(this.storage[product] > 0)) continue;
      const units = Math.min(
        d.capacity - d.stock,
        this.storage[product],
        BOX_UNITS,
      );
      this.carryTrip(e, product, units, entry.approach, () => {
        const moved = this.stockDisplay(entry, product, units);
        if (moved < units) this.addToStorage(product, units - moved);
      });
      return;
    }
    e.idle = 2;
    const p = this.storagePoint;
    e.moveTo({
      x: p.x + (Math.random() - 0.5) * 2,
      z: p.z + Math.random() * 1.2,
    });
  }

  bestStorageFor(display) {
    let best = null;
    for (const [p, n] of Object.entries(this.storage)) {
      if (n > 0 && display.accepts(p) && (!best || n > this.storage[best]))
        best = p;
    }
    return best;
  }

  carryTrip(e, product, units, dest, deliver) {
    e.busy = true;
    e.moveTo(this.storagePoint, () => {
      if (!(this.storage[product] >= units)) {
        e.busy = false;
        return;
      }
      this.storage[product] -= units;
      this.updateStoragePile();
      e.carry = { product, units };
      e.char.setCarry([product]);
      e.char.playAction("pickup", 0.4);
      e.moveTo(dest, () => {
        deliver();
        e.carry = null;
        e.char.setCarry([]);
        e.char.playAction("stock", 0.6);
        e.waitTimer = 0.6;
        e.busy = false;
      });
    });
  }

  baristaTick(e) {
    const cc = this.coffeeDisplay();
    if (
      !this.machine ||
      !cc ||
      this.machine.granos <= 0 ||
      cc.display.stock >= cc.display.capacity * 0.5
    ) {
      e.idle = 1.5;
      if (
        this.machine &&
        Math.hypot(
          e.pos.x - this.machine.point.x,
          e.pos.z - this.machine.point.z,
        ) > 1
      )
        e.moveTo(this.machine.point);
      return;
    }
    e.busy = true;
    e.moveTo(this.machine.point, () => {
      e.face(this.machine.pos.x, this.machine.pos.z);
      e.char.playAction("brew", 2.2);
      setTimeoutGame(this.game, 2.2, () => {
        this.brew();
        e.busy = false;
      });
    });
  }

  // ---------- Bucle ----------

  // ---------- Modo online ----------

  // Lo que ven los demás jugadores de este negocio.
  snapshot() {
    return {
      displays: this.displays.map((d) => [
        d.def.id,
        d.display.product,
        d.display.stock,
      ]),
      prices: this.prices,
      open: this.openToPlayers,
    };
  }

  // Negocio de otro jugador: se dibuja con sus mejoras y existencias.
  setupRemote(snap) {
    this.owned = true;
    this.building.setLocked(false, null);
    this.buildInterior();
    this.applySnapshot(snap);
  }

  applySnapshot(snap) {
    if (!snap) return;
    for (const u of snap.upgrades ?? []) this.upgrades.add(u);
    this.refreshFixtures();
    Object.assign(this.prices, snap.prices ?? {});
    this.openToPlayers = snap.open !== false;
    for (const [id, product, stock] of snap.displays ?? []) {
      const e = this.displays.find((d) => d.def.id === id);
      if (!e) continue;
      if (product && stock > 0) {
        e.display.setProduct(product);
        e.display.setStock(stock);
      } else e.display.setStock(0);
    }
  }

  updateRemote(dt) {
    this.detailTimer = (this.detailTimer ?? 0) - dt;
    if (this.detailTimer <= 0) {
      this.detailTimer = 1;
      this.refreshDetails();
    }
  }

  // Etiquetas de precio y relojes de pared (detalles visuales).
  refreshDetails() {
    for (const e of this.displays) {
      const p = e.display.product;
      const price = this.prices[p];
      e.display.setPriceTag(
        p && price !== undefined ? `$${price.toFixed(2)}` : "",
      );
    }
    const hour = 7 + (this.game.state.clock / 300) * 15;
    for (const c of this.clocks ?? []) c.userData.setTime(hour);
  }

  update(dt, budget) {
    if (!this.owned) return;
    this.detailTimer = (this.detailTimer ?? 0) - dt;
    if (this.detailTimer <= 0) {
      this.detailTimer = 0.5;
      this.refreshDetails();
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.spawnInterval() * (0.6 + Math.random() * 0.8);
      this.spawnTimer = Math.min(this.spawnTimer, 25);
      if (
        this.customers.length < this.maxCustomers() &&
        budget.customers > 0 &&
        this.displays.length
      ) {
        this.customers.push(new Customer(this.game, this, this.spawnPoint()));
        budget.customers--;
      }
    }
    for (const c of this.customers) c.update(dt);
    for (let i = this.customers.length - 1; i >= 0; i--) {
      if (this.customers[i].done) {
        this.customers[i].dispose();
        this.customers.splice(i, 1);
      }
    }
    for (const e of this.employees) e.update(dt);
  }

  // Los clientes llegan andando por la acera desde una calle cercana.
  spawnPoint() {
    const door = this.building.doorPoint(0);
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = Math.max(
      -72,
      Math.min(72, door.x + side * (8 + Math.random() * 12)),
    );
    const z =
      (Math.random() < 0.7 ? Math.sign(door.z) : -Math.sign(door.z)) *
      (6.5 + Math.random());
    return { x, z };
  }

  spawnVip() {
    if (!this.owned || !this.displays.length) return null;
    const c = new Customer(this.game, this, this.spawnPoint(), true);
    c.patience = 120;
    this.customers.push(c);
    return c;
  }

  // Partida nueva: algo de género para vender desde el primer minuto.
  seedStarterStock() {
    const [s1, s2] = this.displays;
    this.stockDisplay(s1, "agua", 12);
    this.stockDisplay(s2, "galletas", 12);
    const produce = this.displays.find((d) => d.def.kind === "produce");
    if (produce) this.stockDisplay(produce, "fruta", 8);
    this.addToStorage("refresco", 10);
  }

  actors() {
    return [
      ...this.customers.map((c) => c.pos),
      ...this.employees.map((e) => e.pos),
    ];
  }

  serialize() {
    return {
      owned: this.owned,
      upgrades: [...this.upgrades],
      prices: this.prices,
      storage: this.storage,
      reputation: this.reputation,
      displays: Object.fromEntries(
        this.displays.map((d) => [
          d.def.id,
          { product: d.display.product, stock: d.display.stock },
        ]),
      ),
      employees: this.employees.map((e) => e.role),
      granos: this.machine?.granos ?? 0,
      open: this.openToPlayers,
    };
  }

  load(data) {
    this.owned = this.def.owned || data.owned;
    for (const u of data.upgrades ?? []) this.upgrades.add(u);
    Object.assign(this.prices, data.prices ?? {});
    this.storage = { ...(data.storage ?? {}) };
    this.reputation = data.reputation ?? 50;
    this.openToPlayers = data.open !== false;
    this.setup();
    if (!this.owned) return;
    for (const d of this.displays) {
      const saved = data.displays?.[d.def.id];
      if (saved?.product && saved.stock > 0) {
        d.display.setProduct(saved.product);
        d.display.setStock(saved.stock);
      }
    }
    if (this.machine) this.machine.granos = data.granos ?? 0;
    for (const role of data.employees ?? []) this.hire(role);
    this.updateStoragePile();
  }
}

export function basketTotal(items) {
  return items.reduce((a, it) => a + it.price, 0);
}

// Temporizador ligado al tiempo de juego (se detiene en pausa).
function setTimeoutGame(game, seconds, fn) {
  game.timers.push({ t: seconds, fn });
}

export function upgradeApplies(business, id) {
  const u = UPGRADES[id];
  if (!business.layout.upgrades.includes(id)) return false;
  return !u.types || u.types.includes(business.def.type);
}
