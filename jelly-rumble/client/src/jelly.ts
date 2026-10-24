// Personaje gelatinoso: cuerpo en forma de gominola (torno), contorno de
// dibujo animado, cara pintada en una textura con expresiones (parpadeo,
// golpe, mareo, alegría), bracitos elásticos y sombra de contacto. Todo opaco
// y con pocas llamadas de dibujo para que vaya fluido en móviles.
import * as THREE from 'three';
import { WEAPONS, type EyeStyle, type Look, type WeaponType } from '../../shared/constants.ts';

const tmpColor = new THREE.Color();

type Uniforms = { uTime: { value: number }; uWobble: { value: number } };

/** Añade la vibración gelatinosa (vértices) y un brillo de borde (fresnel). */
function jellify<M extends THREE.Material>(mat: M, opts: { rim?: THREE.Color; extrude?: number }): M & { userData: { uniforms: Uniforms } } {
  const uniforms: Uniforms = { uTime: { value: 0 }, uWobble: { value: 0.015 } };
  mat.userData.uniforms = uniforms;
  const rim = opts.rim;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWobble = uniforms.uWobble;
    if (rim) shader.uniforms.uRim = { value: rim };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWobble;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float jw = sin(position.y * 6.0 + uTime * 9.0) * 0.6 + sin(position.x * 5.0 - uTime * 7.0) * 0.4;
        transformed += normal * (jw * uWobble + ${(opts.extrude ?? 0).toFixed(3)});`,
      );
    if (rim) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
        .replace(
          '#include <opaque_fragment>',
          `float rimF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.6);
          outgoingLight += uRim * rimF * 0.65;
          #include <opaque_fragment>`,
        );
    }
  };
  mat.customProgramCacheKey = () => (rim ? 'jelly-rim' : `jelly-${opts.extrude ?? 0}`);
  return mat as never;
}

// ------------------------------------------------------------ Geometrías

/** Perfil de gominola: base ancha, cabeza redondeada. */
const PROFILE = new THREE.SplineCurve([
  new THREE.Vector2(0.0, 0.0),
  new THREE.Vector2(0.38, 0.02),
  new THREE.Vector2(0.55, 0.13),
  new THREE.Vector2(0.6, 0.38),
  new THREE.Vector2(0.575, 0.72),
  new THREE.Vector2(0.5, 1.02),
  new THREE.Vector2(0.37, 1.25),
  new THREE.Vector2(0.19, 1.39),
  new THREE.Vector2(0.0, 1.43),
]).getSpacedPoints(30);

const FACE_PHI = (150 * Math.PI) / 180;

const GEO = {
  body: new THREE.LatheGeometry(PROFILE, 32),
  face: new THREE.LatheGeometry(PROFILE.map((p) => new THREE.Vector2(p.x * 1.012 + 0.002, p.y)), 18, Math.PI - FACE_PHI / 2, FACE_PHI),
  sphere: new THREE.SphereGeometry(1, 14, 10),
  arm: new THREE.CylinderGeometry(0.075, 0.085, 1, 8, 1),
  star: new THREE.OctahedronGeometry(0.12),
  shadow: new THREE.CircleGeometry(0.62, 24),
};
// El torno empieza en -z: girar la cara para que quede mirando a +z.
GEO.face.rotateY(Math.PI);

/** Posición en la textura de la cara para un punto del cuerpo (x lateral, y altura). */
function faceUV(x: number, y: number): [number, number] {
  // v: índice del punto del perfil a esa altura en el lateral.
  let idx = 0;
  for (let i = 1; i < PROFILE.length; i++) {
    const a = PROFILE[i - 1]!;
    const b = PROFILE[i]!;
    if (a.y <= y && b.y >= y && b.x > 0.15) {
      idx = i - 1 + (y - a.y) / Math.max(1e-4, b.y - a.y);
      break;
    }
  }
  const v = idx / (PROFILE.length - 1);
  const r = Math.max(0.2, PROFILE[Math.round(idx)]?.x ?? 0.5);
  const ang = Math.asin(Math.max(-1, Math.min(1, x / r)));
  const u = 0.5 + ang / FACE_PHI;
  return [u, v];
}

