// Punto de entrada: crea la escena, conecta los sistemas y ejecuta el bucle.
// Modos: "title" (pantalla de inicio con la ciudad viva detrás),
// "wardrobe" (personalización) y "play" (partida).
import * as THREE from "three";
import { World } from "./world.js";
import { Business } from "./business.js";
import { Player, CameraRig } from "./player.js";
import { Input } from "./input.js";
import { Fx } from "./fx.js";
import { UI } from "./ui.js";
import { AudioManager } from "./audio.js";
import { Crowd } from "./pedestrians.js";
import { Events } from "./events.js";
import { Wardrobe } from "./wardrobe.js";
import { checkMissions, currentMission } from "./missions.js";
import { defaultLook, STARTER_ITEMS, findItem } from "./look.js";
import {
  BUSINESSES,
  PRODUCTS,
  STAGES,
  UPGRADES,
  STAFF,
  SHOP_ITEMS,
  DAY_SECONDS,
  BOX_UNITS,
  START_MONEY,
} from "./config.js";

const SAVE_KEY = "de-cero-a-millonario-v1";
const SETTINGS_KEY = "de-cero-a-millonario-settings";
const AUTOPLAY_KEY = "de-cero-a-millonario-autoplay";
const SAVE_VERSION = 2;

const QUALITY = {
  baja: { ratio: 1, shadows: false, map: 1024, crowd: 5 },
  media: { ratio: 1.25, shadows: true, map: 1024, crowd: 9 },
  alta: { ratio: 1.75, shadows: true, map: 2048, crowd: 14 },
};

// Recompensas que solo se consiguen jugando.
const REWARD_ITEMS = [
  {
    id: "estrella",
    slot: "glasses",
    when: (g) => (g.state.stats.encargos ?? 0) >= 1,
  },
  {
    id: "doradas",
    slot: "shoes",
    when: (g) => (g.state.stats.encargos ?? 0) >= 3,
  },
  { id: "corona", slot: "hat", when: (g) => g.stageIndex() >= 3 },
];

function freshState() {
  return {
    money: START_MONEY,
    day: 1,
    clock: 40,
    mission: 0,
    missionBase: null,
    started: false,
    stats: {
      revenue: 0,
      grossProfit: 0,
      sales: 0,
      unitsBought: 0,
      unitsStocked: 0,
      unitsStored: 0,
      coffeeSold: 0,
      priceChanges: 0,
      expenses: 0,
      encargos: 0,
      coins: 0,
      clothesBought: 0,
    },
    items: {},
    look: defaultLook(),
    wardrobe: [...STARTER_ITEMS],
    discovered: [],
    carried: [],
    pickup: [],
    deliveries: [],
    lastReport: null,
  };
}

