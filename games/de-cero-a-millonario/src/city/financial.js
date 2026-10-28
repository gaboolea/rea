// Zona 4 · Distrito financiero: lejos, al oeste, al final de una avenida
// que sale del barrio inicial. Rascacielos, plazas, fuente, semáforos y
// una galería de lujo. Al principio la avenida está cortada por obras.
import * as THREE from "three";
import { mat, box, mesh, cylinder, signMesh, roundedBox } from "../gfx.js";
import { CityKit } from "./kit.js";
import { DISTRICT } from "../config.js";

export const FINANCIAL = { minX: -345, maxX: -228, minZ: -82, maxZ: 82 };
export const CROSS_X = -280;

export function buildFinancial(world) {
  const kit = new CityKit(world, {
    id: "financiero",
    name: "Distrito financiero",
    rect: [FINANCIAL.minX, FINANCIAL.minZ, -74, FINANCIAL.maxZ],
  });
  const { minX, maxX, minZ, maxZ } = FINANCIAL;
  kit.grass(minX, minZ, -94, maxZ);

  // Avenida del distrito: continúa la calle principal hacia el oeste.
  kit.road(-338, -4, CROSS_X - 4, 4);
  kit.road(CROSS_X + 4, -4, -80, 4);
  kit.road(CROSS_X - 4, minZ + 4, CROSS_X + 4, maxZ - 4);
  kit.sidewalk(CROSS_X + 4, -10, -80, -4);
  kit.sidewalk(CROSS_X + 4, 4, -80, 10);
  kit.sidewalk(-338, -10, CROSS_X - 4, -4);
  kit.sidewalk(-338, 4, CROSS_X - 4, 10);
  kit.sidewalk(CROSS_X - 10, minZ + 4, CROSS_X - 4, -10);
  kit.sidewalk(CROSS_X + 4, minZ + 4, CROSS_X + 10, -10);
  kit.sidewalk(CROSS_X - 10, 10, CROSS_X - 4, maxZ - 4);
  kit.sidewalk(CROSS_X + 4, 10, CROSS_X + 10, maxZ - 4);
  kit.crosswalk(CROSS_X - 11.5, 0, "x");
  kit.crosswalk(CROSS_X + 11.5, 0, "x");
  kit.crosswalk(CROSS_X, -13.5, "z");
  kit.crosswalk(CROSS_X, 13.5, "z");
  // Setos a los lados de la avenida (no se puede rodear la barrera) y
  // límites del distrito.
  kit.hedge(maxX, -12, -74, -11);
  kit.hedge(maxX, 11, -74, 12);
  kit.fence(minX, minZ - 0.2, maxX, minZ);
  kit.fence(minX, maxZ, maxX, maxZ + 0.2);
  kit.fence(minX - 0.2, minZ, minX, maxZ);
  kit.fence(maxX, minZ, maxX + 0.2, -12);
  kit.fence(maxX, 12, maxX + 0.2, maxZ);

  // Avenida: árboles y farolas a ambos lados.
  kit.inside(() => {
    let i = 0;
    for (let x = -86; x >= CROSS_X + 16; x -= 12) {
      world.lamp(x, -4.6, 0x7b5cff);
      world.lamp(x - 6, 4.6, 0x7b5cff);
      if (x !== -98) {
        world.tree(x - 3, -8.4, 0.8);
        world.tree(x - 9, 8.4, 0.8);
      }
      i++;
    }
  });

  // Plazas pavimentadas del distrito (todo el centro es peatonal).
  kit.plaza(CROSS_X + 10, -17, maxX - 1, -10);
  kit.plaza(CROSS_X + 10, 10, maxX - 1, 50);
  kit.plaza(minX + 1, 10, CROSS_X - 10, 22);
  kit.plaza(minX + 1, -22, CROSS_X - 10, -10);

  // Rascacielos: [x, z, ancho, fondo, alto, color, rótulo].
  const towers = [
    [-318, -45, 18, 18, 64, 0x3d8bff, "BANCO CENTRAL"],
    [-296, -66, 12, 12, 40, 0x2ec4c4, null],
    [-326, -72, 10, 10, 30, 0x9aa7b0, null],
    [-318, 45, 18, 16, 54, 0x7b5cff, "MILLONARIO CORP"],
    [-298, 66, 12, 12, 36, 0x34405c, null],
    [-334, 66, 9, 9, 26, 0x4fb3a0, null],
    [-250, -58, 16, 16, 58, 0x1f6fd6, "TORRE NEGOCIOS"],
    [-238, -74, 9, 9, 28, 0x9b6dff, null],
    [-252, 66, 18, 14, 70, 0x2f3b4e, "TORRE IMPERIO"],
    [-236, 58, 8, 8, 24, 0x2ec4c4, null],
  ];
  world.nightMats ??= [];
  kit.inside(() => {
    for (const [x, z, w, d, h, color, label] of towers) {
      const tower = skyscraper(w, d, h, color, label, world.nightMats);
      tower.position.set(x, 0, z);
      kit.add(tower);
      world.physics.addCentered(x, z, w, d);
      world.mapRects.push({
        kind: "tower",
        rect: [x - w / 2, z - d / 2, x + w / 2, z + d / 2],
      });
    }
    // Fuente grande y bancos en la plaza.
    world.fountain(-251, 30);
    world.bench(-262, 30, Math.PI / 2);
    world.bench(-240, 30, -Math.PI / 2);
    for (const [x, z] of [
      [-266, 18],
      [-236, 18],
      [-266, 44],
      [-236, 44],
    ])
      world.tree(x, z, 0.85, true, "palmera");
    // Arte urbano: escultura de moneda.
    const coin = new THREE.Group();
    coin.add(mesh(cylinder(1.2, 1.4, 1.2, 16), mat(0x9aa7b0), 0, 0.6, 0));
    const disc = mesh(
      cylinder(1.4, 1.4, 0.3, 32),
      mat(0xf2c230, { metalness: 0.6, roughness: 0.25 }),
      0,
      2.8,
      0,
    );
    disc.rotation.x = Math.PI / 2;
    coin.add(disc);
    coin.position.set(-304, 0.12, 16);
    kit.add(coin);
    world.physics.addCentered(-304, 16, 2.8, 2.8);
    world.spinners ??= [];
    world.spinners.push(disc);
    for (let x = -334; x <= -290; x += 11) {
      world.lamp(x, -10.6, 0x7b5cff);
      world.lamp(x, 10.6, 0x7b5cff);
    }
  });

  // Galería de lujo (tienda exclusiva).
  const lujo = kit.building("lujo", {
    style: "luxury",
    floors: 3,
    facade: "stone",
    windows: "arched",
    roof: "parapet",
    name: "Galería de Lujo",
    x: -251,
    z: -24,
    w: 18,
    d: 14,
    rot: 0,
    wallColor: 0x2f3542,
    trimColor: 0xf2c230,
    roofColor: 0x1d2b44,
    awning: ["#1d2b44", "#f2c230"],
    sign: "GALERÍA DE LUJO",
    signColors: { bg: "#1d2b44", fg: "#f2c230" },
    floor: ["#f4efe6", "#e8dfcf"],
  });

  const barrier = buildBarrier(kit, world);
  // Indicador al salir del barrio hacia el oeste.
  kit.inside(() => {
    const g = new THREE.Group();
    g.add(mesh(cylinder(0.1, 0.1, 3, 8), mat(0x3e4a59), 0, 1.5, 0));
    const s = signMesh("← DISTRITO FINANCIERO", 3.6, 0.7, {
      bg: "#1d2b44",
      fg: "#ffffff",
    });
    s.position.set(0, 2.7, 0.06);
    const back = s.clone();
    back.rotation.y = Math.PI;
    back.position.z = -0.06;
    g.add(s, back);
    g.position.set(-70, 0.12, -9.5);
    world.scene.add(g);
  });

  kit.poi(
    "distrito",
    "Distrito financiero",
    "🏙️",
    { x: -251, z: 8 },
    { locked: true },
  );
  kit.poi("barrera", "Obras · acceso al distrito", "🚧", {
    x: DISTRICT.barrierX + 3,
    z: 0,
  });
  kit.poi("lujo", "Galería de lujo", "💎", lujo.doorPoint(1.5), {
    locked: true,
  });
  world.exitPoints.push(
    { x: -336, z: -7, zone: "financiero" },
    { x: -336, z: 7, zone: "financiero" },
    { x: CROSS_X - 7, z: maxZ - 6, zone: "financiero" },
    { x: CROSS_X + 7, z: minZ + 6, zone: "financiero" },
  );
  world.visitShops.push(lujo);
  return { kit, lujo, barrier, towers };
}

