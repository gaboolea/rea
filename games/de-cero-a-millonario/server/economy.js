// Reglas económicas autoritativas del servidor. Cada función recibe el
// perfil de ciudad del jugador (y la ciudad cuando hay recursos
// compartidos), valida la acción y la aplica completa o no la aplica.
// Devuelven { ok: true, ... } o { ok: false, error }.
import {
  PRODUCTS,
  UPGRADES,
  STAFF,
  BUSINESSES,
  SHOP_ITEMS,
  STAGES,
  BOX_UNITS,
  START_MONEY,
  DAY_SECONDS,
  VEHICLES,
  FURNITURE,
  FURNITURE_MAX,
  HOME,
  DISTRICT,
  TOW_PRICE,
  GYM,
  GOALS,
  goalProgress,
  upgradeUpkeep,
  automationLevel,
  idleEarnings,
  IDLE,
} from "../src/config.js";
import { STARTER_LAYOUT, findSpot, layoutProblem } from "../src/homelayout.js";
import { ITEMS, SKINS } from "../src/look.js";
import { MISSIONS } from "../src/missions.js";
import {
  SURPRISES,
  SURPRISE_SECONDS,
  SERVER_NEAR,
  THIEF_MAX_UNITS,
  THIEF_PATHS,
  thiefAt,
  thiefSeconds,
  surpriseReward,
  planStops,
} from "../src/surprises.js";

export const WAREHOUSE_MAX = 30;
export const PRICE_CAP = 2.5; // precio de venta máximo = base × 2.5
const EXCLUSIVE = new Set(["cafeteria", "minimercado", "supermercado"]);
const PLACES = new Set([
  "mayorista",
  "cafeteria",
  "boutique",
  "minimercado",
  "supermercado",
  "casagrande",
  "parque",
  "concesionario",
  "bus",
]);

const fail = (error) => ({ ok: false, error });
const round2 = (n) => Math.round(n * 100) / 100;
const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const boxUnits = (p) => PRODUCTS[p].boxUnits ?? BOX_UNITS;

export function stageIndex(cp) {
  let idx = 0;
  STAGES.forEach((st, i) => {
    if (cp.stats.revenue >= st.revenue) idx = i;
  });
  return idx;
}

// Perfil económico de un jugador en una ciudad. El inventario inicial
// coincide con el género con el que empieza la tienda en el cliente.
export function newCityProfile() {
  return {
    money: START_MONEY,
    ledger: { agua: 12, galletas: 12, fruta: 8, refresco: 10 },
    stats: {
      revenue: 0,
      grossProfit: 0,
      sales: 0,
      unitsBought: 0,
      encargos: 0,
      coffeeSold: 0,
      coins: 0,
      expenses: 0,
    },
    mission: 0,
    businesses: { tienda: { upgrades: [], employees: [] } },
    items: {},
    discovered: ["tienda"],
    day: 1,
    dayElapsed: 40,
    lastReport: null,
    blob: null,
    limits: {},
    ...expansionFields(),
  };
}

// Datos de la gran expansión (casa, muebles, desbloqueos y objetivos).
// Los perfiles guardados antes de ella los reciben al cargarse.
function expansionFields() {
  return {
    home: { owned: false, layout: [], open: false },
    furniture: {},
    unlocked: {},
    goals: [],
    vault: 0,
    lastSeen: null,
  };
}

export function upgradeProfile(cp) {
  for (const [k, v] of Object.entries(expansionFields())) cp[k] ??= v;
  return cp;
}

export function newWarehouse() {
  const w = {};
  for (const [p, def] of Object.entries(PRODUCTS))
    if (!def.crafted) w[p] = WAREHOUSE_MAX;
  return w;
}

export function regenWarehouse(w) {
  upgradeWarehouse(w);
  for (const p of Object.keys(w)) w[p] = Math.min(WAREHOUSE_MAX, w[p] + 1);
}

// Ciudades creadas antes de que existiera un producto: llega con el
// Mayorista lleno.
export function upgradeWarehouse(w) {
  for (const [p, def] of Object.entries(PRODUCTS))
    if (!def.crafted) w[p] ??= WAREHOUSE_MAX;
  return w;
}

