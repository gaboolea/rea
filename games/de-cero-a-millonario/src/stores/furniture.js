// Tiendas de muebles y de tecnología (zona comercial): salas de
// exposición por secciones con cada mueble de verdad, su precio y un punto
// «COMPRAR MUEBLE» para examinarlo. Lo comprado va al inventario.
import * as THREE from "three";
import { mat, mesh, box, cylinder, signMesh } from "../gfx.js";
import { furnitureModel } from "../furniture.js";
import { footprint } from "../homelayout.js";
import { ToyCharacter } from "../character.js";
import { workerLook } from "../look.js";
import { FURNITURE } from "../config.js";
import * as decor from "../decor.js";
import * as props from "../props.js";

// Un mueble expuesto: modelo, colisión, etiqueta de precio y punto de uso.
function exhibit(world, b, spots, item) {
  const def = FURNITURE[item.f];
  const model = furnitureModel(item.f);
  b.interior.add(b.place(model, item.x, item.z, (item.r * Math.PI) / 2, 0.12));
  const fp = footprint(item);
  if (!def.flat && !def.wall)
    b.addLocalCollider(
      (fp[0] + fp[2]) / 2,
      (fp[1] + fp[3]) / 2,
      fp[2] - fp[0],
      fp[3] - fp[1],
      "expositor",
    );
  // Hacia dónde mira el mueble (local) y punto delante de él.
  const a = (item.r * Math.PI) / 2;
  const fx = Math.sin(a);
  const fz = Math.cos(a);
  const reach = def.size[1] / 2 + 1.05;
  // Placa de precio inclinada en el suelo, delante del mueble (no tapa
  // la vista al examinarlo).
  const tagAt = {
    x: item.x + fx * (def.size[1] / 2 + 0.35),
    z: item.z + fz * (def.size[1] / 2 + 0.35),
  };
  const plaque = new THREE.Group();
  plaque.add(mesh(box(0.66, 0.24, 0.12), mat(0x8a4b14), 0, 0.12, 0));
  const tag = signMesh(`${def.name}\n$${def.price}`, 0.62, 0.34, {
    bg: "#ffffff",
    fg: "#8a4b14",
    font: "bold 40px",
  });
  tag.rotation.x = -0.9;
  tag.position.set(0, 0.3, 0.02);
  plaque.add(tag);
  b.interior.add(b.place(plaque, tagAt.x, tagAt.z, a, 0.12));
  const front = b.toWorld(item.x + fx * reach, item.z + fz * reach);
  const size = Math.max(def.size[0], def.size[1]);
  spots.push({
    ...front,
    id: item.f,
    kind: "furniture",
    center: { ...b.toWorld(item.x, item.z), y: def.wall ? 1.5 : 0.6 },
    span: Math.max(2.4, size + 1.4),
  });
}

// Coloca una fila de muebles contra una pared, repartidos a lo largo.
//   axis "x": pared del fondo (z = at), miran hacia +z.
//   axis "z": pared lateral (x = at), miran hacia +x (side 1) o −x (−1).
function wallRow(world, b, spots, ids, axis, at, from, to, side = 1) {
  const widths = ids.map((id) => FURNITURE[id].size[0]);
  const gap = (to - from - widths.reduce((s, w) => s + w, 0)) / ids.length;
  let pos = from + gap / 2;
  for (const [i, id] of ids.entries()) {
    const [w, d] = FURNITURE[id].size;
    const along = pos + w / 2;
    pos += w + gap;
    const item =
      axis === "x"
        ? { f: id, x: along, z: at + d / 2, r: 0 }
        : { f: id, x: at + side * (d / 2), z: along, r: side > 0 ? 1 : 3 };
    exhibit(world, b, spots, item);
  }
}

// Suelo de una sala de exposición, con su cartel colgado.
function showroom(b, x0, z0, x1, z1, color, title, signAt) {
  const floor = mesh(
    box(x1 - x0, 0.02, z1 - z0),
    mat(color, { roughness: 0.85 }),
    0,
    0,
    0,
    false,
  );
  b.interior.add(b.place(floor, (x0 + x1) / 2, (z0 + z1) / 2, 0, 0.13));
  const sign = decor.hangingSign(title, signAt.color, 3);
  b.interior.add(b.place(sign, signAt.x, signAt.z, signAt.rot ?? 0, 2.75));
}