// Obras que cortan la avenida: vallas, conos, máquina y el cartel con el
// requisito. open_() levanta las barreras y quita la colisión.
function buildBarrier(kit, world) {
  const x = DISTRICT.barrierX;
  const g = new THREE.Group();
  g.userData.dynamic = true; // se anima al abrirse: no se funde
  const arms = [];
  const stripe = new THREE.MeshStandardMaterial({
    map: stripes(),
    roughness: 0.6,
  });
  for (const z of [-7.2, -2.4, 2.4, 7.2]) {
    const post = mesh(box(0.3, 1.2, 0.3), mat(0x2f3542), x, 0.6, z + 2.2);
    g.add(post);
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.05, z + 2.2);
    const arm = mesh(box(0.18, 0.22, 4.6), stripe, 0, 0, -2.3);
    pivot.add(arm);
    g.add(pivot);
    arms.push(pivot);
  }
  const cones = new THREE.Group();
  for (let z = -9; z <= 9; z += 1.5) {
    const c = new THREE.Group();
    c.add(mesh(cylinder(0.04, 0.24, 0.65, 10), mat(0xff7a1a), 0, 0.33, 0));
    c.add(mesh(cylinder(0.13, 0.14, 0.08, 10), mat(0xffffff), 0, 0.35, 0));
    c.position.set(x + 1.6, 0.12, z);
    cones.add(c);
  }
  g.add(cones);
  // Excavadora de juguete detrás de la valla.
  const digger = new THREE.Group();
  digger.add(mesh(roundedBox(2.4, 1.2, 1.6, 0.2), mat(0xffc22e), 0, 0.9, 0));
  digger.add(mesh(roundedBox(1.2, 1.1, 1.3, 0.2), mat(0xffc22e), -0.4, 1.9, 0));
  digger.add(mesh(box(1.0, 0.7, 1.2), mat(0x9fd8ff), -0.4, 2.0, 0.1));
  const boom = mesh(box(2.4, 0.25, 0.25), mat(0xe0a100), 1.4, 2.2, 0);
  boom.rotation.z = -0.5;
  digger.add(boom);
  digger.add(mesh(box(2.6, 0.4, 1.8), mat(0x2b2b33), 0, 0.2, 0));
  digger.position.set(x - 6, 0, 6);
  digger.rotation.y = 0.6;
  cones.add(digger);
  // Cartel grande con el requisito (se actualiza desde el juego).
  const board = new THREE.Group();
  board.add(mesh(cylinder(0.12, 0.12, 4.2, 8), mat(0x3e4a59), 0, 2.1, -2.4));
  board.add(mesh(cylinder(0.12, 0.12, 4.2, 8), mat(0x3e4a59), 0, 2.1, 2.4));
  const sign = signMesh("DISTRITO FINANCIERO\nACCESO BLOQUEADO", 5.6, 2.2, {
    bg: "#1d2b44",
    fg: "#ffd23f",
    font: "bold 64px",
  });
  sign.rotation.y = Math.PI / 2;
  sign.position.set(0.08, 4.2, 0);
  board.add(sign);
  board.add(mesh(box(0.1, 2.3, 5.8), mat(0xffffff), 0, 4.2, 0));
  board.position.set(x + 3, 0, -7);
  g.add(board);
  kit.add(g);
  for (const dz of [-2.4, 2.4])
    world.physics.addCentered(x + 3, -7 + dz, 0.3, 0.3);
  const collider = world.physics.addBox(x - 0.4, -11, x + 2, 11);
  return {
    x,
    open: false,
    arms,
    cones,
    sign,
    collider,
    t: 0,
    // Texto del cartel: requisito y progreso real.
    setText(text) {
      if (text === this.text) return;
      this.text = text;
      const fresh = signMesh(text, 5.6, 2.2, {
        bg: this.open ? "#1e9e4a" : "#1d2b44",
        fg: this.open ? "#ffffff" : "#ffd23f",
        font: "bold 48px",
      });
      sign.material.map.dispose();
      sign.material.map = fresh.material.map;
      sign.material.needsUpdate = true;
    },
    // El desbloqueo es permanente: solo se abre.
    open_() {
      if (this.open) return;
      this.open = true;
      world.physics.remove(collider);
      cones.visible = false;
    },
    // Las barreras suben poco a poco al abrirse.
    update(dt) {
      const target = this.open ? 1.35 : 0;
      for (const a of arms)
        a.rotation.x += (target - a.rotation.x) * Math.min(1, dt * 2);
    },
  };
}

