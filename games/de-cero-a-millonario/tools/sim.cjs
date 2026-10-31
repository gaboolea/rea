// Ejecuta el jugador simulado en Chromium sin pantalla contra el servidor
// del juego: node tools/sim.cjs [url] [minutos] [repeticiones]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const url = process.argv[2] ?? "http://localhost:8080/";
const minutes = Number(process.argv[3] ?? 200);
const runs = Number(process.argv[4] ?? 3);
(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const results = [];
  for (let i = 0; i < runs; i++) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(url, { timeout: 300000, waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ timeout: 300000, waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.game && !document.getElementById("loading"), null, { timeout: 300000 });
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "simplayer.js"), "utf8") });
    await page.evaluate(async () => {
      const c = await import("/src/config.js");
      window.__simDefs = c;
    });
    const t0 = Date.now();
    const r = await page.evaluate((m) => window.__simRun({ minutes: m }), minutes);
    r.wallSeconds = Math.round((Date.now() - t0) / 1000);
    r.errors = errors;
    delete r.sample;
    console.log(JSON.stringify(r));
    results.push(r);
    await page.close();
  }
  await browser.close();
  const med = (k) => { const v = results.map((r) => r.times[k]).filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
  console.log("MEDIANA", JSON.stringify({ reponedor: med("reponedor"), cinta: med("cinta"), fachada: med("fachada"), planta2: med("planta2") }));
})();