function clerkAt(world, b, lx, lz, rot, color) {
  const clerk = new ToyCharacter({ look: workerLook(color) });
  b.place(clerk.root, lx, lz, rot);
  b.interior.add(clerk.root);
  world.storeClerks.push(clerk);
}

// Caja con dependiente junto a la entrada.
function checkout(world, b, lx, lz, color, text, clerkColor) {
  const desk = props.counter(3.2, 1.0, color, 0xffffff);
  b.interior.add(b.place(desk, lx, lz, 0, 0.12));
  b.addLocalCollider(lx, lz, 3.2, 1.0);
  clerkAt(world, b, lx, lz - 1.0, 0, clerkColor);
  const sign = signMesh(text, 1.8, 0.4, {
    bg: "#ffffff",
    fg: "#8a4b14",
    font: "bold 56px",
  });
  b.interior.add(b.place(sign, lx, lz + 0.52, 0, 0.6));
}

// «Muebles y Decoración»: 22 × 20 m, entrada en +z.
export function buildFurnitureStore(world, b) {
  const spots = [];
  // Salón y dormitorio en la pared del fondo, separados por un tabique.
  showroom(b, -10.6, -9.7, -0.3, -6.4, 0xf6d7b0, "SALÓN", {
    x: -5.4,
    z: -5.6,
    color: "#ff9f43",
  });
  showroom(b, 0.3, -9.7, 10.6, -6.4, 0xd9e6ff, "DORMITORIO", {
    x: 5.4,
    z: -5.6,
    color: "#5b8def",
  });
  b.wall(0, -8.3, 0.2, 2.8, 0xfff6e5, 0, 2.3);
  wallRow(
    world,
    b,
    spots,
    ["sofa", "sillon", "mesa_centro", "mueble_tv", "estanteria"],
    "x",
    -9.7,
    -10.4,
    -0.4,
  );
  wallRow(
    world,
    b,
    spots,
    ["cama_simple", "cama_doble", "armario", "mesita", "escritorio", "silla"],
    "x",
    -9.7,
    0.4,
    10.4,
  );
  // Cocina en la pared izquierda; baño e iluminación en la derecha.
  showroom(b, -10.6, -5.8, -8.2, 4.6, 0xe8f5e0, "COCINA", {
    x: -7.6,
    z: -0.6,
    rot: Math.PI / 2,
    color: "#3fbf5f",
  });
  wallRow(
    world,
    b,
    spots,
    ["mesa_pequena", "mesa_comedor", "nevera", "cocina_horno", "encimera"],
    "z",
    -10.6,
    -5.6,
    4.4,
    1,
  );
  showroom(b, 8.2, -5.8, 10.6, 0.8, 0xd8f1fa, "BAÑO", {
    x: 7.6,
    z: -2.5,
    rot: -Math.PI / 2,
    color: "#2ec4c4",
  });
  wallRow(
    world,
    b,
    spots,
    ["banera", "lavabo", "inodoro"],
    "z",
    10.6,
    -5.6,
    0.6,
    -1,
  );
  showroom(b, 8.6, 1.2, 10.6, 4.6, 0xfff3c4, "LUZ", {
    x: 7.9,
    z: 2.9,
    rot: -Math.PI / 2,
    color: "#e0a100",
  });
  wallRow(
    world,
    b,
    spots,
    ["lampara_pie", "lampara_mesa"],
    "z",
    10.6,
    1.3,
    4.5,
    -1,
  );
  // Decoración: muro expositor en el centro con cuadros, espejo y reloj,
  // plantas a los lados y una alfombra delante.
  b.wall(0, -2.6, 6.4, 0.2, 0xfff1d6, 0, 2.4);
  exhibit(world, b, spots, { f: "cuadro", x: -1.9, z: -2.44, r: 0 });
  exhibit(world, b, spots, { f: "espejo", x: 0, z: -2.44, r: 0 });
  exhibit(world, b, spots, { f: "reloj", x: 1.9, z: -2.44, r: 0 });
  exhibit(world, b, spots, { f: "planta", x: -3.8, z: -2.2, r: 0 });
  exhibit(world, b, spots, { f: "alfombra", x: 0, z: 0.4, r: 0 });
  const decoSign = decor.hangingSign("DECORACIÓN", "#c94f86", 3);
  b.interior.add(b.place(decoSign, 0, -2.6, 0, 2.95));
  // Caja junto a la entrada, plantas y lámparas.
  checkout(world, b, 6.2, 7.2, 0xc9782e, "CAJA", "naranja");
  b.interior.add(
    b.place(
      decor.poster(
        "LO COMPRADO VA A TU\nINVENTARIO · COLÓCALO\nCON 🛋️ DECORAR",
        "#fff1d6",
        "#8a4b14",
        2.4,
        1.0,
      ),
      -10.75,
      7,
      Math.PI / 2,
      1.9,
    ),
  );
  for (const [lx, lz] of [
    [-10, 9],
    [10, 9],
  ]) {
    b.interior.add(b.place(props.pottedPlant(1.2), lx, lz));
    b.addLocalCollider(lx, lz, 0.7, 0.7);
  }
  for (const [lx, lz] of [
    [-5, -7.5],
    [5, -7.5],
    [-5, 4],
    [5, 4],
  ])
    b.interior.add(b.place(decor.pendantLamp(0xfff1d6), lx, lz, 0, 3.3));
  return { spots };
}

