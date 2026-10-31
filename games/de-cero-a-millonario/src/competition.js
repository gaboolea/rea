// Competencia en el modo de un jugador: una tienda rival que lleva el
// juego, en un local libre del barrio (y, cuando la compras, otra más
// fuerte en la zona comercial). Tiene nombre, dueño y cartel propios, sus
// precios, existencias y nivel, y reacciona a lo que haces: baja precios
// si tú los bajas, monta ofertas, a veces se queda sin género y mejora con
// el tiempo. En la calle, parte de los peatones elige ir a ella
// (streetflow.js) y se lleva parte de tus clientes (playerFactor).
//
// En online no existe: allí la competencia son los demás jugadores (no
// hay rival que valide el servidor). Su dinero no es el del jugador: sus
// ventas solo cuentan en sus propias estadísticas.
import { Business, freshToday } from "./business.js";
import { randomPerson } from "./look.js";
import { PRODUCTS, RIVALS, RIVAL_UPGRADES, STAGES, BOX_UNITS } from "./config.js";

// Cada cuánto piensa el rival (segundos de juego).
const AI_TICK = 5;
// Días que tarda en subir un nivel por su cuenta.
const DAYS_PER_LEVEL = 6;
// Su proveedor le trae género cada tanto (si no está sin existencias).
const RESTOCK_EVERY = 35;
const STOCK_TARGET = 90;

function ownerLook(seed) {
  const p = randomPerson(seed, "adulto");
  return {
    ...p.look,
    top: { id: "chaqueta", color: "rojo" },
    bottom: { id: "pantalon", color: "marino" },
    hat: { id: "none" },
    face: { id: "seguro" },
  };
}

export class RivalShop extends Business {
  constructor(game, def, saved = {}) {
    super(game, "tienda", { building: def.building, ai: true, name: def.name });
    this.rival = def;
    this.owned = true;
    this.since = saved.since ?? game.state.day;
    this.ratio = saved.ratio ?? def.prices[0];
    this.level = -1;
    this.outage = 0;
    this.restock = 2;
    this.aiTimer = 1;
    this.revenue = saved.revenue ?? 0;
    this.news = [];
  }

  open() {
    const b = this.building;
    b.setLocked(false, null);
    this.buildInterior();
    b.setSignText(this.rival.sign, this.rival.colors);
    this.levelUp(true);
    // Dueño en la caja (con su propio look) y un reponedor.
    const owner = this.hire("cajero");
    owner.char.setLook(ownerLook(this.rival.ownerSeed));
    owner.seed = this.rival.ownerSeed;
    this.hire("reponedor");
    this.fillStorage(STOCK_TARGET);
    for (const e of this.displays) {
      const p = this.productFor(e);
      if (p) this.stockDisplay(e, p, 14);
    }
  }

  // Nivel: sigue a tu etapa (como mínimo minLevel) y sube con los días,
  // pero nunca más de uno por encima de tu etapa: en Principiante es débil.
  targetLevel() {
    const stage = this.game.stageIndex();
    const grown = Math.floor((this.game.state.day - this.since) / DAYS_PER_LEVEL);
    return Math.min(
      3,
      stage + 1,
      Math.max(this.rival.minLevel, stage) + grown,
    );
  }

  levelUp(quiet = false) {
    const level = this.targetLevel();
    if (level <= this.level) return;
    const first = this.level < 0;
    this.level = level;
    for (const u of RIVAL_UPGRADES[level]) this.upgrades.add(u);
    this.refreshFixtures();
    this.reputation = Math.max(this.reputation, 45 + level * 8);
    this.ratio = Math.min(this.ratio, this.rival.prices[level]);
    this.applyPrices();
    if (!first && !quiet)
      this.say(`🏪 ${this.name} ha mejorado su tienda (nivel ${level + 1})`);
  }

  strength() {
    return this.rival.strength[Math.max(0, this.level)];
  }

  productFor(entry) {
    const d = entry.display;
    if (d.product) return d.product;
    const stage = this.level;
    const options = this.catalog().filter(
      (p) =>
        (PRODUCTS[p].stage ?? 0) <= stage &&
        d.spec.accepts(PRODUCTS[p]) &&
        !this.displays.some((x) => x.display.product === p),
    );
    return options[Math.floor(Math.random() * options.length)] ?? null;
  }

  fillStorage(target) {
    const wanted = this.displays
      .map((e) => this.productFor(e))
      .filter(Boolean);
    let room = Math.min(target, this.storageCap()) - this.storageUnits();
    for (const p of wanted) {
      if (room < BOX_UNITS) break;
      if ((this.storage[p] ?? 0) >= 20) continue;
      this.addToStorage(p, BOX_UNITS);
      room -= BOX_UNITS;
    }
  }

