// Zona 2 · Zona comercial: al norte del barrio inicial, siguiendo la
// avenida que ya sale de la ciudad. Escaparates, tiendas físicas (ropa,
// vehículos, muebles, tecnología), gimnasio, plaza y aparcamiento.
import * as THREE from "three";
import { mat, box, mesh, cylinder, signMesh } from "../gfx.js";
import * as decor from "../decor.js";
import { toyCar } from "../vehicles.js";
import { CityKit } from "./kit.js";

export const COMMERCIAL = { minX: -66, maxX: 66, minZ: -164, maxZ: -48 };
const CROSS_Z = -100;

export function buildCommercial(world) {
  const kit = new CityKit(world, {
    id: "comercial",
    name: "Zona comercial",
    rect: [COMMERCIAL.minX, COMMERCIAL.minZ, COMMERCIAL.maxX, COMMERCIAL.maxZ],
  });
  const { minX, maxX, minZ } = COMMERCIAL;
  // El césped del barrio inicial llega hasta z = -68.
  kit.grass(minX, minZ, maxX, -68);
  // Avenida comercial (continúa la calle norte-sur) y calle transversal.
  kit.road(-4, -158, 4, -53);
  kit.road(-62, CROSS_Z - 4, -4, CROSS_Z + 4);
  kit.road(4, CROSS_Z - 4, 62, CROSS_Z + 4);
  kit.sidewalk(-7, -158, -4, CROSS_Z - 4);
  kit.sidewalk(-7, CROSS_Z + 4, -4, -54);
  kit.sidewalk(4, -158, 7, CROSS_Z - 4);
  kit.sidewalk(4, CROSS_Z + 4, 7, -54);
  kit.sidewalk(-62, CROSS_Z - 7, -7, CROSS_Z - 4);
  kit.sidewalk(7, CROSS_Z - 7, 62, CROSS_Z - 4);
  kit.sidewalk(-62, CROSS_Z + 4, -7, CROSS_Z + 7);
  kit.sidewalk(7, CROSS_Z + 4, 62, CROSS_Z + 7);
  kit.crosswalk(0, CROSS_Z - 8.5, "z");
  kit.crosswalk(0, CROSS_Z + 8.5, "z");
  kit.crosswalk(-10.5, CROSS_Z, "x");
  kit.crosswalk(10.5, CROSS_Z, "x");
  // Límites de la zona.
  kit.fence(minX - 0.2, minZ, minX, -48);
  kit.fence(maxX, minZ, maxX + 0.2, -48);
  kit.fence(minX, minZ - 0.2, maxX, minZ);

  // Arco de entrada.
  kit.inside(() => {
    const arch = decor.archSign("🛍️ ZONA COMERCIAL", 0xff7eb6, 15, 5.2);
    arch.position.set(0, 0, -57);
    kit.add(arch);
  });
  for (const s of [-1, 1]) world.physics.addCentered(s * 7.5, -57, 0.4, 0.4);

  // Tiendas. Las fachadas dan a la avenida (oeste: rot π/2, este: −π/2).
  const shops = {
    ropa: kit.building("ropa", {
      name: "Tienda de Ropa",
      x: -16,
      z: -72,
      w: 18,
      d: 16,
      rot: Math.PI / 2,
      wallColor: 0xfff0f6,
      trimColor: 0xff5fa2,
      roofColor: 0xff8fc0,
      awning: ["#ff5fa2", "#ffffff"],
      sign: "TIENDA DE ROPA",
      signColors: { bg: "#ffffff", fg: "#e0458b" },
      floor: ["#fbe9ef", "#f3d5e1"],
    }),
    vehiculos: kit.building("vehiculos", {
      name: "Vehículos",
      x: 19,
      z: -74,
      w: 22,
      d: 22,
      rot: -Math.PI / 2,
      doorW: 6,
      wallColor: 0xeef4ff,
      trimColor: 0x2f6fd6,
      roofColor: 0x4f8dff,
      awning: ["#2f6fd6", "#ffffff"],
      sign: "VEHÍCULOS",
      signColors: { bg: "#ffffff", fg: "#2f6fd6" },
      floor: ["#e8edf3", "#d9e1ea"],
    }),
    muebles: kit.building("muebles", {
      name: "Muebles y Decoración",
      x: -18,
      z: -132,
      w: 22,
      d: 20,
      rot: Math.PI / 2,
      wallColor: 0xfff6e5,
      trimColor: 0xc9782e,
      roofColor: 0xe0a25a,
      awning: ["#c9782e", "#fff1d6"],
      sign: "MUEBLES Y DECORACIÓN",
      signColors: { bg: "#fff1d6", fg: "#8a4b14" },
      floor: ["#f1e2c8", "#e6d2b0"],
    }),
    tecnologia: kit.building("tecnologia", {
      name: "Tecnología",
      x: 16,
      z: -132,
      w: 16,
      d: 16,
      rot: -Math.PI / 2,
      wallColor: 0xeefbfb,
      trimColor: 0x1f9fa8,
      roofColor: 0x2ec4c4,
      awning: ["#1d2b44", "#2ec4c4"],
      sign: "TECNOLOGÍA",
      signColors: { bg: "#1d2b44", fg: "#7ff3f3" },
      floor: ["#e6eef2", "#d6e2e8"],
    }),
    gimnasio: kit.building("gimnasio", {
      name: "Gimnasio",
      x: -36,
      z: -85,
      w: 14,
      d: 12,
      rot: Math.PI,
      wallColor: 0xfff7d6,
      trimColor: 0xff7a45,
      roofColor: 0xff9f43,
      awning: ["#ff7a45", "#1d2b44"],
      sign: "GIMNASIO",
      signColors: { bg: "#1d2b44", fg: "#ffd23f" },
      floor: ["#d9dde3", "#c9cfd8"],
    }),
  };
  kit.plaza(-44, CROSS_Z + 7, -28, -91);

  // Pista de pruebas del concesionario (sale de la calle transversal).
  kit.inside(() => {
    const lot = mesh(
      box(26, 0.04, 26),
      mat(0x5a6370, { roughness: 0.9 }),
      49,
      0.02,
      -77,
      false,
    );
    kit.add(lot);
    const white = mat(0xffffff);
    for (const [x, z, w, d] of [
      [49, -64.2, 24, 0.25],
      [49, -89.8, 24, 0.25],
      [36.2, -77, 0.25, 26],
      [61.8, -77, 0.25, 26],
    ])
      kit.add(mesh(box(w, 0.02, d), white, x, 0.045, z, false));
    const cone = (x, z) => {
      const c = new THREE.Group();
      c.add(mesh(cylinder(0.04, 0.22, 0.6, 10), mat(0xff7a1a), 0, 0.3, 0));
      c.add(mesh(cylinder(0.12, 0.13, 0.08, 10), white, 0, 0.32, 0));
      c.position.set(x, 0.04, z);
      kit.add(c);
    };
    for (let i = 0; i < 6; i++) cone(42 + i * 3, -77 + (i % 2 ? 2 : -2));
    const sign = signMesh("PISTA DE PRUEBAS", 5, 0.8, {
      bg: "#2f6fd6",
      fg: "#ffffff",
    });
    sign.position.set(49, 2.2, -63.6);
    sign.rotation.y = Math.PI;
    kit.add(sign);
    kit.add(
      mesh(cylinder(0.08, 0.08, 2.2, 8), mat(0x3e4a59), 46.5, 1.1, -63.6),
    );
    kit.add(
      mesh(cylinder(0.08, 0.08, 2.2, 8), mat(0x3e4a59), 51.5, 1.1, -63.6),
    );
  });
  world.physics.addFloor(36, -90, 62, -64, 0.04);
  world.mapRects.push({ kind: "road", rect: [36, -90, 62, -64] });
  // Acceso desde la calle transversal.
  kit.road(44, CROSS_Z + 7, 54, -90, { lines: false });

  // Aparcamiento público al norte (para dejar el coche).
  kit.inside(() => {
    const lot = mesh(
      box(30, 0.04, 22),
      mat(0x5a6370, { roughness: 0.9 }),
      44,
      0.02,
      -128,
      false,
    );
    kit.add(lot);
    const white = mat(0xffffff);
    for (let i = 0; i <= 8; i++)
      for (const z of [-136, -120])
        kit.add(
          mesh(box(0.15, 0.02, 4.5), white, 31 + i * 3.4, 0.045, z, false),
        );
    const sign = signMesh("P · APARCAMIENTO", 3.2, 0.7, {
      bg: "#2f6fd6",
      fg: "#ffffff",
    });
    sign.position.set(29.6, 2.3, -128);
    sign.rotation.y = -Math.PI / 2;
    kit.add(sign);
    kit.add(mesh(cylinder(0.08, 0.08, 2.4, 8), mat(0x3e4a59), 29.6, 1.2, -128));
    for (const [x, z, c, r] of [
      [34.4, -136, 0x69db7c, 0],
      [44.6, -120, 0xffa8a8, Math.PI],
      [51.4, -136, 0xb197fc, 0],
    ]) {
      const car = toyCar(c);
      car.position.set(x, 0.04, z);
      car.rotation.y = r;
      kit.add(car);
      world.physics.addCentered(x, z, 1.8, 3.3);
    }
  });
  world.physics.addFloor(29, -139, 59, -117, 0.04);
  world.mapRects.push({ kind: "road", rect: [29, -139, 59, -117] });
  kit.road(40, -117, 48, CROSS_Z - 7, { lines: false });

  // Plaza comercial con fuente, bancos y quiosco.
  kit.plaza(-58, -150, -32, -112);
  kit.inside(() => {
    world.fountain(-45, -131);
    world.bench(-52, -118, 0);
    world.bench(-38, -118, 0);
    world.bench(-52, -144, Math.PI);
    world.bench(-38, -144, Math.PI);
    for (const [x, z] of [
      [-56, -114],
      [-34, -114],
      [-56, -148],
      [-34, -148],
    ])
      world.tree(x, z, 0.8, true);
    world.planter(-45, -116, 0, 2.4);
    world.planter(-45, -146, 0, 2.4);
  });

  // Calle viva: farolas con banderolas de colores, árboles y jardineras.
  const banners = [0xff5fa2, 0x4f8dff, 0xffc22e, 0x5bd47a];
  kit.inside(() => {
    let i = 0;
    for (let z = -60; z >= -154; z -= 12) {
      if (Math.abs(z - CROSS_Z) < 9) continue;
      world.lamp(-4.6, z, banners[i++ % 4]);
      world.lamp(4.6, z - 6, banners[i++ % 4]);
      if (Math.abs(z - 3 - CROSS_Z) > 9) {
        world.tree(-5.9, z - 3, 0.62, true);
        world.tree(5.9, z - 9, 0.62, true);
      }
    }
    for (let x = -56; x <= 56; x += 14) {
      if (Math.abs(x) < 12 || (x > 40 && x < 56)) continue;
      world.lamp(x, CROSS_Z - 4.6, banners[i++ % 4]);
      world.lamp(x + 7, CROSS_Z + 4.6, banners[i++ % 4]);
    }
    for (const b of Object.values(shops))
      for (const side of [-1, 1]) {
        const p = b.doorPoint(0.45, side * (b.opts.doorW / 2 + 1.4));
        world.planter(p.x, p.z, b.worldRot(0));
      }
    // Árboles de fondo.
    for (let z = -60; z >= -156; z -= 8) {
      world.tree(-63, z, 1.1);
      world.tree(63, z, 1.1);
    }
  });

  // Puntos de interés del mapa.
  kit.poi("ropa", "Tienda de ropa", "👕", shops.ropa.doorPoint(1.5));
  kit.poi("vehiculos", "Vehículos", "🚗", shops.vehiculos.doorPoint(1.5));
  kit.poi(
    "muebles",
    "Muebles y decoración",
    "🛋️",
    shops.muebles.doorPoint(1.5),
  );
  kit.poi("tecnologia", "Tecnología", "📺", shops.tecnologia.doorPoint(1.5));
  kit.poi("gimnasio", "Gimnasio", "🏋️", shops.gimnasio.doorPoint(1.5));
  kit.poi("aparcamiento", "Aparcamiento", "🅿️", { x: 44, z: -128 });

  // Peatones: entran y salen por los extremos de las calles.
  world.exitPoints.push(
    { x: -5.5, z: -156, zone: "comercial" },
    { x: 5.5, z: -156, zone: "comercial" },
    { x: -60, z: CROSS_Z - 5.5, zone: "comercial" },
    { x: 60, z: CROSS_Z + 5.5, zone: "comercial" },
  );
  world.visitShops.push(
    shops.ropa,
    shops.muebles,
    shops.tecnologia,
    shops.gimnasio,
  );
  return { kit, shops, crossZ: CROSS_Z };
}
