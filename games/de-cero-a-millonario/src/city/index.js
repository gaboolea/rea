// Expansión de la ciudad alrededor del barrio inicial (que no cambia):
// zona comercial al norte, zona residencial al sur y avenida hacia el
// distrito financiero al oeste. También amplía el tráfico.
import { toyCar, toyModernCar } from "../vehicles.js";
import { buildCommercial } from "./commercial.js";
import { buildResidential } from "./residential.js";
import { buildFinancial, CROSS_X } from "./financial.js";
import { DISTRICT } from "../config.js";
import { buildClothingStore } from "../stores/clothing.js";
import { buildDealership } from "../stores/vehicles.js";
import { buildFurnitureStore, buildTechStore } from "../stores/furniture.js";
import { buildLuxuryStore } from "../stores/luxury.js";
import { buildGym } from "../stores/gym.js";

// Distancia a partir de la cual una zona no se dibuja (la niebla ya la
// oculta): menos objetos que recorrer en cada fotograma.
const DRAW_DISTANCE = 230;

export function buildExpansion(world) {
  const commercial = buildCommercial(world);
  const residential = buildResidential(world);
  const financial = buildFinancial(world);
  world.expansion = { commercial, residential, financial };
  // Interiores de las tiendas físicas.
  world.stores = {
    ropa: buildClothingStore(world, commercial.shops.ropa),
    vehiculos: buildDealership(world, commercial.shops.vehiculos),
    muebles: buildFurnitureStore(world, commercial.shops.muebles),
    tecnologia: buildTechStore(world, commercial.shops.tecnologia),
    lujo: buildLuxuryStore(world, financial.lujo),
    gimnasio: buildGym(world, commercial.shops.gimnasio),
  };

  const t = world.traffic;
  // La avenida norte-sur ahora atraviesa las tres zonas.
  t.setRange("z0", -158, 165);
  // Mientras el distrito esté cerrado, los coches dan la vuelta antes de
  // la barrera.
  t.setRange("x0", DISTRICT.barrierX + 4, 80);
  const comLights = t.addLights(0, commercial.crossZ);
  const resLights = t.addLights(0, residential.crossZ);
  const finLights = t.addLights(CROSS_X, 0);
  t.addStop("z0", commercial.crossZ, comLights);
  t.addStop("z0", residential.crossZ, resLights);
  t.addRoad({ id: "xc", axis: "x", c: commercial.crossZ, from: -62, to: 62 });
  t.addRoad({ id: "xr", axis: "x", c: residential.crossZ, from: -62, to: 62 });
  t.addRoad({ id: "zf", axis: "z", c: CROSS_X, from: -78, to: 78 });
  t.addStop("xc", 0, comLights);
  t.addStop("xr", 0, resLights);
  t.addStop("zf", 0, finLights);
  const colors = [0x4dabf7, 0xff8787, 0x69db7c, 0xffd43b, 0xb197fc, 0x63e6be];
  [
    ["z0", 1, -130],
    ["z0", -1, -90],
    ["z0", 1, 80],
    ["z0", -1, 140],
    ["xc", 1, -40],
    ["xc", -1, 30],
    ["xr", 1, -30],
    ["xr", -1, 40],
  ].forEach(([road, dir, along], i) =>
    t.add(toyCar(colors[i % colors.length]), road, dir, along, {
      speed: 5 + (i % 3),
    }),
  );
  // Coches modernos del distrito (por su tramo, detrás de la barrera).
  t.addRoad({ id: "xf", axis: "x", c: 0, from: -338, to: -232 });
  t.addStop("xf", CROSS_X, finLights);
  [
    ["xf", 1, -320],
    ["xf", -1, -250],
    ["zf", 1, -60],
    ["zf", -1, 20],
    ["zf", 1, 50],
  ].forEach(([road, dir, along], i) =>
    t.add(
      toyModernCar([0x1d2b44, 0xffffff, 0xd9534f, 0x9aa7b0, 0x2ec4c4][i]),
      road,
      dir,
      along,
      {
        speed: 6 + (i % 3),
      },
    ),
  );
  return world.expansion;
}

// Oculta las zonas lejanas a la cámara.
export function cullZones(world, camera) {
  for (const zone of world.zones) {
    if (!zone.group) continue;
    const [x0, z0, x1, z1] = zone.rect;
    const dx = Math.max(x0 - camera.x, 0, camera.x - x1);
    const dz = Math.max(z0 - camera.z, 0, camera.z - z1);
    zone.group.visible = Math.hypot(dx, dz) < DRAW_DISTANCE;
  }
}

// Abre o cierra la avenida del distrito para el tráfico.
export function setFinancialTraffic(world, open) {
  world.traffic.setRange("x0", open ? -232 : DISTRICT.barrierX + 4, 80);
}