const owns = (cp, biz) => !!cp.businesses[biz];
const take = (cp, p, n) => {
  cp.ledger[p] = (cp.ledger[p] ?? 0) - n;
  if (cp.ledger[p] <= 0) delete cp.ledger[p];
};
const give = (cp, p, n) => (cp.ledger[p] = (cp.ledger[p] ?? 0) + n);

// Limitador de frecuencia por tipo de acción (cubo de fichas).
export function allow(cp, key, perSecond, burst, now = Date.now()) {
  const l = (cp.limits[key] ??= { tokens: burst, at: now });
  l.tokens = Math.min(burst, l.tokens + ((now - l.at) / 1000) * perSecond);
  l.at = now;
  if (l.tokens < 1) return false;
  l.tokens -= 1;
  return true;
}

export function buySupplies(cp, city, { order, deliver }) {
  if (!order || typeof order !== "object") return fail("Pedido vacío");
  const stage = stageIndex(cp);
  let cost = 0;
  let boxes = 0;
  const items = [];
  for (const [p, n] of Object.entries(order)) {
    if (n === 0) continue;
    const def = PRODUCTS[p];
    if (!def || def.crafted) return fail("Producto desconocido");
    if (!isInt(n, 1, WAREHOUSE_MAX)) return fail("Cantidad no válida");
    if ((def.stage ?? 0) > stage)
      return fail(`${def.name} requiere la etapa ${STAGES[def.stage].name}`);
    if (def.kind === "cafe" && !owns(cp, "cafeteria"))
      return fail("Necesitas la cafetería para ese producto");
    if ((city.warehouse[p] ?? 0) < n)
      return fail(`No quedan suficientes cajas de ${def.name}`);
    cost += def.cost * boxUnits(p) * n * (stage >= 3 ? 0.85 : 1);
    boxes += n;
    for (let i = 0; i < n; i++) items.push({ product: p, units: boxUnits(p) });
  }
  if (!boxes) return fail("Pedido vacío");
  if (deliver != null) {
    if (!owns(cp, deliver)) return fail("Ese negocio no es tuyo");
    // El reparto es gratis con furgoneta o con el camión propio.
    if (
      !cp.items.furgoneta &&
      !cp.businesses[deliver].upgrades.includes("camion")
    )
      cost += 4;
  }
  cost = round2(cost);
  if (cp.money < cost)
    return fail(`Te faltan $${round2(cost - cp.money).toFixed(2)}`);
  cp.money = round2(cp.money - cost);
  cp.stats.expenses = round2(cp.stats.expenses + cost);
  for (const it of items) {
    give(cp, it.product, it.units);
    cp.stats.unitsBought += it.units;
  }
  for (const [p, n] of Object.entries(order)) if (n) city.warehouse[p] -= n;
  return { ok: true, cost, items };
}

// Venta a un cliente controlado por el juego en un negocio propio.
export function sale(cp, { biz, items, vip }, now = Date.now()) {
  if (!owns(cp, biz)) return fail("Ese negocio no es tuyo");
  if (
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > (vip ? 10 : 6)
  )
    return fail("Venta no válida");
  if (!allow(cp, "sale", 2, 8, now)) return fail("Demasiadas ventas seguidas");
  if (vip && !allow(cp, "vip", 1 / 50, 1, now))
    return fail("Cliente VIP no válido");
  const need = {};
  let total = 0;
  let cost = 0;
  for (const it of items) {
    const def = PRODUCTS[it?.p];
    const price = Number(it?.price);
    if (
      !def ||
      def.ingredient ||
      !Number.isFinite(price) ||
      price < 0 ||
      price > def.base * PRICE_CAP
    )
      return fail("Precio no válido");
    need[it.p] = (need[it.p] ?? 0) + 1;
    total += price;
    cost += it.p === "cafe" ? PRODUCTS.granos.cost : def.cost;
  }
  for (const [p, n] of Object.entries(need))
    if ((cp.ledger[p] ?? 0) < n) return fail("No tienes esas existencias");
  for (const [p, n] of Object.entries(need)) take(cp, p, n);
  if (vip) total *= 2;
  total = round2(total);
  cp.money = round2(cp.money + total);
  cp.stats.revenue = round2(cp.stats.revenue + total);
  cp.stats.grossProfit = round2(cp.stats.grossProfit + total - cost);
  cp.stats.sales += 1;
  cp.stats.coffeeSold += need.cafe ?? 0;
  return { ok: true, total };
}