const FACE_W = 256;
const FACE_H = 448;
export type Expression = 'normal' | 'blink' | 'hurt' | 'dizzy' | 'happy';
const faceCache = new Map<string, THREE.CanvasTexture>();

function faceTexture(eyes: EyeStyle, expr: Expression): THREE.CanvasTexture {
  const key = `${eyes}|${expr}`;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = FACE_W;
  c.height = FACE_H;
  const g = c.getContext('2d')!;
  const P = (x: number, y: number): [number, number] => {
    const [u, v] = faceUV(x, y);
    return [u * FACE_W, (1 - v) * FACE_H];
  };
  const S = 195; // píxeles por unidad (aprox.)
  const ink = '#24163d';
  const ellipse = (x: number, y: number, rx: number, ry: number, fill: string, rot = 0) => {
    const [px, py] = P(x, y);
    g.beginPath();
    g.ellipse(px, py, rx * S, ry * S, rot, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
  };

  // Barriga más clara y brillo especular (lo que da el aspecto de gominola).
  {
    const [bx, by] = P(0, 0.42);
    const grd = g.createRadialGradient(bx, by, 4, bx, by, 0.36 * S);
    grd.addColorStop(0, 'rgba(255,255,255,0.32)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(bx, by, 0.36 * S, 0.3 * S, 0, 0, Math.PI * 2);
    g.fill();
    const [hx, hy] = P(-0.24, 1.2);
    const hl = g.createRadialGradient(hx, hy, 2, hx, hy, 0.16 * S);
    hl.addColorStop(0, 'rgba(255,255,255,0.85)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl;
    g.beginPath();
    g.ellipse(hx, hy, 0.16 * S, 0.09 * S, -0.5, 0, Math.PI * 2);
    g.fill();
    ellipse(-0.33, 1.06, 0.03, 0.03, 'rgba(255,255,255,0.8)');
  }

  const EY = 0.94;
  const EX = 0.18;
  // Mejillas
  ellipse(-0.33, EY - 0.17, 0.075, 0.045, 'rgba(255,110,150,0.55)');
  ellipse(0.33, EY - 0.17, 0.075, 0.045, 'rgba(255,110,150,0.55)');

  g.lineCap = 'round';
  g.lineJoin = 'round';
  const stroke = (pts: [number, number][], w: number, color = ink) => {
    g.beginPath();
    pts.forEach(([x, y], i) => {
      const [px, py] = P(x, y);
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    });
    g.strokeStyle = color;
    g.lineWidth = w;
    g.stroke();
  };
  const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, w: number) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 12; i++) {
      const a = a0 + ((a1 - a0) * i) / 12;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    stroke(pts, w);
  };

  for (const s of [-1, 1]) {
    const x = EX * s;
    if (expr === 'blink' || (expr === 'happy' && eyes !== 'angry')) {
      if (expr === 'happy') arc(x, EY - 0.03, 0.09, 0.08, 0.15, Math.PI - 0.15, 9);
      else arc(x, EY + 0.02, 0.1, 0.05, Math.PI + 0.2, Math.PI * 2 - 0.2, 8);
    } else if (expr === 'hurt') {
      stroke([[x - 0.08 * s, EY + 0.07], [x + 0.07 * s, EY], [x - 0.08 * s, EY - 0.07]], 9);
    } else if (expr === 'dizzy') {
      const pts: [number, number][] = [];
      for (let i = 0; i < 40; i++) {
        const a = i * 0.45 * s;
        const r = 0.012 + i * 0.0024;
        pts.push([x + Math.cos(a) * r, EY + Math.sin(a) * r]);
      }
      stroke(pts, 5);
    } else if (eyes === 'happy') {
      arc(x, EY - 0.03, 0.09, 0.08, 0.15, Math.PI - 0.15, 9);
    } else {
      // Ojos abiertos con pupila grande y brillos.
      const rx = 0.12;
      const ry = eyes === 'sleepy' ? 0.1 : 0.14;
      ellipse(x, EY, rx + 0.018, ry + 0.018, ink);
      ellipse(x, EY, rx, ry, '#ffffff');
      ellipse(x + 0.02 * -s, EY - 0.02, 0.075, eyes === 'angry' ? 0.07 : 0.09, ink);
      ellipse(x + 0.01 * -s - 0.03, EY + 0.03, 0.03, 0.035, '#ffffff');
      ellipse(x + 0.01 * -s + 0.03, EY - 0.05, 0.014, 0.014, '#ffffff');
      if (eyes === 'sleepy') {
        // Párpado: tapa la mitad superior.
        const [px, py] = P(x, EY + 0.012);
        g.fillStyle = ink;
        g.beginPath();
        g.ellipse(px, py, (rx + 0.02) * S, (ry + 0.02) * S, 0, Math.PI, Math.PI * 2);
        g.fill();
      }
      if (eyes === 'angry') stroke([[x + 0.13 * s, EY + 0.2], [x - 0.08 * s, EY + 0.13]], 10);
    }
  }

  // Boca
  const MY = EY - 0.2;
  if (expr === 'hurt') {
    ellipse(0, MY - 0.02, 0.07, 0.06, ink);
    ellipse(0, MY - 0.05, 0.04, 0.025, '#ff6b8a');
  } else if (expr === 'dizzy') {
    stroke([[-0.09, MY], [-0.045, MY + 0.025], [0, MY], [0.045, MY + 0.025], [0.09, MY]], 7);
  } else if (expr === 'happy') {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI + (Math.PI * i) / 12;
      pts.push([Math.cos(a) * 0.1, MY + 0.03 + Math.sin(a) * 0.08]);
    }
    const [sx, sy] = P(pts[0]![0], pts[0]![1]);
    g.beginPath();
    g.moveTo(sx, sy);
    for (const [x, y] of pts) g.lineTo(...P(x, y));
    g.closePath();
    g.fillStyle = ink;
    g.fill();
    ellipse(0, MY - 0.03, 0.05, 0.025, '#ff6b8a');
  } else if (eyes === 'angry') {
    arc(0, MY - 0.05, 0.07, 0.04, 0.3, Math.PI - 0.3, 7);
  } else {
    arc(0, MY + 0.03, 0.08, 0.06, Math.PI + 0.35, Math.PI * 2 - 0.35, 7);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  faceCache.set(key, tex);
  return tex;
}

/** Sube a la GPU todas las caras de unos estilos de ojos (evita tirones al cambiar de expresión). */
export function preloadFaces(renderer: THREE.WebGLRenderer, eyes: Iterable<EyeStyle>): void {
  for (const e of new Set(eyes)) {
    for (const x of ['normal', 'blink', 'hurt', 'dizzy', 'happy'] as Expression[]) renderer.initTexture(faceTexture(e, x));
  }
}

let shadowTex: THREE.CanvasTexture | null = null;
function blobShadowTexture(): THREE.CanvasTexture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, 'rgba(20,10,40,0.55)');
  grd.addColorStop(0.6, 'rgba(20,10,40,0.3)');
  grd.addColorStop(1, 'rgba(20,10,40,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

const SHARED = {
  white: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }),
  black: new THREE.MeshStandardMaterial({ color: '#1a1030', roughness: 0.2 }),
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
const lowSphere = new THREE.SphereGeometry(1, 10, 8);


