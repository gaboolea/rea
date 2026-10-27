// Reglas de la casita sin gráficos (las usan el cliente y el servidor):
// planta, huella de los muebles, si una colocación es válida, si queda
// paso a todas las habitaciones y dónde cabe un mueble nuevo.
import { FURNITURE } from "./config.js";

// Parcelas de las casitas (zona residencial): una por local del modo
// online, en el mismo orden que PLOTS. Casitas de 10 × 9 m giradas 90°.
export const HOME_LOTS = [
  { x: -17, z: 68, rot: Math.PI / 2, number: 1 },
  { x: 17, z: 68, rot: -Math.PI / 2, number: 2 },
  { x: -17, z: 90, rot: Math.PI / 2, number: 3 },
  { x: 17, z: 90, rot: -Math.PI / 2, number: 4 },
];

// ¿Está el punto (mundo) dentro de la casita de esa parcela?
export function insideHomeLot(index, x, z) {
  const lot = HOME_LOTS[index];
  return !!lot && Math.abs(x - lot.x) < 4.5 && Math.abs(z - lot.z) < 5;
}

export const CASITA = {
  // Interior útil: x ∈ [-4.7, 4.7], z ∈ [-4.2, 4.2].
  rooms: [
    { id: "dormitorio", name: "Dormitorio", rect: [-4.7, -4.2, 0.9, -0.9] },
    { id: "bano", name: "Baño", rect: [1.1, -4.2, 4.7, -0.9] },
    { id: "salon", name: "Salón y cocina", rect: [-4.7, -0.7, 4.7, 4.2] },
  ],
  // Puerta de entrada y puertas interiores (no se pueden tapar).
  clear: [
    [-1.3, 2.9, 1.3, 4.2],
    [-2.75, -1.75, -1.25, 0.15],
    [2.25, -1.75, 3.55, 0.15],
  ],
  // Paredes interiores donde colgar cosas: [x0, z0, x1, z1, nx, nz].
  walls: [
    [-4.7, -4.2, 0.9, -4.2, 0, 1],
    [1.1, -4.2, 4.7, -4.2, 0, 1],
    [-4.7, -4.2, -4.7, -1.0, 1, 0],
    [-4.7, -0.6, -4.7, 2.7, 1, 0],
    [4.7, -4.2, 4.7, -1.0, -1, 0],
    [4.7, -0.6, 4.7, 4.0, -1, 0],
    [-1.4, -0.6, 2.4, -0.6, 0, 1],
    [-4.7, -1.0, -2.6, -1.0, 0, -1],
    [0.9, -4.2, 0.9, -1.0, -1, 0],
    [1.1, -4.2, 1.1, -1.0, 1, 0],
  ],
  door: [0, 3.9],
};

const GRID = 0.25;
const PLAYER_R = 0.32;

// Huella de un mueble colocado: [x0, z0, x1, z1] (coordenadas locales).
export function footprint(item) {
  const def = FURNITURE[item.f];
  let [w, d] = def.size;
  if (item.r % 2) [w, d] = [d, w];
  return [item.x - w / 2, item.z - d / 2, item.x + w / 2, item.z + d / 2];
}

const overlap = (a, b, pad = 0) =>
  a[0] < b[2] + pad &&
  a[2] > b[0] - pad &&
  a[1] < b[3] + pad &&
  a[3] > b[1] - pad;
const inside = (a, b) =>
  a[0] >= b[0] - 1e-6 &&
  a[2] <= b[2] + 1e-6 &&
  a[1] >= b[1] - 1e-6 &&
  a[3] <= b[3] + 1e-6;

// Colocación inicial de los muebles que vienen con la casa.
export const STARTER_LAYOUT = [
  { f: "cama_simple", x: -2.6, z: -3.15, r: 0 },
  { f: "mesa_pequena", x: -2.8, z: 1.4, r: 0 },
  { f: "silla", x: -2.8, z: 2.3, r: 2 },
  { f: "lampara_pie", x: -4.3, z: 3.8, r: 0 },
  { f: "encimera", x: 4.35, z: 1.4, r: 3 },
  { f: "inodoro", x: 4.3, z: -3.5, r: 3 },
  { f: "lavabo", x: 2.2, z: -3.95, r: 0 },
];

