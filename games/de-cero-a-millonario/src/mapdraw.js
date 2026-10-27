// Dibujo del plano de la ciudad (minimapa y mapa grande) a partir de lo que
// registran las zonas: césped, aceras, calles, plazas, agua, torres,
// edificios y puntos de interés. Todo sale de posiciones reales del mundo.

const FILL = {
  grass: "#a8df8a",
  walk: "#f3e1b9",
  plaza: "#efe3c8",
  road: "#7d8792",
  tower: "#8fa3c4",
};

// view: { X(x), Z(z), s (píxeles por metro), w, h }.
export function drawCity(ctx, world, view, buildingColor) {
  const { X, Z, s } = view;
  const order = ["grass", "walk", "plaza", "road", "water", "tower"];
  for (const kind of order)
    for (const r of world.mapRects) {
      if (r.kind !== kind) continue;
      if (r.circle) {
        const [x, z, rad] = r.circle;
        ctx.fillStyle = "#6cc6f0";
        ctx.beginPath();
        ctx.arc(X(x), Z(z), rad * s, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const [x0, z0, x1, z1] = r.rect;
      ctx.fillStyle = FILL[kind] ?? "#ccc";
      ctx.fillRect(X(x0), Z(z0), (x1 - x0) * s, (z1 - z0) * s);
    }
  for (const b of Object.values(world.buildings)) {
    const a = b.toWorld(-b.w / 2, -b.d / 2);
    const d = b.toWorld(b.w / 2, b.d / 2);
    const x0 = Math.min(a.x, d.x);
    const z0 = Math.min(a.z, d.z);
    const bx = X(x0);
    const bz = Z(z0);
    const bw = Math.abs(d.x - a.x) * s;
    const bh = Math.abs(d.z - a.z) * s;
    if (bx > view.w || bz > view.h || bx + bw < 0 || bz + bh < 0) continue;
    ctx.fillStyle = buildingColor(b);
    ctx.fillRect(bx, bz, bw, bh);
  }
}

// Icono con fondo blanco redondo (se pega al borde si queda fuera).
export function drawIcon(
  ctx,
  view,
  x,
  z,
  icon,
  { clamp = false, size = 14 } = {},
) {
  let cx = view.X(x);
  let cz = view.Z(z);
  if (clamp) {
    cx = Math.max(10, Math.min(view.w - 10, cx));
    cz = Math.max(10, Math.min(view.h - 10, cz));
  } else if (cx < -10 || cz < -10 || cx > view.w + 10 || cz > view.h + 10)
    return;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(cx, cz, size * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icon, cx, cz + 1);
}