function stripes() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 8;
  const ctx = c.getContext("2d");
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "#ffffff" : "#e8392f";
    ctx.fillRect(i * 8, 0, 8, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  return tex;
}

// Rascacielos de cristal con ventanas (de noche se encienden algunas).
const towerTex = new Map();
function windowsTexture(color) {
  if (towerTex.has(color)) return towerTex.get(color);
  const size = 128;
  const make = (lit) => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    ctx.fillStyle = lit
      ? "#000000"
      : `#${new THREE.Color(color).getHexString()}`;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 4; x++) {
        const on = (x * 7 + y * 13) % 5 < 2;
        ctx.fillStyle = lit
          ? on
            ? "#ffd98a"
            : "#000000"
          : on
            ? "rgba(255,255,255,0.55)"
            : "rgba(255,255,255,0.28)";
        ctx.fillRect(x * 32 + 4, y * 16 + 3, 24, 10);
      }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  };
  const pair = [make(false), make(true)];
  towerTex.set(color, pair);
  return pair;
}

function skyscraper(w, d, h, color, label, nightMats) {
  const g = new THREE.Group();
  const [base, lit] = windowsTexture(color);
  const map = base.clone();
  const emissiveMap = lit.clone();
  for (const t of [map, emissiveMap]) {
    t.repeat.set(
      Math.max(1, Math.round(w / 6)),
      Math.max(1, Math.round(h / 8)),
    );
    t.needsUpdate = true;
  }
  const body = new THREE.MeshStandardMaterial({
    map,
    emissiveMap,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    roughness: 0.25,
    metalness: 0.35,
  });
  nightMats.push(body);
  g.add(mesh(box(w, h, d), body, 0, h / 2, 0));
  g.add(mesh(box(w + 0.6, 3.2, d + 0.6), mat(0xe8edf2), 0, 1.6, 0));
  g.add(mesh(box(w * 0.7, 2, d * 0.7), mat(0xdfe6ea), 0, h + 1, 0));
  g.add(mesh(cylinder(0.08, 0.08, 6, 6), mat(0xdfe6ea), 0, h + 5, 0));
  if (label) {
    const s = signMesh(label, Math.min(w - 2, 12), 1.6, {
      bg: "#ffffff",
      fg: "#1d2b44",
    });
    s.position.set(0, h - 3, d / 2 + 0.05);
    g.add(s);
    const back = s.clone();
    back.rotation.y = Math.PI;
    back.position.z = -d / 2 - 0.05;
    g.add(back);
  }
  return g;
}