// ¿Es válida esta colocación? Devuelve null o el motivo (para el jugador).
export function placementProblem(layout, item, skipIndex = -1) {
  const def = FURNITURE[item.f];
  const fp = footprint(item);
  if (def.wall) {
    const wall = CASITA.walls.find((w) => onWall(w, item));
    if (!wall) return "Los cuadros, espejos y relojes van en una pared";
    for (const [i, other] of layout.entries())
      if (
        i !== skipIndex &&
        FURNITURE[other.f].wall &&
        overlap(footprint(other), fp, 0.05)
      )
        return "Hay otra cosa colgada ahí";
    return null;
  }
  if (!CASITA.rooms.some((r) => inside(fp, r.rect)))
    return "Tiene que caber dentro de una habitación";
  if (!def.flat && CASITA.clear.some((c) => overlap(fp, c)))
    return "Taparía una puerta";
  for (const [i, other] of layout.entries()) {
    if (i === skipIndex) continue;
    const od = FURNITURE[other.f];
    if (od.wall) continue;
    if (def.flat !== od.flat && (def.flat || od.flat)) continue;
    if (overlap(footprint(other), fp)) return "Choca con otro mueble";
  }
  if (!def.flat) {
    const next = layout.filter((_, i) => i !== skipIndex).concat([item]);
    if (!allRoomsReachable(next)) return "Dejaría una habitación sin paso";
  }
  return null;
}

function onWall(w, item) {
  const [x0, z0, x1, z1] = w;
  const half = FURNITURE[item.f].size[0] / 2;
  if (z0 === z1)
    return (
      Math.abs(item.z - z0) < 0.2 &&
      item.x - half >= Math.min(x0, x1) - 1e-6 &&
      item.x + half <= Math.max(x0, x1) + 1e-6
    );
  return (
    Math.abs(item.x - x0) < 0.2 &&
    item.z - half >= Math.min(z0, z1) - 1e-6 &&
    item.z + half <= Math.max(z0, z1) + 1e-6
  );
}

// Desde la puerta se puede llegar a todas las habitaciones (rejilla de
// 0,25 m: tabiques y muebles, ensanchados por el tamaño del personaje).
export function allRoomsReachable(layout) {
  const minX = -4.7;
  const minZ = -4.2;
  const W = Math.round(9.4 / GRID);
  const H = Math.round(8.4 / GRID);
  const blocked = new Uint8Array(W * H);
  const block = (r) => {
    const x0 = Math.max(0, Math.floor((r[0] - PLAYER_R - minX) / GRID));
    const x1 = Math.min(W - 1, Math.floor((r[2] + PLAYER_R - minX) / GRID));
    const z0 = Math.max(0, Math.floor((r[1] - PLAYER_R - minZ) / GRID));
    const z1 = Math.min(H - 1, Math.floor((r[3] + PLAYER_R - minZ) / GRID));
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) blocked[z * W + x] = 1;
  };
  // Tabiques (ver buildCasitaInterior).
  for (const r of [
    [-4.7, -0.9, -2.6, -0.7],
    [-1.4, -0.9, 2.4, -0.7],
    [3.4, -0.9, 4.7, -0.7],
    [0.9, -4.2, 1.1, -0.9],
  ])
    block(r);
  for (const it of layout)
    if (!FURNITURE[it.f].wall && !FURNITURE[it.f].flat) block(footprint(it));
  const cell = (x, z) =>
    Math.floor((z - minZ) / GRID) * W + Math.floor((x - minX) / GRID);
  const start = cell(CASITA.door[0], CASITA.door[1]);
  if (blocked[start]) return false;
  const seen = new Uint8Array(W * H);
  const queue = [start];
  seen[start] = 1;
  while (queue.length) {
    const c = queue.pop();
    const cx = c % W;
    const cz = (c - cx) / W;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const n = nz * W + nx;
      if (seen[n] || blocked[n]) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return CASITA.rooms.every((room) => {
    const [x0, z0, x1, z1] = room.rect;
    for (let x = x0 + 0.2; x < x1; x += GRID)
      for (let z = z0 + 0.2; z < z1; z += GRID)
        if (seen[cell(x, z)]) return true;
    return false;
  });
}

