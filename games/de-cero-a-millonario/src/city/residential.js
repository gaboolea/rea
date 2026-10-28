// Zona 3 · Zona residencial: al sur del barrio inicial. Calles tranquilas,
// jardines, un parque y cuatro casitas en venta (una por jugador en el modo
// online; en el modo de un jugador se usa la primera).
import * as THREE from "three";
import {
  mat,
  box,
  mesh,
  cylinder,
  sphere,
  signMesh,
  roundedBox,
} from "../gfx.js";
import { gableRoof } from "../building.js";
import { CityKit } from "./kit.js";
import { CASITA, HOME_LOTS } from "../homelayout.js";

export const RESIDENTIAL = { minX: -66, maxX: 66, minZ: 52, maxZ: 168 };
const CROSS_Z = 110;

// Parcelas de las casitas: centro de la casa, giro (puerta hacia la avenida).
export function buildResidential(world) {
  const kit = new CityKit(world, {
    id: "residencial",
    name: "Zona residencial",
    rect: [
      RESIDENTIAL.minX,
      RESIDENTIAL.minZ,
      RESIDENTIAL.maxX,
      RESIDENTIAL.maxZ,
    ],
  });
  const { minX, maxX, maxZ } = RESIDENTIAL;
  kit.grass(minX, 72, maxX, maxZ);
  kit.road(-4, 57, 4, 165);
  kit.road(-62, CROSS_Z - 4, -4, CROSS_Z + 4);
  kit.road(4, CROSS_Z - 4, 62, CROSS_Z + 4);
  kit.sidewalk(-7, 58, -4, CROSS_Z - 4);
  kit.sidewalk(-7, CROSS_Z + 4, -4, 165);
  kit.sidewalk(4, 58, 7, CROSS_Z - 4);
  kit.sidewalk(4, CROSS_Z + 4, 7, 165);
  kit.sidewalk(-62, CROSS_Z - 7, -7, CROSS_Z - 4);
  kit.sidewalk(7, CROSS_Z - 7, 62, CROSS_Z - 4);
  kit.sidewalk(-62, CROSS_Z + 4, -7, CROSS_Z + 7);
  kit.sidewalk(7, CROSS_Z + 4, 62, CROSS_Z + 7);
  kit.crosswalk(0, CROSS_Z - 8.5, "z");
  kit.crosswalk(0, CROSS_Z + 8.5, "z");
  kit.crosswalk(-10.5, CROSS_Z, "x");
  kit.crosswalk(10.5, CROSS_Z, "x");
  kit.fence(minX - 0.2, 52, minX, maxZ);
  kit.fence(maxX, 52, maxX + 0.2, maxZ);
  kit.fence(minX, maxZ, maxX, maxZ + 0.2);

  // Letrero de bienvenida.
  kit.inside(() => {
    const g = new THREE.Group();
    g.add(mesh(cylinder(0.1, 0.1, 2.6, 8), mat(0x6b4a2f), -1.4, 1.3, 0));
    g.add(mesh(cylinder(0.1, 0.1, 2.6, 8), mat(0x6b4a2f), 1.4, 1.3, 0));
    const sign = signMesh("BARRIO LOS JARDINES", 3.4, 0.8, {
      bg: "#5bd47a",
      fg: "#ffffff",
    });
    sign.position.set(0, 2.3, 0.06);
    const back = sign.clone();
    back.rotation.y = Math.PI;
    back.position.z = -0.06;
    g.add(sign, back);
    g.position.set(-9.5, 0, 55.5);
    kit.add(g);
  });
  world.physics.addCentered(-9.5, 55.5, 3, 0.3);

  // Casitas del jugador (en venta). Cada parcela: casa, jardín, camino,
  // plaza de aparcamiento, buzón con número y farol.
  const lots = HOME_LOTS.map((lot, i) => {
    const building = kit.building(`casita${i}`, {
      name: `Casita ${lot.number}`,
      x: lot.x,
      z: lot.z,
      w: 10,
      d: 9,
      rot: lot.rot,
      doorW: 1.8,
      floors: 1,
      gable: true,
      wallColor: [0xfff3d6, 0xe6f4ff, 0xffe6ec, 0xeafbe0][i],
      trimColor: [0xff9f43, 0x4f8dff, 0xff6b9a, 0x3fbf5f][i],
      roofColor: [0xd9534f, 0x3d6fd6, 0xc94f86, 0x2e8a43][i],
      floor: ["#e9d3b0", "#dcc49c"],
    });
    const b = building;
    // Jardín delantero, camino y plaza de aparcamiento.
    const front = (lx, lz) => b.toWorld(lx, lz);
    kit.inside(() => {
      const lawn = mesh(box(10, 0.06, 5), mat(0x6fd24c), 0, 0, 0, false);
      b.place(lawn, 0, 4.5 + 2.5, 0, 0.03);
      kit.add(lawn);
      const path = mesh(box(1.4, 0.08, 5), mat(0xe8dcc4), 0, 0, 0, false);
      b.place(path, 0, 7, 0, 0.05);
      kit.add(path);
      const drive = mesh(box(4, 0.08, 6), mat(0xb9bec6), 0, 0, 0, false);
      b.place(drive, 7.2, 6.4, 0, 0.05);
      kit.add(drive);
      // Valla baja de madera con hueco para el camino y el coche.
      for (const [lx, w] of [
        [-3.1, 3.8],
        [3.1, 3.8],
      ]) {
        const f = mesh(box(w, 0.6, 0.12), mat(0xffffff), 0, 0, 0);
        b.place(f, lx, 9.4, 0, 0.3);
        kit.add(f);
      }
      // Buzón con número.
      const box1 = new THREE.Group();
      box1.add(mesh(cylinder(0.05, 0.05, 1, 6), mat(0x6b4a2f), 0, 0.5, 0));
      box1.add(
        mesh(roundedBox(0.4, 0.3, 0.5, 0.06), mat(b.opts.trimColor), 0, 1.1, 0),
      );
      const num = signMesh(String(lot.number), 0.3, 0.3, {
        bg: "#ffffff",
        fg: "#1d2b44",
      });
      num.position.set(0.21, 1.1, 0);
      num.rotation.y = Math.PI / 2;
      box1.add(num);
      b.place(box1, -1.4, 9.6, 0, 0);
      kit.add(box1);
      // Farol de jardín.
      const lamp = new THREE.Group();
      lamp.add(mesh(cylinder(0.05, 0.06, 1.3, 8), mat(0x232a33), 0, 0.65, 0));
      const bulb = new THREE.MeshStandardMaterial({
        color: 0xfff3c4,
        emissive: 0xffd26e,
        emissiveIntensity: 0.1,
      });
      lamp.add(mesh(sphere(0.14, 10), bulb, 0, 1.4, 0, false));
      world.lamps.push(bulb);
      b.place(lamp, 1.4, 9.6, 0, 0);
      kit.add(lamp);
      // Flores junto a la fachada.
      for (const s of [-1, 1]) {
        const p = front(s * 3.4, 5.3);
        world.planter(p.x, p.z, b.worldRot(0), 2.2);
      }
    });
    const fenceA = b.toWorld(-3.1, 9.4);
    const fenceB = b.toWorld(3.1, 9.4);
    const horiz = Math.abs(Math.sin(b.rot)) < 0.5;
    for (const p of [fenceA, fenceB])
      world.physics.addCentered(p.x, p.z, horiz ? 3.8 : 0.2, horiz ? 0.2 : 3.8);
    const interior = buildCasitaInterior(b);
    return {
      ...interior,
      index: i,
      number: lot.number,
      building: b,
      parking: { ...b.toWorld(7.2, 6.4), heading: b.worldRot(0) + Math.PI },
      door: b.doorPoint(1.2),
    };
  });
  world.homeLots = lots;

  // Casas de los vecinos (decorativas: puertas cerradas, sin interior).
  const neighbors = [
    [-50, 124, Math.PI],
    [-34, 124, Math.PI],
    [18, 124, Math.PI],
    [34, 124, Math.PI],
    [50, 124, Math.PI],
    [-50, 97, 0],
    [-34, 97, 0],
    [34, 97, 0],
    [50, 97, 0],
    [-18, 142, 0],
    [18, 142, 0],
    [-40, 150, 0],
    [40, 150, 0],
  ];
  const palette = [
    [0xfff3d6, 0xd9534f],
    [0xe6f4ff, 0x3d6fd6],
    [0xffe6ec, 0xc94f86],
    [0xeafbe0, 0x2e8a43],
    [0xfff7c2, 0xe0a100],
    [0xf1e6ff, 0x7b5cff],
  ];
  kit.inside(() =>
    neighbors.forEach(([x, z, rot], i) => {
      const [wall, roof] = palette[i % palette.length];
      kit.add(neighborHouse(x, z, rot, wall, roof));
      world.physics.addCentered(x, z, 9, 7);
      world.tree(x + 6, z + (rot ? 4 : -4), 0.9);
    }),
  );

  // Tu casa (edificio «casa» de World) ocupa el hueco de la calle
  // transversal: camino hasta la acera y jardín lateral con la caseta del
  // perro (Critters).
  kit.inside(() => {
    kit.add(mesh(box(1.4, 0.08, 2.2), mat(0xe8dcc4), -18, 0.05, 118, false));
    kit.add(mesh(box(4.2, 0.05, 11.5), mat(0x6fd24c), -10.4, 0.03, 124, false));
  });
  for (const [x, z] of [
    [-24.5, 118.5],
    [-11, 118.2],
  ])
    world.planter(x, z, Math.PI, 2.2);

  // Parque con estanque, columpio y bancos (este) y huerto vecinal (oeste).
  kit.inside(() => {
    const pond = mesh(
      cylinder(5, 5, 0.06, 32),
      mat(0x63c5f0, { roughness: 0.15 }),
      46,
      0.04,
      80,
      false,
    );
    kit.add(pond);
    world.physics.addCentered(46, 80, 8, 8);
    for (const [x, z] of [
      [34, 64],
      [58, 64],
      [34, 94],
      [58, 94],
      [30, 80],
    ])
      world.tree(x, z, 1.1);
    world.bench(38, 72, Math.PI / 2);
    world.bench(54, 88, -Math.PI / 2);
    kit.add(swing(40, 92));
    world.physics.addCentered(40, 92, 2.6, 1.2);
    for (let i = 0; i < 6; i++)
      world.planter(-34 - (i % 3) * 8, 70 + Math.floor(i / 3) * 14, 0, 3);
    for (const [x, z] of [
      [-56, 66],
      [-56, 94],
      [-30, 94],
    ])
      world.tree(x, z, 1.0);
    // Farolas y árboles en la avenida.
    let k = 0;
    for (let z = 62; z <= 160; z += 12) {
      if (Math.abs(z - CROSS_Z) < 9) continue;
      world.lamp(-4.6, z, [0x5bd47a, 0xffc22e][k++ % 2]);
      world.lamp(4.6, z + 6, [0x5bd47a, 0xffc22e][k++ % 2]);
    }
    for (let x = -56; x <= 56; x += 14) {
      if (Math.abs(x) < 12) continue;
      world.lamp(x, CROSS_Z - 4.6);
      world.lamp(x + 7, CROSS_Z + 4.6);
    }
    for (let z = 140; z <= 164; z += 8) {
      world.tree(-60, z, 1.1);
      world.tree(60, z, 1.1);
    }
  });
  world.mapRects.push({ kind: "water", circle: [46, 80, 5] });

  world.exitPoints.push(
    { x: -5.5, z: 163, zone: "residencial" },
    { x: 5.5, z: 163, zone: "residencial" },
    { x: -60, z: CROSS_Z - 5.5, zone: "residencial" },
    { x: 60, z: CROSS_Z + 5.5, zone: "residencial" },
  );
  return { kit, lots, crossZ: CROSS_Z };
}

