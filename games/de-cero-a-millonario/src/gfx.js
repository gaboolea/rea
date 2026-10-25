// Utilidades gráficas compartidas: materiales y geometrías en caché,
// cajas redondeadas y texturas de texto para letreros.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const materials = new Map();
const geometries = new Map();

export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!materials.has(key)) {
    materials.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.55,
        metalness: 0,
        ...opts,
      }),
    );
  }
  return materials.get(key);
}

export function geo(key, make) {
  if (!geometries.has(key)) geometries.set(key, make());
  return geometries.get(key);
}

export function roundedBox(w, h, d, r = 0.08) {
  const radius = Math.min(r, w / 2, h / 2, d / 2);
  return geo(
    `rb${w}|${h}|${d}|${radius}`,
    () => new RoundedBoxGeometry(w, h, d, 3, radius),
  );
}

export function box(w, h, d) {
  return geo(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
}

export function cylinder(rt, rb, h, seg = 16) {
  return geo(
    `c${rt}|${rb}|${h}|${seg}`,
    () => new THREE.CylinderGeometry(rt, rb, h, seg),
  );
}

export function sphere(r, seg = 16) {
  return geo(
    `s${r}|${seg}`,
    () => new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.75)),
  );
}

export function capsule(r, len) {
  return geo(`cap${r}|${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 12));
}

// Malla con sombras activadas por defecto.
export function mesh(geometry, material, x = 0, y = 0, z = 0, shadows = true) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

export function textTexture(text, opts = {}) {
  const {
    bg = "#ffffff",
    fg = "#333333",
    w = 512,
    h = 128,
    font = "bold 64px",
    border,
  } = opts;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  roundRect(ctx, 4, 4, w - 8, h - 8, h * 0.22);
  ctx.fill();
  if (border) {
    ctx.lineWidth = 8;
    ctx.strokeStyle = border;
    ctx.stroke();
  }
  ctx.fillStyle = fg;
  ctx.font = `${font} "Baloo 2", "Trebuchet MS", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = String(text).split("\n");
  const lh = h / (lines.length + 0.4);
  lines.forEach((line, i) => ctx.fillText(line, w / 2, lh * (i + 0.7), w - 24));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function signMesh(text, width, height, opts = {}) {
  const tex = textTexture(text, {
    w: 512,
    h: Math.round((512 * height) / width),
    ...opts,
  });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.6,
      alphaTest: 0.5,
    }),
  );
  return m;
}

export function stripedTexture(a, b, stripes = 8) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  const sw = 256 / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? b : a;
    ctx.fillRect(i * sw, 0, sw, 32);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function tileTexture(a, b, repeat) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = b;
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillRect(32, 32, 32, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

// Burbuja de pensamiento sobre la cabeza (como la de la referencia visual).
const bubbleCache = new Map();
export function bubbleMaterial(icon, color = "#ffffff") {
  const key = icon + color;
  if (!bubbleCache.has(key)) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(64, 56, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(40, 112, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#7fd0ff";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(64, 56, 50, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 52px "Baloo 2", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icon, 64, 60);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    bubbleCache.set(
      key,
      new THREE.SpriteMaterial({ map: tex, depthTest: false }),
    );
  }
  return bubbleCache.get(key);
}
