// IA de entrenamiento. Los bots solo existen si el anfitrión los añade y se
// marcan como bots en todas las listas, para no confundirlos con jugadores.
import { PLAYER_HEIGHT, WEAPONS } from '../shared/constants.ts';
import { type MapDef, barAngle, cylRadius, energyZoneIndex, sectorIndexAt, sectorState, vanishState } from '../shared/maps.ts';
import { type Solid, groundHeightAt } from '../shared/physics.ts';
import { INPUT_ATTACK, INPUT_BLOCK, INPUT_INTERACT, INPUT_JUMP, INPUT_RUN, STATUS_ALIVE, STATUS_QUALIFIED } from '../shared/protocol.ts';

export const BOT_NAMES = ['Gominola', 'Flan', 'Pudin', 'Natilla', 'Mochi', 'Gelatín', 'Chicle', 'Malvavisco', 'Bombón', 'Regaliz', 'Turrón', 'Merengue'];

export interface BotView {
  id: number;
  x: number; y: number; z: number;
  vx: number; vz: number;
  status: number;
  weapon: keyof typeof WEAPONS;
  atk: number;
  grounded: boolean;
  invuln: number;
  carry: number;
}

export interface BotWorld {
  map: MapDef;
  t: number;
  solids: Solid[];
  players: BotView[];
  weapons: { x: number; y: number; z: number; landed: boolean }[];
  cores: { x: number; y: number; z: number }[];
}

export interface BotInput {
  mx: number; mz: number; yaw: number; b: number;
}

export class BotBrain {
  private wanderX = 0;
  private wanderZ = 0;
  private nextThink = 0;
  private targetId = -1;
  private reaction: number;
  private aggression: number;
  private interactToggle = false;
  private blockUntil = 0;
  private jumpPressed = false;

  constructor(seed: number) {
    this.reaction = 0.15 + (seed % 5) * 0.06;
    this.aggression = 0.55 + ((seed * 7) % 5) * 0.1;
  }