// Interior de una casita (coordenadas locales, puerta en +z): salón con
// cocina abierta delante; dormitorio y baño detrás, separados por tabiques
// con puertas. Devuelve las habitaciones, las zonas de paso que deben
// quedar libres y las paredes donde se pueden colgar cuadros.

function buildCasitaInterior(b) {
  const wall = 0xfffaf0;
  // Tabique horizontal (con dos puertas) y vertical entre dormitorio y baño.
  for (const [x0, x1] of [
    [-4.7, -2.6],
    [-1.4, 2.4],
    [3.4, 4.7],
  ])
    b.wall((x0 + x1) / 2, -0.8, x1 - x0, 0.2, wall, 0, 2.5);
  b.wall(1.0, -2.55, 0.2, 3.3, wall, 0, 2.5);
  // Dinteles sobre las puertas interiores.
  for (const [x0, x1] of [
    [-2.6, -1.4],
    [2.4, 3.4],
  ])
    b.wall((x0 + x1) / 2, -0.8, x1 - x0, 0.2, wall, 2.1, 0.4, false);
  // Suelos distintos en cocina y baño.
  const tile = (x0, z0, x1, z1, color) => {
    const m = mesh(box(x1 - x0, 0.02, z1 - z0), mat(color), 0, 0, 0, false);
    b.interior.add(b.place(m, (x0 + x1) / 2, (z0 + z1) / 2, 0, 0.13));
  };
  tile(1.6, -0.7, 4.7, 4.2, 0xdfe9ef);
  tile(1.1, -4.2, 4.7, -0.9, 0xcfeaf5);
  tile(-4.7, -4.2, 0.9, -0.9, 0xe8d3b8);
  return { rooms: CASITA.rooms, clear: CASITA.clear, walls: CASITA.walls };
}

