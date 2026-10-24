// Escenario 3D de fondo del menú: gelatinas que corretean, saltan, rebotan y
// se caen de la isla (usando la misma física del juego) mientras la cámara gira.
import * as THREE from 'three';
import { ACCESSORIES, DT, EYES, PALETTE, type Look } from '../../shared/constants.ts';
import { MAPS } from '../../shared/maps.ts';
import { type PhysState, buildSolids, groundHeightAt, newPhysState, stepPlayer } from '../../shared/physics.ts';
import { Fx } from './fx.ts';
import { Jelly } from './jelly.ts';
import { WorldView } from './world.ts';

/** Isla lateral del mapa 1 donde posa la vista previa del personaje. */
const PREVIEW = { x: -25, y: 0.5, z: 0 };

interface Npc { jelly: Jelly; s: PhysState; dir: number; nextTurn: number; jumpAt: number; yaw: number }

export class MenuScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
  private world: WorldView;
  private npcs: Npc[] = [];
  private preview: Jelly | null = null;
  private previewMode = false;
  private t = 0;
  private acc = 0;
  private fx: Fx;
  private map = MAPS[0]!;
  private solids = buildSolids(this.map, 0, '');

  constructor() {
    this.world = new WorldView(this.map, this.scene);
    this.fx = new Fx(this.scene);
    for (let i = 0; i < 9; i++) {
      const look: Look = { color: PALETTE[i % PALETTE.length]!, accessory: ACCESSORIES[(i * 3) % ACCESSORIES.length]!, eyes: EYES[i % EYES.length]! };
      const j = new Jelly(look);
      this.scene.add(j.root);
      const a = (i / 9) * Math.PI * 2;
      this.npcs.push({ jelly: j, s: newPhysState(Math.cos(a) * 6, 2 + i, Math.sin(a) * 6), dir: Math.random() * 6.28, nextTurn: 0, jumpAt: Math.random() * 3, yaw: 0 });
    }
  }

  setPreview(look: Look | null): void {
    this.preview?.dispose();
    this.preview = null;
    this.previewMode = !!look;
    if (look) {
      this.preview = new Jelly(look);
      this.preview.root.position.set(PREVIEW.x, PREVIEW.y, PREVIEW.z);
      this.preview.root.scale.setScalar(1.6);
      this.scene.add(this.preview.root);
      this.preview.poke(6);
    }
  }

  frame(dt: number, renderer: THREE.WebGLRenderer): void {
    this.t += dt;
    this.acc += dt;
    while (this.acc >= DT) {
      this.acc -= DT;
      this.solids = buildSolids(this.map, this.t, '');
      for (const n of this.npcs) this.stepNpc(n);
    }
    for (const n of this.npcs) {
      n.jelly.root.position.set(n.s.x, n.s.y, n.s.z);
      n.jelly.setGround(groundHeightAt(this.solids, n.s.x, n.s.z, n.s.y + 0.3, 0.3));
      n.jelly.update(dt, { vx: n.s.vx, vy: n.s.vy, vz: n.s.vz, grounded: n.s.grounded, yaw: n.yaw, atk: -1, atkW: 'fists', weapon: 'fists', blocking: false, stun: n.s.stun, invuln: 0 });
    }
    this.world.update(this.t, dt, '', this.t);
    this.fx.update(dt);

    if (this.preview) {
      this.preview.setGround(PREVIEW.y);
      this.preview.update(dt, { vx: 0, vy: 0, vz: 0, grounded: true, yaw: Math.sin(this.t * 0.8) * 0.5 + 0.35, happy: Math.sin(this.t * 0.9) > 0.7, atk: -1, atkW: 'fists', weapon: 'fists', blocking: false, stun: 0, invuln: 0 });
      if (Math.sin(this.t * 2.2) > 0.995) this.preview.poke(3);
    }

    if (this.previewMode) {
      // La gominola de muestra está en la isla lateral, a la izquierda del panel.
      this.camera.position.lerp(new THREE.Vector3(PREVIEW.x + 2.4, PREVIEW.y + 2.1, PREVIEW.z + 6.5), Math.min(1, dt * 4));
      this.camera.lookAt(PREVIEW.x + 1.9, PREVIEW.y + 1.1, PREVIEW.z);
    } else {
      const a = this.t * 0.06;
      this.camera.position.set(Math.cos(a) * 24, 9, Math.sin(a) * 24);
      this.camera.lookAt(-Math.sin(a) * 6, 1, Math.cos(a) * 6);
    }
    this.world.sun.position.set(25, 45, 18);
    renderer.render(this.scene, this.camera);
  }

  private stepNpc(n: Npc): void {
    if (this.t > n.nextTurn) {
      n.nextTurn = this.t + 1 + Math.random() * 2.5;
      // Tienden hacia el centro pero a veces se despistan y se caen.
      const toCenter = Math.atan2(-n.s.x, -n.s.z);
      n.dir = Math.random() < 0.75 ? toCenter + (Math.random() - 0.5) * 2.4 : Math.random() * Math.PI * 2;
    }
    const jump = this.t > n.jumpAt;
    if (jump) n.jumpAt = this.t + 0.8 + Math.random() * 3;
    const mx = Math.sin(n.dir);
    const mz = Math.cos(n.dir);
    stepPlayer(n.s, { mx, mz, jump, run: Math.random() < 0.3, block: false }, this.map, this.solids, this.t, DT);
    n.yaw = Math.atan2(mx, mz);
    // Choques graciosos entre ellas.
    for (const o of this.npcs) {
      if (o === n) continue;
      const dx = o.s.x - n.s.x;
      const dz = o.s.z - n.s.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.1 && Math.abs(o.s.y - n.s.y) < 1 && n.s.stun <= 0 && Math.random() < 0.08) {
        o.s.vx = (dx / (d || 1)) * 9;
        o.s.vz = (dz / (d || 1)) * 9;
        o.s.vy = 6;
        o.s.stun = 0.6;
        o.s.grounded = false;
        o.jelly.poke(4);
        this.fx.burst({ x: o.s.x, y: o.s.y + 0.8, z: o.s.z }, ['#ffffff', '#ffd23f'], 10, 5, 0.5);
      }
    }
    if (n.s.y < -25) {
      const a = Math.random() * Math.PI * 2;
      Object.assign(n.s, newPhysState(Math.cos(a) * 4, 12, Math.sin(a) * 4));
    }
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
