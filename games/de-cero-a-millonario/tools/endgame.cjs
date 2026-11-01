// Equilibrio de la etapa Magnate: mide con el código real del juego cuánto
// gana por minuto una tienda completa y automática (camión propio, cinta,
// todas las ampliaciones) y proyecta cuánto se tarda en llegar al millón:
// - antes: solo con la tienda (como estaba el juego);
// - ahora: comprando franquicias en cuanto se puede, la Torre Imperio y
//   metiendo el resto en el Fondo Millonario.
// Uso: node tools/endgame.cjs [url] [minutos medidos]
const { chromium } = require("playwright");
const url = process.argv[2] ?? "http://localhost:8080/";
const minutes = Number(process.argv[3] ?? 40);

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, { timeout: 300000, waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ timeout: 300000, waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.game && !document.getElementById("loading"), null, { timeout: 300000 });
  const r = await page.evaluate(async (minutes) => {
    const g = window.game;
    const cfg = await import("/src/config.js");
    g.renderer.setAnimationLoop(null);
    g.mode = "play";
    const shop = g.businesses.tienda;
    g.state.stats.revenue = cfg.STAGES[3].revenue;
    for (const id of ["estanteria1", "estanteria2", "refrigerador", "congelador", "caja2", "ampliacion", "estanteria3", "estanteria4", "plantas", "letrero", "suelo", "camion", "cinta", "fachada", "planta2"])
      shop.upgrades.add(id);
    shop.refreshFixtures();
    shop.reputation = 80;
    shop.hire("reponedor");
    shop.hire("cajero");
    shop.addToStorage("agua", 60);
    g.state.money = 3000;
    const door = shop.building.doorPoint(1.5);
    g.player.teleport(door.x, door.z, 0);
    const dt = 1 / 15;
    // Calentamiento: 10 minutos para que el camión y la cinta llenen todo.
    for (let i = 0; i < 15 * 600; i++) {
      g.player.pos.x = door.x; g.player.pos.z = door.z;
      g.stepWorld(dt, false); g.automation.update(dt); g.advanceClock(dt);
    }
    const m0 = g.state.money;
    const r0 = g.state.stats.revenue;
    const s0 = g.state.stats.sales;
    for (let i = 0; i < 15 * 60 * minutes; i++) {
      g.player.pos.x = door.x; g.player.pos.z = door.z;
      g.stepWorld(dt, false); g.automation.update(dt); g.advanceClock(dt);
    }
    const net = (g.state.money - m0) / minutes;
    // Proyección hasta el millón desde la entrada en la etapa Magnate
    // (patrimonio inicial: dinero + 80 % de lo comprado ≈ 6.000).
    const start = 6000;
    const before = (1e6 - start) / net;
    // Estrategia: franquicias en cuanto se pueda, torre (con 3), y el
    // dinero sobrante al fondo cada minuto (dejando $500).
    let money = start, units = 0, fr = 0, tower = false, t = 0;
    const worth = () => money + units * cfg.fundPrice(t) + (() => { let w = 0; for (let i = 0; i < fr; i++) w += cfg.franchisePrice(i) * 0.8; return w; })() + (tower ? cfg.EMPIRE.tower.price * 0.8 : 0);
    const log = [];
    while (worth() < 1e6 && t < 100000) {
      money += net + cfg.empireIncome({ franchises: fr, tower }) * 60;
      t += 1;
      // Vende participaciones si hacen falta para la siguiente compra.
      const target = fr < cfg.EMPIRE.franchises ? cfg.franchisePrice(fr) : !tower ? cfg.EMPIRE.tower.price : Infinity;
      if (money + units * cfg.fundPrice(t) >= target && target < Infinity) {
        money += units * cfg.fundPrice(t);
        units = 0;
        money -= target;
        if (fr < cfg.EMPIRE.franchises) fr++; else tower = true;
        log.push(`${Math.round(t)} min: ${fr < cfg.EMPIRE.franchises || !tower ? "franquicia " + fr : "torre"}`);
      } else if (money > 1500) {
        units += (money - 500) / cfg.fundPrice(t);
        money = 500;
      }
    }
    return {
      measuredMinutes: minutes,
      netPerMinute: Math.round(net * 100) / 100,
      revenuePerMinute: Math.round(((g.state.stats.revenue - r0) / minutes) * 100) / 100,
      salesPerMinute: Math.round(((g.state.stats.sales - s0) / minutes) * 100) / 100,
      hoursToMillionBefore: Math.round((before / 60) * 10) / 10,
      hoursToMillionNow: Math.round((t / 60) * 10) / 10,
      purchases: log,
    };
  }, minutes);
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();
