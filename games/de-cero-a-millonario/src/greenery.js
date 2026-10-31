// Vegetación de relleno: arbustos, macizos de flores, matas de hierba,
// piedras y algún árbol en el césped que se había quedado vacío. Se
// planta una sola vez al construir la ciudad, con semilla fija (todos los
// jugadores ven lo mismo), y solo donde el césped no tiene nada encima:
// ni aceras o suelos elevados, ni calles, ni colisiones, ni otros objetos.
// Los árboles necesitan mucho sitio libre y no se plantan en los parques
// por donde pasean los peatones. Arbustos, flores y piedras son
// decorativos (sin colisión). Todo se funde en pocas mallas por parcela.
import * as THREE from "three";
import { mesh, mergeParts, bakeGroup } from "./gfx.js";
import { seededRandom } from "./look.js";
import { ZONE1 } from "./physics.js";

// Arbustos y piedras proyectan sombra; flores y matas (muchas y bajitas),
// no: al fundirse por material, cada grupo es una malla distinta.
const PLANT_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.75,
});
const LOW_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.8,
});
// Lado de las parcelas en que se trocea la vegetación (así la cámara
// descarta las que no ve).
const TILE = 50;
// Separación de las rejillas de puntos candidatos (m): árboles y resto.
const TREE_SPACING = 7.5;
const SPACING = 3;
// Tamaño de celda del índice de huellas de objetos (m).
const CELL = 6;
// Lo que flota más alto que esto (nubes) no ocupa el suelo.
const HIGH = 12;

const GREENS = [0x3fa55a, 0x4bb05c, 0x5cc46b, 0x379a4f, 0x6fd67a];
const PETALS = [0xff5a6e, 0xffd23f, 0xffffff, 0xb18cff, 0xff8fc7, 0xff9f43];
const ROCKS = [0x9aa5b1, 0xb3bcc6, 0x8a929c];

const blob = (r, detail = 1) => new THREE.IcosahedronGeometry(r, detail);
// Piezas pequeñas con pocos triángulos (hay cientos de flores).
const bud = (r) => new THREE.OctahedronGeometry(r);
const stem = (h) => new THREE.CylinderGeometry(0.02, 0.02, h, 3, 1, true);

