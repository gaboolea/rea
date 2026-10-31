// Jugador simulado (se inyecta en la página del juego). Solo atiende la
// tienda: cobra, repone, compra en el Mayorista y sigue la ruta de la
// tienda automática; sin misiones, objetivos, encargos ni otros negocios.
// Usa el código real del juego (clientes, navegación, precios) a paso fijo.
// Devuelve los minutos de juego en que compra cada paso y estadísticas.
window.__simRun = function simRun(opts = {}) {
  const g = window.game;
  const maxMin = opts.minutes ?? 200;
  const dt = 1 / 15;
  g.renderer.setAnimationLoop(null);
  g.mode = "play";
  g.tutorial.done?.();
  const shop = g.businesses.tienda;
  // El jugador se queda en la puerta de la tienda (la calle está viva ahí).
  const door = shop.building.doorPoint(1.5);
  g.player.teleport(door.x, door.z, 0);
  const ORDER = ["reponedor", "cajero", "camion", "cinta", "estanteria1",
    "estanteria2", "caja2", "letrero", "fachada", "planta2"];
  const times = {};
  let t = 0;
  let restockCd = 0;
  let buyCd = 0;
  const serveCd = new Map();
  const pending = [];
  const has = (id) => shop.employees.some((e) => e.role === id) || shop.upgrades.has(id);
  const priceOf = (id) => (window.__simDefs.STAFF[id]?.salary ?? window.__simDefs.UPGRADES[id].price);
  const stageOk = (id) => {
    const d = window.__simDefs.STAFF[id] ?? window.__simDefs.UPGRADES[id];
    return (d.stage ?? 0) <= g.stageIndex();
  };
  const sample = [];
  // Clientes distintos que han entrado en la tienda (de la calle o no).
  const seen = new WeakSet();
  let arrived = 0;
  let fromStreet = 0;
  while (t < maxMin * 60) {
    g.player.pos.x = door.x; g.player.pos.z = door.z;
    g.stepWorld(dt, false);
    g.automation.update(dt);
    g.advanceClock(dt);
    if (window.__simExtra) window.__simExtra(dt);
    t += dt;
    for (const c of shop.customers)
      if (!seen.has(c)) { seen.add(c); arrived++; if (c.street) fromStreet++; }
    const cashier = shop.employees.some((e) => e.role === "cajero");
    const stocker = shop.employees.some((e) => e.role === "reponedor");
    // Cobrar (1,5 s por cliente).
    if (!cashier) for (const r of shop.registers) {
      const c = r.queue[0];
      if (c?.ready) {
        const left = (serveCd.get(r) ?? 1.5) - dt;
        if (left <= 0) { shop.serve(r); serveCd.set(r, 1.5); } else serveCd.set(r, left);
      }
    }
    // Reponer: una caja cada 6 s.
    restockCd -= dt;
    if (!stocker && restockCd <= 0) {
      for (const e of shop.displays) {
        const d = e.display;
        if (e.def.kind === "coffee" || d.stock >= d.capacity * 0.5) continue;
        const p = d.product ?? shop.bestStorageFor(d);
        if (!p || !(shop.storage[p] > 0)) continue;
        const units = Math.min(d.capacity - d.stock, shop.storage[p], 10);
        shop.storage[p] -= units;
        const moved = shop.stockDisplay(e, p, units);
        if (moved < units) shop.addToStorage(p, units - moved);
        shop.updateStoragePile();
        restockCd = 6;
        break;
      }
    }
    // Comprar en el Mayorista (viaje de ida y vuelta: 90 s mínimo entre
    // compras) mientras no hay camión.
    buyCd -= dt;
    for (let i = pending.length - 1; i >= 0; i--)
      if (t >= pending[i].at) { for (const [p, n] of pending[i].items) shop.addToStorage(p, n); pending.splice(i, 1); }
    if (!shop.upgrades.has("camion") && buyCd <= 0 && !pending.length && shop.storageUnits() < 30) {
      // Compra lo que tiene expuesto (y algo para las estanterías vacías):
      // hasta 10 cajas, sin quedarse sin dinero.
      const stage = g.stageIndex();
      const P = window.__simDefs.PRODUCTS;
      const want = [];
      for (const e of shop.displays) {
        const d = e.display;
        if (e.def.kind === "coffee") continue;
        let p = d.product;
        if (!p) p = shop.catalog().find((x) => (P[x].stage ?? 0) <= stage && d.spec.accepts(P[x]) &&
          !shop.displays.some((o) => o.display.product === x) && !want.includes(x));
        if (p) want.push(p);
      }
      const order = {};
      let boxes = 0;
      const budget = g.state.money - 5;
      for (let round = 0; round < 3 && boxes < 10; round++)
        for (const p of want) {
          if (boxes >= 10 || (shop.storage[p] ?? 0) + (order[p] ?? 0) * 10 >= 30) continue;
          const o = { ...order, [p]: (order[p] ?? 0) + 1 };
          if (g.supplyCost(o) > budget) continue;
          order[p] = o[p]; boxes++;
        }
      if (boxes) {
        const cost = g.supplyCost(order);
        g.state.money -= cost; g.state.stats.expenses += cost;
        pending.push({ at: t + 60, items: Object.entries(order).map(([p, n]) => [p, n * 10]) });
        buyCd = 90;
      }
    }
    // Ruta de la tienda automática con $40 de reserva para género.
    const next = ORDER.find((id) => !has(id));
    if (next && stageOk(next) && g.state.money >= priceOf(next) + 40) {
      const before = g.state.money;
      if (window.__simDefs.STAFF[next]) { g.state.money -= priceOf(next); shop.hire(next); }
      else { g.state.money -= priceOf(next); shop.upgrades.add(next); shop.refreshFixtures();
        if (next === "fachada") shop.reputation = Math.min(100, shop.reputation + 10); }
      times[next] = Math.round(t / 6) / 10;
      void before;
    }
    if (Math.round(t / dt) % Math.round(60 / dt) === 0)
      sample.push({ min: Math.round(t / 60), money: Math.round(g.state.money), revenue: Math.round(g.state.stats.revenue), sales: g.state.stats.sales, rep: Math.round(shop.reputation) });
    if (!next) break;
  }
  return { times, minutes: Math.round(t / 6) / 10, arrived, fromStreet,
    perMinute: Math.round((arrived / (t / 60)) * 100) / 100, sales: g.state.stats.sales, revenue: Math.round(g.state.stats.revenue), sample, extra: window.__simReport?.() };
};
