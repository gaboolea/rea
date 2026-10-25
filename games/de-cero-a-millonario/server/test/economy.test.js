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
