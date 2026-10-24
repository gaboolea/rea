// Simulación de movimiento compartida. El servidor la usa como autoridad y el
// cliente la ejecuta para predecir a su propio jugador y reconciliar después.
import {
  AIR_ACCEL, BLOCK_SPEED_FACTOR, BOUNCE_SPEED, COYOTE_TIME, GRAVITY, GROUND_ACCEL, JUMP_SPEED,
  MAX_FALL_SPEED, PLAYER_HEIGHT, PLAYER_RADIUS, RUN_SPEED, STEP_HEIGHT, STUN_CONTROL,
  STUN_GROUND_FRICTION, WALK_SPEED,
} from './constants.ts';
import {
  type MapDef, TILE_GONE, barAngle, boxOffset, cylRadius, sectorIndexAt, sectorState, vanishState,
} from './maps.ts';

export interface PhysState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  grounded: boolean;
  /** Sólido bajo los pies: índice de caja, 1000+índice de cilindro, o -1. */
  ground: number;
  stun: number;
  coyote: number;
  jumpHeld: boolean;
  barCd: number;
}

export interface MoveInput {
  mx: number;
  mz: number;
  jump: boolean;
  run: boolean;
  block: boolean;
  /** Multiplicador de velocidad por carga (núcleos); 1 = sin carga. No afecta al salto. */
  load?: number;
}

export interface StepEvents {
  jumped: boolean;
  landed: number;
  bounced: boolean;
  barHit: boolean;
}

export interface BoxSolid {
  type: 'box';
  id: number;
  minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
  bounce: boolean;
}

export interface CylSolid {
  type: 'cyl';
  id: number;
  x: number; z: number; r: number; inner: number;
  top: number; bottom: number;
  /** Máscara de sectores caídos (bit = sector). */
  fallen: number;
  sectors: number;
}

export type Solid = BoxSolid | CylSolid;

export function newPhysState(x: number, y: number, z: number): PhysState {
  return { x, y, z, vx: 0, vy: 0, vz: 0, grounded: false, ground: -1, stun: 0, coyote: 0, jumpHeld: false, barCd: 0 };
}

export function clonePhys(s: PhysState): PhysState {
  return { ...s };
}

/** Construye la lista de sólidos del mapa en el instante t. */
export function buildSolids(map: MapDef, t: number, tiles: string): Solid[] {
  const out: Solid[] = [];
  map.boxes.forEach((b, i) => {
    if (b.kind === 'vanish' && !vanishState(b, t).solid) return;
    if (b.kind === 'tile' && b.tile !== undefined && tiles[b.tile] === TILE_GONE) return;
    const [ox, oy, oz] = boxOffset(b, t);
    out.push({
      type: 'box', id: i,
      minX: b.x + ox - b.w / 2, maxX: b.x + ox + b.w / 2,
      minY: b.y + oy - b.h / 2, maxY: b.y + oy + b.h / 2,
      minZ: b.z + oz - b.d / 2, maxZ: b.z + oz + b.d / 2,
      bounce: b.kind === 'bounce',
    });
  });
  map.cyls.forEach((c, i) => {
    let fallen = 0;
    if (c.sectors) {
      for (let s = 0; s < c.sectors; s++) if (sectorState(t, s, c.sectors) === 2) fallen |= 1 << s;
    }
    out.push({
      type: 'cyl', id: 1000 + i, x: c.x, z: c.z, r: cylRadius(c, t), inner: c.inner ?? 0,
      top: c.top, bottom: c.top - c.h, fallen, sectors: c.sectors ?? 0,
    });
  });
  return out;
}

function cylSolidAt(c: CylSolid, x: number, z: number): boolean {
  if (!c.sectors || !c.fallen) return true;
  return !(c.fallen & (1 << sectorIndexAt(x, z, c.x, c.z, c.sectors)));
}

function topOf(s: Solid): number {
  return s.type === 'box' ? s.maxY : s.top;
}

function bottomOf(s: Solid): number {
  return s.type === 'box' ? s.minY : s.bottom;
}

/** ¿El punto (x,z) expandido por r cae sobre la huella del sólido? */
function footprint(s: Solid, x: number, z: number, r: number): boolean {
  if (s.type === 'box') {
    return x >= s.minX - r && x <= s.maxX + r && z >= s.minZ - r && z <= s.maxZ + r;
  }
  const d = Math.hypot(x - s.x, z - s.z);
  if (d > s.r + r * 0.5) return false;
  if (s.inner > 0 && d < s.inner) return false;
  return cylSolidAt(s, x, z);
}

/** Altura del suelo más alto bajo (x,z) que no supere maxY. */
export function groundHeightAt(solids: Solid[], x: number, z: number, maxY: number, r = 0.2): number {
  let best = -Infinity;
  for (const s of solids) {
    const top = topOf(s);
    if (top <= maxY && top > best && footprint(s, x, z, r)) best = top;
  }
  return best;
}