// La máquina de café convierte granos en cafés (1:1).
export function brew(cp, { units }) {
  if (!owns(cp, "cafeteria")) return fail("No tienes cafetería");
  if (!isInt(units, 1, 12)) return fail("Cantidad no válida");
  if ((cp.ledger.granos ?? 0) < units) return fail("No tienes granos");
  take(cp, "granos", units);
  give(cp, "cafe", units);
  return { ok: true };
}

export function buyUpgrade(cp, { biz, id }) {
  const u = UPGRADES[id];
  const b = cp.businesses[biz];
  if (!u || !b) return fail("Mejora no válida");
  if (u.types && !u.types.includes(BUSINESSES[biz].type))
    return fail("Esa mejora no sirve para este negocio");
  if (b.upgrades.includes(id)) return fail("Ya la tienes");
  if ((u.stage ?? 0) > stageIndex(cp))
    return fail(`Requiere la etapa ${STAGES[u.stage].name}`);
  if ((u.needs ?? []).some((n) => !b.upgrades.includes(n)))
    return fail("Antes necesitas otra mejora");
  if ((u.staff ?? []).some((r) => !b.employees.includes(r)))
    return fail("Antes necesitas contratar al personal");
  if (cp.money < u.price)
    return fail(`Te faltan $${round2(u.price - cp.money).toFixed(2)}`);
  cp.money = round2(cp.money - u.price);
  b.upgrades.push(id);
  return { ok: true };
}

export function hire(cp, { biz, role }) {
  const st = STAFF[role];
  const b = cp.businesses[biz];
  if (!st || !b || !BUSINESSES[biz].staff.includes(role))
    return fail("Puesto no válido");
  if ((st.stage ?? 0) > stageIndex(cp))
    return fail(`Requiere la etapa ${STAGES[st.stage].name}`);
  if (b.employees.length >= 4) return fail("Este local no admite más personal");
  if (cp.money < st.salary)
    return fail(`Te faltan $${round2(st.salary - cp.money).toFixed(2)}`);
  cp.money = round2(cp.money - st.salary);
  b.employees.push(role);
  return { ok: true };
}

export function fire(cp, { biz, role }) {
  const b = cp.businesses[biz];
  const i = b ? b.employees.indexOf(role) : -1;
  if (i < 0) return fail("No hay nadie en ese puesto");
  b.employees.splice(i, 1);
  return { ok: true };
}

// Locales exclusivos: el servidor decide quién lo compra primero.
export function buyBusiness(cp, city, playerId, { biz }) {
  const def = BUSINESSES[biz];
  if (!def || !EXCLUSIVE.has(biz)) return fail("Ese local no está a la venta");
  if (owns(cp, biz)) return fail("Ya es tuyo");
  if (city.exclusive[biz]) return fail("Otro jugador ya compró este local");
  if ((def.stage ?? 0) > stageIndex(cp))
    return fail(`Requiere la etapa ${STAGES[def.stage].name}`);
  if (cp.money < def.price)
    return fail(`Te faltan $${round2(def.price - cp.money).toFixed(2)}`);
  cp.money = round2(cp.money - def.price);
  cp.businesses[biz] = { upgrades: [], employees: [] };
  city.exclusive[biz] = playerId;
  return { ok: true };
}