// Casa vecina sencilla (sin interior): muros, tejado, puerta y ventanas.
function neighborHouse(x, z, rot, wallColor, roofColor) {
  const g = new THREE.Group();
  g.add(mesh(box(9, 3, 7), mat(wallColor), 0, 1.5, 0));
  const roof = gableRoof(9.6, 7.6, 2.4, roofColor);
  roof.position.y = 3;
  g.add(roof);
  g.add(mesh(roundedBox(1.2, 2.1, 0.1, 0.04), mat(0x8b5a3c), 0, 1.05, 3.52));
  g.add(mesh(sphere(0.06, 8), mat(0xf2c230), 0.4, 1.05, 3.6));
  for (const s of [-1, 1]) {
    g.add(mesh(box(1.3, 1.1, 0.08), mat(0xffffff), s * 2.6, 1.7, 3.51));
    g.add(
      mesh(
        box(1.1, 0.9, 0.1),
        mat(0x9fd8ff, { roughness: 0.15 }),
        s * 2.6,
        1.7,
        3.53,
      ),
    );
  }
  g.add(mesh(box(9.2, 0.25, 0.4), mat(0xe8dcc4), 0, 0.12, 3.7));
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  return g;
}

function swing(x, z) {
  const g = new THREE.Group();
  const wood = mat(0xb07a4a);
  for (const s of [-1, 1]) {
    const leg = mesh(cylinder(0.07, 0.07, 2.4, 8), wood, s * 1.2, 1.15, 0);
    leg.rotation.z = s * 0.12;
    g.add(leg);
  }
  const top = mesh(cylinder(0.07, 0.07, 2.6, 8), wood, 0, 2.3, 0);
  top.rotation.z = Math.PI / 2;
  g.add(top);
  for (const s of [-0.5, 0.5]) {
    g.add(mesh(box(0.03, 1.6, 0.03), mat(0x555555), s - 0.2, 1.5, 0));
    g.add(mesh(box(0.03, 1.6, 0.03), mat(0x555555), s + 0.2, 1.5, 0));
    g.add(mesh(box(0.6, 0.06, 0.3), mat(0xff6b6b), s, 0.7, 0));
  }
  g.position.set(x, 0, z);
  return g;
}
