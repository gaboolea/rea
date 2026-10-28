// Pruebas de las reglas económicas autoritativas.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as eco from "../economy.js";

const city = () => ({
  code: "TEST1",
  warehouse: eco.newWarehouse(),
  exclusive: {},
});

test("comprar mercadería descuenta dinero, suma inventario y vacía el almacén", () => {
  const cp = eco.newCityProfile();
  const c = city();
  const r = eco.buySupplies(cp, c, { order: { agua: 2 }, deliver: null });
  assert.equal(r.ok, true);
  assert.equal(r.cost, 16);
  assert.equal(cp.money, 134);
  assert.equal(cp.ledger.agua, 12 + 20);
  assert.equal(c.warehouse.agua, eco.WAREHOUSE_MAX - 2);
});

test("no se puede comprar sin dinero ni cantidades inválidas", () => {
  const cp = eco.newCityProfile();
  cp.money = 5;
  assert.equal(eco.buySupplies(cp, city(), { order: { agua: 1 } }).ok, false);
  cp.money = 999;
  assert.equal(eco.buySupplies(cp, city(), { order: { agua: -3 } }).ok, false);
  assert.equal(eco.buySupplies(cp, city(), { order: { agua: 1.5 } }).ok, false);
  assert.equal(eco.buySupplies(cp, city(), { order: { oro: 1 } }).ok, false);
  assert.equal(cp.money, 999);
});

test("una venta exige existencias y precio razonable", () => {
  const cp = eco.newCityProfile();
  const t = 1e6;
  assert.equal(
    eco.sale(cp, { biz: "tienda", items: [{ p: "agua", price: 1000 }] }, t).ok,
    false,
  );
  assert.equal(
    eco.sale(cp, { biz: "tienda", items: [{ p: "cereal", price: 4 }] }, t).ok,
    false,
  );
  const r = eco.sale(
    cp,
    {
      biz: "tienda",
      items: [
        { p: "agua", price: 2 },
        { p: "agua", price: 2 },
      ],
    },
    t,
  );
  assert.equal(r.ok, true);
  assert.equal(cp.money, 154);
  assert.equal(cp.ledger.agua, 10);
  assert.equal(
    eco.sale(cp, { biz: "cafeteria", items: [{ p: "agua", price: 2 }] }, t).ok,
    false,
  );
});

test("las ventas tienen límite de frecuencia", () => {
  const cp = eco.newCityProfile();
  cp.ledger.agua = 100;
  let ok = 0;
  for (let i = 0; i < 30; i++)
    if (
      eco.sale(cp, { biz: "tienda", items: [{ p: "agua", price: 2 }] }, 5000).ok
    )
      ok++;
  assert.ok(ok <= 8, `se aceptaron ${ok} ventas en el mismo instante`);
});

test("un local exclusivo solo lo compra el primero", () => {
  const c = city();
  const a = eco.newCityProfile();
  const b = eco.newCityProfile();
  for (const p of [a, b]) {
    p.money = 5000;
    p.stats.revenue = 5000;
  }
  assert.equal(eco.buyBusiness(a, c, "A", { biz: "cafeteria" }).ok, true);
  const r = eco.buyBusiness(b, c, "B", { biz: "cafeteria" });
  assert.equal(r.ok, false);
  assert.equal(b.money, 5000);
  assert.equal(c.exclusive.cafeteria, "A");
});

test("las recompensas de misión solo se cobran una vez y en orden", () => {
  const cp = eco.newCityProfile();
  assert.equal(eco.claimMission(cp, { index: 0 }).ok, true);
  assert.equal(eco.claimMission(cp, { index: 0 }).ok, false);
  assert.equal(eco.claimMission(cp, { index: 5 }).ok, false);
  assert.equal(cp.mission, 1);
});