export function makeWeaponMesh(type: WeaponType | 'shield'): THREE.Group {
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
  } else if (type === 'gloves') {
    // Guante de boxeo grande con puño dorado.
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), SHARED.red);
    glove.scale.set(1, 0.9, 1.15);
    glove.position.y = 0.35;
    const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), SHARED.red);
    thumb.position.set(0.24, 0.3, 0.08);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.2, 14), SHARED.gold);
    cuff.position.y = 0.05;
    g.add(glove, thumb, cuff);
  } else if (type === 'shield') {
    // Escudo redondo (solo aparece en el suelo; al cogerlo se activa la burbuja).
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 24), SHARED.steel);
    disc.rotation.x = Math.PI / 2;
    disc.position.y = 0.6;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 8, 28), SHARED.gold);
    rim.position.y = 0.6;
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), SHARED.gold);
    boss.position.set(0, 0.6, 0.08);
    g.add(disc, rim, boss);
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
      const pom = new THREE.Mesh(lowSphere, SHARED.star);
      pom.scale.setScalar(0.09);
      pom.position.set(0.13, 0.52, 0);
      g.add(c, pom);
      break;
    }
    case 'antenna': {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6), SHARED.black);
      stick.position.y = 0.22;
      const ball = new THREE.Mesh(lowSphere, new THREE.MeshStandardMaterial({ color: tmpColor.set(color).offsetHSL(0.5, 0, 0).getStyle(), emissive: '#333333' }));
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
      const k = new THREE.Mesh(lowSphere, m);
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
      const leaf = new THREE.Mesh(lowSphere, SHARED.green);
      leaf.scale.set(0.16, 0.04, 0.08);
      leaf.position.set(0.12, 0.2, 0);
      leaf.rotation.z = 0.5;
      const leaf2 = leaf.clone();
      leaf2.position.x = -0.12;
      leaf2.rotation.z = -0.5;
      g.add(stem, leaf, leaf2);
      break;
    }
    case 'halo': {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.04, 10, 28), new THREE.MeshStandardMaterial({ color: '#fff3a8', emissive: '#ffd84a', emissiveIntensity: 0.9, roughness: 0.3 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.32;
      g.add(ring);
      break;
    }
    case 'chef': {
      const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.16, 18), m);
      band.position.y = 0.06;
      const puff = new THREE.Mesh(lowSphere, m);
      puff.scale.set(0.3, 0.22, 0.3);
      puff.position.y = 0.26;
      g.add(band, puff);
      break;
    }
    case 'viking': {
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), SHARED.steel);
      helm.position.y = -0.04;
      const m = new THREE.MeshStandardMaterial({ color: '#fff3d6', roughness: 0.6 });
      for (const sd of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.32, 10), m);
        h.position.set(0.3 * sd, 0.12, 0);
        h.rotation.z = -0.9 * sd;
        g.add(h);
      }
      g.add(helm);
      break;
    }
    case 'flowers': {
      const cols = ['#ff7ab8', '#ffe14d', '#ffffff', '#b28cff', '#ff9a4d', '#7fe7ff'];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const f = new THREE.Mesh(lowSphere, new THREE.MeshStandardMaterial({ color: cols[i], roughness: 0.5 }));
        f.scale.setScalar(0.075);
        f.position.set(Math.cos(a) * 0.22, 0.04, Math.sin(a) * 0.22);
        g.add(f);
      }
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
  /** Clasificado o ganador: cara feliz. */
  happy?: boolean;
  /** Escudo temporal activo: muestra la burbuja protectora. */
  shielded?: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

