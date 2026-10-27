// Caras de los personajes: una «máscara» fina sobre la parte delantera de
// la cabeza con ojos, cejas, boca y rubor dibujados en un canvas. Cada
// combinación de estilo y expresión es una textura compartida por todos
// los personajes (cambiar de expresión solo cambia de material).
import * as THREE from "three";
import { geo } from "./gfx.js";

// Expresiones: normal, parpadeo, alegría y sorpresa.
export const EXPRESSIONS = ["normal", "blink", "joy", "wow"];

// La máscara cubre ±0,8 rad en horizontal y ±0,75 rad en vertical
// alrededor del frente de la cabeza (radio 0,42 → 0,423).
export const faceGeometry = () =>
  geo("face-mask", () => {
    const g = new THREE.SphereGeometry(
      0.423,
      20,
      14,
      Math.PI / 2 - 0.8,
      1.6,
      Math.PI / 2 - 0.75,
      1.5,
    );
    g.translate(0, 0.32, 0);
    return g;
  });

const S = 256;
const INK = "#2a2233";
const BLUSH = "rgba(255, 120, 150, 0.38)";
// Posiciones en el canvas (alineadas con las lentes: ojos a ±0,145 m).
const EYE_X = [73, 183];
const EYE_Y = 126;
const BROW_Y = 80;
const MOUTH_Y = 190;

const materials = new Map();

export function faceMaterial(style, state) {
  const key = `${style}|${state}`;
  if (!materials.has(key)) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = S;
    drawFace(canvas.getContext("2d"), style, state);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    materials.set(
      key,
      new THREE.MeshStandardMaterial({
        map,
        transparent: true,
        depthWrite: false,
        roughness: 0.35,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
  }
  return materials.get(key);
}

function drawFace(ctx, style, state) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  const blush =
    state === "joy" || ["timido", "risueno", "alegre"].includes(style);
  if (blush) {
    ctx.fillStyle = BLUSH;
    for (const x of [EYE_X[0] - 16, EYE_X[1] + 16]) {
      ctx.beginPath();
      ctx.ellipse(x, EYE_Y + 36, 20, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = INK;
  }
  drawBrows(ctx, style, state);
  // Ojos según la expresión (el estilo «alegre» los tiene siempre así).
  const eyes =
    state === "blink"
      ? "closed"
      : state === "wow"
        ? "wide"
        : state === "joy" || style === "alegre"
          ? "happy"
          : style === "tranquilo"
            ? "lidded"
            : style === "risueno"
              ? "sparkle"
              : "round";
  for (const [i, x] of EYE_X.entries()) drawEye(ctx, x, eyes, style, i);
  const mouth =
    state === "joy"
      ? "open"
      : state === "wow"
        ? "o"
        : ({
            feliz: "smile",
            risueno: "open",
            tranquilo: "flat",
            timido: "w",
            seguro: "smirk",
            alegre: "smile",
          }[style] ?? "smile");
  drawMouth(ctx, mouth);
}

function drawBrows(ctx, style, state) {
  ctx.lineWidth = 6;
  for (const [i, x] of EYE_X.entries()) {
    const side = i ? 1 : -1;
    let lift = state === "wow" ? -10 : 0;
    let tilt = 0;
    if (style === "timido") tilt = -5; // preocupado: bajan hacia fuera
    if (style === "seguro" && i === 1) lift -= 8;
    if (style === "tranquilo") lift += 4;
    ctx.beginPath();
    ctx.moveTo(x - 15, BROW_Y + lift - side * tilt);
    ctx.quadraticCurveTo(
      x,
      BROW_Y + lift - 7,
      x + 15,
      BROW_Y + lift + side * tilt,
    );
    ctx.stroke();
  }
}

function drawEye(ctx, x, kind, style, i) {
  const y = EYE_Y;
  ctx.lineWidth = 7;
  if (kind === "closed") {
    ctx.beginPath();
    ctx.moveTo(x - 15, y);
    ctx.quadraticCurveTo(x, y + 10, x + 15, y);
    ctx.stroke();
    return;
  }
  if (kind === "happy") {
    ctx.beginPath();
    ctx.moveTo(x - 16, y + 6);
    ctx.quadraticCurveTo(x, y - 16, x + 16, y + 6);
    ctx.stroke();
    return;
  }
  const rx = kind === "wide" ? 19 : 15;
  const ry = kind === "wide" ? 24 : 21;
  ctx.save();
  if (kind === "lidded") {
    // Párpados medio bajados: solo la mitad de abajo del ojo.
    ctx.beginPath();
    ctx.rect(x - 30, y - 4, 60, 40);
    ctx.clip();
  }
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x - rx * 0.32, y - ry * 0.38, rx * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + rx * 0.35, y + ry * 0.35, rx * 0.17, 0, Math.PI * 2);
  ctx.fill();
  if (kind === "sparkle") {
    // Brillo en forma de estrella pequeña.
    ctx.beginPath();
    ctx.arc(x + rx * 0.3, y - ry * 0.05, rx * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (kind === "lidded") {
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x - 18, y - 4);
    ctx.lineTo(x + 18, y - 4);
    ctx.stroke();
  }
  // Pestañitas en el estilo «seguro» (ojo derecho guiña un poco).
  if (style === "seguro" && i === 1 && kind === "round") {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x - 17, y - 8);
    ctx.lineTo(x + 17, y - 12);
    ctx.stroke();
  }
}

function drawMouth(ctx, kind) {
  const x = 128;
  const y = MOUTH_Y;
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  if (kind === "smile") {
    ctx.beginPath();
    ctx.moveTo(x - 20, y - 4);
    ctx.quadraticCurveTo(x, y + 16, x + 20, y - 4);
    ctx.stroke();
  } else if (kind === "flat") {
    ctx.beginPath();
    ctx.moveTo(x - 14, y + 2);
    ctx.quadraticCurveTo(x, y + 7, x + 14, y + 2);
    ctx.stroke();
  } else if (kind === "w") {
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x - 16, y);
    ctx.quadraticCurveTo(x - 8, y + 10, x, y + 1);
    ctx.quadraticCurveTo(x + 8, y + 10, x + 16, y);
    ctx.stroke();
  } else if (kind === "smirk") {
    ctx.beginPath();
    ctx.moveTo(x - 16, y + 4);
    ctx.quadraticCurveTo(x + 4, y + 12, x + 20, y - 6);
    ctx.stroke();
  } else if (kind === "open") {
    ctx.fillStyle = "#7a1f35";
    ctx.beginPath();
    ctx.moveTo(x - 24, y - 6);
    ctx.quadraticCurveTo(x, y - 2, x + 24, y - 6);
    ctx.quadraticCurveTo(x + 20, y + 28, x, y + 28);
    ctx.quadraticCurveTo(x - 20, y + 28, x - 24, y - 6);
    ctx.fill();
    ctx.fillStyle = "#ff8fa8";
    ctx.beginPath();
    ctx.ellipse(x, y + 19, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "o") {
    ctx.fillStyle = "#7a1f35";
    ctx.beginPath();
    ctx.ellipse(x, y + 6, 11, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