export function buyItem(cp, city, playerId, { id }) {
  if (Object.hasOwn(VEHICLES, id)) return buyVehicle(cp, id);
  const item = SHOP_ITEMS[id];
  if (!item) return fail("Artículo no válido");
  if (cp.items[id]) return fail("Ya lo tienes");
  if ((item.stage ?? 0) > stageIndex(cp))
    return fail(`Requiere la etapa ${STAGES[item.stage].name}`);
  if (id === "casa" && city.exclusive.casa)
    return fail("Otro jugador ya compró la Villa Bonita");
  if (cp.money < item.price)
    return fail(`Te faltan $${round2(item.price - cp.money).toFixed(2)}`);
  cp.money = round2(cp.money - item.price);
  cp.items[id] = true;
  if (id === "casa") city.exclusive.casa = playerId;
  return { ok: true };
}

function buyVehicle(cp, id) {
  const def = VEHICLES[id];
  if (cp.items[id]) return fail("Ya lo tienes");
  if ((def.stage ?? 0) > stageIndex(cp))
    return fail(`Requiere la etapa ${STAGES[def.stage].name}`);
  if (def.zone === "financiero" && !cp.unlocked.financiero)
    return fail("Desbloquea el distrito financiero");
  if (cp.money < def.price)
    return fail(`Te faltan $${round2(def.price - cp.money).toFixed(2)}`);
  cp.money = round2(cp.money - def.price);
  cp.items[id] = true;
  return { ok: true };
}

// Grúa: trae un vehículo propio aparcado lejos.
export function tow(cp, { id }) {
  if (!cp.items[id] || !VEHICLES[id]) return fail("No es tuyo");
  if (cp.money < TOW_PRICE) return fail("No tienes dinero para la grúa");
  cp.money = round2(cp.money - TOW_PRICE);
  return { ok: true };
}

// Casita: se compra una vez y trae muebles básicos colocados.
export function buyHome(cp) {
  if (cp.home.owned) return fail("Ya tienes casa");
  if (cp.money < HOME.price)
    return fail(`Te faltan $${round2(HOME.price - cp.money).toFixed(2)}`);
  cp.money = round2(cp.money - HOME.price);
  for (const f of HOME.starter) cp.furniture[f] = (cp.furniture[f] ?? 0) + 1;
  cp.home = {
    owned: true,
    layout: STARTER_LAYOUT.map((it) => ({ ...it })),
    open: false,
  };
  return { ok: true, home: cp.home, furniture: cp.furniture };
}

// Muebles: solo con casa y si caben en ella tal como está.
export function buyFurniture(cp, { id }) {
  const def = Object.hasOwn(FURNITURE, id) ? FURNITURE[id] : null;
  if (!def) return fail("Mueble no válido");
  if (!cp.home.owned) return fail("Necesitas casa");
  if ((def.stage ?? 0) > stageIndex(cp))
    return fail(`Requiere la etapa ${STAGES[def.stage].name}`);
  const have = cp.furniture[id] ?? 0;
  if (have >= FURNITURE_MAX) return fail(`Ya tienes ${FURNITURE_MAX}`);
  if (!findSpot(cp.home.layout, id)) return fail("No cabe en tu casa");
  if (cp.money < def.price)
    return fail(`Te faltan $${round2(def.price - cp.money).toFixed(2)}`);
  cp.money = round2(cp.money - def.price);
  cp.furniture[id] = have + 1;
  return { ok: true, furniture: cp.furniture };
}

// Nueva distribución de la casa: se valida entera (muebles comprados y
// cada uno en un sitio válido) y se guarda limpia.
export function setHome(cp, { layout, open }) {
  if (!cp.home.owned) return fail("No tienes casa");
  const clean = Array.isArray(layout)
    ? layout.map((it) => ({
        f: it?.f,
        x: it?.x,
        z: it?.z,
        r: it?.r,
        ...(it?.on ? { on: true } : {}),
      }))
    : null;
  const problem = layoutProblem(clean, cp.furniture);
  if (problem) return fail(problem);
  cp.home.layout = clean;
  cp.home.open = !!open;
  return { ok: true };
}

// Distrito financiero: se abre al llegar a las ventas pedidas (una vez y
// para siempre).
export function unlock(cp, { zone }) {
  if (zone !== "financiero") return fail("Zona no válida");
  if (cp.unlocked.financiero) return { ok: true };
  if (cp.stats.revenue < DISTRICT.revenue)
    return fail(`Necesitas $${DISTRICT.revenue} en ventas`);
  cp.unlocked.financiero = true;
  return { ok: true };
}