export class Jelly {
  root = new THREE.Group();
  private body = new THREE.Group();
  private bodyMat: ReturnType<typeof jellify<THREE.MeshStandardMaterial>>;
  private outlineMat: ReturnType<typeof jellify<THREE.MeshBasicMaterial>>;
  private faceMat: THREE.MeshBasicMaterial;
  private face: THREE.Mesh;
  private expr: Expression = 'normal';
  private handL = new THREE.Group();
  private handR = new THREE.Group();
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private footL: THREE.Mesh;
  private footR: THREE.Mesh;
  private weapons: Record<WeaponType, THREE.Object3D | null>;
  private shield: THREE.Mesh;
  private stars = new THREE.Group();
  private shadow: THREE.Mesh;
  private tag: THREE.Sprite | null = null;
  private squash = 1;
  private squashV = 0;
  private lean = 0;
  private walkPhase = 0;
  private yawShown = 0;
  private wasGrounded = true;
  private time = Math.random() * 10;
  private nextBlink = 2 + Math.random() * 3;
  private hurtUntil = 0;
  private restL = new THREE.Vector3();
  private restR = new THREE.Vector3();

  constructor(public look: Look, name?: string, opts: { bot?: boolean; me?: boolean } = {}) {
    const base = new THREE.Color(look.color);
    const rim = base.clone().lerp(new THREE.Color('#ffffff'), 0.65);
    this.bodyMat = jellify(new THREE.MeshStandardMaterial({
      color: base, roughness: 0.3, metalness: 0, emissive: base.clone().multiplyScalar(0.18),
    }), { rim });
    const dark = base.clone().offsetHSL(0, 0.05, -0.32);
    this.outlineMat = jellify(new THREE.MeshBasicMaterial({ color: dark, side: THREE.BackSide }), { extrude: 0.035 });
    const footMat = new THREE.MeshStandardMaterial({ color: base.clone().offsetHSL(0, 0, -0.12), roughness: 0.5 });

    const bodyMesh = new THREE.Mesh(GEO.body, this.bodyMat);
    const outline = new THREE.Mesh(GEO.body, this.outlineMat);
    this.faceMat = new THREE.MeshBasicMaterial({ map: faceTexture(look.eyes, 'normal'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.face = new THREE.Mesh(GEO.face, this.faceMat);
    this.face.renderOrder = 2;
    this.body.add(outline, bodyMesh, this.face);

    const acc = makeAccessory(look.accessory, look.color);
    if (acc) {
      acc.position.y += 1.36;
      this.body.add(acc);
    }

    // Bracitos elásticos (se estiran del hombro a la mano) y manos.
    this.armL = new THREE.Mesh(GEO.arm, this.bodyMat);
    this.armR = new THREE.Mesh(GEO.arm, this.bodyMat);
    this.body.add(this.armL, this.armR);
    for (const hand of [this.handL, this.handR]) {
      const m = new THREE.Mesh(lowSphere, this.bodyMat);
      m.scale.setScalar(0.13);
      hand.add(m);
      this.body.add(hand);
    }
    this.handL.position.set(-0.62, 0.55, 0.05);
    this.handR.position.set(0.62, 0.55, 0.05);

    this.footL = new THREE.Mesh(lowSphere, footMat);
    this.footR = new THREE.Mesh(lowSphere, footMat);
    for (const [f, s] of [[this.footL, -1], [this.footR, 1]] as const) {
      f.scale.set(0.17, 0.1, 0.22);
      f.position.set(0.22 * s, 0.08, 0.06);
      this.root.add(f);
    }

    this.weapons = { fists: null, sword: makeWeaponMesh('sword'), hammer: makeWeaponMesh('hammer'), quake: makeWeaponMesh('quake'), gloves: makeWeaponMesh('gloves') };
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
    this.stars.position.y = 1.65;
    this.stars.visible = false;
    this.body.add(this.stars);

    this.shadow = new THREE.Mesh(GEO.shadow, new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 1;
    this.root.add(this.shadow);

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
    if (amount >= 3) this.hurtUntil = this.time + 0.45;
  }

  setTagVisible(v: boolean): void {
    if (this.tag) this.tag.visible = v;
  }

  /** Altura del suelo bajo el personaje para la sombra de contacto (null = vacío). */
  setGround(y: number | null): void {
    if (y === null || !Number.isFinite(y)) {
      this.shadow.visible = false;
      return;
    }
    const h = this.root.position.y - y;
    this.shadow.visible = h > -0.3 && h < 14;
    this.shadow.position.y = -h + 0.03;
    const k = Math.max(0.35, 1 - h * 0.08);
    this.shadow.scale.setScalar(k);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.25, 1 - h * 0.07);
  }

  private setExpr(e: Expression): void {
    if (e === this.expr) return;
    this.expr = e;
    this.faceMat.map = faceTexture(this.look.eyes, e);
  }

  private placeArm(arm: THREE.Mesh, shoulder: THREE.Vector3, hand: THREE.Vector3): void {
    tmpDir.subVectors(hand, shoulder);
    const len = Math.max(0.05, tmpDir.length());
    arm.position.copy(shoulder).addScaledVector(tmpDir, 0.5);
    arm.quaternion.setFromUnitVectors(UP, tmpDir.divideScalar(len));
    arm.scale.set(1, len, 1);
  }

  update(dt: number, p: JellyPose): void {
    this.time += dt;
    const hSpeed = Math.hypot(p.vx, p.vz);

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
    const wob = 0.012 + Math.min(0.05, Math.abs(this.squashV) * 0.01) + (p.stun > 0 ? 0.03 : 0);
    for (const u of [this.bodyMat.userData.uniforms, this.outlineMat.userData.uniforms]) {
      u.uTime.value = this.time;
      u.uWobble.value = wob;
    }

    // Expresión facial.
    if (this.time > this.nextBlink + 0.13) this.nextBlink = this.time + 2 + Math.random() * 3.5;
    if (p.stun > 0.25) this.setExpr('dizzy');
    else if (this.time < this.hurtUntil) this.setExpr('hurt');
    else if (p.happy) this.setExpr('happy');
    else if (this.time > this.nextBlink) this.setExpr('blink');
    else this.setExpr('normal');

    // Caminar.
    const moving = p.grounded && hSpeed > 0.5;
    this.walkPhase += dt * (moving ? 4 + hSpeed * 1.4 : 0);
    const sw = moving ? Math.sin(this.walkPhase) : 0;
    this.footL.position.z = 0.06 + sw * 0.22;
    this.footR.position.z = 0.06 - sw * 0.22;
    this.footL.position.y = 0.08 + Math.max(0, -sw) * 0.1;
    this.footR.position.y = 0.08 + Math.max(0, sw) * 0.1;
    this.body.position.y = moving ? Math.abs(Math.cos(this.walkPhase)) * 0.08 : Math.sin(this.time * 2.2) * 0.012;
    const targetLean = p.stun > 0 ? 0 : Math.min(0.25, hSpeed * 0.025);
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 8);

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

    for (const [k, m] of Object.entries(this.weapons)) {
      if (m) m.visible = k === p.weapon || (p.atk >= 0 && k === p.atkW && k !== 'fists');
    }

    // Brazos: reposo (balanceo; en el aire, arriba), ataque o bloqueo.
    const air = !p.grounded && p.stun <= 0;
    const restL = this.restL.set(-0.66, air ? 1.0 : 0.5 + (moving ? -sw * 0.06 : Math.sin(this.time * 2.2) * 0.02), 0.06 + (moving ? -sw * 0.18 : 0));
    const restR = this.restR.set(0.66, air ? 1.0 : 0.5 + (moving ? sw * 0.06 : Math.sin(this.time * 2.2 + 1) * 0.02), 0.06 + (moving ? sw * 0.18 : 0));
    this.handR.rotation.set(0, 0, 0);
    if (p.weapon !== 'fists' && p.atk < 0) { this.handR.rotation.x = 0.5; restR.y = Math.min(restR.y, 0.6); }
    if (p.atk >= 0) {
      const st = WEAPONS[p.atkW];
      const k = p.atk < st.windup ? p.atk / Math.max(0.001, st.windup) : 1 + (p.atk - st.windup) / 0.3;
      if (p.atkW === 'fists' || p.atkW === 'gloves') {
        const ext = k < 1 ? -0.1 * k : Math.sin(Math.min(1, k - 1) * Math.PI) * 0.65;
        restR.set(0.35, 0.75, 0.3 + ext);
        restL.set(-0.45, 0.7, 0.35);
      } else if (p.atkW === 'sword') {
        const a = k < 1 ? -1.2 * k : -1.2 + Math.min(1, k - 1) * 3;
        restR.set(Math.cos(a) * 0.6, 0.75, Math.sin(-a) * 0.35 + 0.3);
        this.handR.rotation.set(1.4, 0, -a);
      } else {
        const a = k < 1 ? -2.6 * k : -2.6 + Math.min(1, (k - 1) * 2.2) * 4.2;
        restR.set(0.35, 0.95, 0.25);
        this.handR.rotation.x = -a * 0.8 - 0.4;
      }
    } else if (p.blocking) {
      restL.set(-0.28, 0.85, 0.5);
      restR.set(0.28, 0.85, 0.5);
    }
    this.handL.position.lerp(restL, Math.min(1, dt * 20));
    this.handR.position.lerp(restR, Math.min(1, dt * 25));
    this.placeArm(this.armL, tmpA.set(-0.5, 0.72, 0.02), this.handL.position);
    this.placeArm(this.armR, tmpB.set(0.5, 0.72, 0.02), this.handR.position);
    this.shield.visible = p.blocking || !!p.shielded;

    // Parpadeo de invulnerabilidad (sin transparencias: alterna visibilidad).
    this.body.visible = !(p.invuln > 0 && p.invuln < 50 && Math.sin(this.time * 30) < -0.2);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.tag?.material.map?.dispose();
    this.bodyMat.dispose();
    this.outlineMat.dispose();
    this.faceMat.dispose();
  }
}
