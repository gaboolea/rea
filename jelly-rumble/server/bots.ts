// IA de entrenamiento. Los bots solo existen si el anfitrión los añade y se
// marcan como bots en todas las listas, para no confundirlos con jugadores.
import { PLAYER_HEIGHT, WEAPONS } from '../shared/constants.ts';
import { type MapDef, barAngle, cylRadius, sectorIndexAt, sectorState } from '../shared/maps.ts';
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
}

export interface BotWorld {
  map: MapDef;
  t: number;
  solids: Solid[];
  players: BotView[];
  weapons: { x: number; y: number; z: number; landed: boolean }[];
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

    let tx = gx + this.wanderX;
    let tz = map.goalZ !== undefined ? gz : gz + this.wanderZ;
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

    // Mantenerse dentro de zonas seguras.
    const cyl = map.cyls[0];
    if (cyl) {
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
    if (dl > 0.4) { dx /= dl; dz /= dl; } else { dx = 0; dz = 0; }

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

    // Saltar barras que se acercan.
    for (const b of map.bars) {
      if (b.y < me.y - 0.2 || b.y > me.y + PLAYER_HEIGHT) continue;
      const a = barAngle(b, t + 0.25);
      const ux = Math.cos(a);
      const uz = Math.sin(a);
      const px = me.x - b.x;
      const pz = me.z - b.z;
      const lo = b.oneSided ? 0 : -b.len;
      const u = Math.max(lo, Math.min(b.len, px * ux + pz * uz));
      const d = Math.hypot(px - ux * u, pz - uz * u);
      if (d < 1.3 && me.grounded && Math.random() < 0.85) jump = true;
    }

    out.mx = dx;
    out.mz = dz;
    out.yaw = target ? Math.atan2(target.x - me.x, target.z - me.z) : Math.atan2(dx, dz);
    if (jump) out.b |= INPUT_JUMP;
    if (attack) out.b |= INPUT_ATTACK;
    if (interact) out.b |= INPUT_INTERACT;
    if (t < this.blockUntil) out.b |= INPUT_BLOCK;
    return out;
  }
}