  applyPrices() {
    for (const p of this.catalog())
      this.prices[p] = Math.round(PRODUCTS[p].base * this.ratio * 10) / 10;
  }

  // Precio medio de tus tiendas de comestibles (× precio base).
  playerRatio() {
    const shops = Object.values(this.game.businesses).filter(
      (b) => b.owned && b.def.type === "grocery",
    );
    let sum = 0;
    let n = 0;
    for (const b of shops)
      for (const p of b.catalog()) {
        sum += b.priceOf(p) / PRODUCTS[p].base;
        n++;
      }
    return n ? sum / n : 1;
  }

  think() {
    this.levelUp();
    // Si bajas precios, baja los suyos poco a poco (hasta su suelo); si
    // los subes, vuelve despacio a su precio de siempre.
    const target = this.rival.prices[this.level];
    const floor = this.rival.floor[this.level];
    const mine = this.playerRatio();
    let goal = target;
    if (this.level >= 1 && mine < target - 0.02)
      goal = Math.max(floor, mine - 0.02);
    const before = this.ratio;
    this.ratio += Math.max(-0.02, Math.min(0.01, goal - this.ratio));
    if (Math.abs(this.ratio - before) > 1e-3) this.applyPrices();
    if (before - this.ratio > 1e-3 && !this.cutNotice) {
      this.cutNotice = true;
      this.say(`📉 ${this.name} baja sus precios para no perder clientes`);
    }
    if (this.ratio >= target - 1e-3) this.cutNotice = false;
    // Ofertas (desde el nivel 1).
    if (this.level >= 1 && !this.offer && !(this.offerCooldown > 0)) {
      if (Math.random() < 0.02 + this.level * 0.012) {
        const stocked = this.catalog().filter((p) => this.shelfStock(p) > 0);
        const p = stocked[Math.floor(Math.random() * stocked.length)];
        if (p && this.startOffer(p))
          this.say(`🏷️ ${this.name}: ¡oferta en ${PRODUCTS[p].name}!`);
      }
    }
    // A veces su proveedor falla y se queda sin género un rato.
    this.calm = Math.max(0, (this.calm ?? 120) - AI_TICK);
    if (this.outage <= 0 && this.calm <= 0 && Math.random() < 0.012) {
      this.outage = 80 + Math.random() * 60;
      this.say(`📦 ${this.name} se ha quedado sin género`);
    }
  }

  update(dt, budget) {
    if (!this.owned) return;
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this.aiTimer = AI_TICK;
      this.think();
    }
    if (this.outage > 0) {
      this.outage -= dt;
      if (this.outage <= 0) this.restock = 0;
    } else {
      this.restock -= dt;
      if (this.restock <= 0) {
        this.restock = RESTOCK_EVERY;
        this.fillStorage(STOCK_TARGET);
      }
    }
    super.update(dt, budget);
  }

  // Menos clientes que tú al principio; más cuanto más nivel tiene.
  spawnInterval() {
    return super.spawnInterval() / (0.35 + this.level * 0.15);
  }

  // Sus ventas no son dinero del jugador.
  collect(c, total) {
    this.revenue += total;
  }

  afterSale() {}

  say(text) {
    this.news.unshift({ text, day: this.game.state.day });
    this.news.length = Math.min(this.news.length, 6);
    // Solo se avisa si estás cerca (si no, queda en Gestión → 🏁 Rival).
    const g = this.game;
    const p = g.player.pos;
    if (Math.hypot(p.x - this.building.x, p.z - this.building.z) < 45)
      g.ui.toast(text, "event");
  }

  // Cierra al comprarla: quien estaba comprando sale a la calle.
  close() {
    for (const c of this.customers) {
      if (c.street) {
        const door = this.building.doorPoint(2.5);
        c.pos.x = door.x;
        c.pos.z = door.z;
        c.street.endShopping();
      } else c.dispose();
    }
    this.customers = [];
    for (const e of this.employees) e.dispose();
    this.employees = [];
    for (const r of this.registers) r.queue = [];
    this.owned = false;
    this.offer = null;
    this.building.setLocked(true, "COMPRADA\npor ti");
    this.building.setSignText("CERRADO", { bg: "#ffffff", fg: "#7f8c8d" });
  }

  serialize() {
    return {
      id: this.rival.id,
      since: this.since,
      ratio: this.ratio,
      revenue: this.revenue,
    };
  }
}

export class Competition {
  constructor(game) {
    this.game = game;
    this.rival = null;
    this.cache = new Map();
  }

  get state() {
    return (this.game.state.competition ??= { bought: [], rival: null });
  }