  think(me: BotView, w: BotWorld): BotInput {
    const out: BotInput = { mx: 0, mz: 0, yaw: 0, b: INPUT_RUN };
    if (me.status !== STATUS_ALIVE && me.status !== STATUS_QUALIFIED) return out;
    const { map, t } = w;

    // Destino base según el mapa.
    let gx = 0;
    let gz = 0;
    let wantFight = true;
    if (map.goalZ !== undefined) {
      if (me.status === STATUS_QUALIFIED) return out;
      gz = map.goalZ + 5;
      gx = 0;
      wantFight = me.z < 60 && Math.random() < 0.5;
    }

    if (t >= this.nextThink) {
      this.nextThink = t + 0.6 + Math.random() * 0.8;
      const ang = Math.random() * Math.PI * 2;
      const rr = Math.random() * 6;
      this.wanderX = Math.cos(ang) * rr;
      this.wanderZ = Math.sin(ang) * rr;
      // Elegir rival cercano.
      let best = -1;
      let bestD = Infinity;
      for (const p of w.players) {
        if (p.id === me.id || p.status !== STATUS_ALIVE) continue;
        const d = Math.hypot(p.x - me.x, p.z - me.z) + Math.random() * 4;
        if (d < bestD) { bestD = d; best = p.id; }
      }
      this.targetId = best;
    }

    // En la carrera apenas se desvían del centro (y nada al llegar al trampolín).
    let tx = gx + this.wanderX;
    let tz = map.goalZ !== undefined ? gz : gz + this.wanderZ;
    // Carrera: seguir la ruta y esperar si el siguiente tramo no tiene suelo todavía.
    let waitForGround = false;
    if (map.path) {
      // Salida escalonada para no ir todos en pelotón contra la primera barra.
      if (t < (this.reaction - 0.15) * 6) waitForGround = true;
      const wp = map.path.find(([, z]) => z > me.z + 0.8) ?? map.path[map.path.length - 1]!;
      tx = wp[0];
      tz = wp[1];
      wantFight = false;
      const g = groundHeightAt(w.solids, wp[0], wp[1], me.y + 5, 0.3);
      const dist = Math.hypot(wp[0] - me.x, wp[1] - me.z);
      if (g === -Infinity && me.grounded && dist < 5) waitForGround = true;
      // Plataformas que desaparecen: elegir el lado (izquierda/derecha) que seguirá
      // firme un rato; si ninguno, esperar antes de saltar.
      const steady = (x: number, z: number) => {
        const vb = map.boxes.find((bx) => bx.kind === 'vanish' && Math.abs(bx.x - x) < bx.w / 2 && Math.abs(bx.z - z) < bx.d / 2);
        if (!vb) return null;
        const later = vanishState(vb, t + 1);
        return vanishState(vb, t).solid && later.solid && later.warn === 0;
      };
      const here = steady(wp[0], wp[1]);
      if (here !== null && dist < 7) {
        if (here) { tx = wp[0]; }
        else if (steady(-wp[0], wp[1])) { tx = -wp[0]; }
        else if (me.grounded) waitForGround = true;
      }
    }
    let attack = false;
    let interact = false;

    const target = w.players.find((p) => p.id === this.targetId && p.status === STATUS_ALIVE);
    // Buscar arma si vamos a puñetazos.
    let weaponTarget: { x: number; z: number; d: number } | null = null;
    if (me.weapon === 'fists') {
      for (const wp of w.weapons) {
        if (!wp.landed || Math.abs(wp.y - me.y) > 2.5) continue;
        const d = Math.hypot(wp.x - me.x, wp.z - me.z);
        if (d < 16 && (!weaponTarget || d < weaponTarget.d)) weaponTarget = { x: wp.x, z: wp.z, d };
      }
    }
    if (weaponTarget && (map.goalZ === undefined || weaponTarget.d < 6)) {
      tx = weaponTarget.x;
      tz = weaponTarget.z;
      if (weaponTarget.d < 1.6) {
        this.interactToggle = !this.interactToggle;
        interact = this.interactToggle;
      }
    } else if (target && wantFight) {
      const d = Math.hypot(target.x - me.x, target.z - me.z);
      if (d < 18 * this.aggression || map.goalZ === undefined) {
        tx = target.x;
        tz = target.z;
        const range = WEAPONS[me.weapon].range;
        if (d < range + 0.3 && Math.abs(target.y - me.y) < 1.4 && Math.random() < 0.6 - this.reaction) attack = true;
        if (target.atk >= 0 && d < 3.2 && Math.random() < 0.08) this.blockUntil = t + 0.6;
      }
    }

    // Ronda de energía: recoger, entregar o robar a quien lleva núcleos.
    if (map.energy) {
      const zone = map.energy.zones[energyZoneIndex(map.energy, t)]!;
      let core: { x: number; z: number; d: number } | null = null;
      for (const c of w.cores) {
        if (Math.abs(c.y - me.y) > 3) continue;
        const d = Math.hypot(c.x - me.x, c.z - me.z);
        if (!core || d < core.d) core = { x: c.x, z: c.z, d };
      }
      const carrier = w.players.find((p) => p.id !== me.id && p.carry > 0 && p.status === STATUS_ALIVE && Math.hypot(p.x - me.x, p.z - me.z) < 5);
      if (carrier && me.carry < 2) {
        tx = carrier.x; tz = carrier.z;
        if (Math.hypot(carrier.x - me.x, carrier.z - me.z) < WEAPONS[me.weapon].range + 0.3 && Math.random() < 0.5) attack = true;
      } else if (me.carry >= 2 || (me.carry > 0 && (!core || core.d > 9))) {
        tx = zone[0]; tz = zone[1];
      } else if (core) {
        tx = core.x; tz = core.z;
      }
    }

    // Mantenerse dentro de zonas seguras.
    const cyl = map.cyls[0];
    if (cyl && !map.energy) {
      const r = cylRadius(cyl, t);
      const d = Math.hypot(me.x - cyl.x, me.z - cyl.z);
      if (d > r - 2.2 && Math.hypot(tx, tz) > r - 2.5) {
        tx = cyl.x + this.wanderX * 0.3;
        tz = cyl.z + this.wanderZ * 0.3;
      }
      if (cyl.sectors) {
        const sec = sectorIndexAt(me.x, me.z, cyl.x, cyl.z, cyl.sectors);
        if (d > (cyl.inner ?? 0) && sectorState(t, sec, cyl.sectors) !== 0) {
          // Ir al centro (siempre sólido).
          tx = cyl.x + 1.8;
          tz = cyl.z;
        }
      }
    }

    let dx = tx - me.x;
    let dz = tz - me.z;
    const dl = Math.hypot(dx, dz);
    if (dl > 0.4 && !waitForGround) { dx /= dl; dz /= dl; } else { dx = 0; dz = 0; }

    // Evitar bordes: comprobar el suelo delante.
    let jump = false;
    if (dx !== 0 || dz !== 0) {
      const here = groundHeightAt(w.solids, me.x, me.z, me.y + 0.6);
      const ahead = groundHeightAt(w.solids, me.x + dx * 1.3, me.z + dz * 1.3, me.y + 0.6);
      if (here > -Infinity && ahead < me.y - 1.2) {
        // ¿Hay suelo más lejos? Entonces saltar el hueco.
        let far = -Infinity;
        for (const k of [2.5, 3.5, 4.5]) {
          far = Math.max(far, groundHeightAt(w.solids, me.x + dx * k, me.z + dz * k, me.y + 1.6));
        }
        if (far > me.y - 1 && me.grounded) {
          jump = true;
        } else {
          // Girar hacia el centro del mapa.
          const cx = map.goalZ !== undefined ? 0 : -me.x;
          const cz = map.goalZ !== undefined ? 0 : -me.z;
          const cl = Math.hypot(cx, cz) || 1;
          dx = cx / cl;
          dz = map.goalZ !== undefined ? 0.3 : cz / cl;
          if (map.goalZ !== undefined) { dx = -Math.sign(me.x) || 0; dz = 0; }
        }
      }
      // Escalones y cajas.
      const step = groundHeightAt(w.solids, me.x + dx * 1, me.z + dz * 1, me.y + 2.2);
      if (step > me.y + 0.45 && step < me.y + 2 && me.grounded) jump = true;
    }

    // Barras giratorias: saltarlas justo a tiempo o esperar fuera a que pasen.
    for (const b of map.bars) {
      if (b.y < me.y - 0.2 || b.y > me.y + PLAYER_HEIGHT) continue;
      // Posición futura propia (vamos corriendo) contra la barra futura.
      let near = Infinity;
      for (const k of [0.08, 0.16, 0.26, 0.36]) near = Math.min(near, barDist(b, t + k, me.x + me.vx * k, me.z + me.vz * k));
      if (near < 1.5 && me.grounded) jump = true;
      const outside = Math.hypot(me.x - b.x, me.z - b.z) > b.len + 0.4;
      if (outside && (dx !== 0 || dz !== 0) && me.grounded) {
        const nx = me.x + dx * 1.6;
        const nz = me.z + dz * 1.6;
        for (const k of [0.2, 0.45, 0.7, 0.95]) {
          if (barDist(b, t + k, nx, nz) < 1.6) { dx = 0; dz = 0; break; }
        }
      }
    }

    out.mx = dx;
    out.mz = dz;
    out.yaw = target ? Math.atan2(target.x - me.x, target.z - me.z) : Math.atan2(dx, dz);
    // El salto se activa al pulsar: soltar un tick entre saltos seguidos.
    if (jump && !this.jumpPressed) out.b |= INPUT_JUMP;
    this.jumpPressed = jump && !this.jumpPressed;
    if (attack) out.b |= INPUT_ATTACK;
    if (interact) out.b |= INPUT_INTERACT;
    if (t < this.blockUntil) out.b |= INPUT_BLOCK;
    return out;
  }
}

/** Distancia horizontal de un punto a una barra giratoria en el instante t. */
function barDist(b: MapDef['bars'][number], t: number, x: number, z: number): number {
  const a = barAngle(b, t);
  const ux = Math.cos(a);
  const uz = Math.sin(a);
  const px = x - b.x;
  const pz = z - b.z;
  const u = Math.max(b.oneSided ? 0 : -b.len, Math.min(b.len, px * ux + pz * uz));
  return Math.hypot(px - ux * u, pz - uz * u);
}
