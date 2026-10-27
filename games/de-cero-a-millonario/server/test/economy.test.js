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