test("la compra entre jugadores mueve dinero y unidades sin duplicar", () => {
  const buyer = eco.newCityProfile();
  const seller = eco.newCityProfile();
  const shop = {
    open: true,
    prices: { agua: 2.5 },
    displays: [["s1", "agua", 12]],
  };
  const r = eco.p2pBuy(buyer, seller, shop, { display: "s1", units: 5 });
  assert.equal(r.ok, true);
  assert.equal(buyer.money + seller.money, 300);
  assert.equal(buyer.ledger.agua + seller.ledger.agua, 24);
  assert.equal(shop.displays[0][2], 7);
  shop.open = false;
  assert.equal(
    eco.p2pBuy(buyer, seller, shop, { display: "s1", units: 5 }).ok,
    false,
  );
});

test("los gastos del día se cobran al cerrar el día", () => {
  const cp = eco.newCityProfile();
  cp.businesses.tienda.employees.push("cajero");
  cp.dayElapsed = 299;
  const report = eco.tickDay(cp, 1);
  assert.equal(report.expenses, 15 + 22);
  assert.equal(cp.money, 150 - 37);
  assert.equal(cp.day, 2);
});

test("la casita se compra una vez y trae muebles básicos colocados", () => {
  const cp = eco.newCityProfile();
  cp.money = 300;
  const r = eco.buyHome(cp);
  assert.equal(r.ok, true);
  assert.equal(cp.money, 50);
  assert.equal(cp.home.owned, true);
  assert.ok(cp.home.layout.length > 0);
  assert.equal(eco.buyHome(cp).ok, false);
});

test("los muebles exigen casa, dinero, etapa y que quepan", () => {
  const cp = eco.newCityProfile();
  cp.money = 5000;
  assert.equal(eco.buyFurniture(cp, { id: "sofa" }).ok, false);
  eco.buyHome(cp);
  assert.equal(eco.buyFurniture(cp, { id: "sofa" }).ok, true);
  assert.equal(cp.furniture.sofa, 1);
  assert.equal(eco.buyFurniture(cp, { id: "cama_doble" }).ok, false);
  assert.equal(eco.buyFurniture(cp, { id: "__proto__" }).ok, false);
  cp.money = 1;
  assert.equal(eco.buyFurniture(cp, { id: "sofa" }).ok, false);
});

test("la distribución de la casa se valida entera en el servidor", () => {
  const cp = eco.newCityProfile();
  cp.money = 5000;
  eco.buyHome(cp);
  eco.buyFurniture(cp, { id: "sofa" });
  const base = cp.home.layout;
  const ok = [...base, { f: "sofa", x: 2.5, z: 3.4, r: 2 }];
  assert.equal(eco.setHome(cp, { layout: ok, open: true }).ok, true);
  assert.equal(cp.home.open, true);
  // Tapar la puerta, muebles no comprados o fuera de la casa: no.
  const door = [...base, { f: "sofa", x: 0, z: 3.4, r: 0 }];
  assert.equal(eco.setHome(cp, { layout: door }).ok, false);
  const extra = [...ok, { f: "sofa", x: -2.5, z: 3.4, r: 0 }];
  assert.equal(eco.setHome(cp, { layout: extra }).ok, false);
  const out = [...base, { f: "sofa", x: 40, z: 3, r: 0 }];
  assert.equal(eco.setHome(cp, { layout: out }).ok, false);
  assert.equal(cp.home.layout.length, ok.length);
});

test("vehículos: etapa, dinero, distrito financiero y grúa", () => {
  const cp = eco.newCityProfile();
  cp.money = 50;
  assert.equal(eco.buyItem(cp, {}, "p1", { id: "bici" }).ok, false);
  assert.equal(eco.buyItem(cp, {}, "p1", { id: "moto" }).ok, false);
  assert.equal(eco.buyItem(cp, {}, "p1", { id: "skate" }).ok, true);
  assert.equal(cp.items.skate, true);
  cp.money = 99999;
  cp.stats.revenue = 999999;
  assert.equal(eco.buyItem(cp, {}, "p1", { id: "lujo" }).ok, false);
  cp.unlocked.financiero = true;
  assert.equal(eco.buyItem(cp, {}, "p1", { id: "lujo" }).ok, true);
  assert.equal(eco.tow(cp, { id: "lujo" }).ok, true);
  assert.equal(eco.tow(cp, { id: "moto" }).ok, false);
});