// Objetivo opcional: se paga una vez y solo si se cumple con los datos
// que guarda el servidor.
export function claimGoal(cp, { id }) {
  const goal = GOALS.find((x) => x.id === id);
  if (!goal) return fail("Objetivo no válido");
  if (cp.goals.includes(id)) return fail("Ya cobrado");
  if (!goalProgress(id, cp).done) return fail("Aún no lo has cumplido");
  cp.goals.push(id);
  cp.money = round2(cp.money + goal.reward);
  return { ok: true, reward: goal.reward };
}

// Gimnasio: se cobra el entrenamiento (como mucho uno cada 2 minutos).
export function gym(cp, now = Date.now()) {
  if (!allow(cp, "gym", 1 / 120, 1, now))
    return fail("Ya has entrenado hace poco");
  if (cp.money < GYM.price) return fail("No tienes suficiente dinero");
  cp.money = round2(cp.money - GYM.price);
  return { ok: true };
}

// Ropa: se paga con el dinero de la ciudad y queda en el perfil global.
export function buyClothing(cp, profile, { slot, id }) {
  const item =
    slot === "skin"
      ? SKINS.find((s) => s.id === id)
      : ITEMS[slot]?.find((i) => i.id === id);
  if (!item) return fail("Prenda no válida");
  if (profile.wardrobe.includes(id)) return { ok: true, owned: true };
  if (item.reward) {
    const earned =
      (id === "estrella" && cp.stats.encargos >= 1) ||
      (id === "doradas" && cp.stats.encargos >= 3) ||
      (id === "corona" && stageIndex(cp) >= 3);
    if (!earned) return fail(`Se consigue jugando: ${item.reward}`);
  } else {
    if ((item.stage ?? 0) > stageIndex(cp))
      return fail(`Requiere la etapa ${STAGES[item.stage].name}`);
    if (item.lux && !cp.unlocked.financiero)
      return fail("Desbloquea el distrito financiero");
    const price = item.price ?? 0;
    if (cp.money < price)
      return fail(`Te faltan $${round2(price - cp.money).toFixed(2)}`);
    cp.money = round2(cp.money - price);
  }
  profile.wardrobe.push(id);
  return { ok: true };
}

// Recompensa de misión: solo la siguiente de la cadena y una sola vez.
export function claimMission(cp, { index }) {
  if (index !== cp.mission || !MISSIONS[index]) return fail("Misión no válida");
  const reward = MISSIONS[index].reward ?? 0;
  cp.mission += 1;
  cp.money = round2(cp.money + reward);
  return { ok: true, reward };
}

export function claimCoin(cp, now = Date.now()) {
  if (!allow(cp, "coin", 1 / 2.5, 2, now)) return fail("Demasiado rápido");
  const value = 1 + Math.floor(Math.random() * 3);
  cp.money = round2(cp.money + value);
  cp.stats.coins += 1;
  return { ok: true, value };
}

export function discover(cp, { place }) {
  if (!PLACES.has(place)) return fail("Lugar desconocido");
  if (cp.discovered.includes(place)) return fail("Ya lo descubriste");
  cp.discovered.push(place);
  cp.money = round2(cp.money + 10);
  return { ok: true, value: 10 };
}

// Encargo de un comerciante: entrega unidades y cobra 1,5 × precio base.
export function encargo(cp, { product, units }, now = Date.now()) {
  const def = PRODUCTS[product];
  if (!def || def.kind !== "grocery" || ![10, 20].includes(units))
    return fail("Encargo no válido");
  if (!allow(cp, "encargo", 1 / 45, 1, now))
    return fail("Espera al próximo encargo");
  if ((cp.ledger[product] ?? 0) < units) return fail("No tienes esas unidades");
  take(cp, product, units);
  const pay = Math.round(units * def.base * 1.5);
  cp.money = round2(cp.money + pay);
  cp.stats.encargos += 1;
  return { ok: true, pay };
}

