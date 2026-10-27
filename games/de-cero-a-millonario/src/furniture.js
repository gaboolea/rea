// Modelos 3D de muebles y decoración (estilo juguete). Cada modelo mide lo
// que indica su huella en config FURNITURE (ancho en x, fondo en z) y mira
// hacia +z. userData: screen (TV), bulb (lámparas), seat (sentarse).
import * as THREE from "three";
import { mat, box, mesh, cylinder, sphere, roundedBox } from "./gfx.js";
import { FURNITURE } from "./config.js";

const wood = () => mat(0xc99a6b);
const darkWood = () => mat(0x8b5a3c);
const white = () => mat(0xf7f7f2);
const metal = () => mat(0xb8c4cc, { metalness: 0.4, roughness: 0.4 });

function legs(g, w, d, h, r = 0.04, material = darkWood()) {
  for (const x of [-w / 2 + 0.08, w / 2 - 0.08])
    for (const z of [-d / 2 + 0.08, d / 2 - 0.08])
      g.add(mesh(cylinder(r, r, h, 8), material, x, h / 2, z));
}

const BUILDERS = {
  sofa(g, w, d, c) {
    const m = mat(c);
    g.add(mesh(roundedBox(w, 0.42, d, 0.1), m, 0, 0.21, 0));
    g.add(mesh(roundedBox(w, 0.55, 0.22, 0.1), m, 0, 0.6, -d / 2 + 0.11));
    for (const s of [-1, 1])
      g.add(
        mesh(roundedBox(0.2, 0.32, d, 0.08), m, s * (w / 2 - 0.1), 0.55, 0),
      );
    const cushion = mat(new THREE.Color(c).offsetHSL(0, 0, 0.12).getHex());
    for (const s of [-1, 1])
      g.add(
        mesh(
          roundedBox(w / 2 - 0.25, 0.12, d - 0.3, 0.06),
          cushion,
          s * (w / 4 - 0.02),
          0.47,
          0.08,
        ),
      );
    g.userData.seat = { x: 0, z: 0.1, y: 0.45 };
  },
  sillon(g, w, d, c) {
    BUILDERS.sofa(g, w, d, c);
  },
  mesa_centro(g, w, d) {
    g.add(mesh(roundedBox(w, 0.08, d, 0.04), wood(), 0, 0.42, 0));
    legs(g, w, d, 0.4);
    g.add(mesh(roundedBox(0.3, 0.05, 0.2, 0.02), mat(0xff6b6b), 0.2, 0.48, 0));
  },
  mueble_tv(g, w, d) {
    g.add(mesh(roundedBox(w, 0.5, d, 0.04), wood(), 0, 0.25, 0));
    for (const s of [-1, 1])
      g.add(
        mesh(
          box(w / 2 - 0.1, 0.36, 0.02),
          darkWood(),
          s * (w / 4),
          0.25,
          d / 2 + 0.01,
        ),
      );
  },
  estanteria(g, w, d) {
    const h = 1.8;
    for (const s of [-1, 1])
      g.add(mesh(box(0.05, h, d), wood(), s * (w / 2 - 0.025), h / 2, 0));
    for (let i = 0; i < 4; i++)
      g.add(mesh(box(w, 0.04, d), wood(), 0, 0.05 + i * 0.58, 0));
    const colors = [0xff6b6b, 0x4f8dff, 0xffd23f, 0x5bd47a, 0x9b6dff];
    for (let i = 0; i < 3; i++)
      for (let k = 0; k < 5; k++)
        g.add(
          mesh(
            box(0.08, 0.32, d * 0.7),
            mat(colors[(i + k) % 5]),
            -w / 2 + 0.2 + k * 0.12 + (i % 2) * 0.4,
            0.25 + i * 0.58,
            0,
          ),
        );
  },
  alfombra(g, w, d, c) {
    g.add(mesh(box(w, 0.02, d), mat(c), 0, 0.01, 0, false));
    g.add(
      mesh(
        box(w - 0.3, 0.025, d - 0.3),
        mat(new THREE.Color(c).offsetHSL(0, 0, 0.15).getHex()),
        0,
        0.012,
        0,
        false,
      ),
    );
  },
  cama_simple(g, w, d, c) {
    g.add(mesh(roundedBox(w, 0.3, d, 0.06), wood(), 0, 0.2, 0));
    g.add(
      mesh(roundedBox(w - 0.08, 0.18, d - 0.1, 0.06), white(), 0, 0.42, 0.02),
    );
    g.add(
      mesh(
        roundedBox(w - 0.06, 0.08, d * 0.6, 0.04),
        mat(c),
        0,
        0.52,
        d * 0.18,
      ),
    );
    g.add(
      mesh(
        roundedBox(w * 0.7, 0.12, 0.35, 0.06),
        white(),
        0,
        0.56,
        -d / 2 + 0.3,
      ),
    );
    g.add(mesh(roundedBox(w, 0.7, 0.08, 0.04), wood(), 0, 0.45, -d / 2 + 0.04));
    g.userData.seat = { x: 0, z: 0.1, y: 0.55, lie: true };
  },
  cama_doble(g, w, d, c) {
    BUILDERS.cama_simple(g, w, d, c);
  },
  armario(g, w, d) {
    g.add(mesh(roundedBox(w, 2.0, d, 0.05), wood(), 0, 1.0, 0));
    g.add(mesh(box(0.02, 1.8, 0.02), darkWood(), 0, 1.0, d / 2 + 0.01));
    for (const s of [-1, 1])
      g.add(mesh(sphere(0.04, 8), metal(), s * 0.12, 1.0, d / 2 + 0.03));
  },
  mesita(g, w, d) {
    g.add(mesh(roundedBox(w, 0.5, d, 0.04), wood(), 0, 0.25, 0));
    g.add(mesh(box(w - 0.1, 0.16, 0.02), darkWood(), 0, 0.32, d / 2 + 0.01));
  },
  escritorio(g, w, d) {
    g.add(mesh(roundedBox(w, 0.06, d, 0.03), wood(), 0, 0.75, 0));
    legs(g, w, d, 0.73);
    g.add(mesh(box(0.4, 0.4, d - 0.1), wood(), w / 2 - 0.25, 0.5, 0));
  },
  silla(g, w, d) {
    g.add(mesh(roundedBox(w, 0.06, d, 0.03), wood(), 0, 0.45, 0));
    legs(g, w, d, 0.44, 0.025);
    g.add(mesh(roundedBox(w, 0.5, 0.05, 0.02), wood(), 0, 0.72, -d / 2 + 0.03));
    g.userData.seat = { x: 0, z: 0.05, y: 0.45 };
  },
  mesa_pequena(g, w, d) {
    g.add(mesh(roundedBox(w, 0.06, d, 0.03), wood(), 0, 0.74, 0));
    legs(g, w, d, 0.72);
    g.add(mesh(cylinder(0.08, 0.06, 0.16, 10), mat(0x9fd8ff), 0, 0.85, 0));
  },
  mesa_comedor(g, w, d) {
    BUILDERS.mesa_pequena(g, w, d);
  },
  nevera(g, w, d) {
    g.add(mesh(roundedBox(w, 1.75, d, 0.08), white(), 0, 0.875, 0));
    g.add(
      mesh(box(w - 0.04, 0.02, 0.02), mat(0xd0d6dc), 0, 1.15, d / 2 + 0.01),
    );
    g.add(
      mesh(box(0.04, 0.5, 0.04), metal(), w / 2 - 0.12, 1.45, d / 2 + 0.03),
    );
    g.add(mesh(box(0.04, 0.4, 0.04), metal(), w / 2 - 0.12, 0.8, d / 2 + 0.03));
  },
  cocina_horno(g, w, d) {
    g.add(mesh(roundedBox(w, 0.9, d, 0.04), white(), 0, 0.45, 0));
    g.add(mesh(box(w, 0.04, d), mat(0x2b2b33), 0, 0.92, 0));
    for (const x of [-0.18, 0.18])
      for (const z of [-0.15, 0.15])
        g.add(mesh(cylinder(0.1, 0.1, 0.02, 14), mat(0x555555), x, 0.95, z));
    g.add(
      mesh(
        box(w - 0.2, 0.4, 0.02),
        mat(0x2b2b33, { roughness: 0.2 }),
        0,
        0.45,
        d / 2 + 0.01,
      ),
    );
  },
  encimera(g, w, d) {
    g.add(mesh(roundedBox(w, 0.86, d, 0.03), mat(0xffffff), 0, 0.43, 0));
    g.add(mesh(box(w, 0.05, d), mat(0xc99a6b), 0, 0.88, 0));
    g.add(
      mesh(
        box(0.5, 0.06, 0.36),
        mat(0xb8c4cc, { metalness: 0.5, roughness: 0.3 }),
        -w / 4,
        0.89,
        0,
      ),
    );
    g.add(
      mesh(cylinder(0.02, 0.02, 0.3, 8), metal(), -w / 4, 1.05, -d / 2 + 0.1),
    );
  },
  banera(g, w, d) {
    g.add(mesh(roundedBox(w, 0.55, d, 0.15), white(), 0, 0.28, 0));
    g.add(
      mesh(roundedBox(w - 0.2, 0.05, d - 0.2, 0.1), mat(0x9fdcff), 0, 0.52, 0),
    );
    g.add(mesh(cylinder(0.03, 0.03, 0.3, 8), metal(), -w / 2 + 0.15, 0.7, 0));
  },
  lavabo(g, w, d) {
    g.add(mesh(cylinder(0.08, 0.12, 0.75, 12), white(), 0, 0.38, 0));
    g.add(mesh(roundedBox(w, 0.16, d, 0.07), white(), 0, 0.8, 0));
    g.add(mesh(cylinder(0.03, 0.03, 0.18, 8), metal(), 0, 0.95, -d / 2 + 0.08));
  },
  inodoro(g, w, d) {
    g.add(mesh(cylinder(0.2, 0.16, 0.42, 16), white(), 0, 0.21, 0.08));
    g.add(mesh(cylinder(0.23, 0.23, 0.05, 16), white(), 0, 0.44, 0.08));
    g.add(mesh(roundedBox(w, 0.5, 0.2, 0.05), white(), 0, 0.6, -d / 2 + 0.1));
  },
  lampara_pie(g) {
    g.add(mesh(cylinder(0.18, 0.2, 0.05, 16), mat(0x2b2b33), 0, 0.03, 0));
    g.add(mesh(cylinder(0.025, 0.025, 1.5, 8), mat(0x2b2b33), 0, 0.78, 0));
    g.add(mesh(cylinder(0.14, 0.24, 0.3, 16, true), mat(0xfff1d6), 0, 1.55, 0));
    const bulb = new THREE.MeshStandardMaterial({
      color: 0xfff3c4,
      emissive: 0xffd26e,
      emissiveIntensity: 0.1,
    });
    g.add(mesh(sphere(0.09, 10), bulb, 0, 1.48, 0, false));
    g.userData.bulb = bulb;
    g.userData.lightY = 1.5;
  },
  lampara_mesa(g, w, d) {
    g.add(mesh(roundedBox(w, 0.5, d, 0.04), wood(), 0, 0.25, 0));
    g.add(mesh(cylinder(0.05, 0.08, 0.25, 10), mat(0xff9f43), 0, 0.62, 0));
    g.add(mesh(cylinder(0.1, 0.16, 0.18, 14, true), mat(0xfff1d6), 0, 0.82, 0));
    const bulb = new THREE.MeshStandardMaterial({
      color: 0xfff3c4,
      emissive: 0xffd26e,
      emissiveIntensity: 0.1,
    });
    g.add(mesh(sphere(0.06, 10), bulb, 0, 0.77, 0, false));
    g.userData.bulb = bulb;
    g.userData.lightY = 0.85;
  },
  planta(g) {
    g.add(mesh(cylinder(0.2, 0.15, 0.35, 14), mat(0xd9824b), 0, 0.18, 0));
    const leaf = mat(0x4fb35d);
    for (const [x, y, z, r] of [
      [0, 0.75, 0, 0.3],
      [0.15, 0.6, 0.1, 0.22],
      [-0.14, 0.62, -0.08, 0.2],
      [0, 1.0, 0, 0.2],
    ])
      g.add(mesh(sphere(r, 10), leaf, x, y, z));
  },
  cuadro(g, w) {
    g.add(mesh(box(w, 0.75, 0.05), wood(), 0, 1.6, 0));
    g.add(mesh(box(w - 0.12, 0.62, 0.06), mat(0xbfe8ff), 0, 1.6, 0.005));
    g.add(mesh(sphere(0.12, 10), mat(0xffd23f), -w / 4, 1.75, 0.04));
    g.add(mesh(box(w - 0.14, 0.18, 0.07), mat(0x5bd47a), 0, 1.36, 0.01));
  },
  espejo(g, w) {
    g.add(mesh(roundedBox(w, 1.1, 0.05, 0.05), mat(0xf2c230), 0, 1.5, 0));
    g.add(
      mesh(
        roundedBox(w - 0.1, 1.0, 0.06, 0.04),
        mat(0xdff6ff, { roughness: 0.05, metalness: 0.6 }),
        0,
        1.5,
        0.005,
      ),
    );
  },
  reloj(g, w) {
    const face = mesh(cylinder(w / 2, w / 2, 0.05, 24), white(), 0, 1.9, 0);
    face.rotation.x = Math.PI / 2;
    g.add(face);
    g.add(mesh(box(0.03, 0.18, 0.02), mat(0x2b2b33), 0, 1.97, 0.03));
    g.add(mesh(box(0.14, 0.03, 0.02), mat(0x2b2b33), 0.06, 1.9, 0.03));
  },
  tele(g, w, d) {
    g.add(mesh(roundedBox(0.4, 0.04, d, 0.02), mat(0x2b2b33), 0, 0.52, 0));
    g.add(mesh(cylinder(0.03, 0.03, 0.2, 8), mat(0x2b2b33), 0, 0.62, 0));
    g.add(mesh(roundedBox(w, 0.72, 0.06, 0.03), mat(0x1d2b44), 0, 1.06, 0));
    const screen = new THREE.MeshBasicMaterial({ color: 0x111418 });
    g.add(mesh(box(w - 0.1, 0.62, 0.02), screen, 0, 1.06, 0.035, false));
    g.add(mesh(roundedBox(w * 0.9, 0.5, d, 0.04), wood(), 0, 0.25, 0));
    g.userData.screen = screen;
  },
  ordenador(g, w, d) {
    BUILDERS.escritorio(g, w, d);
    g.add(
      mesh(
        roundedBox(0.55, 0.36, 0.04, 0.02),
        mat(0x2b2b33),
        0,
        1.07,
        -d / 2 + 0.15,
      ),
    );
    const screen = new THREE.MeshBasicMaterial({ color: 0x3d8bff });
    g.add(mesh(box(0.5, 0.3, 0.01), screen, 0, 1.07, -d / 2 + 0.175, false));
    g.add(mesh(box(0.45, 0.02, 0.15), mat(0xdfe6ea), 0, 0.79, 0.05));
  },
  altavoz(g, w, d) {
    g.add(mesh(roundedBox(w, 1.0, d, 0.05), mat(0x2b2b33), 0, 0.5, 0));
    for (const [y, r] of [
      [0.72, 0.13],
      [0.35, 0.17],
    ]) {
      const c = mesh(
        cylinder(r, r, 0.02, 18),
        mat(0x555555),
        0,
        y,
        d / 2 + 0.01,
      );
      c.rotation.x = Math.PI / 2;
      g.add(c);
    }
  },
  lavadora(g, w, d) {
    g.add(mesh(roundedBox(w, 0.85, d, 0.05), white(), 0, 0.43, 0));
    const door = mesh(
      cylinder(0.22, 0.22, 0.04, 20),
      mat(0x9fdcff, { roughness: 0.1 }),
      0,
      0.42,
      d / 2 + 0.01,
    );
    door.rotation.x = Math.PI / 2;
    g.add(door);
    g.add(mesh(box(w - 0.1, 0.1, 0.02), mat(0xdfe6ea), 0, 0.75, d / 2 + 0.01));
  },
};

export function furnitureModel(id) {
  const def = FURNITURE[id];
  const g = new THREE.Group();
  const [w, d] = def.size;
  BUILDERS[id](g, w, d, def.color ?? 0xff9f43);
  g.userData.id = id;
  return g;
}
