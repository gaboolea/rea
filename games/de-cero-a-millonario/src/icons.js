// Iconos de producto dibujados en canvas (misma forma y color que el
// modelo 3D de la estantería), para la interfaz de pedidos.
import { PRODUCTS } from "./config.js";

const cache = new Map();
const hex = (c) => `#${c.toString(16).padStart(6, "0")}`;

export function productIcon(id) {
  if (cache.has(id)) return cache.get(id);
  const p = PRODUCTS[id];
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const ctx = c.getContext("2d");
  const col = hex(p.color);
  ctx.fillStyle = "#fff7e6";
  ctx.beginPath();
  ctx.roundRect(4, 4, 88, 88, 22);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  const shapes = {
    bottle: () => {
      ctx.beginPath();
      ctx.roundRect(34, 30, 28, 52, 9);
      ctx.fill();
      ctx.fillRect(41, 18, 14, 14);
      ctx.fillStyle = "#fff";
      ctx.fillRect(34, 50, 28, 12);
    },
    jug: () => {
      ctx.beginPath();
      ctx.roundRect(28, 30, 40, 52, 10);
      ctx.fill();
      ctx.fillRect(52, 20, 12, 14);
      ctx.fillStyle = "#fff";
      ctx.fillRect(32, 48, 32, 14);
    },
    box: () => {
      ctx.beginPath();
      ctx.roundRect(28, 20, 40, 60, 6);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(34, 32, 28, 18);
    },
    carton: () => {
      ctx.fillRect(32, 30, 32, 50);
      ctx.beginPath();
      ctx.moveTo(32, 30);
      ctx.lineTo(48, 16);
      ctx.lineTo(64, 30);
      ctx.fill();
      ctx.fillStyle = "#3d8bff";
      ctx.fillRect(32, 50, 32, 10);
    },
    fruit: () => {
      ctx.beginPath();
      ctx.arc(48, 54, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3f9e4d";
      ctx.beginPath();
      ctx.ellipse(56, 28, 10, 5, -0.5, 0, Math.PI * 2);
      ctx.fill();
    },
    veg: () => {
      ctx.beginPath();
      ctx.arc(38, 54, 18, 0, Math.PI * 2);
      ctx.arc(58, 52, 18, 0, Math.PI * 2);
      ctx.arc(48, 40, 18, 0, Math.PI * 2);
      ctx.fill();
    },
    bag: () => {
      ctx.beginPath();
      ctx.moveTo(26, 24);
      ctx.lineTo(70, 24);
      ctx.lineTo(66, 82);
      ctx.lineTo(30, 82);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e63946";
      ctx.beginPath();
      ctx.arc(48, 52, 11, 0, Math.PI * 2);
      ctx.fill();
    },
    can: () => {
      ctx.beginPath();
      ctx.roundRect(32, 26, 32, 54, 8);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(32, 44, 32, 10);
    },
    cup: () => {
      ctx.beginPath();
      ctx.moveTo(30, 32);
      ctx.lineTo(66, 32);
      ctx.lineTo(60, 80);
      ctx.lineTo(36, 80);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(28, 26, 40, 8);
    },
    tub: () => {
      ctx.beginPath();
      ctx.roundRect(24, 40, 48, 38, 10);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(48, 40, 24, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    },
    cake: () => {
      ctx.beginPath();
      ctx.roundRect(22, 44, 52, 32, 8);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(22, 44, 52, 8);
      ctx.fillStyle = "#e63946";
      ctx.beginPath();
      ctx.arc(48, 36, 7, 0, Math.PI * 2);
      ctx.fill();
    },
    loaf: () => {
      ctx.beginPath();
      ctx.roundRect(18, 38, 60, 40, 8);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(48, 40, 30, 14, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      for (const x of [34, 48, 62]) ctx.fillRect(x - 2, 32, 4, 14);
    },
    eggs: () => {
      ctx.beginPath();
      ctx.roundRect(16, 50, 64, 28, 6);
      ctx.fill();
      ctx.fillStyle = "#fffaf0";
      for (const x of [26, 42, 58, 74]) {
        ctx.beginPath();
        ctx.ellipse(x, 46, 7, 9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    jar: () => {
      ctx.beginPath();
      ctx.roundRect(30, 34, 36, 46, 8);
      ctx.fill();
      ctx.fillStyle = "#f2f2f2";
      ctx.fillRect(28, 24, 40, 12);
      ctx.fillStyle = "#fff";
      ctx.fillRect(34, 50, 28, 14);
    },
    bar: () => {
      ctx.beginPath();
      ctx.roundRect(24, 28, 48, 44, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      for (const x of [40, 56]) {
        ctx.beginPath();
        ctx.moveTo(x, 28);
        ctx.lineTo(x, 72);
        ctx.stroke();
      }
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(24, 44, 48, 12);
    },
    wedge: () => {
      ctx.beginPath();
      ctx.moveTo(18, 74);
      ctx.lineTo(78, 74);
      ctx.lineTo(78, 34);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      for (const [x, y] of [
        [58, 62],
        [70, 50],
        [44, 68],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    pizza: () => {
      ctx.fillStyle = "#f5d6a1";
      ctx.beginPath();
      ctx.arc(48, 50, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(48, 50, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff3b0";
      for (const [x, y] of [
        [40, 42],
        [58, 46],
        [46, 60],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
  (shapes[p.shape] ?? shapes.box)();
  const url = c.toDataURL();
  cache.set(id, url);
  return url;
}
