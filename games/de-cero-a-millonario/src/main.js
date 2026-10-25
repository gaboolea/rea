// Punto de entrada: crea la escena, conecta los sistemas y ejecuta el bucle.
import * as THREE from "three";
import { World } from "./world.js";
import { Business } from "./business.js";
import { Player, CameraRig } from "./player.js";
import { Input } from "./input.js";
import { Fx } from "./fx.js";
import { UI } from "./ui.js";
import { checkMissions, currentMission } from "./missions.js";
import {
  BUSINESSES,
  PRODUCTS,
  STAGES,
  UPGRADES,
  STAFF,
  SHOP_ITEMS,
  OUTFITS,
  HATS,
  DAY_SECONDS,
  BOX_UNITS,
  START_MONEY,
} from "./config.js";

const SAVE_KEY = "de-cero-a-millonario-v1";

function freshState() {
  return {
    money: START_MONEY,
    day: 1,
    clock: 0,
    mission: 0,
    stats: {
      revenue: 0,
      grossProfit: 0,
      sales: 0,
      unitsBought: 0,
      unitsStocked: 0,
      coffeeSold: 0,
      priceChanges: 0,
      expenses: 0,
    },
    items: {},
    outfit: "turquesa",
    hat: "none",
    ownedOutfits: ["turquesa"],
    ownedHats: ["none"],
    carried: [],
    pickup: [],
    lastReport: null,
  };
}