// «Tecnología»: 16 × 16 m. Productos con uso real en casa, un muro de
// pantallas encendidas y mesas con móviles y portátiles de exposición.
export function buildTechStore(world, b) {
  const spots = [];
  showroom(b, -7.4, -7.6, 7.4, -4.8, 0xdde9f0, "IMAGEN Y SONIDO", {
    x: 0,
    z: -4.2,
    color: "#1f9fa8",
  });
  wallRow(world, b, spots, ["tele", "ordenador", "altavoz"], "x", -7.6, -7, 7);
  showroom(b, -7.6, -3.6, -5.4, 2.4, 0xe6eef2, "HOGAR", {
    x: -4.8,
    z: -0.6,
    rot: Math.PI / 2,
    color: "#5b8def",
  });
  exhibit(world, b, spots, { f: "lavadora", x: -7.25, z: -0.6, r: 1 });
  // Muro de pantallas (decorativo) en la pared derecha.
  const colors = [0xff5a8a, 0x3fd0ff, 0xffd23f, 0x7bd96a, 0xb07cff, 0xff8a3d];
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 3; col++) {
      const screen = mesh(
        box(0.06, 0.8, 1.35),
        new THREE.MeshStandardMaterial({
          color: 0x111111,
          emissive: colors[(row * 3 + col) % colors.length],
          emissiveIntensity: 0.75,
        }),
        0,
        0,
        0,
        false,
      );
      b.interior.add(
        b.place(screen, 7.68, -2.4 + col * 1.5, 0, 1.2 + row * 0.95),
      );
    }
  // Mesas con móviles y portátiles (solo exposición).
  for (const lz of [1.0, 4.0]) {
    const table = props.counter(2.6, 1.0, 0x1d2b44, 0xf4f6fa);
    b.interior.add(b.place(table, 0, lz, 0, 0.12));
    b.addLocalCollider(0, lz, 2.6, 1.0);
    for (let i = 0; i < 4; i++) {
      const phone = mesh(
        box(0.18, 0.02, 0.34),
        mat(i % 2 ? 0x2b2f38 : 0xe9edf2),
        0,
        0,
        0,
        false,
      );
      b.interior.add(b.place(phone, -0.9 + i * 0.6, lz, 0, 1.17));
    }
  }
  checkout(world, b, 4.6, 5.6, 0x1f9fa8, "CAJA", "azul");
  for (const [lx, lz] of [
    [-4, -5.5],
    [4, -5.5],
    [0, 2.5],
  ])
    b.interior.add(b.place(decor.pendantLamp(0xe8fbff), lx, lz, 0, 3.3));
  return { spots };
}
