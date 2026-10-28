// Sucesos inesperados: reglas compartidas por el cliente y el servidor
// (sin three.js). Un suceso es una pequeña misión con tiempo límite:
// atrapar a un ladrón que huye de tu tienda o encontrar algo perdido y
// llevárselo a su dueño. El servidor elige el suceso, sus puntos y comprueba
// con la posición sincronizada del jugador que de verdad llegó a cada uno.

export const SURPRISES = {
  ladron: {
    icon: "🦹",
    name: "¡Al ladrón!",
    reward: 40,
    intro:
      "¡Un ladrón se lleva género de tu tienda! Alcánzalo antes de que escape",
  },
  cartera: {
    icon: "👛",
    name: "Cartera perdida",
    reward: 30,
    find: "Alguien perdió su cartera por el barrio. Encuéntrala",
    deliver: "Devuelve la cartera a su dueña",
    owner: "Doña Carmen",
  },
  perro: {
    icon: "🐶",
    name: "Perro perdido",
    reward: 45,
    find: "Se ha escapado un perro. Búscalo por el barrio",
    deliver: "Lleva el perro con su dueño",
    owner: "Martín",
  },
  paquete: {
    icon: "📦",
    name: "Paquete caído",
    reward: 30,
    find: "Al camión del Mayorista se le cayó un paquete. Búscalo",
    deliver: "Devuelve el paquete en la puerta del Mayorista",
    owner: "Mayorista",
  },
};

// Tiempo entre sucesos (segundos de juego) y límite para resolverlos.
export const SURPRISE_GAP = [140, 230];
export const SURPRISE_SECONDS = 150;
// Distancia para «llegar» a un punto: el cliente lo marca a NEAR y el
// servidor acepta hasta SERVER_NEAR (las posiciones llegan a 10 Hz).
export const NEAR = 1.8;
export const SERVER_NEAR = 4.5;
// Unidades que se lleva el ladrón como mucho.
export const THIEF_MAX_UNITS = 6;
export const THIEF_SPEED = 4.3;
// Segundos que el ladrón tarda en salir corriendo de la puerta.
export const THIEF_DELAY = 1.5;

// Huida del ladrón desde la puerta de cada local inicial hasta la salida
// del barrio, por aceras y pasos (coordenadas del mundo).
export const THIEF_PATHS = {
  tienda: [
    [-22, -7.8],
    [-22, -6.2],
    [-6.2, -6.2],
    [-6.2, 6.4],
    [40, 6.4],
    [74, 6.4],
  ],
  oeste: [
    [-5.5, -38],
    [-4.8, -36],
    [-4.8, -6.2],
    [-40, -6.2],
    [-74, -6.2],
  ],
  este: [
    [5.5, -38],
    [4.8, -36],
    [4.8, -6.2],
    [40, -6.2],
    [74, -6.2],
  ],
  sur: [
    [-5.5, 38],
    [-5.2, 36],
    [-5.2, 6.4],
    [-30, 6.4],
    [-74, 6.4],
  ],
};

// Sitios del barrio (aceras y parque) donde aparece lo perdido o espera
// su dueño.
export const SPOTS = [
  [-38, -6.6],
  [12, -6.6],
  [50, -6.6],
  [-35, 6.6],
  [14, 6.6],
  [55, 6.6],
  [-5.6, -25],
  [5.6, -28],
  [-5.6, 25],
  [5.6, 32],
  [40, 36],
  [18, 42],
  [30, 44],
];
export const MAYORISTA_DROP = [-22, 7];

export function pathLength(path) {
  let len = 0;
  for (let i = 1; i < path.length; i++)
    len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return len;
}

// Segundos que tarda el ladrón en escapar por ese camino.
export function thiefSeconds(path) {
  return THIEF_DELAY + pathLength(path) / THIEF_SPEED;
}

// Posición del ladrón t segundos después de empezar el suceso.
export function thiefAt(path, t) {
  let left = Math.max(0, t - THIEF_DELAY) * THIEF_SPEED;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1];
    const [bx, bz] = path[i];
    const seg = Math.hypot(bx - ax, bz - az);
    const heading = Math.atan2(bx - ax, bz - az);
    if (left <= seg)
      return {
        x: ax + ((bx - ax) * left) / seg,
        z: az + ((bz - az) * left) / seg,
        heading,
        escaped: false,
      };
    left -= seg;
  }
  const [x, z] = path[path.length - 1];
  return { x, z, heading: 0, escaped: true };
}

const STAGE_FACTOR = [1, 1.5, 2.5, 4];
export function surpriseReward(type, stage) {
  return Math.round(SURPRISES[type].reward * (STAGE_FACTOR[stage] ?? 1));
}

// Elige los puntos de un suceso de «buscar y devolver»: el objeto y su
// dueño, a cierta distancia el uno del otro.
export function planStops(type, random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const find = pick(SPOTS);
  if (type === "paquete") return [find, MAYORISTA_DROP];
  const far = SPOTS.filter(
    (s) => Math.hypot(s[0] - find[0], s[1] - find[1]) >= 30,
  );
  return [find, pick(far)];
}
