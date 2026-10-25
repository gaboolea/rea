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
} from "../src/config.js";
import { ITEMS, SKINS } from "../src/look.js";
import { MISSIONS } from "../src/missions.js";

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
  };
}

export function newWarehouse() {
  const w = {};
  for (const [p, def] of Object.entries(PRODUCTS))
    if (!def.crafted) w[p] = WAREHOUSE_MAX;
  return w;
}

export function regenWarehouse(w) {
  for (const p of Object.keys(w)) w[p] = Math.min(WAREHOUSE_MAX, w[p] + 1);
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
    if (!cp.items.furgoneta) cost += 4;
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

// Gastos diarios: alquiler, salarios, luz de frío y furgoneta.
export function dailyExpenses(cp) {
  let total = 0;
  const lines = [];
  for (const [id, b] of Object.entries(cp.businesses)) {
    const def = BUSINESSES[id];
    const salaries = b.employees.reduce((a, r) => a + STAFF[r].salary, 0);
    const power =
      (b.upgrades.includes("refrigerador") ? 5 : 0) +
      (b.upgrades.includes("congelador") ? 4 : 0);
    const cost = def.rent + salaries + power;
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
