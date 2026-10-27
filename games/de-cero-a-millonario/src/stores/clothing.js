// Tiendas de ropa físicas. Cada prenda se expone con el mismo modelo 3D
// que lleva el personaje (maniquí completo, busto o solo los pies) y tiene
// su punto de interacción «VER PRENDA». Los maniquíes se funden en unas
// pocas mallas para no multiplicar las llamadas de dibujo.
import * as THREE from "three";
import {
  mat,
  box,
  mesh,
  cylinder,
  roundedBox,
  signMesh,
  bakeGroup,
} from "../gfx.js";
import { ToyCharacter } from "../character.js";
import { findItem, workerLook } from "../look.js";
import * as decor from "../decor.js";
import * as props from "../props.js";

// Ropa base de los maniquíes (neutra) sobre la que se pone la prenda.
const BASE = {
  skin: "crema",
  face: { id: "none" },
  hair: { id: "rapado" },
  top: { id: "camiseta", color: "blanco" },
  bottom: { id: "pantalon", color: "gris" },
  shoes: { id: "zapatillas", color: "blanco" },
  hat: { id: "none" },
  glasses: { id: "none" },
  back: { id: "none" },
  neck: { id: "none" },
};

// Color con el que se expone cada prenda (y el que se prueba primero).
export function displayColor(item) {
  return item.colors ? (item.showColor ?? "turquesa") : undefined;
}

// Maniquí con la prenda puesta. part: "full" | "bust" | "head" | "feet".
export function mannequin(slot, id, part = "full", extra = {}) {
  const item = findItem(slot, id);
  const look = { ...BASE, ...extra, [slot]: { id, color: displayColor(item) } };
  const c = new ToyCharacter({ look, scale: 1 });
  for (const child of c.root.children) if (child.isMesh) child.visible = false;
  if (part === "head") {
    c.torso.visible = false;
    c.legs.forEach((l) => (l.visible = false));
    c.arms.forEach((a) => (a.visible = false));
  } else if (part === "bust") {
    c.legs.forEach((l) => (l.visible = false));
  } else if (part === "feet") {
    c.torso.visible = false;
    c.headPivot.visible = false;
    c.arms.forEach((a) => (a.visible = false));
  }
  return c.root;
}

// Peana redonda.
function stand(r = 0.45, h = 0.12) {
  return mesh(cylinder(r, r * 1.05, h, 20), mat(0xf4efe6), 0, h / 2, 0);
}

// Cartel de precio pequeño.
function priceTag(text, bg = "#ffffff", fg = "#e0458b") {
  const s = signMesh(text, 0.7, 0.3, { bg, fg, font: "bold 70px" });
  return s;
}

function money(n) {
  return n ? `$${n.toLocaleString("es")}` : "GRATIS";
}

