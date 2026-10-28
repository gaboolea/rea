// Punto de entrada: crea la escena, conecta los sistemas y ejecuta el bucle.
// Modos: "title" (pantalla de inicio con la ciudad viva detrás),
// "wardrobe" (personalización) y "play" (partida).
import * as THREE from "three";
import { World } from "./world.js";
import { Scenery } from "./scenery.js";
import { Business } from "./business.js";
import { Player, CameraRig } from "./player.js";
import { Input } from "./input.js";
import { Fx } from "./fx.js";
import { UI } from "./ui.js";
import { AudioManager } from "./audio.js";
import { Crowd } from "./pedestrians.js";
import { Wayfinding } from "./wayfinding.js";
import { Surprises } from "./surpriseplay.js";
import { Events } from "./events.js";
import { Wardrobe } from "./wardrobe.js";
import { Guide } from "./guide.js";
import { Tutorial } from "./tutorial.js";
import { Warehouse } from "./warehouse.js";
import { Net, savedName } from "./net.js";
import { Online } from "./online.js";
import { Shopping } from "./shopping.js";
import { FurnitureShop } from "./furnishop.js";
import { District } from "./district.js";
import { Gym, Goals } from "./goals.js";
import { Automation } from "./automation.js";
import { Critters } from "./critters.js";
import { Rides, isSmall } from "./rides.js";
import { Home } from "./home.js";
import { Decorator } from "./decorate.js";
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
  PLOTS,
  CART_CAPACITY,
  CATEGORIES,
  VEHICLES,
  upgradeUpkeep,
} from "./config.js";

const SAVE_KEY = "de-cero-a-millonario-v1";
const SETTINGS_KEY = "de-cero-a-millonario-settings";
const AUTOPLAY_KEY = "de-cero-a-millonario-autoplay";
const ONLINE_KEY = "de-cero-a-millonario-online";
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
    // Carro de carga del Mayorista (lleva muchas cajas a la vez).
    cart: false,
    // Vehículos: el pequeño elegido para V y dónde está aparcado cada coche.
    ride: null,
    parked: {},
    // Zonas desbloqueadas, casa propia y muebles, objetivos cumplidos.
    unlocked: {},
    home: { owned: false, layout: [], open: false },
    furniture: {},
    goals: [],
    // Tienda automática: nivel de almacén al que sale el camión y caja
    // fuerte con lo ganado mientras no juegas.
    auto: { threshold: 0.4, vault: 0 },
    pickup: [],
    deliveries: [],
    warehouse: {},
    tutorial: {},
    lastReport: null,
  };
}