function storage(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

class Game {
  constructor() {
    this.canvas = document.getElementById("game");
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 260);
    this.setupLights();
    this.timers = [];
    this.settings = this.loadSettings();
    this.audio = new AudioManager(this.settings);
    this.state = freshState();
    this.world = new World(this.scene);
    this.fx = new Fx(this.scene);
    this.input = new Input(this.canvas);
    this.input.settings = this.settings;
    this.businesses = {};
    for (const id of Object.keys(BUSINESSES))
      this.businesses[id] = new Business(this, id);
    const start = this.startPoint();
    this.player = new Player(this, start.x, start.z, this.state.look);
    this.cameraRig = new CameraRig(this.camera, this.settings);
    this.crowd = new Crowd(this);
    this.events = new Events(this);
    this.wardrobe = new Wardrobe(this);
    this.ui = new UI(this);
    this.staticInteractables = [
      ...this.buildStaticInteractables(),
      ...this.events.merchantInteractables(),
    ];
    this.world.traffic.onBusStop = () => this.crowd.onBusStop();
    this.world.traffic.onHorn = (v) => {
      if (
        Math.hypot(
          v.mesh.position.x - this.player.pos.x,
          v.mesh.position.z - this.player.pos.z,
        ) < 25
      )
        this.audio.sfx("horn");
    };
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.autosave = 30;
    this.mode = "title";
    this._agents = [];
    window.addEventListener("resize", () => this.resize());
    this.applySettings();
    this.resize();
    const loaded = this.load();
    if (!loaded) this.setupNewGame();
    this.bindTitle();
    this.unlockAudioOnGesture();
    // Calentar la ciudad unos segundos para que ya haya gente en la calle.
    for (let i = 0; i < 90; i++) this.stepWorld(1 / 15, true);
    this.renderer.setAnimationLoop(() => this.frame());
    const autoplay = storage(() => sessionStorage.getItem(AUTOPLAY_KEY));
    storage(() => sessionStorage.removeItem(AUTOPLAY_KEY));
    if (autoplay) this.startPlay(true);
    else this.showTitle();
    requestAnimationFrame(() => document.getElementById("loading")?.remove());
  }

  // Partida nueva: junto a la puerta de la tienda, con algo de género.
  startPoint() {
    return this.world.buildings.tienda.doorPoint(4.2);
  }

  setupNewGame() {
    for (const b of Object.values(this.businesses)) b.setup();
    this.businesses.tienda.seedStarterStock();
    this.applyItems();
  }

  setupLights() {
    this.hemi = new THREE.HemisphereLight(0xcfeaff, 0xf3d9a4, 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = -32;
    s.right = 32;
    s.top = 32;
    s.bottom = -32;
    s.near = 1;
    s.far = 120;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.skyDay = new THREE.Color(0x9fdcff);
    this.skyDusk = new THREE.Color(0xffb38a);
    this.skyNight = new THREE.Color(0x3a3f7a);
    this.scene.background = this.skyDay.clone();
    this.scene.fog = new THREE.Fog(this.skyDay.clone(), 70, 180);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 70 : 55;
    this.camera.updateProjectionMatrix();
    this.wardrobe?.resize();
  }

  // ---------- Ajustes ----------

  loadSettings() {
    const touch = matchMedia("(pointer: coarse)").matches;
    const defaults = {
      music: 0.6,
      sfx: 0.8,
      muted: false,
      sensitivity: 1,
      invertY: false,
      alwaysRun: false,
      quality: touch ? "media" : "alta",
    };
    const saved = storage(() =>
      JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null"),
    );
    return { ...defaults, ...(saved ?? {}) };
  }

  applySettings() {
    const q = QUALITY[this.settings.quality] ?? QUALITY.alta;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.ratio));
    this.sun.castShadow = q.shadows;
    if (this.sun.shadow.mapSize.x !== q.map) {
      this.sun.shadow.mapSize.set(q.map, q.map);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.crowd?.setDensity(q.crowd);
    this.audio.applySettings();
    this.ui?.refreshHud(true);
    this.resize();
    storage(() =>
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)),
    );
  }

  toggleMute() {
    this.settings.muted = !this.settings.muted;
    this.audio.unlock();
    this.applySettings();
  }

  // El navegador solo permite sonido tras un gesto del usuario.
  unlockAudioOnGesture() {
    const unlock = () => {
      this.audio.unlock();
      if (this.audio.ctx) {
        this.audio.setMood(this.mode === "play" ? "city" : "title");
        document.getElementById("t-sound").hidden = true;
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  // ---------- Pantalla de inicio y transiciones ----------

  bindTitle() {
    const $ = (id) => document.getElementById(id);
    const big = $("logo-big");
    big.innerHTML = [...big.textContent]
      .map((ch, i) => `<span style="--i:${i}">${ch}</span>`)
      .join("");
    const on = (id, fn) =>
      ($(id).onclick = () => {
        this.audio.unlock();
        this.audio.sfx("click");
        fn();
      });
    on("t-continue", () => this.startPlay());
    on("t-play", () => {
      if (this.state.started) this.ui.confirmNewGame();
      else this.startPlay();
    });
    on("t-custom", () => this.openWardrobe("title"));
    on("t-options", () => this.ui.openOptions());
    on("t-credits", () => this.ui.openCredits());
    on("t-sound", () => {});
  }

  showTitle() {
    this.mode = "title";
    const $ = (id) => document.getElementById(id);
    $("title").hidden = false;
    $("t-continue").hidden = !this.state.started;
    $("t-continue-info").textContent = this.state.started
      ? `Día ${this.state.day} · $${Math.floor(this.state.money).toLocaleString("es")} · ${STAGES[this.stageIndex()].name}`
      : "";
    $("t-play").textContent = this.state.started ? "NUEVA PARTIDA" : "JUGAR";
    $("t-sound").hidden = this.audio.ready;
    this.ui.showHud(false);
    this.ui.setPrompt(null);
    this.player.char.setCarry([]);
    this.player.ring.visible = false;
    this.titleTime = 0;
    this.audio.setMood("title");
  }

  fade(then) {
    const f = document.getElementById("fade");
    f.classList.add("on");
    setTimeout(() => {
      then();
      setTimeout(() => f.classList.remove("on"), 60);
    }, 460);
  }

  startPlay(instant = false) {
    const go = () => {
      document.getElementById("title").hidden = true;
      this.mode = "play";
      this.state.started = true;
      this.player.ring.visible = true;
      this.player.char.setLook(this.state.look);
      this.onCarryChanged();
      this.cameraRig.yaw = this.player.heading + Math.PI;
      this.cameraRig.pitch = 0.42;
      this.cameraRig.snap(this.player);
      this.ui.showHud(true);
      this.ui.refreshHud(true);
      this.audio.setMood("city");
      this.save();
    };
    this.audio.sfx("whoosh");
    if (instant) go();
    else this.fade(go);
  }

  goToTitle() {
    this.fade(() => this.showTitle());
  }

  openWardrobe(from) {
    const show = () => {
      document.getElementById("title").hidden = true;
      this.ui.showHud(false);
      this.mode = "wardrobe";
      this.wardrobe.show(from);
    };
    if (from === "title") this.fade(show);
    else show();
  }

  onWardrobeClosed(from, start) {
    if (from === "title") {
      if (start) this.startPlay();
      else this.fade(() => this.showTitle());
      return;
    }
    this.mode = "play";
    this.ui.showHud(true);
    this.player.char.root.position.set(
      this.player.pos.x,
      this.player.pos.y,
      this.player.pos.z,
    );
  }

  // ---------- Economía ----------

  spend(amount) {
    if (this.state.money < amount) {
      this.ui.toast("No tienes suficiente dinero", "bad");
      this.audio.sfx("error");
      return false;
    }
    this.state.money -= amount;
    this.audio.sfx("buy");
    return true;
  }

  earn(total, profit) {
    const s = this.state;
    s.money += total;
    s.stats.revenue += total;
    s.stats.grossProfit += profit;
    s.stats.sales++;
  }

  onSale(business, customer, total) {
    this.audio.sfx("cash");
    this.ui.floatMoney(total);
    this.events.onSold(customer.basket);
  }

  stageIndex() {
    let idx = 0;
    STAGES.forEach((st, i) => {
      if (this.state.stats.revenue >= st.revenue) idx = i;
    });
    return idx;
  }

  netWorth() {
    let worth = this.state.money;
    for (const b of Object.values(this.businesses))
      if (b.owned) worth += b.def.price * 0.8;
    for (const [id, owned] of Object.entries(this.state.items))
      if (owned && SHOP_ITEMS[id]) worth += SHOP_ITEMS[id].price * 0.5;
    return worth;
  }

  carryCapacity() {
    return this.state.items.carretilla ? 3 : 1;
  }

  onCarryChanged() {
    this.player.char.setCarry(this.state.carried.map((b) => b.product));
    if (this.state.carried.length && this.player.riding) this.toggleRide(false);
    this.ui.refreshHud(true);
  }

  ownedTypes() {
    return new Set(
      Object.values(this.businesses)
        .filter((b) => b.owned)
        .map((b) => b.def.type),
    );
  }

  supplierDiscount() {
    return this.stageIndex() >= 3 ? 0.85 : 1;
  }

  // Compra al proveedor. order: { producto: cajas }. deliverTo: id de un
  // negocio para que lo lleve la furgoneta propia o el camión de reparto.
  buySupplies(order, deliverTo) {
    const stage = this.stageIndex();
    let cost = 0;
    let boxes = 0;
    let units = 0;
    for (const [p, n] of Object.entries(order)) {
      if (!n) continue;
      if ((PRODUCTS[p].stage ?? 0) > stage) return false;
      const per = PRODUCTS[p].boxUnits ?? BOX_UNITS;
      cost +=
        PRODUCTS[p].cost *
        per *
        n *
        this.supplierDiscount() *
        this.events.discount(p);
      boxes += n;
      units += per * n;
    }
    if (!boxes) return false;
    const target = deliverTo ? this.businesses[deliverTo] : null;
    const van = !!this.state.items.furgoneta;
    if (target && !van) cost += 4;
    if (target) {
      const pending = this.state.deliveries
        .filter((d) => d.biz === target.id)
        .reduce((a, d) => a + d.items.reduce((s, i) => s + i.units, 0), 0);
      if (target.storageUnits() + pending + units > target.storageCap()) {
        this.ui.toast("No cabe en el almacén de ese negocio", "bad");
        this.audio.sfx("error");
        return false;
      }
    } else if (this.state.pickup.length + boxes > 18) {
      this.ui.toast(
        "La zona de recogida está llena: recoge tus cajas primero",
        "bad",
      );
      this.audio.sfx("error");
      return false;
    }
    cost = Math.round(cost * 100) / 100;
    if (!this.spend(cost)) return false;
    const items = [];
    for (const [p, n] of Object.entries(order)) {
      const per = PRODUCTS[p].boxUnits ?? BOX_UNITS;
      for (let i = 0; i < n; i++) items.push({ product: p, units: per });
      this.state.stats.unitsBought += per * n;
    }
    this.state.stats.expenses += cost;
    this.ui.floatMoney(-cost);
    if (target && van) {
      for (const it of items) target.addToStorage(it.product, it.units);
      this.ui.toast(
        `Tu furgoneta lo dejó en ${target.name} (−$${cost.toFixed(2)})`,
        "good",
      );
    } else if (target) {
      const delivery = { biz: target.id, items };
      this.state.deliveries.push(delivery);
      this.dispatchTruck(delivery);
      this.ui.toast(`🚚 El camión va camino de ${target.name}`, "event");
    } else {
      this.state.pickup.push(...items);
      this.world.pickupPile.setCount(this.state.pickup.length);
      this.ui.toast(
        `Compra realizada (−$${cost.toFixed(2)}). Recoge las cajas en RECOGIDA.`,
      );
    }
    this.save();
    return true;
  }

  // Camión de reparto real que circula y descarga en la puerta del negocio.
  dispatchTruck(delivery) {
    const b = this.businesses[delivery.biz];
    const door = b.building.doorPoint(0);
    this.world.traffic.spawnTruck(door.x, () => {
      for (const it of delivery.items) b.addToStorage(it.product, it.units);
      this.state.deliveries.splice(this.state.deliveries.indexOf(delivery), 1);
      this.ui.toast(`📦 ¡Entrega recibida en ${b.name}!`, "good");
      this.audio.sfx("place");
      this.save();
    });
  }

  buyUpgrade(biz, id) {
    const b = this.businesses[biz];
    const u = UPGRADES[id];
    if (b.upgrades.has(id) || (u.stage ?? 0) > this.stageIndex()) return;
    if ((u.needs ?? []).some((n) => !b.upgrades.has(n))) return;
    if (!this.spend(u.price)) return;
    b.upgrades.add(id);
    b.refreshFixtures();
    if (id === "plantas") b.reputation = Math.min(100, b.reputation + 5);
    if (id === "suelo") b.reputation = Math.min(100, b.reputation + 10);
    this.ui.toast(`¡${u.name} instalada en ${b.name}!`, "good");
    this.ui.floatMoney(-u.price);
    this.audio.sfx("sparkle");
    this.save();
  }

  hire(biz, role) {
    if ((STAFF[role].stage ?? 0) > this.stageIndex()) return;
    const b = this.businesses[biz];
    if (b.employees.length >= 4)
      return this.ui.toast("Este local no admite más personal", "bad");
    if (!this.spend(STAFF[role].salary)) return;
    b.hire(role);
    this.ui.toast(
      `Has contratado a un/a ${STAFF[role].name} (primer día pagado)`,
      "good",
    );
    this.save();
  }

  buyBusiness(id) {
    const b = this.businesses[id];
    if (b.owned || (b.def.stage ?? 0) > this.stageIndex()) return;
    if (!this.spend(b.def.price)) return;
    b.buy();
    this.ui.toast(`¡Ahora eres dueño/a de ${b.name}!`, "good");
    this.audio.sfx("mission");
    this.player.char.playAction("cheer", 1);
    this.save();
  }

  buyItem(id) {
    const item = SHOP_ITEMS[id];
    if (this.state.items[id] || (item.stage ?? 0) > this.stageIndex()) return;
    if (!this.spend(item.price)) return;
    this.state.items[id] = true;
    this.applyItems();
    this.ui.toast(`¡Has comprado: ${item.name}!`, "good");
    this.audio.sfx("sparkle");
    this.save();
  }

  applyItems() {
    const it = this.state.items;
    this.world.ownVan.visible = !!it.furgoneta;
    if (it.furgoneta && !this.vanCollider)
      this.vanCollider = this.world.physics.addCentered(25, 13, 2.0, 4.6);
    this.world.displayVan.visible = !it.furgoneta;
    this.world.displayScooter.visible = !it.scooter;
    this.world.buildings.casagrande.setLocked(
      !it.casa,
      it.casa
        ? null
        : `SE VENDE\n$${SHOP_ITEMS.casa.price.toLocaleString("es")}`,
    );
  }

  // Prendas especiales que se ganan jugando.
  unlockRewards() {
    for (const r of REWARD_ITEMS) {
      if (this.state.wardrobe.includes(r.id) || !r.when(this)) continue;
      this.state.wardrobe.push(r.id);
      this.ui.toast(
        `🎁 ¡Desbloqueaste ${findItem(r.slot, r.id).name}! Pruébatelo en la Boutique`,
        "event",
      );
      this.audio.sfx("sparkle");
    }
  }

  toggleRide(force) {
    if (!this.state.items.scooter) return;
    const on = force ?? !this.player.riding;
    if (on && this.state.carried.length)
      return this.ui.toast("No puedes ir en scooter cargando cajas", "bad");
    const inside = Object.values(this.world.buildings).some((b) =>
      b.contains(this.player.pos.x, this.player.pos.z),
    );
    if (on && inside)
      return this.ui.toast("Sal a la calle para usar el scooter", "bad");
    this.player.setRiding(on);
    this.audio.sfx(on ? "jump" : "land");
  }

  // ---------- Interacciones fijas del mundo ----------

  buildStaticInteractables() {
    const w = this.world;
    const list = [
      {
        x: w.supplierCounter.x,
        z: w.supplierCounter.z,
        radius: 1.8,
        label: () => ({ text: "Hacer un pedido al Mayorista", enabled: true }),
        action: () => this.ui.openSupplier(),
      },
      {
        x: w.pickupPoint.x,
        z: w.pickupPoint.z,
        radius: 2.0,
        label: () => {
          const next = this.state.pickup[0];
          if (!next) return { text: "Zona de recogida vacía", enabled: false };
          if (this.state.carried.length >= this.carryCapacity())
            return {
              text: `Manos llenas (${this.carryCapacity()} caja/s máx.)`,
              enabled: false,
            };
          return {
            text: `Recoger caja de ${PRODUCTS[next.product].name} (${this.state.pickup.length} en espera)`,
            enabled: true,
          };
        },
        action: () => {
          const box = this.state.pickup.shift();
          this.state.carried.push(box);
          this.world.pickupPile.setCount(this.state.pickup.length);
          this.player.char.playAction("pickup", 0.5);
          this.audio.sfx("pickup");
          this.onCarryChanged();
        },
      },
      {
        x: w.homeBed.x,
        z: w.homeBed.z,
        radius: 1.6,
        label: () => ({
          text: "Descansar y guardar la partida",
          enabled: true,
        }),
        action: () => this.rest(),
      },
      {
        x: w.villaBed.x,
        z: w.villaBed.z,
        radius: 1.6,
        label: () =>
          this.state.items.casa
            ? { text: "Descansar en tu villa y guardar", enabled: true }
            : null,
        action: () => this.rest(),
      },
      {
        x: w.boutiqueCounter.x,
        z: w.boutiqueCounter.z,
        radius: 1.8,
        label: () => ({ text: "Probar ropa y accesorios", enabled: true }),
        action: () => this.openWardrobe("game"),
      },
      {
        x: w.dealerCounter.x,
        z: w.dealerCounter.z,
        radius: 2.0,
        label: () => ({ text: "Ver vehículos y propiedades", enabled: true }),
        action: () => this.ui.openDealer(),
      },
      {
        ...w.buildings.casagrande.doorPoint(1.5),
        radius: 2.4,
        label: () => {
          if (this.state.items.casa) return null;
          const item = SHOP_ITEMS.casa;
          if (this.stageIndex() < item.stage)
            return {
              text: `Villa Bonita · $${item.price.toLocaleString("es")} · requiere etapa ${STAGES[item.stage].name}`,
              enabled: false,
            };
          return {
            text: `Comprar Villa Bonita ($${item.price.toLocaleString("es")})`,
            enabled: true,
          };
        },
        action: () => this.buyItem("casa"),
      },
      {
        ...w.buildings.restaurante.doorPoint(1.5),
        radius: 2.4,
        label: () => ({
          text: "Restaurante en obras · todavía no se puede visitar",
          enabled: false,
        }),
        action: () => {},
      },
    ];
    for (const b of Object.values(this.businesses)) {
      list.push({
        ...b.building.doorPoint(1.5),
        radius: 2.4,
        label: () => {
          if (b.owned) return null;
          const stage = b.def.stage ?? 0;
          if (this.stageIndex() < stage)
            return {
              text: `${b.name} · $${b.def.price.toLocaleString("es")} · requiere etapa ${STAGES[stage].name}`,
              enabled: false,
            };
          return {
            text: `Comprar ${b.name} ($${b.def.price.toLocaleString("es")})`,
            enabled: true,
          };
        },
        action: () => this.buyBusiness(b.id),
      });
    }
    return list;
  }

  rest() {
    this.save();
    this.ui.toast("Partida guardada. ¡Energía recargada!", "good");
    this.audio.sfx("sparkle");
    this.player.char.playAction("cheer", 0.8);
  }

  findInteractable() {
    const p = this.player.pos;
    const fx = Math.sin(this.player.heading);
    const fz = Math.cos(this.player.heading);
    let best = null;
    let bestScore = Infinity;
    const all = [...this.staticInteractables];
    for (const b of Object.values(this.businesses))
      if (b.owned) all.push(...b.interactables);
    for (const it of all) {
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d > it.radius) continue;
      const label = it.label();
      if (!label) continue;
      // Preferir lo que está delante del jugador.
      const look = it.alt ?? it;
      const lx = look.x - p.x;
      const lz = look.z - p.z;
      const ll = Math.hypot(lx, lz) || 1;
      const facing = (lx * fx + lz * fz) / ll;
      const score = d - facing * 0.6 - (label.enabled ? 0.5 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = { it, label };
      }
    }
    return best;
  }

  agentPositions() {
    return this._agents;
  }

  // Todas las personas no jugadoras visibles (para separarlas entre sí).
  allAgents() {
    const list = [];
    for (const b of Object.values(this.businesses))
      list.push(...b.customers, ...b.employees);
    for (const p of this.crowd.people) if (!p.hidden()) list.push(p);
    return list;
  }

  separateAgents(agents) {
    const physics = this.world.physics;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i].pos;
      for (let j = i + 1; j < agents.length; j++) {
        const b = agents[j].pos;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.36 || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (0.6 - d) * 0.25;
        a.x -= (dx / d) * push;
        a.z -= (dz / d) * push;
        b.x += (dx / d) * push;
        b.z += (dz / d) * push;
      }
    }
    for (const ag of agents) {
      this.world.traffic.pushOut(ag.pos, 0.3);
      physics.resolveCircle(ag.pos, 0.28);
    }
  }

  // ---------- Bucle principal ----------

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;
    if (this.mode === "wardrobe") {
      this.wardrobe.update(dt, this.elapsed);
      this.renderer.render(this.wardrobe.scene, this.wardrobe.camera);
      this.input.endFrame();
      return;
    }
    if (this.mode === "title") this.stepTitle(dt);
    else if (!this.ui.panelOpen) this.step(dt);
    this.updateOcclusion();
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  // Vida de la ciudad (peatones, tráfico, ambiente). En la pantalla de
  // inicio no aparecen clientes nuevos para no alterar la partida guardada.
  stepWorld(dt, title) {
    this._agents = [];
    for (const b of Object.values(this.businesses))
      this._agents.push(...b.actors());
    this._agents.push(...this.crowd.positions());
    const budget = {
      customers: title
        ? 0
        : Math.max(
            0,
            (this.settings.quality === "baja" ? 14 : 24) -
              Object.values(this.businesses).reduce(
                (a, b) => a + b.customers.length,
                0,
              ),
          ),
    };
    for (const b of Object.values(this.businesses)) b.update(dt, budget);
    this.crowd.update(dt);
    this.separateAgents(this.allAgents());
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) {
        this.timers.splice(i, 1);
        t.fn();
      }
    }
    const focus = title ? this.titleSpot() : this.player.pos;
    this.world.update(dt, [...this._agents, this.player.pos], focus);
    this.fx.update(dt, this.elapsed);
    this.updateSun(focus);
  }

  titleSpot() {
    const door = this.world.buildings.tienda.doorPoint(3.4);
    return { x: door.x - 1.2, y: 0.12, z: door.z };
  }

  stepTitle(dt) {
    this.stepWorld(dt, true);
    this.titleTime = (this.titleTime ?? 0) + dt;
    const spot = this.titleSpot();
    const char = this.player.char;
    char.root.position.set(spot.x, spot.y, spot.z);
    char.root.rotation.y = Math.sin(this.titleTime * 0.4) * 0.35;
    char.animate(dt, 0);
    if (!char.action && Math.random() < dt * 0.25)
      char.playAction(Math.random() < 0.5 ? "wave" : "pose", 1.6);
    // Cámara cinematográfica que oscila despacio frente a la tienda.
    const wide = window.innerWidth > window.innerHeight;
    const a = Math.sin(this.titleTime * 0.12) * 0.35;
    const target = new THREE.Vector3(
      spot.x - (wide ? 2.6 : 0),
      2.0 + (wide ? 0 : 0.4),
      spot.z - 2,
    );
    const r = wide ? 9 : 10.5;
    this.camera.position.set(
      target.x + Math.sin(a) * r,
      2.6 + Math.sin(this.titleTime * 0.2) * 0.2,
      target.z + Math.cos(a) * r,
    );
    this.camera.lookAt(target);
    this.audio.update(dt, this.audioInfo(spot, true));
  }

  step(dt) {
    const input = this.input;
    input.enabled = true;
    this.player.update(dt, input, this.cameraRig.yaw);
    const inside = Object.values(this.world.buildings).find((b) =>
      b.contains(this.player.pos.x, this.player.pos.z),
    );
    this.cameraRig.update(dt, input, this.player, !!inside);
    this.stepWorld(dt, false);
    this.events.update(dt, this.elapsed);
    this.handleKeys(input);
    this.advanceClock(dt);
    checkMissions(this);
    const m = currentMission(this);
    this.fx.setMarker(
      m?.target ? m.target(this) : this.events.hudEncargo()?.target,
    );
    this.ui.refreshHud();
    this.audio.update(dt, this.audioInfo(this.player.pos, false, !!inside));
    this.autosave -= dt;
    if (this.autosave <= 0) {
      this.autosave = 30;
      this.save();
    }
  }

  audioInfo(pos, title, inside = false) {
    const t = this.state.clock / DAY_SECONDS;
    const hour = 7 + t * 15;
    let near = 0;
    for (const a of this._agents)
      if (Math.abs(a.x - pos.x) < 14 && Math.abs(a.z - pos.z) < 14) near++;
    return {
      title,
      inside,
      night: Math.max(0, Math.min(1, (hour - 18.5) / 3)),
      carDist: this.world.traffic.nearestDistance(pos),
      peopleNear: near,
    };
  }

  handleKeys(input) {
    const found = this.findInteractable();
    this.ui.setPrompt(found ? found.label : null, this.input.isTouch);
    if (input.consume("e") && found?.label.enabled) {
      found.it.action();
      this.ui.refreshHud(true);
    }
    if (input.consume("g") || input.consume("tab")) this.ui.openManagement();
    if (input.consume("m")) this.ui.openMap();
    if (input.consume("i")) this.ui.openInventory();
    if (input.consume("v")) this.toggleRide();
    if (input.consume("escape") || input.consume("p")) this.ui.openMenu();
  }

  advanceClock(dt) {
    const s = this.state;
    s.clock += dt;
    if (s.clock >= DAY_SECONDS) {
      s.clock = 0;
      this.endDay();
    }
  }

  endDay() {
    const s = this.state;
    let expenses = 0;
    const lines = [];
    for (const b of Object.values(this.businesses)) {
      if (!b.owned) continue;
      const fridge = b.upgrades.has("refrigerador") ? 5 : 0;
      const cost = b.def.rent + b.salaries() + fridge;
      expenses += cost;
      lines.push({
        name: b.name,
        revenue: b.today.revenue,
        profit: b.today.profit,
        sales: b.today.sales,
        lost: b.today.lost,
        cost,
      });
      b.today = { revenue: 0, profit: 0, sales: 0, lost: 0 };
    }
    if (this.state.items.furgoneta) expenses += 10;
    s.money -= expenses;
    s.stats.expenses += expenses;
    s.lastReport = { day: s.day, lines, expenses };
    s.day++;
    this.ui.showReport(s.lastReport);
    this.ui.floatMoney(-expenses);
    this.save();
  }

  // Día → tarde → noche, con cielo y luces que cambian gradualmente.
  updateSun(focus) {
    const t = this.state.clock / DAY_SECONDS; // 0 = 7:00, 1 = 22:00
    const hour = 7 + t * 15;
    const dusk =
      Math.max(0, Math.min(1, (hour - 16.5) / 2.5)) *
      (1 - Math.max(0, Math.min(1, (hour - 19.5) / 1.5)));
    const night = Math.max(0, Math.min(1, (hour - 18.5) / 3));
    const angle = 0.35 + t * 2.4;
    this.sun.position.set(
      focus.x + Math.cos(angle) * 30,
      12 + Math.sin(Math.min(Math.PI, angle)) * 30,
      focus.z + 18,
    );
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.intensity = 2.3 * (1 - night * 0.65);
    this.sun.color.setHSL(
      0.09 - dusk * 0.04,
      0.6 + dusk * 0.35,
      0.9 - night * 0.2,
    );
    this.hemi.intensity = 1.25 - night * 0.45;
    this.scene.background
      .copy(this.skyDay)
      .lerp(this.skyDusk, dusk * 0.7)
      .lerp(this.skyNight, night);
    this.scene.fog.color.copy(this.scene.background);
    this.world.setNight(night);
  }

  // Las paredes entre la cámara y el jugador se vuelven translúcidas.
  updateOcclusion() {
    const origin = this.camera.position;
    const hits = new Set();
    if (this.mode === "play") {
      // Varios rayos (pies, cuerpo y por encima de la cabeza) para no tapar al jugador.
      for (const h of [0.2, 1.1, 2.8]) {
        const target = new THREE.Vector3(
          this.player.pos.x,
          this.player.pos.y + h,
          this.player.pos.z,
        );
        const dir = target.sub(origin);
        const len = dir.length();
        this.raycaster.set(origin, dir.normalize());
        this.raycaster.far = len;
        for (const hit of this.raycaster.intersectObjects(
          this.world.occluders,
          false,
        ))
          hits.add(hit.object);
      }
    }
    for (const m of this.world.occluders) {
      const wanted = hits.has(m) ? 0.18 : 1;
      const mt = m.material;
      mt.opacity += (wanted - mt.opacity) * 0.25;
      const fading = mt.opacity < 0.98;
      if (fading !== mt.transparent) {
        mt.transparent = fading;
        mt.depthWrite = !fading;
        mt.needsUpdate = true;
      }
      if (!fading) mt.opacity = 1;
    }
  }

  // ---------- Guardado ----------

  save() {
    const data = {
      version: SAVE_VERSION,
      state: this.state,
      player: {
        x: this.player.pos.x,
        z: this.player.pos.z,
        heading: this.player.heading,
      },
      businesses: Object.fromEntries(
        Object.entries(this.businesses).map(([id, b]) => [id, b.serialize()]),
      ),
    };
    return storage(() => {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    }, false);
  }

  load() {
    const data = storage(() =>
      JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null"),
    );
    if (!data || !data.state || ![1, SAVE_VERSION].includes(data.version))
      return false;
    const fresh = freshState();
    this.state = {
      ...fresh,
      ...data.state,
      stats: { ...fresh.stats, ...data.state.stats },
    };
    if (data.version === 1) this.migrateV1(data.state);
    this.state.wardrobe = [
      ...new Set([...STARTER_ITEMS, ...(this.state.wardrobe ?? [])]),
    ];
    this.state.look = { ...defaultLook(), ...this.state.look };
    for (const [id, b] of Object.entries(this.businesses))
      b.load(data.businesses?.[id] ?? {});
    this.restorePlayer(data.player);
    this.world.pickupPile.setCount(this.state.pickup.length);
    for (const d of this.state.deliveries) this.dispatchTruck(d);
    this.applyItems();
    this.player.char.setLook(this.state.look);
    this.onCarryChanged();
    return true;
  }

  // Solo se restaura la posición si es un sitio válido (no dentro de un
  // mueble ni de un local cerrado); si no, el jugador aparece en su tienda.
  restorePlayer(p) {
    const fallback = this.startPoint();
    let x = p?.x;
    let z = p?.z;
    const physics = this.world.physics;
    const valid = Number.isFinite(x) && Number.isFinite(z);
    if (valid) {
      const pos = { x, z };
      physics.resolveCircle(pos, this.player.radius);
      const moved = Math.hypot(pos.x - x, pos.z - z);
      const locked = Object.values(this.world.buildings).some(
        (b) => b.shutter && b.contains(x, z),
      );
      if (moved > 1 || locked) ({ x, z } = fallback);
      else ({ x, z } = pos);
    } else ({ x, z } = fallback);
    this.player.teleport(x, z, p?.heading ?? Math.PI);
  }

  // Partidas de la versión anterior: se conserva todo y se adapta la ropa.
  migrateV1(old) {
    const s = this.state;
    const colorByOutfit = {
      verde: "menta",
      azul: "azul",
      rosa: "rosa",
      traje: "marino",
      dorado: "oro",
    };
    s.look = defaultLook();
    if (old.outfit && colorByOutfit[old.outfit])
      s.look.top = {
        id: old.outfit === "traje" ? "traje" : "camiseta",
        color: colorByOutfit[old.outfit],
      };
    if (old.hat && old.hat !== "none")
      s.look.hat = { id: old.hat, color: "rojo" };
    s.wardrobe = [
      ...STARTER_ITEMS,
      ...(old.hat && old.hat !== "none" ? [old.hat] : []),
      ...(old.outfit === "traje" ? ["traje"] : []),
    ];
    s.discovered = ["tienda"];
    s.mission = (old.mission ?? 0) >= 3 ? 6 : 0;
    s.missionBase = { ...s.stats };
    s.started = true;
  }

  newGame() {
    storage(() => localStorage.removeItem(SAVE_KEY));
    storage(() => sessionStorage.setItem(AUTOPLAY_KEY, "1"));
    location.reload();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  try {
    window.game = new Game();
  } catch (err) {
    const el = document.getElementById("loading");
    if (el) el.textContent = `No se pudo iniciar el juego: ${err.message}`;
    throw err;
  }
});