// Compra entre jugadores: el comprador paga al dueño el precio de su
// estantería y recibe las unidades. Todo o nada.
export function p2pBuy(buyer, seller, shop, { display, units }) {
  if (!shop?.open) return fail("Esta tienda no vende a otros jugadores ahora");
  if (!isInt(units, 1, 10)) return fail("Cantidad no válida");
  const d = shop.displays.find((x) => x[0] === display);
  if (!d || !PRODUCTS[d[1]] || d[2] < units)
    return fail("No quedan tantas unidades en esa estantería");
  const product = d[1];
  const unit = Number(shop.prices[product]);
  if (
    !Number.isFinite(unit) ||
    unit < 0 ||
    unit > PRODUCTS[product].base * PRICE_CAP
  )
    return fail("Precio no válido");
  if ((seller.ledger[product] ?? 0) < units)
    return fail("El dueño no tiene esas existencias");
  const total = round2(unit * units);
  if (buyer.money < total)
    return fail(`Te faltan $${round2(total - buyer.money).toFixed(2)}`);
  buyer.money = round2(buyer.money - total);
  seller.money = round2(seller.money + total);
  seller.stats.revenue = round2(seller.stats.revenue + total);
  seller.stats.sales += 1;
  take(seller, product, units);
  give(buyer, product, units);
  d[2] -= units;
  return { ok: true, product, total };
}

// Gastos diarios: alquiler, salarios, mantenimiento de mejoras y furgoneta.
export function dailyExpenses(cp) {
  let total = 0;
  const lines = [];
  for (const [id, b] of Object.entries(cp.businesses)) {
    const def = BUSINESSES[id];
    const salaries = b.employees.reduce((a, r) => a + STAFF[r].salary, 0);
    const cost = def.rent + salaries + upgradeUpkeep(b.upgrades);
    total += cost;
    lines.push({ name: def.name, cost });
  }
  if (cp.items.furgoneta) total += 10;
  return { total, lines };
}

export function tickDay(cp, seconds) {
  cp.dayElapsed += seconds;
  if (cp.dayElapsed < DAY_SECONDS) return null;
  cp.dayElapsed -= DAY_SECONDS;
  const { total, lines } = dailyExpenses(cp);
  cp.money = round2(cp.money - total);
  cp.stats.expenses = round2(cp.stats.expenses + total);
  const report = { day: cp.day, expenses: total, lines };
  cp.day += 1;
  cp.lastReport = report;
  return report;
}

export function netWorth(cp) {
  let worth = cp.money;
  for (const id of Object.keys(cp.businesses))
    worth += (BUSINESSES[id].price ?? 0) * 0.8;
  for (const [id, v] of Object.entries(cp.items))
    if (v && SHOP_ITEMS[id]) worth += SHOP_ITEMS[id].price * 0.5;
  return Math.round(worth);
}

// Tienda automática: lo que gana la tienda mientras el jugador no está
// (desde la última vez que el servidor lo vio jugando). Se guarda en la
// caja fuerte, con un límite que sube con el nivel de automatización.
const MIN_AWAY_MS = 2 * 60000;

export function automation(cp) {
  const b = cp.businesses.tienda;
  if (!b) return 0;
  return automationLevel({ roles: b.employees, upgrades: b.upgrades });
}

export function accrueIdle(cp, now = Date.now()) {
  const since = cp.lastSeen;
  cp.lastSeen = now;
  if (!since || now - since < MIN_AWAY_MS) return { ok: true, vault: cp.vault };
  const level = automation(cp);
  const cap = idleEarnings(level, IDLE.capMinutes[level]);
  const gained = idleEarnings(level, (now - since) / 60000);
  cp.vault = round2(Math.min(cap, cp.vault + gained));
  return { ok: true, vault: cp.vault, gained };
}

export function collectVault(cp) {
  const v = cp.vault;
  if (!(v > 0)) return fail("La caja fuerte está vacía");
  cp.vault = 0;
  cp.money = round2(cp.money + v);
  return { ok: true, total: v, vault: 0 };
}