const PORTRAIT_KEY = "de-cero-a-millonario-portrait";

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
    // Neutral conserva la saturación (ACES apagaba los colores vivos).
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.15, 340);
    this.setupLights();
    this.timers = [];
    this.settings = this.loadSettings();
    this.audio = new AudioManager(this.settings);
    this.state = freshState();
    this.world = new World(this.scene);
    this.scenery = new Scenery(this.scene);
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
    this.surprises = new Surprises(this);
    this.wardrobe = new Wardrobe(this);
    this.warehouse = new Warehouse(this);
    this.guide = new Guide(this);
    this.tutorial = new Tutorial(this);
    this.ui = new UI(this);
    this.shopping = new Shopping(this);
    this.furnishop = new FurnitureShop(this);
    this.district = new District(this);
    this.gym = new Gym(this);
    this.automation = new Automation(this);
    this.goals = new Goals(this);
    this.rides = new Rides(this);
    this.home = new Home(this);
    this.critters = new Critters(this);
    this.wayfinding = new Wayfinding(this);
    this.decorator = new Decorator(this, this.home);
    this.examine = null;
    this.rebuildInteractables();
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
    this.setupLandscape();
    this.applySettings();
    this.resize();
    this.bindTitle();
    this.unlockAudioOnGesture();
    // Modo online: la partida la decide el servidor (ver bootOnline).
    const session = storage(() =>
      JSON.parse(sessionStorage.getItem(ONLINE_KEY) ?? "null"),
    );
    if (session) {
      this.bootOnline(session);
      return;
    }
    const loaded = this.load();
    if (!loaded) this.setupNewGame();
    this.finishBoot(false);
  }

  finishBoot(online) {
    // Calentar la ciudad unos segundos para que ya haya gente en la calle.
    for (let i = 0; i < 90; i++) this.stepWorld(1 / 15, true);
    this.renderer.setAnimationLoop(() => this.frame());
    const autoplay = storage(() => sessionStorage.getItem(AUTOPLAY_KEY));
    storage(() => sessionStorage.removeItem(AUTOPLAY_KEY));
    if (autoplay || online) this.startPlay(true);
    else this.showTitle();
    requestAnimationFrame(() => document.getElementById("loading")?.remove());
  }

  rebuildInteractables() {
    this.staticInteractables = [
      ...this.buildStaticInteractables(),
      ...this.events.merchantInteractables(),
      ...this.shopping.interactables(),
      ...this.rides.interactables(),
      ...this.furnishop.interactables(),
      ...this.district.interactables(),
      ...this.gym.interactables(),
      ...this.automation.interactables(),
      ...this.home.interactables(),
      ...this.home.furnitureInteractables(),
      ...this.storeDoorHints(),
      ...(this.online?.interactables() ?? []),
    ];
  }

  // ---------- Modo online ----------

  async bootOnline(sess) {
    const loading = document.getElementById("loading");
    loading.querySelector("span").textContent = "Conectando con la ciudad…";
    try {
      const net = new Net(sess.url);
      await net.connect();
      await net.hello(
        sess.name || savedName() || "Empresario",
        this.state.look,
      );
      const res = await net.request(
        sess.create ? "create" : "join",
        sess.create ?? { code: sess.code },
      );
      if (!res.ok) throw new Error(res.error);
      // Una recarga vuelve a entrar en la misma ciudad (no crea otra).
      sess.code = res.city.code;
      delete sess.create;
      storage(() => sessionStorage.setItem(ONLINE_KEY, JSON.stringify(sess)));
      this.net = net;
      this.online = new Online(this, net, res);
      this.applyJoin(res);
      net.onClose = () => this.reconnect(sess);
      net.onStatus(() => this.ui.refreshHud(true));
      this.finishBoot(true);
      this.ui.chatLine(
        `Entraste en «${res.city.name}» · código ${res.city.code}`,
        true,
      );
    } catch (err) {
      loading.innerHTML = `<div class="boot-error"><b>No se pudo entrar en la ciudad</b><span>${String(err.message).replace(/[<>]/g, "")}</span>
        <div><button id="boot-retry">Reintentar</button><button id="boot-offline">Jugar sin conexión</button></div></div>`;
      document.getElementById("boot-retry").onclick = () => location.reload();
      document.getElementById("boot-offline").onclick = () => {
        storage(() => sessionStorage.removeItem(ONLINE_KEY));
        location.reload();
      };
    }
  }

  // Estado de la partida a partir del servidor (autoritativo) y del último
  // reparto de mercancía guardado (cosmético).
  applyJoin(res) {
    const cp = res.profile;
    const blob = cp.blob ?? {};
    const fresh = freshState();
    this.state = { ...fresh, ...(blob.state ?? {}) };
    Object.assign(this.state, {
      money: cp.money,
      mission: cp.mission,
      items: { ...cp.items },
      discovered: [...cp.discovered],
      day: cp.day,
      clock: cp.dayElapsed,
      wardrobe: [...new Set([...STARTER_ITEMS, ...res.wardrobe])],
      look: { ...defaultLook(), ...res.look },
      started: true,
      lastReport: cp.lastReport,
      // Casa, muebles y desbloqueos los guarda y valida el servidor.
      home: structuredClone(cp.home),
      furniture: { ...cp.furniture },
      unlocked: { ...cp.unlocked },
      goals: [...cp.goals],
    });
    // La caja fuerte la llena el servidor (ganancias mientras no juegas).
    this.state.auto = {
      ...fresh.auto,
      ...(blob.state?.auto ?? {}),
      vault: cp.vault ?? 0,
    };
    this.state.stats = {
      ...fresh.stats,
      ...(blob.state?.stats ?? {}),
      ...cp.stats,
    };
    this.state.missionBase ??= { ...this.state.stats };
    this.businesses = {};
    for (const id of Object.keys(BUSINESSES)) {
      const owner = res.owners[id];
      if (owner && owner.id !== res.you.id) {
        this.online.addRemoteExclusive(id, owner);
        continue;
      }
      const b = new Business(
        this,
        id,
        id === "tienda" ? { building: res.you.plot } : {},
      );
      const server = cp.businesses[id];
      b.load({
        ...(blob.businesses?.[id] ?? {}),
        owned: !!server,
        upgrades: server?.upgrades ?? [],
        employees: server?.employees ?? [],
      });
      this.businesses[id] = b;
    }
    if (!cp.blob) this.businesses.tienda.seedStarterStock();
    this.normalizeCarry();
    this.player.setRide(null);
    for (const m of res.members) this.online.addRemotePlot(m);
    this.online.reconcile(cp.ledger);
    this.restorePlayer(blob.player);
    this.world.pickupPile.setCount(this.state.pickup.length);
    for (const d of this.state.deliveries) this.dispatchTruck(d);
    this.rebuildInteractables();
    this.applyItems();
    this.setupGuides();
    this.player.char.setLook(this.state.look);
    this.onCarryChanged();
  }

  async reconnect(sess) {
    this.ui.toast("Se perdió la conexión. Reconectando…", "bad");
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((r) =>
        setTimeout(r, Math.min(10000, 1000 * 2 ** attempt)),
      );
      try {
        await this.net.connect();
        await this.net.hello(sess.name || savedName(), this.state.look);
        const res = await this.net.request("join", { code: sess.code });
        if (!res.ok) throw new Error(res.error);
        this.applyServerMoney({
          money: res.profile.money,
          revenue: res.profile.stats.revenue,
        });
        this.online.owners = res.owners;
        this.online.warehouseStock = res.warehouse;
        for (const m of res.members) this.online.members.set(m.id, m);
        this.net.onClose = () => this.reconnect(sess);
        this.ui.toast("Conexión recuperada", "good");
        return;
      } catch {
        // Se reintenta con espera creciente.
      }
    }
    this.ui.toast(
      "No se pudo reconectar. Sal al menú para intentarlo de nuevo.",
      "bad",
    );
  }

  leaveOnline() {
    this.save();
    this.online?.leave();
    storage(() => sessionStorage.removeItem(ONLINE_KEY));
    location.reload();
  }

  // Acción económica validada por el servidor.
  async serverAction(type, payload = {}, quiet = false) {
    const r = await this.net.request(type, payload);
    if (!r.ok && !quiet) {
      this.ui.toast(r.error ?? "El servidor rechazó la acción", "bad");
      this.audio.sfx("error");
    }
    this.applyServerMoney(r);
    return r;
  }

  applyServerMoney(r) {
    if (typeof r.money === "number") this.state.money = r.money;
    if (typeof r.revenue === "number") this.state.stats.revenue = r.revenue;
    this.ui.refreshHud(true);
  }

  // Fin del día dictado por el servidor (gastos ya descontados allí).
  onServerDay(report, money) {
    const lines = [];
    for (const b of Object.values(this.businesses)) {
      if (!b.owned) continue;
      const cost = report.lines.find((l) => l.name === b.def.name)?.cost ?? 0;
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
    this.state.money = money;
    this.state.day = report.day + 1;
    this.state.clock = 0;
    this.state.lastReport = {
      day: report.day,
      lines,
      expenses: report.expenses,
    };
    this.ui.showReport(this.state.lastReport);
    this.ui.floatMoney(-report.expenses);
  }

  onRemoteOwner(biz, name, id) {
    if (biz === "casa") {
      this.world.buildings.casagrande.setForSale(null);
      return;
    }
    const b = this.businesses[biz];
    if (b && !b.owned) {
      delete this.businesses[biz];
      this.online.addRemoteExclusive(biz, { id, name });
      this.rebuildInteractables();
    }
    this.ui.toast(`${name} compró ${BUSINESSES[biz]?.name ?? biz}`, "event");
  }

  // Partida nueva: junto a la puerta de la tienda, con algo de género.
  startPoint() {
    return (
      this.businesses?.tienda?.building ?? this.world.buildings.tienda
    ).doorPoint(2.2);
  }

  setupNewGame() {
    for (const b of Object.values(this.businesses)) b.setup();
    this.businesses.tienda.seedStarterStock();
    this.applyItems();
    this.setupGuides();
  }

  // Balizas de orientación y locales reservados a otros jugadores.
  setupGuides() {
    const own = this.businesses.tienda.building;
    own.setSignText("MI TIENDITA");
    const beacons = [{ building: own, own: true, label: "MI TIENDITA" }];
    for (const id of PLOTS) {
      const b = this.world.buildings[id];
      if (b === own) continue;
      const remote = this.online?.plotOwner(id);
      if (remote)
        beacons.push({ building: b, own: false, label: `Tienda de ${remote}` });
      else if (!this.online) b.setLocked(true, "LOCAL PARA\nMODO ONLINE");
    }
    this.guide.setBeacons(beacons);
    this.home.setup(
      this.online ? Math.max(0, PLOTS.indexOf(this.online.me.plot)) : 0,
    );
    this.district.apply();
    this.goals.check();
    this.automation.setup();
    this.rebuildInteractables();
    this.tutorial.begin();
  }

  missionTarget() {
    // Un suceso es urgente: la flecha lo señala primero.
    const sp = this.surprises.target();
    if (sp) return sp;
    const m = currentMission(this);
    const t = m?.target ? m.target(this) : null;
    if (t) return { x: t.x, z: t.z, label: "Objetivo" };
    const enc = this.events.hudEncargo()?.target;
    return enc ? { x: enc.x, z: enc.z + 1.1, label: enc.name } : null;
  }

  setupLights() {
    this.hemi = new THREE.HemisphereLight(0xcfeaff, 0xa8d878, 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 3.0);
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
    this.scene.background = new THREE.Color(0xc4ebff);
    this.scene.fog = new THREE.Fog(0xc4ebff, 95, 240);
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

  // El juego es horizontal: en móvil se intenta bloquear la orientación al
  // primer toque (solo funciona a pantalla completa y si el navegador lo
  // permite); si no, un aviso en vertical pide girar el teléfono.
  setupLandscape() {
    if (storage(() => localStorage.getItem(PORTRAIT_KEY)) === "1")
      document.body.classList.add("allow-portrait");
    document.getElementById("rotate-skip").onclick = () => {
      document.body.classList.add("allow-portrait");
      storage(() => localStorage.setItem(PORTRAIT_KEY, "1"));
    };
    if (!this.input.isTouch) return;
    const lock = async () => {
      try {
        if (!document.fullscreenElement)
          await document.documentElement.requestFullscreen?.({
            navigationUI: "hide",
          });
        await screen.orientation?.lock?.("landscape");
      } catch {
        // Sin permiso (p. ej. dentro de otra app): queda el aviso de girar.
      }
    };
    window.addEventListener("pointerdown", lock, { once: true });
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
      chat: true,
      mutedPlayers: [],
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
    on("t-multi", () => this.ui.openMultiplayer());
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
    if (this.online) return this.leaveOnline();
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

  // Venta a un cliente del juego. En online el servidor valida existencias
  // y precio y es quien suma el dinero.
  earn(total, profit, basket = [], business = null, vip = false) {
    const s = this.state;
    s.stats.grossProfit += profit;
    s.stats.sales++;
    if (business) this.automation.recordSale(profit, business);
    if (this.online) {
      const items = basket.map((i) => ({
        p: i.product,
        price: Math.round(i.price * 100) / 100,
      }));
      this.net
        .request("sale", { biz: business?.id ?? "tienda", items, vip })
        .then((r) => this.applyServerMoney(r));
      return;
    }
    s.money += total;
    s.stats.revenue += total;
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
      if (owned && (SHOP_ITEMS[id] ?? VEHICLES[id]))
        worth += (SHOP_ITEMS[id] ?? VEHICLES[id]).price * 0.5;
    return worth;
  }

  carryCapacity() {
    if (this.state.cart) return CART_CAPACITY;
    return this.state.items.carretilla ? 3 : 1;
  }

  onCarryChanged() {
    this.player.char.setCarry(
      this.state.carried.map((b) => b.product),
      this.state.cart,
    );
    if ((this.state.carried.length || this.state.cart) && this.player.ride)
      this.rides.dismount();
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

  // Precio del Mayorista de un pedido (producto → cajas), sin envío.
  supplyCost(order) {
    let cost = 0;
    for (const [p, n] of Object.entries(order)) {
      if (!n) continue;
      const per = PRODUCTS[p].boxUnits ?? BOX_UNITS;
      cost +=
        PRODUCTS[p].cost *
        per *
        n *
        this.supplierDiscount() *
        this.events.discount(p);
    }
    return Math.round(cost * 100) / 100;
  }

  // Paga en la CAJA las cajas sin pagar del carro (order: producto → cajas).
  // deliverTo: negocio al que las lleva el camión; si no, salen contigo.
  async buySupplies(order, deliverTo) {
    const stage = this.stageIndex();
    let cost = this.supplyCost(order);
    let boxes = 0;
    let units = 0;
    for (const [p, n] of Object.entries(order)) {
      if (!n) continue;
      if ((PRODUCTS[p].stage ?? 0) > stage) return false;
      boxes += n;
      units += (PRODUCTS[p].boxUnits ?? BOX_UNITS) * n;
    }
    if (!boxes) return false;
    // Solo se paga lo que de verdad llevas sin pagar.
    for (const [p, n] of Object.entries(order))
      if (n > this.unpaid().filter((b) => b.product === p).length) return false;
    for (const [p, n] of Object.entries(order)) {
      if (n > this.warehouse.available(p)) {
        this.ui.toast(
          `No quedan suficientes cajas de ${PRODUCTS[p].name} en el Mayorista`,
          "bad",
        );
        this.audio.sfx("error");
        return false;
      }
    }
    const target = deliverTo ? this.businesses[deliverTo] : null;
    // Con furgoneta o camión propio el envío es gratis.
    const van =
      !!this.state.items.furgoneta || !!target?.upgrades.has("camion");
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
    }
    cost = Math.round(cost * 100) / 100;
    if (this.online) {
      const clean = Object.fromEntries(
        Object.entries(order).filter(([, n]) => n > 0),
      );
      const r = await this.serverAction("buy", {
        order: clean,
        deliver: deliverTo ?? null,
      });
      if (!r.ok) return false;
      cost = r.cost;
      this.audio.sfx("buy");
    } else if (!this.spend(cost)) return false;
    // Las cajas pagadas dejan de estar «sin pagar»; si van en camión,
    // salen del carro.
    const items = [];
    for (const [p, n] of Object.entries(order)) {
      if (!n) continue;
      const per = PRODUCTS[p].boxUnits ?? BOX_UNITS;
      let left = n;
      for (const box of this.state.carried)
        if (left > 0 && box.unpaid && box.product === p) {
          delete box.unpaid;
          items.push(box);
          left--;
        }
      this.state.stats.unitsBought += per * n;
      this.warehouse.take(p, n);
    }
    if (target)
      this.state.carried = this.state.carried.filter((b) => !items.includes(b));
    this.onCarryChanged();
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
      this.ui.toast(
        `🧾 Pagado (−$${cost.toFixed(2)}). ¡Ya puedes salir con tu compra!`,
        "good",
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

  async buyUpgrade(biz, id) {
    const b = this.businesses[biz];
    const u = UPGRADES[id];
    if (b.upgrades.has(id) || (u.stage ?? 0) > this.stageIndex()) return;
    if ((u.needs ?? []).some((n) => !b.upgrades.has(n))) return;
    if ((u.staff ?? []).some((r) => !b.employees.some((e) => e.role === r))) {
      this.ui.toast("Antes contrata a un reponedor y a un cajero", "bad");
      return;
    }
    if (this.online) {
      if (!(await this.serverAction("upgrade", { biz, id })).ok) return;
    } else if (!this.spend(u.price)) return;
    b.upgrades.add(id);
    b.refreshFixtures();
    if (id === "plantas") b.reputation = Math.min(100, b.reputation + 5);
    if (id === "suelo" || id === "fachada")
      b.reputation = Math.min(100, b.reputation + 10);
    this.ui.toast(`¡${u.name} instalada en ${b.name}!`, "good");
    this.ui.floatMoney(-u.price);
    this.audio.sfx("sparkle");
    this.save();
  }

  async hire(biz, role) {
    if ((STAFF[role].stage ?? 0) > this.stageIndex()) return;
    const b = this.businesses[biz];
    if (b.employees.length >= 4)
      return this.ui.toast("Este local no admite más personal", "bad");
    if (this.online) {
      if (!(await this.serverAction("hire", { biz, role })).ok) return;
    } else if (!this.spend(STAFF[role].salary)) return;
    b.hire(role);
    this.ui.toast(
      `Has contratado a un/a ${STAFF[role].name} (primer día pagado)`,
      "good",
    );
    this.save();
  }

  async fire(biz, role) {
    if (this.online && !(await this.serverAction("fire", { biz, role })).ok)
      return;
    this.businesses[biz].fire(role);
    this.save();
  }

  async buyBusiness(id) {
    const b = this.businesses[id];
    if (!b || b.owned || (b.def.stage ?? 0) > this.stageIndex()) return;
    if (this.online) {
      if (!(await this.serverAction("business", { biz: id })).ok) return;
    } else if (!this.spend(b.def.price)) return;
    b.buy();
    this.ui.toast(`¡Ahora eres dueño/a de ${b.name}!`, "good");
    this.audio.sfx("mission");
    this.player.char.playAction("cheer", 1);
    this.save();
  }

  async buyItem(id) {
    if (VEHICLES[id]) return this.rides.buy(id);
    const item = SHOP_ITEMS[id];
    if (this.state.items[id] || (item.stage ?? 0) > this.stageIndex()) return;
    if (this.online) {
      if (!(await this.serverAction("item", { id })).ok) return;
    } else if (!this.spend(item.price)) return;
    this.state.items[id] = true;
    this.applyItems();
    this.ui.toast(`¡Has comprado: ${item.name}!`, "good");
    this.audio.sfx("sparkle");
    this.save();
  }

  applyItems() {
    const it = this.state.items;
    // La furgoneta propia es un vehículo conducible (lo gestiona Rides).
    this.world.ownVan.visible = false;
    this.world.displayVan.visible = !it.furgoneta;
    this.world.displayScooter.visible = !it.scooter;
    this.rides.restore();
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

  // V: subir o bajar del vehículo pequeño (monopatín, bici o scooter).
  toggleRide() {
    this.rides.toggleSmall();
  }

  // ¿Está el jugador dentro de su casita?
  atHome() {
    const lot = this.home.lot;
    if (!lot || !this.state.home.owned) return false;
    const p = this.player.pos;
    return lot.building.contains(p.x, p.z);
  }

  // ---------- Autoservicio del Mayorista ----------

  unpaid() {
    return this.state.carried.filter((b) => b.unpaid);
  }

  // Cajas de un producto que aún quedan en la estantería (sin contar las
  // que ya llevas en el carro sin pagar).
  shelfStock(product) {
    const taken = this.unpaid().filter((b) => b.product === product).length;
    return Math.max(0, this.warehouse.available(product) - taken);
  }

  // Coge una caja de la estantería: va al carro (o a los brazos) sin pagar.
  takeFromShelf(product) {
    const p = PRODUCTS[product];
    if ((p.stage ?? 0) > this.stageIndex()) return false;
    if (this.shelfStock(product) <= 0) {
      this.ui.toast(`No quedan cajas de ${p.name}`, "bad");
      return false;
    }
    if (this.state.carried.length >= this.carryCapacity()) {
      this.ui.toast(
        this.state.cart
          ? `El carro está lleno (${CART_CAPACITY} cajas): ve a pagar`
          : "Manos llenas · toma un carro en la entrada para llevar más",
        "bad",
      );
      this.audio.sfx("error");
      return false;
    }
    this.state.carried.push({
      product,
      units: p.boxUnits ?? BOX_UNITS,
      unpaid: true,
    });
    this.warehouse.restock(product);
    this.player.char.playAction("pickup", 0.4);
    this.audio.sfx("pickup");
    this.onCarryChanged();
    return true;
  }

  // Devuelve a la estantería una caja sin pagar de ese producto.
  returnToShelf(product) {
    const list = this.state.carried;
    for (let i = list.length - 1; i >= 0; i--)
      if (list[i].unpaid && list[i].product === product) {
        list.splice(i, 1);
        this.audio.sfx("place");
        this.onCarryChanged();
        return true;
      }
    return false;
  }

  // No se puede salir del Mayorista con cajas sin pagar: las antenas de
  // la puerta suenan y el jugador vuelve hacia dentro.
  checkExitGate() {
    const b = this.world.buildings.mayorista;
    const p = this.player.pos;
    if (!b.contains(p.x, p.z) || !this.state.carried.some((x) => x.unpaid))
      return;
    const local = b.toLocal(p.x, p.z);
    const limit = b.d / 2 - 1.4;
    if (local.z <= limit) return;
    const back = b.toWorld(local.x, limit);
    p.x = back.x;
    p.z = back.z;
    this.player.vel.x = this.player.vel.z = 0;
    this.world.alarm = 1.2;
    if (this.elapsed - (this.alarmToastAt ?? -9) > 2.5) {
      this.alarmToastAt = this.elapsed;
      this.ui.toast("🛑 Paga en la CAJA antes de salir", "bad");
      this.audio.sfx("error");
    }
  }

  toggleCart() {
    if (this.state.cart && this.state.carried.length) return;
    this.state.cart = !this.state.cart;
    if (this.state.cart && this.player.ride) this.rides.dismount();
    this.audio.sfx(this.state.cart ? "pickup" : "place");
    this.ui.toast(
      this.state.cart
        ? "🛒 Carro listo: carga todas tus cajas de una vez en la zona B"
        : "🛒 Carro devuelto",
    );
    this.onCarryChanged();
  }

  // ---------- Interacciones fijas del mundo ----------

  buildStaticInteractables() {
    const w = this.world;
    const list = [
      {
        x: w.supplierCounter.x,
        z: w.supplierCounter.z,
        radius: 2.6,
        label: () => {
          const n = this.unpaid().length;
          return n
            ? { text: `🧾 CAJA · Pagar ${n} caja/s`, enabled: true }
            : {
                text: "CAJA · Elige primero tus cajas en las estanterías",
                enabled: true,
              };
        },
        action: () => this.ui.openCheckout(),
      },
      // Estanterías: aquí se eligen las cajas (se pagan después en la CAJA).
      ...w.warehouseSpots.racks.map((r, i) => {
        const cat = w.warehouseSpots.rackCats[i];
        return {
          x: r.x,
          z: r.z,
          radius: 1.7,
          label: () => ({
            text: `🛒 Estantería de ${CATEGORIES[cat].name} · elegir cajas`,
            enabled: true,
          }),
          action: () => this.ui.openShelf(cat),
        };
      }),
      {
        x: w.cartPoint.x,
        z: w.cartPoint.z,
        radius: 1.5,
        label: () => {
          if (!this.state.cart)
            return {
              text: `🛒 Tomar un carro (hasta ${CART_CAPACITY} cajas)`,
              enabled: true,
            };
          return this.state.carried.length
            ? { text: "Vacía el carro antes de devolverlo", enabled: false }
            : { text: "Devolver el carro", enabled: true };
        },
        action: () => this.toggleCart(),
      },
      // Palé con cajas tuyas ya pagadas que quedaron pendientes (partidas
      // antiguas o género que no cupo en tu almacén en el modo online).
      {
        x: w.pickupPoint.x,
        z: w.pickupPoint.z,
        radius: 2.0,
        label: () => {
          if (!this.state.pickup.length) return null;
          const room = this.carryCapacity() - this.state.carried.length;
          if (room <= 0)
            return { text: "Manos llenas · toma un carro", enabled: false };
          return {
            text: `Recoger tus cajas guardadas (${this.state.pickup.length})`,
            enabled: true,
          };
        },
        action: () => {
          const room = this.carryCapacity() - this.state.carried.length;
          const boxes = this.state.pickup.splice(0, Math.max(1, room));
          this.state.carried.push(...boxes);
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
        label: () => ({
          text: "Probador · cambiarte con tu ropa (se compra en la Tienda de ropa)",
          enabled: true,
        }),
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
          const villaOwner = this.online?.owners.casa;
          if (villaOwner && villaOwner.id !== this.online.me.id)
            return {
              text: `Villa Bonita · casa de ${villaOwner.name}`,
              enabled: false,
            };
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
    for (const [biz, owner] of Object.entries(this.online?.owners ?? {})) {
      if (biz === "casa" || owner.id === this.online.me.id) continue;
      list.push({
        ...this.world.buildings[biz].doorPoint(1.5),
        radius: 2.4,
        label: () => ({
          text: `${BUSINESSES[biz].name} · propiedad de ${owner.name}`,
          enabled: false,
        }),
        action: () => {},
      });
    }
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
    const ride = this.rides.dynamic();
    if (ride) all.push(ride);
    all.push(...this.critters.interactables());
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
  // Al salir del Mayorista con cajas: rumbo a la tienda.
  carryHint() {
    const p = this.player.pos;
    const inWarehouse = this.world.buildings.mayorista.contains(p.x, p.z);
    // Al entrar: recordatorio de dónde se compra (si no hay tutorial).
    if (inWarehouse && !this.wasInWarehouse && !this.tutorial.active()) {
      const now = this.elapsed;
      if (now - (this.warehouseHintAt ?? -1e9) > 90) {
        this.warehouseHintAt = now;
        this.ui.toast(
          "🛒 Se compra en la CAJA (sigue las flechas amarillas) · hay carros en la entrada",
          "event",
        );
      }
    }
    this.wasInWarehouse = inWarehouse;
    const paid = this.state.carried.filter((b) => !b.unpaid).length;
    if (!paid) this.carryHintShown = false;
    else if (inWarehouse && !this.carryHintShown && !this.unpaid().length) {
      this.carryHintShown = true;
      this.ui.toast(
        "📦 LLEVA LA MERCADERÍA A TU TIENDA · sigue la ruta",
        "event",
      );
      this.guide.setDestination({
        ...this.businesses.tienda.building.doorPoint(1.2),
        label: "Mi tienda",
        building: this.businesses.tienda.building,
      });
    }
  }

  allAgents() {
    const list = [];
    for (const b of Object.values(this.businesses))
      list.push(...b.customers, ...b.employees);
    for (const p of this.crowd.people) if (!p.hidden()) list.push(p);
    list.push(...this.warehouse.workers);
    return list;
  }

  // Empuje suave entre personas. Además de separarlas, las desvía de lado
  // (las dos hacia su derecha) para que al cruzarse se esquiven en vez de
  // empujarse de frente; quien acaba de atascarse pasa a través un momento.
  separateAgents(agents) {
    const physics = this.world.physics;
    for (let i = 0; i < agents.length; i++) {
      const A = agents[i];
      if (A.ghost > 0) continue;
      const a = A.pos;
      for (let j = i + 1; j < agents.length; j++) {
        const B = agents[j];
        if (B.ghost > 0) continue;
        const b = B.pos;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.36 || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const push = (0.6 - d) * 0.25;
        const side = A.target && B.target ? push * 0.8 : 0;
        a.x -= nx * push - nz * side;
        a.z -= nz * push + nx * side;
        b.x += nx * push - nz * side;
        b.z += nz * push + nx * side;
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
    else if (this.examine) this.stepExamine(dt);
    this.updateOcclusion();
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  // Cámara de vista previa: mira al personaje de frente (para ver la ropa
  // puesta) o a un objeto que se examina, dejando sitio al panel lateral.
  examinePlayer() {
    const p = this.player.pos;
    // Dentro de un local, la cámara se pone hacia el centro (lejos de las
    // paredes) y el personaje se gira para mirarla.
    const b = Object.values(this.world.buildings).find((x) =>
      x.contains(p.x, p.z),
    );
    let fx = Math.sin(this.player.heading);
    let fz = Math.cos(this.player.heading);
    if (b) {
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.5) {
        fx = dx / d;
        fz = dz / d;
      }
    }
    this.player.heading = Math.atan2(fx, fz);
    this.player.char.root.rotation.y = this.player.heading;
    const wide = window.innerWidth > window.innerHeight;
    // Vector derecho de la cámara que mira hacia el personaje.
    const rx = fz;
    const rz = -fx;
    this.examine = {
      eye: { x: p.x + fx * 2.9, y: p.y + 1.3, z: p.z + fz * 2.9 },
      look: {
        x: p.x + (wide ? rx * 0.9 : 0),
        y: p.y + (wide ? 0.8 : 0.3),
        z: p.z + (wide ? rz * 0.9 : 0),
      },
    };
  }

  // Examinar un objeto (vehículo, mueble): el personaje se aparta de la
  // vista mientras dura.
  examineObject(target, eye) {
    this.examine = { eye, look: target };
    this.player.char.root.visible = false;
  }

  stepExamine(dt) {
    const e = this.examine;
    const k = Math.min(1, dt * 6);
    this.camera.position.x += (e.eye.x - this.camera.position.x) * k;
    this.camera.position.y += (e.eye.y - this.camera.position.y) * k;
    this.camera.position.z += (e.eye.z - this.camera.position.z) * k;
    this.camera.lookAt(e.look.x, e.look.y, e.look.z);
    this.player.char.animate(dt, 0);
  }

  // Avisos en la puerta de las tiendas nuevas («ENTRAR A LA TIENDA»).
  storeDoorHints() {
    const list = [];
    for (const poi of this.world.pois) {
      const b = this.world.buildings[poi.id];
      if (!b || !poi.zone) continue;
      const door = b.doorPoint(1.4);
      list.push({
        x: door.x,
        z: door.z,
        radius: 1.6,
        label: () => {
          if (b.shutter) return null;
          return {
            text: `${poi.icon} ENTRAR A LA TIENDA · ${poi.name}`,
            enabled: false,
          };
        },
        action: () => {},
      });
    }
    return list;
  }

  // Vida de la ciudad (peatones, tráfico, ambiente). En la pantalla de
  // inicio no aparecen clientes nuevos para no alterar la partida guardada.
  stepWorld(dt, title) {
    this.wayfinding.update(this.elapsed);
    this._agents = [];
    for (const b of Object.values(this.businesses))
      this._agents.push(...b.actors());
    this._agents.push(
      ...this.crowd.positions(),
      ...this.warehouse.positions(),
      ...(this.online?.positions() ?? []),
    );
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
    this.critters.update(dt, this.elapsed);
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
    // Modo decoración: el joystick mueve el mueble y la cámara mira desde
    // arriba; la ciudad sigue viva.
    if (this.decorator.active) {
      this.decorator.update(dt);
      if (this.examine) this.stepExamine(dt);
      this.stepWorld(dt, false);
      this.ui.refreshHud();
      return;
    }
    this.player.char.root.visible = true;
    if (this.player.sitting) this.player.sit(dt);
    else this.player.update(dt, input, this.cameraRig.yaw);
    this.checkExitGate();
    const inside = Object.values(this.world.buildings).find((b) =>
      b.contains(this.player.pos.x, this.player.pos.z),
    );
    this.cameraRig.update(dt, input, this.player, !!inside);
    this.home.update(dt);
    this.stepWorld(dt, false);
    this.events.update(dt, this.elapsed);
    this.surprises.update(dt, this.elapsed);
    this.warehouse.update(dt);
    this.tutorial.update();
    this.shopping.update();
    this.rides.update(dt);
    this.automation.update(dt);
    this.district.update(dt);
    this.carryHint();
    this.guide.update(dt, this.elapsed);
    this.online?.update(dt);
    this.handleKeys(input);
    this.advanceClock(dt);
    checkMissions(this);
    const m = currentMission(this);
    void m;
    this.fx.setMarker(this.guide.currentTarget());
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
    if (input.consume("u")) this.ui.openUpgrade();
    if (input.consume("m")) this.ui.openMap();
    if (input.consume("c")) this.ui.openShops();
    if (input.consume("i")) this.ui.openInventory();
    if (input.consume("b") && this.atHome()) this.ui.openDecor();
    if (input.consume("v")) this.toggleRide();
    if (input.consume("escape") || input.consume("p")) this.ui.openMenu();
    if (this.online) {
      if (input.consume("1")) this.online.emote("wave");
      if (input.consume("2")) this.online.emote("cheer");
      if (input.consume("3")) this.online.emote("dance");
      if (input.consume("l")) this.ui.openLeaderboard();
      if (input.consume("enter")) this.ui.openChat();
    }
  }

  advanceClock(dt) {
    const s = this.state;
    s.clock += dt;
    // En online el día lo cierra el servidor (mensaje "day").
    if (this.online) s.clock = Math.min(s.clock, DAY_SECONDS - 0.01);
    else if (s.clock >= DAY_SECONDS) {
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
      const cost = b.def.rent + b.salaries() + upgradeUpkeep(b.upgrades);
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
    this.sun.intensity = 3.0 * (1 - night * 0.65);
    this.sun.color.setHSL(
      0.09 - dusk * 0.04,
      0.6 + dusk * 0.35,
      0.9 - night * 0.2,
    );
    this.hemi.intensity = 1.0 - night * 0.3;
    const horizon = this.scenery.update(
      this.camera,
      dusk * 0.7,
      night,
      this.elapsed,
    );
    this.scene.background.copy(horizon);
    this.scene.fog.color.copy(horizon);
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
    // El coche que se conduce se guarda donde está ahora.
    const ride = this.player.ride;
    if (ride && !isSmall(ride.id) && !this.rides.test)
      this.state.parked[ride.id] = {
        x: this.player.pos.x,
        z: this.player.pos.z,
        h: this.player.heading,
      };
    if (this.online) {
      // El servidor guarda dinero e inventario; aquí solo el reparto.
      const state = { ...this.state };
      for (const k of [
        "money",
        "items",
        "wardrobe",
        "look",
        "mission",
        "day",
        "home",
        "furniture",
        "unlocked",
        "goals",
      ])
        delete state[k];
      this.net.send("save", {
        blob: {
          state,
          player: {
            x: this.player.pos.x,
            z: this.player.pos.z,
            heading: this.player.heading,
          },
          businesses: Object.fromEntries(
            Object.entries(this.businesses).map(([id, b]) => [
              id,
              b.serialize(),
            ]),
          ),
        },
      });
      return true;
    }
    // Para calcular lo que gana la tienda mientras la partida está cerrada.
    this.state.auto.savedAt = Date.now();
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
    this.normalizeCarry();
    this.player.setRide(null);
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
    this.setupGuides();
    this.player.char.setLook(this.state.look);
    this.onCarryChanged();
    return true;
  }

  // Al cargar: lo que no se pagó vuelve a las estanterías del Mayorista, y
  // los pedidos del sistema anterior (preparándose en la zona B) pasan al
  // palé para recogerlos.
  normalizeCarry() {
    const s = this.state;
    s.carried = s.carried.filter((b) => !b.unpaid);
    for (const o of s.pendingPickup ?? []) s.pickup.push(...o.items);
    delete s.pendingPickup;
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