  // Al empezar o cargar la partida (solo un jugador).
  setup() {
    if (this.game.online) return;
    // Los locales de los rivales ya comprados quedan cerrados.
    for (const id of this.state.bought) {
      const def = RIVALS.find((r) => r.id === id);
      const b = def && this.game.world.buildings[def.building];
      if (!b) continue;
      b.setLocked(true, "COMPRADA\npor ti");
      b.setSignText("CERRADO", { bg: "#ffffff", fg: "#7f8c8d" });
    }
    const def = RIVALS.find((r) => !this.state.bought.includes(r.id));
    if (!def) return;
    const saved = this.state.rival?.id === def.id ? this.state.rival : {};
    this.rival = new RivalShop(this.game, def, saved);
    this.rival.open();
    this.save();
  }

  active() {
    return this.rival?.owned ? [this.rival] : [];
  }

  save() {
    this.state.rival = this.rival?.serialize() ?? null;
  }

  update(dt, budget) {
    if (!this.rival?.owned) return;
    this.rival.update(dt, budget);
  }

  actors() {
    return this.rival?.owned ? this.rival.actors() : [];
  }

  agents() {
    return this.rival?.owned
      ? [...this.rival.customers, ...this.rival.employees]
      : [];
  }

  // Lo atractiva que es una tienda para quien sale a comprar.
  utility(b) {
    return b.appeal().enter;
  }

  // Multiplicador de clientes de una tienda de comestibles del jugador:
  // 1 − s/2 si sois iguales, hasta 1 − 1,5·s si el rival es mucho mejor y
  // 1 + s/2 si tú lo eres (te llevas a sus clientes). s: fuerza del rival.
  playerFactor(b) {
    const r = this.rival;
    if (!r?.owned || b.def.type !== "grocery") return 1;
    const now = this.game.streetFlow?.time ?? 0;
    const hit = this.cache.get(b);
    if (hit && now - hit.at < 1) return hit.f;
    const up = this.utility(b);
    const ur = this.utility(r);
    const share = ur / (up + ur || 1);
    const f = Math.max(0.6, Math.min(1.25, 1 + r.strength() * (0.5 - 2 * share)));
    this.cache.set(b, { at: now, f });
    return f;
  }

  // Cuota de clientes de hoy (los que entraron en tus comestibles y en la
  // tienda rival).
  share() {
    const r = this.rival;
    let mine = 0;
    for (const b of Object.values(this.game.businesses))
      if (b.owned && b.def.type === "grocery")
        mine += b.today.entered + b.today.walkIns;
    const theirs = r?.owned ? r.today.entered + r.today.walkIns : 0;
    return { mine, theirs, pct: mine + theirs ? mine / (mine + theirs) : 1 };
  }

  endDay() {
    if (this.rival?.owned) this.rival.today = freshToday();
    this.save();
  }

  canBuy() {
    const r = this.rival;
    if (!r?.owned || this.game.online) return { ok: false };
    const stage = this.game.stageIndex();
    if (stage < r.rival.buyStage)
      return {
        ok: false,
        why: `Se puede comprar desde la etapa ${STAGES[r.rival.buyStage].name}`,
      };
    if (this.game.state.money < r.rival.price)
      return { ok: false, why: "No tienes suficiente dinero" };
    return { ok: true };
  }

  // Comprar la tienda rival: cierra, cuenta para el objetivo y aparece la
  // siguiente (más fuerte, en la zona comercial).
  buy() {
    const g = this.game;
    const r = this.rival;
    if (!this.canBuy().ok || !g.spend(r.rival.price)) return false;
    r.close();
    this.state.bought.push(r.rival.id);
    g.state.stats.rivalsBought = (g.state.stats.rivalsBought ?? 0) + 1;
    g.ui.toast(`🤝 ¡Has comprado ${r.name}! Sus clientes vienen a ti`, "good");
    g.ui.coinBurst?.(10);
    g.audio.sfx("mission");
    this.rival = null;
    this.state.rival = null;
    const next = RIVALS.find((x) => !this.state.bought.includes(x.id));
    if (next) {
      this.rival = new RivalShop(g, next, { since: g.state.day });
      this.rival.open();
      g.ui.toast(
        `⚠️ Nueva competencia: ${next.name} abre en la zona comercial`,
        "event",
      );
    }
    this.save();
    g.goals.check();
    g.rebuildInteractables();
    g.save();
    return true;
  }

  interactables() {
    const r = this.rival;
    if (!r?.owned) return [];
    return [
      {
        ...r.building.doorPoint(1.5),
        radius: 2.4,
        label: () => ({
          text: `🏪 ${r.name} · tienda rival de ${r.rival.owner} · E: ver competencia`,
          enabled: true,
        }),
        action: () => this.game.ui.openManagement(undefined, "rival"),
      },
    ];
  }
}
