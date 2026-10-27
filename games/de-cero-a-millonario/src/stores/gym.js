// Gimnasio (zona comercial): cintas de correr, bancos, mancuernas,
// esterillas y espejos. En el mostrador se paga un entrenamiento que te
// hace más rápido a pie durante unos minutos.
import * as THREE from "three";
import { mat, box, mesh, cylinder, roundedBox } from "../gfx.js";
import { ToyCharacter } from "../character.js";
import { workerLook } from "../look.js";
import * as decor from "../decor.js";
import * as props from "../props.js";

function treadmill() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.8, 0.18, 1.8, 0.06), mat(0x2b2f38), 0, 0.12, 0));
  g.add(mesh(box(0.66, 0.03, 1.5), mat(0x111418), 0, 0.22, 0.05));
  for (const s of [-1, 1])
    g.add(
      mesh(cylinder(0.04, 0.04, 1.1, 8), mat(0x9aa3ad), s * 0.36, 0.7, -0.75),
    );
  g.add(mesh(roundedBox(0.8, 0.3, 0.12, 0.04), mat(0xff7a45), 0, 1.25, -0.78));
  return g;
}

function bench() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.4, 0.12, 1.3, 0.05), mat(0x1d2b44), 0, 0.48, 0));
  for (const z of [-0.5, 0.5])
    g.add(mesh(box(0.3, 0.42, 0.08), mat(0x9aa3ad), 0, 0.21, z));
  for (const s of [-1, 1])
    g.add(
      mesh(cylinder(0.03, 0.03, 1.2, 6), mat(0x9aa3ad), s * 0.32, 0.6, -0.5),
    );
  const bar = mesh(
    cylinder(0.025, 0.025, 1.7, 8),
    mat(0xcfd6de),
    0,
    1.15,
    -0.5,
  );
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  for (const s of [-1, 1]) {
    const plate = mesh(
      cylinder(0.2, 0.2, 0.06, 16),
      mat(0xff3d3d),
      s * 0.7,
      1.15,
      -0.5,
    );
    plate.rotation.z = Math.PI / 2;
    g.add(plate);
  }
  return g;
}

function dumbbellRack() {
  const g = new THREE.Group();
  g.add(mesh(box(2.4, 0.06, 0.5), mat(0x2b2f38), 0, 0.5, 0));
  g.add(mesh(box(2.4, 0.06, 0.5), mat(0x2b2f38), 0, 0.9, 0));
  for (const s of [-1, 1])
    g.add(mesh(box(0.06, 0.95, 0.5), mat(0x2b2f38), s * 1.2, 0.47, 0));
  const colors = [0xff3d3d, 0x3fd0ff, 0xffd23f, 0x7bd96a, 0xb07cff];
  for (const [i, y] of [0.56, 0.96].entries())
    for (let k = 0; k < 5; k++) {
      const d = mesh(
        cylinder(0.07, 0.07, 0.34, 10),
        mat(colors[(k + i) % 5]),
        -0.96 + k * 0.48,
        y + 0.07,
        0,
      );
      d.rotation.z = Math.PI / 2;
      g.add(d);
    }
  return g;
}

// «Gimnasio»: 14 × 12 m, entrada en +z.
export function buildGym(world, b) {
  for (const lx of [-4.8, -2.6, -0.4]) {
    b.interior.add(b.place(treadmill(), lx, -4.4, 0, 0.12));
    b.addLocalCollider(lx, -4.4, 0.8, 1.8);
  }
  for (const lx of [2.6, 5.2]) {
    b.interior.add(b.place(bench(), lx, -3.8, 0, 0.12));
    b.addLocalCollider(lx, -3.8, 0.9, 1.5);
  }
  b.interior.add(b.place(dumbbellRack(), 6.5, 0.2, -Math.PI / 2, 0.12));
  b.addLocalCollider(6.5, 0.2, 0.6, 2.4);
  // Esterillas de colores (no bloquean el paso).
  for (const [i, lx] of [-5, -3.6, -2.2].entries()) {
    const m = mesh(
      roundedBox(1.1, 0.03, 2, 0.02),
      mat([0x7bd96a, 0x3fd0ff, 0xff7eb6][i]),
      0,
      0,
      0,
      false,
    );
    b.interior.add(b.place(m, lx, 0.6, 0, 0.13));
  }
  // Espejo en la pared del fondo y carteles.
  const mirror = mesh(
    box(8, 1.8, 0.04),
    mat(0xdff6ff, { roughness: 0.05, metalness: 0.6 }),
    0,
    0,
    0,
    false,
  );
  b.interior.add(b.place(mirror, -2.6, -5.85, 0, 1.6));
  b.interior.add(
    b.place(
      decor.poster("¡ENTRENA Y\nCORRE MÁS!", "#ff7a45", "#ffffff", 1.8, 1.0),
      4,
      -5.85,
      0,
      1.9,
    ),
  );
  // Mostrador con monitora: aquí se paga el entrenamiento.
  const desk = props.counter(2.4, 0.9, 0xff7a45, 0xffffff);
  b.interior.add(b.place(desk, -4.4, 3.6, 0, 0.12));
  b.addLocalCollider(-4.4, 3.6, 2.4, 0.9);
  const coach = new ToyCharacter({
    look: { ...workerLook("naranja"), hat: { id: "gorra", color: "naranja" } },
  });
  b.place(coach.root, -4.4, 2.8, 0);
  b.interior.add(coach.root);
  world.storeClerks.push(coach);
  for (const [lx, lz] of [
    [-3, -2],
    [3, -2],
    [0, 2.5],
  ])
    b.interior.add(b.place(decor.pendantLamp(0xffffff), lx, lz, 0, 3.3));
  return { spots: [{ ...b.toWorld(-4.4, 4.7), kind: "gym" }] };
}