// Índice de las huellas (rectángulos XZ) de todas las mallas de la escena
// salvo el césped, para saber dónde no hay nada.
function footprints(scene) {
  scene.updateMatrixWorld(true);
  const cells = new Map();
  const add = (r) => {
    for (let x = Math.floor(r[0] / CELL); x <= Math.floor(r[2] / CELL); x++)
      for (let z = Math.floor(r[1] / CELL); z <= Math.floor(r[3] / CELL); z++) {
        const key = `${x},${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(r);
      }
  };
  const b = new THREE.Box3();
  scene.traverse((o) => {
    if (!o.isMesh || o.userData.ground) return;
    if (o.isInstancedMesh) {
      o.computeBoundingBox();
      b.copy(o.boundingBox);
    } else {
      o.geometry.boundingBox ?? o.geometry.computeBoundingBox();
      b.copy(o.geometry.boundingBox);
    }
    b.applyMatrix4(o.matrixWorld);
    if (b.isEmpty() || b.min.y > HIGH) return;
    if (b.max.x - b.min.x > 400 || b.max.z - b.min.z > 400) return;
    add([b.min.x, b.min.z, b.max.x, b.max.z]);
  });
  return {
    add,
    hits(x0, z0, x1, z1) {
      for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++)
        for (let z = Math.floor(z0 / CELL); z <= Math.floor(z1 / CELL); z++)
          for (const r of cells.get(`${x},${z}`) ?? [])
            if (r[0] < x1 && r[2] > x0 && r[1] < z1 && r[3] > z0) return true;
      return false;
    },
  };
}

const overlaps = (r, x0, z0, x1, z1) =>
  r[0] < x1 && r[2] > x0 && r[1] < z1 && r[3] > z0;
const inside = (r, x, z) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];

// ¿Hay césped libre en un cuadrado de lado 2·clear alrededor de (x, z)?
function freeGrass(world, prints, x, z, clear) {
  const [x0, z0, x1, z1] = [x - clear, z - clear, x + clear, z + clear];
  if (prints.hits(x0, z0, x1, z1)) return false;
  const ph = world.physics;
  for (const [px, pz] of [
    [x, z],
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ])
    if (ph.groundHeight(px, pz) > 0.01) return false;
  for (const c of ph.near(x0, z0, x1, z1))
    if (c.minX < x1 && c.maxX > x0 && c.minZ < z1 && c.maxZ > z0) return false;
  for (const r of [...world.roads, ...world.crosswalks])
    if (overlaps(r, x0 - 0.5, z0 - 0.5, x1 + 0.5, z1 + 0.5)) return false;
  if (!world.mapRects.some((m) => m.kind === "grass" && inside(m.rect, x, z)))
    return false;
  return !world.mapRects.some(
    (m) => m.kind !== "grass" && m.rect && overlaps(m.rect, x0, z0, x1, z1),
  );
}

// Formas: tamaño, sombra y build() (geometría con colores por vértice),
// que solo se construye si la pieza cabe.
function bush(r) {
  const s = 0.5 + r() * 0.45;
  return { size: 0.8 * s, shadow: true, build: () => bushGeo(r, s) };
}

function bushGeo(r, s) {
  const parts = [];
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const d = i ? 0.35 * s : 0;
    const g = blob((i ? 0.42 : 0.55) * s).scale(1, 0.85, 1);
    parts.push([
      g,
      Math.cos(a) * d,
      (i ? 0.38 : 0.5) * s,
      Math.sin(a) * d,
      0,
      GREENS[Math.floor(r() * GREENS.length)],
    ]);
  }
  // Algunos arbustos tienen flores o bayas.
  if (r() < 0.35) {
    const c = PETALS[Math.floor(r() * PETALS.length)];
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2;
      parts.push([
        bud(0.08),
        Math.cos(a) * 0.5 * s,
        (0.45 + r() * 0.35) * s,
        Math.sin(a) * 0.5 * s,
        0,
        c,
      ]);
    }
  }
  return mergeParts(parts);
}

const flowers = (r) => ({
  size: 0.7,
  shadow: false,
  build: () => flowersGeo(r),
});

function flowersGeo(r) {
  const parts = [];
  const c1 = PETALS[Math.floor(r() * PETALS.length)];
  const c2 = PETALS[Math.floor(r() * PETALS.length)];
  const n = 5 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * 1.1;
    const z = (r() - 0.5) * 1.1;
    const h = 0.25 + r() * 0.25;
    parts.push([stem(h), x, h / 2, z, 0, 0x3f9a4a]);
    parts.push([bud(0.11), x, h + 0.04, z, r() * 3, r() < 0.6 ? c1 : c2]);
  }
  for (let i = 0; i < 2; i++)
    parts.push([
      blob(0.16, 0).scale(1.3, 0.5, 1),
      (r() - 0.5) * 0.9,
      0.06,
      (r() - 0.5) * 0.9,
      r() * 3,
      GREENS[i % GREENS.length],
    ]);
  return mergeParts(parts);
}

const tuft = (r) => ({
  size: 0.35,
  shadow: false,
  build: () => tuftGeo(r),
});

function tuftGeo(r) {
  const parts = [];
  const c = GREENS[Math.floor(r() * GREENS.length)];
  for (let i = 0; i < 5; i++) {
    const h = 0.25 + r() * 0.3;
    const cone = new THREE.ConeGeometry(0.05, h, 4);
    cone.rotateX((r() - 0.5) * 0.6);
    cone.rotateZ((r() - 0.5) * 0.6);
    parts.push([
      cone,
      (r() - 0.5) * 0.35,
      h / 2,
      (r() - 0.5) * 0.35,
      r() * 3,
      c,
    ]);
  }
  return mergeParts(parts);
}

const rock = (r) => ({
  size: 0.5,
  shadow: true,
  build: () => rockGeo(r),
});

function rockGeo(r) {
  const parts = [];
  const n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const g = blob(0.22 + r() * 0.25, 0).scale(1, 0.6, 0.85);
    parts.push([
      g,
      i ? (r() - 0.5) * 0.7 : 0,
      0.08,
      i ? (r() - 0.5) * 0.7 : 0,
      r() * 3,
      ROCKS[Math.floor(r() * ROCKS.length)],
    ]);
  }
  return mergeParts(parts);
}

// Manchas de 0 a 1: unas zonas más frondosas que otras (bosquecillos).
const patch = (x, z) =>
  0.5 +
  0.5 *
    Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) *
    Math.cos(z * 0.09 - x * 0.03);

// Planta vegetación en el césped vacío del barrio y de cada zona nueva.
// kits: los CityKit de las zonas nuevas (antes de fundir su decoración).
// Primero los árboles (necesitan claros grandes) y después arbustos,
// flores, matas y piedras alrededor. Devuelve cuántas piezas de cada tipo
// se han puesto y sus vértices.
export function plantGreenery(world, kits) {
  const prints = footprints(world.scene);
  const rnd = seededRandom(20261031);
  const count = { tree: 0, bush: 0, flowers: 0, tuft: 0, rock: 0, verts: 0 };
  const areas = [
    {
      rect: [
        ZONE1.minX + 1.5,
        ZONE1.minZ + 1.5,
        ZONE1.maxX - 1.5,
        ZONE1.maxZ - 1.5,
      ],
      kit: null,
      palms: false,
    },
    ...kits.map((kit) => ({
      rect: kit.zone.rect.map((v, i) => v + (i < 2 ? 1.5 : -1.5)),
      kit,
      palms: kit.zone.id === "financiero",
    })),
  ];
  // Puntos de una rejilla con algo de desorden.
  const grid = ([x0, z0, x1, z1], step, fn) => {
    for (let gx = x0; gx < x1; gx += step)
      for (let gz = z0; gz < z1; gz += step)
        fn(gx + (rnd() - 0.5) * step * 0.7, gz + (rnd() - 0.5) * step * 0.7);
  };
  for (const area of areas) {
    const tiles = new Map();
    const tile = (x, z) => {
      const key = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
      if (!tiles.has(key)) tiles.set(key, new THREE.Group());
      return tiles.get(key);
    };
    // 1) Árboles en grupos donde la mancha es frondosa.
    // Sobre todo pinos y abedules: pocos triángulos para tantos árboles.
    const kinds = area.palms
      ? ["palmera", "palmera", "pino", "abedul"]
      : ["pino", "pino", "pino", "abedul", "abedul", "frondoso", "cerezo"];
    grid(area.rect, TREE_SPACING, (x, z) => {
      if (rnd() > (patch(x, z) > 0.55 ? 0.7 : 0.1)) return;
      if (world.parkAreas.some((p) => overlaps(p, x - 4, z - 4, x + 4, z + 4)))
        return;
      if (!freeGrass(world, prints, x, z, 2.6)) return;
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      const s = 0.8 + rnd() * 0.35;
      // world.tree añade a world.scene: aquí, a la parcela (se funde con
      // ella y no se mece, como los árboles de las zonas nuevas).
      const real = world.scene;
      world.scene = tile(x, z);
      try {
        world.tree(x, z, s, false, kind);
      } finally {
        world.scene = real;
      }
      prints.add([x - 1.3, z - 1.3, x + 1.3, z + 1.3]);
      count.tree++;
    });
    // 2) Arbustos, flores, matas y piedras.
    grid(area.rect, SPACING, (x, z) => {
      if (rnd() > 0.1 + 0.35 * patch(x, z)) return;
      const roll = rnd();
      const [make, kind] =
        roll < 0.4
          ? [bush, "bush"]
          : roll < 0.72
            ? [flowers, "flowers"]
            : roll < 0.9
              ? [tuft, "tuft"]
              : [rock, "rock"];
      const item = make(seededRandom(Math.floor(rnd() * 1e9)));
      if (!freeGrass(world, prints, x, z, item.size + 0.25)) return;
      const geo = item.build();
      const m = mesh(
        geo,
        item.shadow ? PLANT_MAT : LOW_MAT,
        x,
        0,
        z,
        item.shadow,
      );
      m.rotation.y = rnd() * Math.PI * 2;
      tile(x, z).add(m);
      prints.add([x - item.size, z - item.size, x + item.size, z + item.size]);
      count[kind]++;
      count.verts += geo.attributes.position.count;
    });
    // Cada parcela se funde en pocas mallas; en las zonas nuevas va en el
    // grupo de la zona (se oculta de lejos) y kit.bake no la vuelve a fundir.
    const trees = new Set();
    for (const group of tiles.values()) {
      for (const c of group.children) trees.add(c);
      const baked = bakeGroup(group, { shadows: true });
      baked.userData.baked = true;
      (area.kit ? area.kit.group : world.scene).add(baked);
    }
    world.treeTops = world.treeTops.filter((t) => !trees.has(t));
  }
  return count;
}