function resolveWalls(s: PhysState, solids: Solid[]): void {
  const R = PLAYER_RADIUS;
  for (const so of solids) {
    const top = topOf(so);
    const bottom = bottomOf(so);
    if (!(top > s.y + STEP_HEIGHT && bottom < s.y + PLAYER_HEIGHT)) continue;
    if (so.type === 'box') {
      const cx = Math.min(Math.max(s.x, so.minX), so.maxX);
      const cz = Math.min(Math.max(s.z, so.minZ), so.maxZ);
      let dx = s.x - cx;
      let dz = s.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        dx /= d; dz /= d;
        s.x += dx * (R - d);
        s.z += dz * (R - d);
        const vn = s.vx * dx + s.vz * dz;
        if (vn < 0) { s.vx -= vn * dx; s.vz -= vn * dz; }
      } else {
        // Centro dentro de la caja: salir por el eje de menor penetración.
        const pen = [s.x - so.minX, so.maxX - s.x, s.z - so.minZ, so.maxZ - s.z];
        const m = Math.min(...pen);
        if (m === pen[0]) { s.x = so.minX - R; s.vx = Math.min(s.vx, 0); }
        else if (m === pen[1]) { s.x = so.maxX + R; s.vx = Math.max(s.vx, 0); }
        else if (m === pen[2]) { s.z = so.minZ - R; s.vz = Math.min(s.vz, 0); }
        else { s.z = so.maxZ + R; s.vz = Math.max(s.vz, 0); }
      }
    } else {
      if (!cylSolidAt(so, s.x, s.z)) continue;
      let dx = s.x - so.x;
      let dz = s.z - so.z;
      const d = Math.hypot(dx, dz);
      if (d >= so.r + R) continue;
      if (so.inner > 0 && d < so.inner - R) continue;
      if (d < 1e-6) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
      s.x = so.x + dx * (so.r + R);
      s.z = so.z + dz * (so.r + R);
      const vn = s.vx * dx + s.vz * dz;
      if (vn < 0) { s.vx -= vn * dx; s.vz -= vn * dz; }
    }
  }
}

/** Medidas de la cabeza de los martillos gigantes (físicas y visuales). */
export const HAMMER_HALF = 0.5;
export const HAMMER_RADIUS = 0.5;
export const HAMMER_HEAD_LEN = 0.9;

function applyBars(s: PhysState, map: MapDef, t: number, ev: StepEvents): void {
  if (s.barCd > 0) return;
  for (const b of map.bars) {
    // Los martillos gigantes tienen una cabeza alta en la punta (HAMMER_HALF de alto a cada lado).
    const half = b.hammer ? HAMMER_HALF : 0;
    if (b.y - half > s.y + PLAYER_HEIGHT || b.y + half < s.y - 0.15) continue;
    const a = barAngle(b, t);
    const dirX = Math.cos(a);
    const dirZ = Math.sin(a);
    const px = s.x - b.x;
    const pz = s.z - b.z;
    const lo = b.oneSided ? 0 : -b.len;
    const u = Math.min(b.len, Math.max(lo, px * dirX + pz * dirZ));
    const qx = dirX * u;
    const qz = dirZ * u;
    const ex = px - qx;
    const ez = pz - qz;
    const dist = Math.hypot(ex, ez);
    const onHead = b.hammer && u > b.len - HAMMER_HEAD_LEN;
    if (dist > PLAYER_RADIUS + (onHead ? HAMMER_RADIUS : b.thick)) continue;
    // Fuera de la cabeza, el brazo del martillo es una barra normal.
    if (b.hammer && !onHead && (b.y < s.y - 0.15 || b.y > s.y + PLAYER_HEIGHT)) continue;
    // Velocidad tangencial de la barra en el punto de contacto.
    let tx = -dirZ * b.speed * u;
    let tz = dirX * b.speed * u;
    let tl = Math.hypot(tx, tz);
    if (tl < 1) {
      tx = dist > 1e-4 ? ex / dist : 1;
      tz = dist > 1e-4 ? ez / dist : 0;
      tl = 1;
    }
    tx /= tl; tz /= tl;
    s.vx = tx * b.power;
    s.vz = tz * b.power;
    s.vy = Math.max(s.vy, 5 + b.power * 0.2);
    s.grounded = false;
    s.ground = -1;
    s.stun = 0.65;
    s.barCd = 0.6;
    ev.barHit = true;
    return;
  }
}

