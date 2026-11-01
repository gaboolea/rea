// Rendimiento: tiempo de arranque, triángulos y llamadas de dibujo en
// varios sitios, memoria JS y memoria de los procesos de Chromium.
// Uso: node tools/perf.cjs [url] [repeticiones]
// Se mide con SwiftShader (render por CPU): los tiempos no son los de una
// GPU real ni los de un móvil; sirven para comparar antes y después.
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const url = process.argv[2] ?? "http://localhost:8080/";
const runs = Number(process.argv[3] ?? 3);

function chromiumRssMB() {
  try {
    const out = execSync("ps -eo rss,comm | grep -i chrom", { encoding: "utf8" });
    return Math.round(out.split("\n").filter(Boolean).reduce((a, l) => a + Number(l.trim().split(/\s+/)[0]), 0) / 1024);
  } catch {
    return null;
  }
}

(async () => {
  const results = [];
  for (let i = 0; i < runs; i++) {
    const browser = await chromium.launch({
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-precise-memory-info"],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const t0 = Date.now();
    await page.goto(url, { timeout: 300000, waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.game && !document.getElementById("loading"), null, { timeout: 300000 });
    const boot = Date.now() - t0;
    const r = await page.evaluate(() => {
      const g = window.game;
      g.renderer.setAnimationLoop(null);
      g.startPlay(true);
      const spots = {
        tienda: g.businesses.tienda.building.doorPoint(6),
        comercial: { x: 0, z: -100 },
        residencial: { x: 0, z: 110 },
        financiero: { x: -251, z: 20 },
      };
      const out = {};
      for (const [name, p] of Object.entries(spots)) {
        g.player.teleport(p.x, p.z, Math.PI);
        for (let k = 0; k < 45; k++) g.step(1 / 15);
        g.renderer.info.reset();
        g.renderer.info.autoReset = false;
        const t = performance.now();
        g.updateOcclusion();
        g.renderer.render(g.scene, g.camera);
        const frame = performance.now() - t;
        out[name] = {
          triangles: g.renderer.info.render.triangles,
          calls: g.renderer.info.render.calls,
          frameMs: Math.round(frame),
        };
        g.renderer.info.autoReset = true;
      }
      // Simulación sin dibujar (CPU del juego): 600 pasos de 1/15 s.
      g.player.teleport(spots.tienda.x, spots.tienda.z, Math.PI);
      const t = performance.now();
      for (let k = 0; k < 600; k++) g.step(1 / 15);
      out.stepMs = Math.round(((performance.now() - t) / 600) * 100) / 100;
      out.heapMB = Math.round(performance.memory.usedJSHeapSize / 1048576);
      out.geometries = g.renderer.info.memory.geometries;
      out.textures = g.renderer.info.memory.textures;
      return out;
    });
    r.bootMs = boot;
    r.chromiumRssMB = chromiumRssMB();
    r.errors = errors.slice(0, 5);
    console.log(JSON.stringify(r));
    results.push(r);
    await browser.close();
  }
  const med = (f) => {
    const v = results.map(f).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  console.log(
    "MEDIANA",
    JSON.stringify({
      bootMs: med((r) => r.bootMs),
      stepMs: med((r) => r.stepMs),
      heapMB: med((r) => r.heapMB),
      chromiumRssMB: med((r) => r.chromiumRssMB),
      tienda: { triangles: med((r) => r.tienda.triangles), calls: med((r) => r.tienda.calls) },
      comercial: { triangles: med((r) => r.comercial.triangles), calls: med((r) => r.comercial.calls) },
      financiero: { triangles: med((r) => r.financiero.triangles), calls: med((r) => r.financiero.calls) },
    }),
  );
})();
