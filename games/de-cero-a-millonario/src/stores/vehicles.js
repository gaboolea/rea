// Concesionario «VEHÍCULOS» (zona comercial): sala de exposición con los
// vehículos en peanas, mostrador, carteles de precios y salida a la pista
// de pruebas. Cada vehículo tiene su punto «EXAMINAR VEHÍCULO».
import * as THREE from "three";
import { mat, mesh, cylinder, signMesh, roundedBox } from "../gfx.js";
import { rideModel } from "../vehicles.js";
import { ToyCharacter } from "../character.js";
import { workerLook } from "../look.js";
import { VEHICLES } from "../config.js";
import * as decor from "../decor.js";
import * as props from "../props.js";

// Dónde se expone cada vehículo: [x, z local, giro, radio de la peana].
const LAYOUT = {
  skate: [-7.6, 6.2, 0.6, 0.9],
  bici: [-4.8, 6.2, 0.6, 1.0],
  scooter: [4.8, 6.2, -0.6, 1.0],
  moto: [7.6, 5.8, -0.6, 1.2],
  compacto: [-6.2, -1.0, 0.7, 2.6],
  familiar: [0, -2.4, 0, 2.8],
  deportivo: [6.4, -1.0, 0, 2.7],
};

export function buildVehicleStore(
  world,
  b,
  ids = Object.keys(LAYOUT),
  layout = LAYOUT,
) {
  const spots = [];
  for (const id of ids) {
    const def = VEHICLES[id];
    const [lx, lz, rot, r] = layout[id];
    const base = mesh(
      cylinder(r, r * 1.04, 0.16, 32),
      mat(0xf4f6fa),
      0,
      0.08,
      0,
    );
    b.interior.add(b.place(base, lx, lz, 0, 0.12));
    const model = rideModel(id, def);
    const holder = new THREE.Group();
    holder.add(model);
    b.interior.add(b.place(holder, lx, lz, rot, 0.28));
    // La peana del deportivo gira.
    if (id === "deportivo" || id === "lujo") world.turntables.push(holder);
    b.addLocalCollider(lx, lz, r * 1.6, r * 1.6);
    const front = b.toWorld(lx, lz + r + 0.9);
    const tag = signMesh(
      `${def.name}\n$${def.price.toLocaleString("es")}`,
      1.5,
      0.6,
      {
        bg: "#ffffff",
        fg: "#2f6fd6",
        font: "bold 46px",
      },
    );
    b.interior.add(b.place(tag, lx, lz + r + 0.15, 0, 0.55));
    spots.push({
      ...front,
      id,
      kind: "vehicle",
      center: { ...b.toWorld(lx, lz), y: def.kind === "car" ? 0.9 : 0.6 },
      span: def.kind === "car" ? 5.5 : 2.6,
    });
  }
  return { spots };
}

// Interior completo del concesionario de la zona comercial.
export function buildDealership(world, b) {
  const { spots } = buildVehicleStore(world, b);
  // Mostrador con vendedor.
  const desk = props.counter(3.2, 1.0, 0x2f6fd6, 0xffffff);
  b.interior.add(b.place(desk, 0, -8.6, 0, 0.12));
  b.addLocalCollider(0, -8.6, 3.2, 1.0);
  const clerk = new ToyCharacter({
    look: {
      ...workerLook("azul"),
      top: { id: "traje", color: "marino" },
      neck: { id: "pajarita", color: "rojo" },
    },
  });
  b.place(clerk.root, 0, -9.6, 0);
  b.interior.add(clerk.root);
  world.storeClerks.push(clerk);
  b.interior.add(
    b.place(
      decor.poster(
        "¡PRUEBA ANTES\nDE COMPRAR!",
        "#2f6fd6",
        "#ffffff",
        2.2,
        1.1,
      ),
      0,
      -10.75,
      0,
      2.2,
    ),
  );
  b.interior.add(
    b.place(
      decor.poster("PISTA DE PRUEBAS ➜", "#ffd23f", "#2f6fd6", 2.4, 0.7),
      -10.75,
      4,
      Math.PI / 2,
      2.2,
    ),
  );
  for (const [lx, lz] of [
    [-6, -6],
    [6, -6],
    [-6, 3],
    [6, 3],
  ])
    b.interior.add(b.place(decor.pendantLamp(0xe8f1ff), lx, lz, 0, 3.3));
  for (const [lx, lz] of [
    [-10, -10],
    [10, -10],
  ]) {
    b.interior.add(b.place(props.pottedPlant(1.2), lx, lz));
    b.addLocalCollider(lx, lz, 0.7, 0.7);
  }
  // Suelo brillante de exposición.
  const floor = mesh(
    roundedBox(14, 0.02, 9, 0.01),
    mat(0xdfe8f3, { roughness: 0.2 }),
    0,
    0,
    0,
    false,
  );
  b.interior.add(b.place(floor, 0, -1.6, 0, 0.13));
  return { spots };
}