export function stepPlayer(
  s: PhysState, inp: MoveInput, map: MapDef, solids: Solid[], t: number, dt: number,
): StepEvents {
  const ev: StepEvents = { jumped: false, landed: 0, bounced: false, barHit: false };

  // Arrastre de la plataforma móvil sobre la que estamos.
  if (s.grounded && s.ground >= 0 && s.ground < 1000) {
    const b = map.boxes[s.ground];
    if (b?.move) {
      const a = boxOffset(b, t - dt);
      const c = boxOffset(b, t);
      s.x += c[0] - a[0];
      s.y += c[1] - a[1];
      s.z += c[2] - a[2];
    }
  }

  let mx = Number.isFinite(inp.mx) ? inp.mx : 0;
  let mz = Number.isFinite(inp.mz) ? inp.mz : 0;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const speed = (inp.run ? RUN_SPEED : WALK_SPEED) * (inp.block ? BLOCK_SPEED_FACTOR : 1) * Math.min(1, Math.max(0.5, inp.load ?? 1));
  const tx = mx * speed;
  const tz = mz * speed;

  if (s.stun > 0) {
    s.stun = Math.max(0, s.stun - dt);
    if (s.grounded) {
      const k = Math.min(1, STUN_GROUND_FRICTION * dt);
      s.vx -= s.vx * k;
      s.vz -= s.vz * k;
    }
    s.vx += tx * STUN_CONTROL * dt * 4;
    s.vz += tz * STUN_CONTROL * dt * 4;
  } else {
    const accel = s.grounded ? GROUND_ACCEL : AIR_ACCEL;
    const dvx = tx - s.vx;
    const dvz = tz - s.vz;
    const dl = Math.hypot(dvx, dvz);
    const maxd = accel * dt;
    if (dl <= maxd) { s.vx = tx; s.vz = tz; } else { s.vx += (dvx / dl) * maxd; s.vz += (dvz / dl) * maxd; }
  }
  s.barCd = Math.max(0, s.barCd - dt);

  s.coyote = s.grounded ? COYOTE_TIME : Math.max(0, s.coyote - dt);
  if (inp.jump && !s.jumpHeld && s.coyote > 0 && s.stun <= 0) {
    s.vy = JUMP_SPEED;
    s.grounded = false;
    s.ground = -1;
    s.coyote = 0;
    ev.jumped = true;
  }
  s.jumpHeld = inp.jump;

  s.vy = Math.max(MAX_FALL_SPEED, s.vy + GRAVITY * dt);

  // Movimiento horizontal con subpasos para no atravesar paredes.
  const travel = Math.max(Math.abs(s.vx), Math.abs(s.vz)) * dt;
  const n = Math.min(6, Math.max(1, Math.ceil(travel / 0.35)));
  for (let i = 0; i < n; i++) {
    s.x += (s.vx * dt) / n;
    s.z += (s.vz * dt) / n;
    resolveWalls(s, solids);
  }

  applyBars(s, map, t, ev);

  // Movimiento vertical.
  const wasGrounded = s.grounded;
  const newY = s.y + s.vy * dt;
  const sr = PLAYER_RADIUS * 0.6;
  if (s.vy <= 0) {
    const reachUp = wasGrounded ? STEP_HEIGHT : 0.05;
    const reachDown = wasGrounded ? 0.3 : 0;
    let best: Solid | null = null;
    let bestTop = -Infinity;
    for (const so of solids) {
      const top = topOf(so);
      if (top > s.y + reachUp || top < newY - reachDown - 1e-4) continue;
      if (top <= bestTop || !footprint(so, s.x, s.z, sr)) continue;
      best = so;
      bestTop = top;
    }
    if (best) {
      if (!wasGrounded) ev.landed = -s.vy;
      s.y = bestTop;
      s.vy = 0;
      s.grounded = true;
      s.ground = best.id;
      if (best.type === 'box' && best.bounce) {
        s.vy = BOUNCE_SPEED;
        s.grounded = false;
        s.ground = -1;
        ev.bounced = true;
      }
    } else {
      s.y = newY;
      s.grounded = false;
      s.ground = -1;
    }
  } else {
    let ceiling = Infinity;
    for (const so of solids) {
      const bottom = bottomOf(so);
      if (bottom < s.y + PLAYER_HEIGHT - 0.01 || bottom > newY + PLAYER_HEIGHT) continue;
      if (bottom < ceiling && footprint(so, s.x, s.z, PLAYER_RADIUS * 0.5)) ceiling = bottom;
    }
    if (ceiling < Infinity) {
      s.y = ceiling - PLAYER_HEIGHT;
      s.vy = 0;
    } else {
      s.y = newY;
    }
    s.grounded = false;
    s.ground = -1;
  }
  return ev;
}

/** Separa a dos jugadores que se solapan (empujón suave entre cuerpos). */
export function separatePlayers(a: PhysState, b: PhysState): void {
  if (Math.abs(a.y - b.y) > PLAYER_HEIGHT * 0.9) return;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const min = PLAYER_RADIUS * 2;
  if (d >= min) return;
  const nx = d > 1e-5 ? dx / d : 1;
  const nz = d > 1e-5 ? dz / d : 0;
  const push = (min - d) / 2;
  a.x -= nx * push; a.z -= nz * push;
  b.x += nx * push; b.z += nz * push;
}
