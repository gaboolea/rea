// Galería de lujo (distrito financiero): las prendas de millonario en
// maniquíes sobre peanas doradas y el coche de lujo en una plataforma
// giratoria. Usa los mismos puntos «VER PRENDA» y «EXAMINAR VEHÍCULO»
// que la tienda de ropa y el concesionario.
import * as THREE from "three";
import { mat, box, mesh, cylinder, roundedBox, signMesh } from "../gfx.js";
import { ToyCharacter } from "../character.js";
import { findItem, workerLook } from "../look.js";
import { mannequin } from "./clothing.js";
import { buildVehicleStore } from "./vehicles.js";
import * as decor from "../decor.js";
import * as props from "../props.js";

const GOLD = 0xf2c230;

// «Galería de Lujo»: 18 × 14 m, entrada en +z.
export function buildLuxuryStore(world, b) {
  const spots = [];
  // Prendas: traje de millonario (maniquí completo) y cadena de oro.
  for (const [slot, id, lz, part] of [
    ["top", "traje_oro", -3.4, "full"],
    ["neck", "cadena_oro", 0.2, "bust"],
  ]) {
    const item = findItem(slot, id);
    const lx = -6.4;
    const base = mesh(
      cylinder(0.55, 0.6, 0.22, 24),
      mat(GOLD, { metalness: 0.6, roughness: 0.3 }),
      0,
      0.11,
      0,
    );
    b.interior.add(b.place(base, lx, lz, 0, 0.12));
    const m = mannequin(slot, id, part);
    if (part === "bust") m.scale.setScalar(0.75);
    b.interior.add(
      b.place(m, lx, lz, Math.PI / 2, part === "bust" ? 0.9 : 0.34),
    );
    b.addLocalCollider(lx, lz, 1.2, 1.2);
    const tag = signMesh(
      `${item.name}\n$${item.price.toLocaleString("es")}`,
      1.3,
      0.5,
      {
        bg: "#1d2b44",
        fg: "#f2c230",
        font: "bold 44px",
      },
    );
    b.interior.add(b.place(tag, lx + 0.75, lz + 0.75, Math.PI / 2, 0.5));
    spots.push({ ...b.toWorld(lx + 1.5, lz), slot, id, kind: "clothes" });
  }
  // Coche de lujo en su plataforma giratoria.
  const car = buildVehicleStore(world, b, ["lujo"], {
    lujo: [3.2, -1.6, 0.5, 3.0],
  });
  spots.push(...car.spots);
  // Mostrador con dependiente de traje.
  const desk = props.counter(2.8, 0.9, 0x1d2b44, GOLD);
  b.interior.add(b.place(desk, -2.6, -5.6, 0, 0.12));
  b.addLocalCollider(-2.6, -5.6, 2.8, 0.9);
  const clerk = new ToyCharacter({
    look: {
      ...workerLook("negro"),
      top: { id: "traje", color: "negro" },
      neck: { id: "pajarita", color: "amarillo" },
    },
  });
  b.place(clerk.root, -2.6, -6.4, 0);
  b.interior.add(clerk.root);
  world.storeClerks.push(clerk);
  // Alfombra roja desde la puerta, lámparas doradas, espejo y carteles.
  const carpet = mesh(
    roundedBox(2.2, 0.02, 6.5, 0.01),
    mat(0xb3123b),
    0,
    0,
    0,
    false,
  );
  b.interior.add(b.place(carpet, -2.6, 3.4, 0, 0.13));
  for (const [lx, lz] of [
    [-5, -3],
    [3, -3],
    [-5, 3],
    [3, 3],
  ])
    b.interior.add(b.place(decor.pendantLamp(0xfff1b8), lx, lz, 0, 3.3));
  const mirror = new THREE.Group();
  mirror.add(mesh(roundedBox(1.3, 2.2, 0.08, 0.04), mat(GOLD), 0, 0, 0));
  mirror.add(
    mesh(
      box(1.1, 2.0, 0.02),
      mat(0xdff6ff, { roughness: 0.05, metalness: 0.6 }),
      0,
      0,
      0.05,
    ),
  );
  b.interior.add(b.place(mirror, -8.7, 3.6, Math.PI / 2, 1.4));
  b.interior.add(
    b.place(
      decor.poster("SOLO PARA\nMILLONARIOS", "#1d2b44", "#f2c230", 2.0, 1.0),
      0,
      -6.75,
      0,
      2.0,
    ),
  );
  for (const [lx, lz] of [
    [-8.2, -6.2],
    [8.2, -6.2],
  ]) {
    b.interior.add(b.place(props.pottedPlant(1.1), lx, lz));
    b.addLocalCollider(lx, lz, 0.6, 0.6);
  }
  return { spots };
}