// ---------- Sucesos inesperados ----------
// El servidor elige el suceso y sus puntos, y solo paga cuando la posición
// sincronizada del jugador llega a ellos (o alcanza al ladrón) a tiempo.

function activeSurprise(cp, now) {
  const sp = cp.surprise;
  if (sp && now > sp.until) cp.surprise = null;
  return cp.surprise;
}

// types: sucesos que el cliente puede mostrar ahora (p. ej. sin ladrón si
// estás lejos de la tienda). steal: lo que se llevaría el ladrón de las
// estanterías; se descuenta de tus existencias al empezar.
export function surpriseStart(cp, plot, { types, steal }, now = Date.now()) {
  if (activeSurprise(cp, now)) return fail("Ya hay un suceso en marcha");
  if (!Array.isArray(types)) return fail("Suceso no válido");
  const thief =
    THIEF_PATHS[plot] &&
    PRODUCTS[steal?.product] &&
    !PRODUCTS[steal.product].ingredient &&
    isInt(steal?.units, 1, THIEF_MAX_UNITS) &&
    (cp.ledger[steal.product] ?? 0) >= steal.units;
  const options = types.filter(
    (t) => SURPRISES[t] && (t !== "ladron" || thief),
  );
  if (!options.length) return fail("Suceso no válido");
  if (!allow(cp, "surprise", 1 / 120, 1, now))
    return fail("Aún no toca otro suceso");
  const type = options[Math.floor(Math.random() * options.length)];
  const sp = { type, step: 0, started: now };
  if (type === "ladron") {
    sp.path = THIEF_PATHS[plot];
    sp.stolen = { product: steal.product, units: steal.units };
    sp.until = now + thiefSeconds(sp.path) * 1000;
    take(cp, steal.product, steal.units);
  } else {
    sp.stops = planStops(type);
    sp.until = now + SURPRISE_SECONDS * 1000;
  }
  cp.surprise = sp;
  return { ok: true, surprise: surpriseView(sp, now) };
}

// Anula el suceso en marcha; lo robado vuelve a su dueño.
export function cancelSurprise(cp) {
  const sp = cp.surprise;
  cp.surprise = null;
  if (sp?.stolen && Date.now() <= sp.until)
    give(cp, sp.stolen.product, sp.stolen.units);
}

export function surpriseView(sp, now = Date.now()) {
  return {
    type: sp.type,
    step: sp.step,
    stops: sp.stops,
    path: sp.path,
    stolen: sp.stolen,
    elapsed: (now - sp.started) / 1000,
    left: (sp.until - now) / 1000,
  };
}

// El jugador dice que llegó al siguiente punto (o que alcanzó al ladrón);
// pos es su última posición aceptada por el servidor.
export function surpriseStep(cp, pos, stage, now = Date.now()) {
  const sp = activeSurprise(cp, now);
  if (!sp) return fail("El suceso ya terminó");
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z))
    return fail("Sin posición");
  if (sp.type === "ladron") {
    // Las posiciones llegan con algo de retraso: se compara con dónde
    // estaba el ladrón en los últimos 2,5 s.
    const t = (now - sp.started) / 1000;
    let caught = false;
    for (let back = 0; back <= 2.5 && !caught; back += 0.25) {
      const q = thiefAt(sp.path, t - back);
      caught = Math.hypot(q.x - pos.x, q.z - pos.z) <= SERVER_NEAR;
    }
    if (!caught) return fail("El ladrón está demasiado lejos");
    give(cp, sp.stolen.product, sp.stolen.units);
    cp.stats.thieves = (cp.stats.thieves ?? 0) + 1;
  } else {
    const [x, z] = sp.stops[sp.step];
    if (Math.hypot(x - pos.x, z - pos.z) > SERVER_NEAR)
      return fail("Aún no has llegado");
    sp.step += 1;
    if (sp.step < sp.stops.length) return { ok: true, step: sp.step };
  }
  const reward = surpriseReward(sp.type, stage);
  cp.surprise = null;
  cp.money = round2(cp.money + reward);
  cp.stats.surprises = (cp.stats.surprises ?? 0) + 1;
  return { ok: true, done: true, reward, stolen: sp.stolen };
}