// Construye el interior de la Tienda de ropa (zona comercial).
export function buildClothingStore(world, b) {
  const displays = new THREE.Group();
  const tags = new THREE.Group();
  const spots = [];
  const place = (obj, lx, lz, rot = 0, y = 0.12) => {
    displays.add(b.place(obj, lx, lz, rot, y));
  };
  const addSpot = (slot, id, lx, lz, tagAt, rot) => {
    const item = findItem(slot, id);
    const p = b.toWorld(lx, lz);
    spots.push({ ...p, slot, id, kind: "clothes" });
    const t = priceTag(money(item.price));
    b.place(t, tagAt[0], tagAt[1], rot, tagAt[2]);
    tags.add(t);
  };

  // Pared izquierda: prendas de arriba (maniquíes completos).
  const tops = ["camiseta", "sudadera", "chaqueta", "traje"];
  tops.forEach((id, i) => {
    const lz = -2 + i * 2.2;
    place(stand(), -7.7, lz, Math.PI / 2);
    place(mannequin("top", id, "full"), -7.7, lz, Math.PI / 2, 0.24);
    b.addLocalCollider(-7.7, lz, 0.9, 0.9);
    addSpot("top", id, -6.4, lz, [-7.05, lz + 0.55, 0.45], Math.PI / 2);
  });
  // Pared derecha: pantalones (maniquíes completos).
  const bottoms = [
    ["pantalon", { top: { id: "camiseta", color: "amarillo" } }],
    ["shorts", { top: { id: "camiseta", color: "menta" } }],
    ["vaqueros", { top: { id: "sudadera", color: "rojo" } }],
    ["pantalon_traje", { top: { id: "chaqueta", color: "marino" } }],
  ];
  bottoms.forEach(([id, extra], i) => {
    const lz = -2 + i * 2.2;
    place(stand(), 7.7, lz, -Math.PI / 2);
    place(mannequin("bottom", id, "full", extra), 7.7, lz, -Math.PI / 2, 0.24);
    b.addLocalCollider(7.7, lz, 0.9, 0.9);
    addSpot("bottom", id, 6.4, lz, [7.05, lz - 0.55, 0.45], -Math.PI / 2);
  });

  // Pared del fondo: probadores (izquierda), zapatero (centro) y gorros.
  const wood = mat(0xc99a6b);
  const shelf = new THREE.Group();
  shelf.add(mesh(box(4.4, 0.08, 0.7), wood, 0, 0.5, 0));
  shelf.add(mesh(box(4.4, 0.08, 0.7), wood, 0, 1.2, 0));
  shelf.add(mesh(box(4.4, 1.9, 0.08), mat(0xf4e3cf), 0, 0.95, -0.33));
  for (const s of [-1, 1])
    shelf.add(mesh(box(0.08, 1.9, 0.7), wood, s * 2.2, 0.95, 0));
  place(shelf, -0.6, -7.35);
  b.addLocalCollider(-0.6, -7.35, 4.4, 0.8);
  const shoes = ["zapatillas", "altas", "botas", "zapatos"];
  shoes.forEach((id, i) => {
    const lx = -2.25 + i * 1.1;
    const feet = mannequin("shoes", id, "feet");
    feet.scale.setScalar(0.7);
    place(feet, lx, -7.25, 0, 0.56);
    addSpot("shoes", id, lx, -6.0, [lx, -6.95, 0.35], 0);
  });
  const hats = ["gorra", "gorro", "sombrero", "chistera"];
  hats.forEach((id, i) => {
    const lx = 2.6 + i * 1.5;
    place(
      mesh(cylinder(0.08, 0.2, 1.0, 10), mat(0xf4efe6), 0, 0.5, 0),
      lx,
      -7.2,
    );
    const head = mannequin("hat", id, "head");
    head.scale.setScalar(0.62);
    place(head, lx, -7.2, 0, 0.5);
    b.addLocalCollider(lx, -7.2, 0.6, 0.6);
    addSpot("hat", id, lx, -6.0, [lx, -6.75, 0.35], 0);
  });

  // Mesa central de accesorios (bustos pequeños).
  const table = new THREE.Group();
  table.add(mesh(roundedBox(7.6, 0.12, 1.3, 0.05), mat(0xffffff), 0, 0.8, 0));
  for (const s of [-1, 1])
    table.add(mesh(box(0.12, 0.8, 1.1), wood, s * 3.6, 0.4, 0));
  place(table, 0, 0.8);
  b.addLocalCollider(0, 0.8, 7.6, 1.3);
  const accessories = [
    ["glasses", "sol"],
    ["glasses", "redondas"],
    ["neck", "pajarita"],
    ["neck", "bufanda"],
    ["neck", "cadena"],
    ["back", "mochila"],
    ["back", "mochila_cohete"],
  ];
  accessories.forEach(([slot, id], i) => {
    const lx = -3.3 + i * 1.1;
    const part = slot === "glasses" ? "head" : "bust";
    const m = mannequin(slot, id, part);
    m.scale.setScalar(0.48);
    // Las mochilas se ven de espaldas.
    place(
      m,
      lx,
      0.8,
      slot === "back" ? Math.PI : 0,
      part === "head" ? 0.4 : 0.74,
    );
    addSpot(slot, id, lx, 2.1, [lx, 1.48, 0.95], 0);
  });

  // Escaparate: dos maniquíes con conjuntos completos mirando a la calle.
  for (const [lx, look] of [
    [
      -6,
      {
        top: { id: "chaqueta", color: "rojo" },
        bottom: { id: "vaqueros" },
        hat: { id: "gorro", color: "amarillo" },
        shoes: { id: "botas" },
      },
    ],
    [
      6,
      {
        top: { id: "sudadera", color: "morado" },
        bottom: { id: "shorts", color: "negro" },
        hat: { id: "gorra", color: "azul" },
        shoes: { id: "altas", color: "rosa" },
        back: { id: "mochila", color: "naranja" },
      },
    ],
  ]) {
    const c = new ToyCharacter({ look: { ...BASE, ...look } });
    for (const child of c.root.children)
      if (child.isMesh) child.visible = false;
    place(stand(0.55), lx, 6.6);
    place(c.root, lx, 6.6, 0, 0.24);
    b.addLocalCollider(lx, 6.6, 1.1, 1.1);
  }

  // Probadores (cambiarse con la ropa que ya tienes) y espejos.
  const fitting = [];
  for (const lx of [-7.1, -5.1]) {
    const booth = new THREE.Group();
    booth.add(mesh(box(0.1, 2.4, 1.8), mat(0xffffff), -0.95, 1.2, 0));
    booth.add(mesh(box(0.1, 2.4, 1.8), mat(0xffffff), 0.95, 1.2, 0));
    booth.add(mesh(box(2, 0.1, 1.8), mat(0xffffff), 0, 2.4, 0));
    const curtain = mesh(box(1.8, 2.0, 0.06), mat(0xff7eb6), 0, 1.25, 0.9);
    booth.add(curtain);
    place(booth, lx, -6.8);
    b.addLocalCollider(lx, -6.8, 2, 1.8);
    fitting.push({ ...b.toWorld(lx, -5.4), kind: "fitting" });
  }
  const fitSign = signMesh("PROBADORES", 2.4, 0.4, {
    bg: "#ff5fa2",
    fg: "#ffffff",
    font: "bold 60px",
  });
  b.place(fitSign, -6.1, -5.85, 0, 2.75);
  tags.add(fitSign);
  for (const [lx, lz, rot] of [
    [-8.7, 5.2, Math.PI / 2],
    [8.7, 5.2, -Math.PI / 2],
  ]) {
    const mirror = mesh(
      roundedBox(1.1, 2.0, 0.06, 0.04),
      mat(0xdff6ff, { roughness: 0.05, metalness: 0.6 }),
      0,
      0,
      0,
    );
    place(mirror, lx, lz, rot, 1.3);
  }

  // Caja con dependienta, bolsas y cestas.
  const desk = props.counter(2.6, 0.9, 0xff5fa2, 0xffffff);
  place(desk, -4.4, 4.4, 0, 0.12);
  b.addLocalCollider(-4.4, 4.4, 2.6, 0.9);
  const bag = (color) => {
    const g = new THREE.Group();
    g.add(mesh(roundedBox(0.36, 0.42, 0.14, 0.03), mat(color), 0, 0.21, 0));
    g.add(mesh(box(0.2, 0.12, 0.02), mat(0xffffff), 0, 0.48, 0));
    return g;
  };
  place(bag(0xff5fa2), -4.9, 4.4, 0, 1.04);
  place(bag(0x4f8dff), -4.5, 4.4, 0.4, 1.04);
  place(decor.basketStack(5), 2.6, 6.4);
  b.addLocalCollider(2.6, 6.4, 0.6, 0.5);
  const clerk = new ToyCharacter({
    look: {
      ...workerLook("rosa"),
      glasses: { id: "redondas", color: "rosa" },
    },
  });
  b.place(clerk.root, -4.4, 3.4, 0);
  b.interior.add(clerk.root);
  world.storeClerks.push(clerk);

  // Decoración: lámparas cálidas, carteles y plantas.
  for (const [lx, lz] of [
    [-4, -2],
    [4, -2],
    [-4, 4],
    [4, 4],
  ])
    b.interior.add(b.place(decor.pendantLamp(0xffd6a0), lx, lz, 0, 3.3));
  b.interior.add(
    b.place(
      decor.poster("NUEVA\nCOLECCIÓN", "#ff5fa2", "#ffffff", 1.6, 1.0),
      -8.75,
      -4.4,
      Math.PI / 2,
      1.9,
    ),
  );
  b.interior.add(
    b.place(
      decor.poster("REBAJAS", "#ffd23f", "#e0458b", 1.4, 0.7),
      8.75,
      -4.4,
      -Math.PI / 2,
      1.9,
    ),
  );
  for (const [lx, lz] of [
    [-8.2, -6.2],
    [8.2, 6.9],
  ]) {
    place(props.pottedPlant(1), lx, lz);
    b.addLocalCollider(lx, lz, 0.6, 0.6);
  }
  const rug = mesh(roundedBox(5, 0.02, 3, 0.01), mat(0xffd1e3), 0, 0, 0, false);
  place(rug, 0, 4.4, 0, 0.13);

  // Todo lo estático se funde en pocas mallas.
  b.interior.add(bakeGroup(displays));
  b.interior.add(tags);
  return { spots, fitting };
}
