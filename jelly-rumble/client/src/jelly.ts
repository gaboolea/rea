// Personaje gelatinoso: cuerpo con material brillante y vibración en el
// shader, deformación elástica (squash & stretch), animaciones procedurales de
// andar, saltar, atacar, bloquear, aturdimiento y eliminación.
import * as THREE from 'three';
import { WEAPONS, type Look, type WeaponType } from '../../shared/constants.ts';

const tmpColor = new THREE.Color();

export function makeJellyMaterial(color: string): THREE.MeshPhysicalMaterial & { userData: { uniforms?: { uTime: { value: number }; uWobble: { value: number } } } } {
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.28,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.15,
    sheen: 0.6,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.6),
    emissive: new THREE.Color(color).multiplyScalar(0.12),
    transparent: true,
    opacity: 0.94,
  });
  const uniforms = { uTime: { value: 0 }, uWobble: { value: 0.02 } };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWobble = uniforms.uWobble;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWobble;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float w = sin(position.y * 7.0 + uTime * 9.0) * 0.6 + sin(position.x * 5.0 - uTime * 7.0) * 0.4;
        transformed += normal * w * uWobble;`,
      );
  };
  return mat as never;
}

const SHARED = {
  white: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }),
  black: new THREE.MeshStandardMaterial({ color: '#1a1030', roughness: 0.2 }),
  cheek: new THREE.MeshBasicMaterial({ color: '#ff8fb1', transparent: true, opacity: 0.55 }),
  gold: new THREE.MeshStandardMaterial({ color: '#ffcf33', metalness: 0.6, roughness: 0.3, emissive: '#553300' }),
  steel: new THREE.MeshStandardMaterial({ color: '#dfe8f5', metalness: 0.8, roughness: 0.2 }),
  wood: new THREE.MeshStandardMaterial({ color: '#8a5a2b', roughness: 0.8 }),
  hammerHead: new THREE.MeshStandardMaterial({ color: '#ff6a3d', roughness: 0.4, emissive: '#401000' }),
  quake: new THREE.MeshStandardMaterial({ color: '#b06dff', roughness: 0.2, emissive: '#5a1aff', emissiveIntensity: 0.8 }),
  green: new THREE.MeshStandardMaterial({ color: '#4cd964', roughness: 0.5 }),
  red: new THREE.MeshStandardMaterial({ color: '#ff3b5c', roughness: 0.4 }),
  shield: new THREE.MeshBasicMaterial({ color: '#7fe7ff', transparent: true, opacity: 0.28, depthWrite: false }),
  star: new THREE.MeshBasicMaterial({ color: '#ffe14d' }),
};

const GEO = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  lowSphere: new THREE.SphereGeometry(1, 10, 8),
  body: new THREE.CapsuleGeometry(0.5, 0.42, 10, 24),
  star: new THREE.OctahedronGeometry(0.12),
};

/** Construye la malla de un arma (para la mano o para el suelo). */
export function makeWeaponMesh(type: WeaponType): THREE.Group {
  const g = new THREE.Group();
  if (type === 'sword') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.04), SHARED.steel);
    blade.position.y = 0.75;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.22, 4), SHARED.steel);
    tip.position.y = 1.4;
    tip.rotation.y = Math.PI / 4;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.12), SHARED.gold);
    guard.position.y = 0.2;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), SHARED.wood);
    grip.position.y = 0.02;
    g.add(blade, tip, guard, grip);
  } else if (type === 'hammer') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), SHARED.wood);
    handle.position.y = 0.5;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 16), SHARED.hammerHead);
    head.rotation.z = Math.PI / 2;
    head.position.y = 1.15;
    const band1 = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 16), SHARED.gold);
    band1.rotation.z = Math.PI / 2;
    band1.position.set(0.3, 1.15, 0);
    const band2 = band1.clone();
    band2.position.x = -0.3;
    g.add(handle, head, band1, band2);
  } else if (type === 'quake') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8), SHARED.gold);
    handle.position.y = 0.45;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0), SHARED.quake);
    head.position.y = 1.15;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.04, 8, 24), SHARED.gold);
    ring.position.y = 1.15;
    ring.rotation.x = Math.PI / 2;
    g.add(handle, head, ring);
  }
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

function makeAccessory(kind: Look['accessory'], color: string): THREE.Object3D | null {
  const g = new THREE.Group();
  switch (kind) {
    case 'crown': {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.16, 12, 1, true), SHARED.gold);
      base.material = SHARED.gold;
      g.add(base);
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), SHARED.gold);
        const a = (i / 5) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 0.25, 0.15, Math.sin(a) * 0.25);
        g.add(sp);
      }
      g.position.y = 0.08;
      break;
    }
    case 'cone': {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 16), new THREE.MeshStandardMaterial({ color: '#3bb4ff', roughness: 0.5 }));
      c.position.y = 0.25;
      c.rotation.z = -0.25;
      const pom = new THREE.Mesh(GEO.lowSphere, SHARED.star);
      pom.scale.setScalar(0.09);
      pom.position.set(0.13, 0.52, 0);
      g.add(c, pom);
      break;
    }
    case 'antenna': {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6), SHARED.black);
      stick.position.y = 0.22;
      const ball = new THREE.Mesh(GEO.lowSphere, new THREE.MeshStandardMaterial({ color: tmpColor.set(color).offsetHSL(0.5, 0, 0).getStyle(), emissive: '#333333' }));
      ball.scale.setScalar(0.1);
      ball.position.y = 0.48;
      g.add(stick, ball);
      break;
    }
    case 'bow': {
      const m = new THREE.MeshStandardMaterial({ color: '#ff3b8d', roughness: 0.5 });
      const l = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 4), m);
      l.rotation.z = Math.PI / 2;
      l.position.x = -0.12;
      const r = l.clone();
      r.rotation.z = -Math.PI / 2;
      r.position.x = 0.12;
      const k = new THREE.Mesh(GEO.lowSphere, m);
      k.scale.setScalar(0.06);
      g.add(l, r, k);
      g.position.set(0.18, 0, 0.1);
      g.rotation.z = -0.3;
      break;
    }
    case 'horns': {
      const m = new THREE.MeshStandardMaterial({ color: '#fff3d6', roughness: 0.6 });
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 10), m);
        h.position.set(0.2 * s, 0.05, 0);
        h.rotation.z = -0.5 * s;
        g.add(h);
      }
      break;
    }
    case 'tophat': {
      const m = new THREE.MeshStandardMaterial({ color: '#2a2a3a', roughness: 0.6 });
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 20), m);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.35, 20), m);
      top.position.y = 0.18;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.06, 20), SHARED.red);
      band.position.y = 0.05;
      g.add(brim, top, band);
      g.rotation.z = 0.12;
      break;
    }
    case 'leaf': {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), SHARED.green);
      stem.position.y = 0.1;
      const leaf = new THREE.Mesh(GEO.lowSphere, SHARED.green);
      leaf.scale.set(0.16, 0.04, 0.08);
      leaf.position.set(0.12, 0.2, 0);
      leaf.rotation.z = 0.5;
      const leaf2 = leaf.clone();
      leaf2.position.x = -0.12;
      leaf2.rotation.z = -0.5;
      g.add(stem, leaf, leaf2);
      break;
    }
    default:
      return null;
  }
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

function makeNameTag(name: string, bot: boolean, me: boolean): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = '700 30px Fredoka, "Trebuchet MS", sans-serif';
  const label = bot ? `🤖 ${name}` : name;
  const w = Math.min(250, ctx.measureText(label).width + 28);
  ctx.fillStyle = me ? 'rgba(214,58,92,0.9)' : bot ? 'rgba(90,70,160,0.85)' : 'rgba(43,29,74,0.8)';
  const x = (256 - w) / 2;
  ctx.beginPath();
  ctx.roundRect(x, 10, w, 44, 18);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 33, 230);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(2, 0.5, 1);
  sp.renderOrder = 10;
  return sp;
}

export interface JellyPose {
  vx: number; vy: number; vz: number;
  grounded: boolean;
  yaw: number;
  atk: number;
  atkW: WeaponType;
  weapon: WeaponType;
  blocking: boolean;
  stun: number;
  invuln: number;
}

export class Jelly {
  root = new THREE.Group();
  private body = new THREE.Group();
  private bodyMesh: THREE.Mesh;
  private mat: ReturnType<typeof makeJellyMaterial>;
  private handL = new THREE.Group();
  private handR = new THREE.Group();
  private footL: THREE.Mesh;
  private footR: THREE.Mesh;
  private eyes = new THREE.Group();
  private weapons: Record<WeaponType, THREE.Object3D | null>;
  private shield: THREE.Mesh;
  private stars = new THREE.Group();
  private tag: THREE.Sprite | null = null;
  private squash = 1;
  private squashV = 0;
  private lean = 0;
  private walkPhase = 0;
  private yawShown = 0;
  private wasGrounded = true;
  private time = Math.random() * 10;

  constructor(public look: Look, name?: string, opts: { bot?: boolean; me?: boolean } = {}) {
    this.mat = makeJellyMaterial(look.color);
    this.bodyMesh = new THREE.Mesh(GEO.body, this.mat);
    this.bodyMesh.position.y = 0.72;
    this.bodyMesh.scale.set(1, 1, 0.92);
    this.bodyMesh.castShadow = true;
    this.body.add(this.bodyMesh);

    // Ojos
    const eyeY = 0.98;
    for (const s of [-1, 1]) {
      const white = new THREE.Mesh(GEO.sphere, SHARED.white);
      white.scale.set(0.13, look.eyes === 'sleepy' ? 0.07 : 0.15, 0.08);
      white.position.set(0.16 * s, eyeY, 0.42);
      const pupil = new THREE.Mesh(GEO.sphere, SHARED.black);
      pupil.scale.set(0.065, look.eyes === 'sleepy' ? 0.035 : 0.075, 0.05);
      pupil.position.set(0.16 * s, eyeY - 0.01, 0.48);
      this.eyes.add(white, pupil);
      if (look.eyes === 'angry') {
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), SHARED.black);
        brow.position.set(0.16 * s, eyeY + 0.15, 0.45);
        brow.rotation.z = 0.35 * s;
        this.eyes.add(brow);
      }
      if (look.eyes === 'happy') {
        pupil.scale.set(0.09, 0.03, 0.05);
        pupil.position.y = eyeY + 0.03;
        white.visible = false;
      }
      const cheek = new THREE.Mesh(GEO.lowSphere, SHARED.cheek);
      cheek.scale.set(0.08, 0.05, 0.03);
      cheek.position.set(0.28 * s, eyeY - 0.17, 0.4);
      this.eyes.add(cheek);
    }
    // Boca
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 12, Math.PI), SHARED.black);
    mouth.position.set(0, eyeY - 0.17, 0.47);
    mouth.rotation.z = Math.PI;
    this.eyes.add(mouth);
    this.body.add(this.eyes);

    const acc = makeAccessory(look.accessory, look.color);
    if (acc) {
      acc.position.y += 1.33;
      this.body.add(acc);
    }

    // Manos y pies
    const limbMat = makeJellyMaterial(look.color);
    for (const [hand, s] of [[this.handL, -1], [this.handR, 1]] as const) {
      const m = new THREE.Mesh(GEO.sphere, limbMat);
      m.scale.setScalar(0.13);
      m.castShadow = true;
      hand.add(m);
      hand.position.set(0.55 * s, 0.62, 0.05);
      this.body.add(hand);
    }
    this.footL = new THREE.Mesh(GEO.sphere, limbMat);
    this.footR = new THREE.Mesh(GEO.sphere, limbMat);
    for (const [f, s] of [[this.footL, -1], [this.footR, 1]] as const) {
      f.scale.set(0.15, 0.09, 0.2);
      f.position.set(0.2 * s, 0.08, 0.05);
      f.castShadow = true;
      this.root.add(f);
    }

    this.weapons = { fists: null, sword: makeWeaponMesh('sword'), hammer: makeWeaponMesh('hammer'), quake: makeWeaponMesh('quake') };
    for (const w of Object.values(this.weapons)) {
      if (!w) continue;
      w.visible = false;
      w.scale.setScalar(0.85);
      this.handR.add(w);
    }

    this.shield = new THREE.Mesh(GEO.sphere, SHARED.shield);
    this.shield.scale.set(0.95, 1.05, 0.95);
    this.shield.position.y = 0.75;
    this.shield.visible = false;
    this.body.add(this.shield);

    for (let i = 0; i < 4; i++) {
      const st = new THREE.Mesh(GEO.star, SHARED.star);
      const a = (i / 4) * Math.PI * 2;
      st.position.set(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4);
      this.stars.add(st);
    }
    this.stars.position.y = 1.6;
    this.stars.visible = false;
    this.body.add(this.stars);

    this.root.add(this.body);
    if (name) {
      this.tag = makeNameTag(name, !!opts.bot, !!opts.me);
      this.tag.position.y = 2.15;
      this.root.add(this.tag);
    }
  }

  /** Impulso de deformación (aterrizaje, golpe). */
  poke(amount: number): void {
    this.squashV -= amount;
  }

  setTagVisible(v: boolean): void {
    if (this.tag) this.tag.visible = v;
  }

  update(dt: number, p: JellyPose): void {
    this.time += dt;
    const u = this.mat.userData.uniforms;
    const hSpeed = Math.hypot(p.vx, p.vz);

    // Orientación suave.
    let dy = p.yaw - this.yawShown;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yawShown += dy * Math.min(1, dt * 14);
    this.root.rotation.y = this.yawShown;

    // Deformación elástica.
    if (p.grounded && !this.wasGrounded) this.poke(1.8);
    this.wasGrounded = p.grounded;
    const target = p.grounded ? 1 : 1 + THREE.MathUtils.clamp(p.vy * 0.018, -0.15, 0.22);
    this.squashV += (target - this.squash) * 220 * dt;
    this.squashV *= Math.exp(-11 * dt);
    this.squash += this.squashV * dt;
    const sq = THREE.MathUtils.clamp(this.squash, 0.6, 1.45);
    this.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    if (u) {
      u.uTime.value = this.time;
      u.uWobble.value = 0.015 + Math.min(0.05, Math.abs(this.squashV) * 0.01) + (p.stun > 0 ? 0.03 : 0);
    }

    // Caminar.
    const moving = p.grounded && hSpeed > 0.5;
    this.walkPhase += dt * (moving ? 4 + hSpeed * 1.4 : 0);
    const sw = moving ? Math.sin(this.walkPhase) : 0;
    this.footL.position.z = 0.05 + sw * 0.22;
    this.footR.position.z = 0.05 - sw * 0.22;
    this.footL.position.y = 0.08 + Math.max(0, -sw) * 0.1;
    this.footR.position.y = 0.08 + Math.max(0, sw) * 0.1;
    this.body.position.y = moving ? Math.abs(Math.cos(this.walkPhase)) * 0.08 : 0;
    const targetLean = p.stun > 0 ? 0 : Math.min(0.25, hSpeed * 0.025);
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 8);

    // Aturdido: tambaleo.
    if (p.stun > 0) {
      this.body.rotation.x = Math.sin(this.time * 14) * 0.35;
      this.body.rotation.z = Math.cos(this.time * 11) * 0.35;
      this.stars.visible = true;
      this.stars.rotation.y += dt * 6;
    } else {
      this.body.rotation.x = this.lean;
      this.body.rotation.z *= Math.exp(-10 * dt);
      this.stars.visible = false;
    }
    if (!p.grounded && p.stun <= 0) {
      this.footL.position.y = 0.2;
      this.footR.position.y = 0.2;
    }

    // Armas visibles.
    for (const [k, m] of Object.entries(this.weapons)) {
      if (m) m.visible = k === p.weapon || (p.atk >= 0 && k === p.atkW && k !== 'fists');
    }

    // Brazos: reposo, ataque o bloqueo.
    const restL = new THREE.Vector3(-0.55, 0.62 + (moving ? -sw * 0.06 : 0), 0.05 + (moving ? -sw * 0.15 : 0));
    const restR = new THREE.Vector3(0.55, 0.62 + (moving ? sw * 0.06 : 0), 0.05 + (moving ? sw * 0.15 : 0));
    this.handR.rotation.set(0, 0, 0);
    if (p.weapon !== 'fists' && p.atk < 0) this.handR.rotation.x = 0.5;
    if (p.atk >= 0) {
      const st = WEAPONS[p.atkW];
      const k = p.atk < st.windup ? p.atk / Math.max(0.001, st.windup) : 1 + (p.atk - st.windup) / 0.3;
      if (p.atkW === 'fists') {
        const ext = k < 1 ? -0.1 * k : Math.sin(Math.min(1, k - 1) * Math.PI) * 0.6;
        restR.set(0.35, 0.75, 0.25 + ext);
        restL.set(-0.4, 0.7, 0.3);
      } else if (p.atkW === 'sword') {
        // Tajo horizontal de derecha a izquierda.
        const a = k < 1 ? -1.2 * k : -1.2 + Math.min(1, k - 1) * 3;
        restR.set(Math.cos(a) * 0.55, 0.75, Math.sin(-a) * 0.35 + 0.25);
        this.handR.rotation.set(1.4, 0, -a);
      } else {
        // Golpe vertical por encima de la cabeza.
        const a = k < 1 ? -2.6 * k : -2.6 + Math.min(1, (k - 1) * 2.2) * 4.2;
        restR.set(0.3, 0.9, 0.2);
        this.handR.rotation.x = -a * 0.8 - 0.4;
      }
    } else if (p.blocking) {
      restL.set(-0.25, 0.85, 0.45);
      restR.set(0.25, 0.85, 0.45);
    }
    this.handL.position.lerp(restL, Math.min(1, dt * 20));
    this.handR.position.lerp(restR, Math.min(1, dt * 25));
    this.shield.visible = p.blocking;

    // Parpadeo de invulnerabilidad.
    this.mat.opacity = p.invuln > 0 && p.invuln < 50 ? (Math.sin(this.time * 30) > 0 ? 0.35 : 0.9) : 0.94;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.tag?.material.map?.dispose();
  }
}