test("los perfiles anteriores a la expansión se completan al cargarse", () => {
  const cp = eco.newCityProfile();
  delete cp.home;
  delete cp.furniture;
  eco.upgradeProfile(cp);
  assert.equal(cp.home.owned, false);
  assert.deepEqual(cp.furniture, {});
});

test("el distrito financiero solo se abre con las ventas pedidas", () => {
  const cp = eco.newCityProfile();
  assert.equal(eco.unlock(cp, { zone: "financiero" }).ok, false);
  assert.equal(cp.unlocked.financiero, undefined);
  cp.stats.revenue = 1500;
  assert.equal(eco.unlock(cp, { zone: "financiero" }).ok, true);
  assert.equal(cp.unlocked.financiero, true);
  assert.equal(eco.unlock(cp, { zone: "luna" }).ok, false);
});

test("tienda automática: personal antes del camión, mantenimiento y reparto", () => {
  const cp = eco.newCityProfile();
  cp.money = 5000;
  cp.stats.revenue = 500;
  const up = (id) => eco.buyUpgrade(cp, { biz: "tienda", id }).ok;
  assert.equal(up("camion"), false);
  cp.businesses.tienda.employees.push("reponedor", "cajero");
  assert.equal(up("cinta"), false);
  assert.equal(up("camion"), true);
  assert.equal(up("cinta"), true);
  assert.equal(eco.dailyExpenses(cp).total, 15 + 18 + 22 + 4 + 2);
  // Con camión propio el reparto a la tienda no cobra la tarifa.
  const before = cp.money;
  const r = eco.buySupplies(cp, city(), {
    order: { agua: 1 },
    deliver: "tienda",
  });
  assert.equal(r.cost, 8);
  assert.equal(cp.money, before - 8);
});

test("la caja fuerte guarda lo ganado fuera con límite y se cobra una vez", () => {
  const cp = eco.newCityProfile();
  const t0 = 1_000_000;
  // Sin automatizar no gana nada mientras no estás.
  eco.accrueIdle(cp, t0);
  assert.equal(eco.accrueIdle(cp, t0 + 60 * 60000).vault, 0);
  cp.businesses.tienda.employees.push("reponedor", "cajero");
  // Ausencias cortas no cuentan.
  assert.equal(eco.accrueIdle(cp, t0 + 61 * 60000).vault, 0);
  // 20 minutos a $0.5/min.
  assert.equal(eco.accrueIdle(cp, t0 + 81 * 60000).vault, 10);
  // Tope de 30 minutos del nivel 2, aunque falte un día.
  assert.equal(eco.accrueIdle(cp, t0 + 2000 * 60000).vault, 15);
  const money = cp.money;
  assert.equal(eco.collectVault(cp).total, 15);
  assert.equal(cp.money, money + 15);
  assert.equal(eco.collectVault(cp).ok, false);
});

test("los alimentos nuevos se compran y las ciudades antiguas los reciben", () => {
  const cp = eco.newCityProfile();
  const old = { ...city(), warehouse: { agua: 30, galletas: 30 } };
  assert.equal(eco.buySupplies(cp, old, { order: { pan: 1 } }).ok, false);
  eco.upgradeWarehouse(old.warehouse);
  assert.equal(old.warehouse.agua, 30);
  const r = eco.buySupplies(cp, old, { order: { pan: 1, arroz: 1 } });
  assert.equal(r.ok, true);
  assert.equal(cp.ledger.pan, 10);
  assert.equal(old.warehouse.arroz, eco.WAREHOUSE_MAX - 1);
  // Los de etapa Comerciante siguen bloqueados al principio.
  assert.equal(eco.buySupplies(cp, old, { order: { aceite: 1 } }).ok, false);
  // El cruasán es de la cafetería.
  assert.equal(eco.buySupplies(cp, old, { order: { croissant: 1 } }).ok, false);
});

