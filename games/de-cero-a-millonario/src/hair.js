// Peinados 3D. Cada estilo se funde en una sola malla (una llamada de
// dibujo por personaje) y tiene una versión «bajo el gorro» con solo lo
// que asoma por detrás (melena, coleta) cuando se lleva sombrero o gorra.
// Coordenadas de la cabeza: centro (0, 0,32, 0), radio 0,42, frente +z.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { geo } from "./gfx.js";

const C = new THREE.Vector3(0, 0.32, 0);
const UP = new THREE.Vector3(0, 1, 0);

// Dirección desde el centro de la cabeza: p = ángulo desde arriba,
// a = giro alrededor (0 = delante).
const dir = (p, a) =>
  new THREE.Vector3(
    Math.sin(p) * Math.sin(a),
    Math.cos(p),
    Math.sin(p) * Math.cos(a),
  );

// Pieza: geometría + posición, giro (cuaternión) y escala; top = se tapa
// con el gorro.
function part(g, pos, { quat, rotX = 0, scale = [1, 1, 1], top = true } = {}) {
  const m = new THREE.Matrix4().compose(
    pos,
    quat ?? new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, 0, 0)),
    new THREE.Vector3(...scale),
  );
  const out = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m);
  out.deleteAttribute("uv");
  return { g: out, top };
}

const sphere = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);

// Casquete que cubre la parte de arriba y de atrás sin tapar la cara.
const cap = (r = 0.445, length = 1.25) =>
  part(new THREE.SphereGeometry(r, 26, 12, 0, Math.PI * 2, 0, length), C, {
    rotX: -0.45,
  });

// Mechón sobre la superficie de la cabeza.
const tuft = (r, p, a, scale, dist = 0.43, top = true) =>
  part(sphere(r, 10, 8), C.clone().addScaledVector(dir(p, a), dist), {
    quat: new THREE.Quaternion().setFromUnitVectors(UP, dir(p, a)),
    scale,
    top,
  });

const STYLES = {
  corto: () => [cap()],
  flequillo: () => [
    cap(),
    ...[-0.62, -0.31, 0, 0.31, 0.62].map((a) =>
      tuft(0.11, 0.88, a, [1.25, 0.55, 1.1]),
    ),
  ],
  puntas: () => {
    const parts = [cap()];
    const spikes = [
      [0.15, 0],
      [0.45, 0.4],
      [0.45, -0.4],
      [0.55, Math.PI],
      [0.5, 2.2],
      [0.5, -2.2],
      [0.75, 1.1],
      [0.75, -1.1],
      [0.35, 2.9],
    ];
    for (const [p, a] of spikes) {
      const d = dir(p, a);
      const h = 0.24;
      parts.push(
        part(
          new THREE.ConeGeometry(0.1, h, 8),
          C.clone().addScaledVector(d, 0.42 + h / 2 - 0.05),
          { quat: new THREE.Quaternion().setFromUnitVectors(UP, d) },
        ),
      );
    }
    return parts;
  },
  rizado: () => {
    const parts = [cap(0.46, 1.3)];
    for (let i = 0; i < 18; i++) {
      const p = 0.15 + (i % 3) * 0.38;
      const a = (i / 18) * Math.PI * 2 * 3 + (i % 3) * 0.5;
      // Sin rizos sobre la frente.
      const front = Math.cos(a) > 0.55 && p > 0.6;
      if (front) continue;
      parts.push(tuft(0.15, p, a, [1, 1, 1], 0.44));
    }
    return parts;
  },
  coleta: () => [
    cap(),
    tuft(0.12, 1.55, Math.PI, [1, 1, 1], 0.43, false),
    part(sphere(0.15), new THREE.Vector3(0, 0.2, -0.6), {
      scale: [0.85, 1.6, 0.85],
      rotX: 0.35,
      top: false,
    }),
  ],
  melena: () => [
    cap(),
    part(sphere(0.47, 24, 14), new THREE.Vector3(0, 0.22, -0.12), {
      scale: [1, 1.12, 0.68],
      top: false,
    }),
  ],
  mono: () => [
    cap(),
    part(sphere(0.17), new THREE.Vector3(0, 0.8, -0.14), { top: true }),
  ],
  tupe: () => [
    cap(),
    part(sphere(0.2), new THREE.Vector3(0, 0.72, 0.16), {
      scale: [1.15, 0.7, 1.35],
      rotX: -0.3,
    }),
  ],
};

// Geometría del peinado (null si no hay nada que dibujar).
export function hairGeometry(style, underHat) {
  const make = STYLES[style];
  if (!make) return null;
  return geo(`hair|${style}|${underHat ? 1 : 0}`, () => {
    const parts = make().filter((p) => !underHat || !p.top);
    return parts.length ? mergeGeometries(parts.map((p) => p.g)) : null;
  });
}