class Game {
  constructor() {
    this.canvas = document.getElementById("game");
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 260);
    this.setupLights();
    this.timers = [];
    this.state = freshState();
    this.world = new World(this.scene);
    this.fx = new Fx(this.scene);
    this.input = new Input(this.canvas);
    this.businesses = {};
    for (const id of Object.keys(BUSINESSES))
      this.businesses[id] = new Business(this, id);
    const spawn = this.world.homeSpawn;
    this.player = new Player(this, spawn.x, spawn.z);
    this.cameraRig = new CameraRig(this.camera);
    this.ui = new UI(this);
    this.staticInteractables = this.buildStaticInteractables();
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.autosave = 30;
    this.paused = false;
    window.addEventListener("resize", () => this.resize());
    this.resize();
    const loaded = this.load();
    if (!loaded) {
      for (const b of Object.values(this.businesses)) b.setup();
      this.applyItems();
    }
    this.cameraRig.snap(this.player);
    this.ui.refreshHud(true);
    this.renderer.setAnimationLoop(() => this.frame());
    if (!loaded) this.ui.showWelcome();
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
  }

  // ---------- Economía ----------

  spend(amount) {
    if (this.state.money < amount) {
      this.ui.toast("No tienes suficiente dinero", "bad");
      return false;
    }
    this.state.money -= amount;
    return true;
  }

  earn(total, profit) {
    const s = this.state;
    s.money += total;
    s.stats.revenue += total;
    s.stats.grossProfit += profit;
    s.stats.sales++;
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

  // Compra al proveedor. order: { producto: cajas }.
  buySupplies(order, deliverTo) {
    const stage = this.stageIndex();
    let cost = 0;
    let boxes = 0;
    for (const [p, n] of Object.entries(order)) {
      if (!n) continue;
      if ((PRODUCTS[p].stage ?? 0) > stage) return false;
      cost +=
        PRODUCTS[p].cost *
        (PRODUCTS[p].boxUnits ?? BOX_UNITS) *
        n *
        this.supplierDiscount();
      boxes += n;
    }
    if (!boxes) return false;
    if (deliverTo) cost += 5;
    const target = deliverTo ? this.businesses[deliverTo] : null;
    if (target) {
      let units = 0;
      for (const [p, n] of Object.entries(order))
        units += (PRODUCTS[p].boxUnits ?? BOX_UNITS) * n;
      if (target.storageUnits() + units > target.storageCap()) {
        this.ui.toast("No cabe en el almacén de ese negocio", "bad");
        return false;
      }
    } else if (this.state.pickup.length + boxes > 18) {
      this.ui.toast(
        "La zona de recogida está llena: recoge tus cajas primero",
        "bad",
      );
      return false;
    }
    cost = Math.round(cost * 100) / 100;
    if (!this.spend(cost)) return false;
    for (const [p, n] of Object.entries(order)) {
      const units = PRODUCTS[p].boxUnits ?? BOX_UNITS;
      for (let i = 0; i < n; i++) {
        if (target) target.addToStorage(p, units);
        else this.state.pickup.push({ product: p, units });
      }
      this.state.stats.unitsBought += units * n;
    }
    this.state.stats.expenses += cost;
    this.world.pickupPile.setCount(this.state.pickup.length);
    this.ui.toast(
      target
        ? `Pedido entregado en ${target.name} (-$${cost.toFixed(2)})`
        : `Compra realizada (-$${cost.toFixed(2)}). Recoge las cajas en RECOGIDA.`,
    );
    this.save();
    return true;
  }

  supplierDiscount() {
    return this.stageIndex() >= 3 ? 0.85 : 1;
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
    document.getElementById("btn-ride").hidden = !it.scooter;
  }

  buyOutfit(kind, id) {
    const list = kind === "outfit" ? OUTFITS : HATS;
    const owned =
      kind === "outfit" ? this.state.ownedOutfits : this.state.ownedHats;
    const item = list.find((o) => o.id === id);
    if (!owned.includes(id)) {
      if ((item.stage ?? 0) > this.stageIndex() || !this.spend(item.price))
        return;
      owned.push(id);
    }
    if (kind === "outfit") this.state.outfit = id;
    else this.state.hat = id;
    this.applyLook();
    this.save();
  }

  applyLook() {
    const o = OUTFITS.find((x) => x.id === this.state.outfit) ?? OUTFITS[0];
    this.player.char.setBodyColor(o.body);
    this.player.char.setHat(this.state.hat);
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
        label: () => ({ text: "Comprar ropa y accesorios", enabled: true }),
        action: () => this.ui.openBoutique(),
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
    if (!this._agents) this._agents = [];
    return this._agents;
  }

  // ---------- Bucle principal ----------

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;
    if (!this.paused) this.step(dt);
    this.updateOcclusion();
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  step(dt) {
    const input = this.input;
    input.enabled = !this.ui.panelOpen;
    this._agents = [];
    for (const b of Object.values(this.businesses))
      this._agents.push(...b.actors());
    this.player.update(dt, input, this.cameraRig.yaw);
    const inside = Object.values(this.world.buildings).find((b) =>
      b.contains(this.player.pos.x, this.player.pos.z),
    );
    this.cameraRig.update(dt, input, this.player, !!inside);
    const budget = {
      customers: Math.max(
        0,
        26 -
          Object.values(this.businesses).reduce(
            (a, b) => a + b.customers.length,
            0,
          ),
      ),
    };
    for (const b of Object.values(this.businesses)) b.update(dt, budget);
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) {
        this.timers.splice(i, 1);
        t.fn();
      }
    }
    this.world.update(dt, [...this._agents, this.player.pos], this.player.pos);
    this.fx.update(dt, this.elapsed);
    this.updateSun();
    if (!this.ui.panelOpen) this.handleKeys(input);
    this.advanceClock(dt);
    checkMissions(this);
    const m = currentMission(this);
    this.fx.setMarker(m?.target ? m.target(this) : null);
    this.ui.refreshHud();
    this.autosave -= dt;
    if (this.autosave <= 0) {
      this.autosave = 30;
      this.save();
    }
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
    if (input.consume("v")) this.toggleRide();
    if (input.consume("escape")) this.ui.openMenu();
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
    this.save();
  }

  updateSun() {
    const t = this.state.clock / DAY_SECONDS; // 0 = 7:00, 1 = 22:00
    const hour = 7 + t * 15;
    const night = Math.max(0, Math.min(1, (hour - 18.5) / 3));
    const angle = 0.35 + t * 2.4;
    const p = this.player.pos;
    this.sun.position.set(
      p.x + Math.cos(angle) * 30,
      12 + Math.sin(Math.min(Math.PI, angle)) * 30,
      p.z + 18,
    );
    this.sun.target.position.set(p.x, 0, p.z);
    this.sun.intensity = 2.3 * (1 - night * 0.65);
    this.sun.color.setHSL(0.1, 0.6 + night * 0.3, 0.9 - night * 0.2);
    this.hemi.intensity = 1.25 - night * 0.45;
    this.scene.background.copy(this.skyDay).lerp(this.skyNight, night);
    this.scene.fog.color.copy(this.scene.background);
    this.world.setNight(night);
  }

  // Las paredes entre la cámara y el jugador se vuelven translúcidas.
  updateOcclusion() {
    const origin = this.camera.position;
    const hits = new Set();
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
      version: 1,
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
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  load() {
    let data = null;
    try {
      data = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
    } catch {
      data = null;
    }
    if (!data || data.version !== 1) return false;
    this.state = {
      ...freshState(),
      ...data.state,
      stats: { ...freshState().stats, ...data.state.stats },
    };
    for (const [id, b] of Object.entries(this.businesses))
      b.load(data.businesses?.[id] ?? {});
    if (data.player) {
      this.player.pos.x = data.player.x;
      this.player.pos.z = data.player.z;
      this.player.pos.y = this.world.physics.groundHeight(
        data.player.x,
        data.player.z,
      );
      this.player.heading = data.player.heading ?? Math.PI;
    }
    this.world.pickupPile.setCount(this.state.pickup.length);
    this.applyItems();
    this.applyLook();
    this.onCarryChanged();
    this.ui.toast(`Partida cargada · Día ${this.state.day}`);
    return true;
  }

  newGame() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // Sin almacenamiento: simplemente recargamos.
    }
    location.reload();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  try {
    window.game = new Game();
  } catch (err) {
    document.getElementById("loading").textContent =
      `No se pudo iniciar el juego: ${err.message}`;
    throw err;
  }
});