// Mantiene la huella de un mueble dentro del interior útil.
export function keepInside(it) {
  const fp = footprint(it);
  if (fp[0] < -4.7) it.x += -4.7 - fp[0];
  if (fp[2] > 4.7) it.x -= fp[2] - 4.7;
  if (fp[1] < -4.2) it.z += -4.2 - fp[1];
  if (fp[3] > 4.2) it.z -= fp[3] - 4.2;
}

// Cuadros, espejos y relojes: el punto de pared más cercano a (x, z).
export function wallSnap(f, x, z) {
  const half = FURNITURE[f].size[0] / 2;
  let best = null;
  for (const w of CASITA.walls) {
    const [x0, z0, x1, z1, nx, nz] = w;
    const horiz = z0 === z1;
    const lo = (horiz ? Math.min(x0, x1) : Math.min(z0, z1)) + half;
    const hi = (horiz ? Math.max(x0, x1) : Math.max(z0, z1)) - half;
    if (hi < lo) continue;
    const along = Math.max(lo, Math.min(hi, horiz ? x : z));
    const px = horiz ? along : x0 + nx * 0.06;
    const pz = horiz ? z0 + nz * 0.06 : along;
    const dist = Math.hypot(px - x, pz - z);
    if (!best || dist < best.dist)
      best = {
        x: px,
        z: pz,
        dist,
        r: nz > 0 ? 0 : nz < 0 ? 2 : nx > 0 ? 1 : 3,
      };
  }
  return best && { x: best.x, z: best.z, r: best.r };
}

// Primer sitio válido para un mueble nuevo, empezando cerca de (x, z);
// null si ahora mismo no cabe en ninguna parte de la casa.
export function findSpot(layout, f, near = { x: 0, z: 1.6 }) {
  const candidates = [];
  if (FURNITURE[f].wall) {
    for (const w of CASITA.walls) {
      const [x0, z0, x1, z1] = w;
      for (let t = 0; t <= 1.001; t += 0.1) {
        const s = wallSnap(f, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
        if (s) candidates.push({ f, ...s });
      }
    }
  } else {
    for (let x = -4.5; x <= 4.5; x += 0.5)
      for (let z = -4; z <= 4; z += 0.5)
        for (let r = 0; r < 4; r++) {
          const it = { f, x, z, r };
          keepInside(it);
          candidates.push(it);
        }
  }
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - near.x, a.z - near.z) -
      Math.hypot(b.x - near.x, b.z - near.z),
  );
  return candidates.find((it) => !placementProblem(layout, it)) ?? null;
}

// Validación completa de una casa enviada por un cliente: muebles que
// existen, que tiene comprados, y cada uno en un sitio válido.
export function layoutProblem(layout, owned) {
  if (!Array.isArray(layout) || layout.length > 60) return "Casa no válida";
  const used = {};
  for (const [i, it] of layout.entries()) {
    if (!it || !FURNITURE[it.f]) return "Mueble desconocido";
    if (![it.x, it.z].every(Number.isFinite) || ![0, 1, 2, 3].includes(it.r))
      return "Posición no válida";
    used[it.f] = (used[it.f] ?? 0) + 1;
    if (used[it.f] > (owned[it.f] ?? 0))
      return `No tienes tantos: ${FURNITURE[it.f].name}`;
    const problem = placementProblem(layout.slice(0, i), it);
    if (problem) return `${FURNITURE[it.f].name}: ${problem}`;
  }
  return null;
}