test("suceso del ladrón: se lleva género y solo se recupera alcanzándolo", async () => {
  const { thiefAt, THIEF_PATHS, thiefSeconds } = await import(
    "../../src/surprises.js"
  );
  const cp = eco.newCityProfile();
  const t0 = 1e7;
  // El cliente no puede inventarse el robo de lo que no tiene.
  assert.equal(
    eco.surpriseStart(
      cp,
      "tienda",
      { types: ["ladron"], steal: { product: "agua", units: 50 } },
      t0,
    ).ok,
    false,
  );
  const r = eco.surpriseStart(
    cp,
    "tienda",
    { types: ["ladron"], steal: { product: "agua", units: 5 } },
    t0,
  );
  assert.equal(r.ok, true);
  assert.equal(r.surprise.type, "ladron");
  assert.equal(cp.ledger.agua, 7);
  // Otro suceso mientras tanto: no.
  assert.equal(
    eco.surpriseStart(cp, "tienda", { types: ["cartera"] }, t0 + 1000).ok,
    false,
  );
  // Lejos del ladrón no cuenta.
  assert.equal(
    eco.surpriseStep(cp, { x: 60, z: -100 }, 0, t0 + 6000).ok,
    false,
  );
  // Junto a él (según el camino compartido), sí.
  const q = thiefAt(THIEF_PATHS.tienda, 6);
  const money = cp.money;
  const ok = eco.surpriseStep(cp, { x: q.x + 1, z: q.z }, 0, t0 + 6000);
  assert.equal(ok.ok, true);
  assert.equal(ok.done, true);
  assert.equal(cp.ledger.agua, 12);
  assert.equal(cp.money, money + ok.reward);
  assert.equal(cp.stats.thieves, 1);
  assert.equal(cp.surprise, null);
  // Ya cobrado: no se paga dos veces.
  assert.equal(
    eco.surpriseStep(cp, { x: q.x, z: q.z }, 0, t0 + 6100).ok,
    false,
  );

  // Si escapa, el género se pierde.
  const t1 = t0 + 200000;
  eco.surpriseStart(
    cp,
    "tienda",
    { types: ["ladron"], steal: { product: "galletas", units: 4 } },
    t1,
  );
  const end = thiefAt(THIEF_PATHS.tienda, 99);
  const late = t1 + (thiefSeconds(THIEF_PATHS.tienda) + 1) * 1000;
  assert.equal(eco.surpriseStep(cp, { x: end.x, z: end.z }, 0, late).ok, false);
  assert.equal(cp.ledger.galletas, 8);
});

test("suceso de buscar y devolver: hay que pasar por cada punto en orden", () => {
  const cp = eco.newCityProfile();
  const t0 = 2e7;
  assert.equal(
    eco.surpriseStart(cp, "tienda", { types: ["oro"] }, t0).ok,
    false,
  );
  const r = eco.surpriseStart(cp, "tienda", { types: ["perro"] }, t0);
  assert.equal(r.ok, true);
  const [find, owner] = r.surprise.stops;
  const at = ([x, z]) => ({ x, z });
  // Ir directamente al dueño no vale.
  assert.equal(eco.surpriseStep(cp, at(owner), 0, t0 + 5000).ok, false);
  assert.deepEqual(eco.surpriseStep(cp, at(find), 0, t0 + 5000), {
    ok: true,
    step: 1,
  });
  const money = cp.money;
  const done = eco.surpriseStep(cp, at(owner), 2, t0 + 9000);
  assert.equal(done.done, true);
  // La recompensa sube con la etapa (Empresario: × 2,5).
  assert.equal(done.reward, Math.round(45 * 2.5));
  assert.equal(cp.money, money + done.reward);
  assert.equal(cp.stats.surprises, 1);
  // Hay que esperar al siguiente.
  assert.equal(
    eco.surpriseStart(cp, "tienda", { types: ["perro"] }, t0 + 10000).ok,
    false,
  );
});

test("objetivos de sucesos: se pagan con las estadísticas del servidor", () => {
  const cp = eco.newCityProfile();
  assert.equal(eco.claimGoal(cp, { id: "heroe" }).ok, false);
  cp.stats.thieves = 3;
  const r = eco.claimGoal(cp, { id: "heroe" });
  assert.equal(r.ok, true);
  assert.equal(r.reward, 150);
  assert.equal(eco.claimGoal(cp, { id: "heroe" }).ok, false);
});
