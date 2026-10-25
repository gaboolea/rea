// Catálogo de apariencia: piel, prendas y accesorios por ranura, con
// precios y requisitos. Un "look" guarda { ranura: { id, color } }.

export const COLORS = {
  blanco: 0xf7f7f2,
  negro: 0x2f3542,
  gris: 0x9aa5b1,
  rojo: 0xff5a4e,
  naranja: 0xff9f43,
  amarillo: 0xffd23f,
  menta: 0x5bd47a,
  turquesa: 0x2ec4c4,
  azul: 0x4f8dff,
  marino: 0x34405c,
  morado: 0x9b6dff,
  rosa: 0xff7eb6,
  marron: 0x8b5a3c,
  oro: 0xf2c230,
};

export const SKINS = [
  { id: "crema", name: "Crema", color: 0xf7f3ee },
  { id: "melocoton", name: "Melocotón", color: 0xffd9c0 },
  { id: "canela", name: "Canela", color: 0xe0ac7e },
  { id: "cacao", name: "Cacao", color: 0x9a6a4a },
  { id: "menta", name: "Juguete menta", color: 0xc9f2dc, price: 60 },
  { id: "lavanda", name: "Juguete lavanda", color: 0xe1d6ff, price: 60 },
  {
    id: "dorada",
    name: "Edición dorada",
    color: 0xffe08a,
    stage: 3,
    price: 5000,
  },
];

// price 0 = gratis desde el inicio. stage = etapa mínima. reward = solo se
// consigue jugando (encargos/misiones). colors = admite cambiar el color.
export const ITEMS = {
  top: [
    { id: "camiseta", name: "Camiseta", price: 0, colors: true },
    { id: "sudadera", name: "Sudadera con capucha", price: 45, colors: true },
    { id: "chaqueta", name: "Chaqueta", price: 90, colors: true },
    { id: "traje", name: "Traje elegante", price: 900, stage: 2, colors: true },
    {
      id: "traje_oro",
      name: "Traje de millonario",
      price: 6000,
      stage: 3,
      colors: false,
    },
  ],
  bottom: [
    { id: "pantalon", name: "Pantalones", price: 0, colors: true },
    { id: "shorts", name: "Shorts", price: 0, colors: true },
    { id: "vaqueros", name: "Vaqueros", price: 35, colors: false },
    {
      id: "pantalon_traje",
      name: "Pantalón de vestir",
      price: 250,
      stage: 2,
      colors: true,
    },
  ],
  shoes: [
    { id: "zapatillas", name: "Zapatillas", price: 0, colors: true },
    { id: "altas", name: "Zapatillas altas", price: 55, colors: true },
    { id: "botas", name: "Botas", price: 70, colors: false },
    {
      id: "zapatos",
      name: "Zapatos de vestir",
      price: 220,
      stage: 2,
      colors: false,
    },
    {
      id: "doradas",
      name: "Zapatillas doradas",
      price: 0,
      reward: "Completa 3 encargos",
      colors: false,
    },
  ],
  hat: [
    { id: "none", name: "Sin gorro", price: 0 },
    { id: "gorra", name: "Gorra", price: 0, colors: true },
    { id: "gorro", name: "Gorro de lana", price: 25, colors: true },
    { id: "sombrero", name: "Sombrero", price: 80, colors: false },
    { id: "chistera", name: "Chistera", price: 700, stage: 2, colors: false },
    {
      id: "corona",
      name: "Corona",
      price: 0,
      reward: "Llega a la etapa Magnate",
      colors: false,
    },
  ],
  glasses: [
    { id: "none", name: "Sin lentes", price: 0 },
    { id: "sol", name: "Lentes de sol", price: 30, colors: false },
    { id: "redondas", name: "Lentes redondos", price: 20, colors: true },
    {
      id: "estrella",
      name: "Lentes de estrella",
      price: 0,
      reward: "Completa tu primer encargo",
      colors: true,
    },
  ],
  back: [
    { id: "none", name: "Nada", price: 0 },
    { id: "mochila", name: "Mochila", price: 40, colors: true },
    {
      id: "mochila_cohete",
      name: "Mochila cohete",
      price: 1500,
      stage: 2,
      colors: false,
    },
  ],
  neck: [
    { id: "none", name: "Nada", price: 0 },
    { id: "pajarita", name: "Pajarita", price: 30, colors: true },
    { id: "bufanda", name: "Bufanda", price: 35, colors: true },
    { id: "cadena", name: "Cadena de plata", price: 150, colors: false },
    {
      id: "cadena_oro",
      name: "Cadena de oro",
      price: 2500,
      stage: 3,
      colors: false,
    },
  ],
};

export const SLOTS = [
  { id: "top", name: "Arriba", icon: "👕" },
  { id: "bottom", name: "Abajo", icon: "👖" },
  { id: "shoes", name: "Calzado", icon: "👟" },
  { id: "hat", name: "Cabeza", icon: "🧢" },
  { id: "glasses", name: "Lentes", icon: "🕶️" },
  { id: "back", name: "Espalda", icon: "🎒" },
  { id: "neck", name: "Cuello", icon: "⛓️" },
  { id: "skin", name: "Piel", icon: "🎨" },
];

export const STARTER_ITEMS = Object.values(ITEMS)
  .flat()
  .filter((i) => i.price === 0 && !i.reward)
  .map((i) => i.id)
  .concat(SKINS.filter((s) => !s.price).map((s) => s.id));

export function defaultLook() {
  return {
    skin: "crema",
    top: { id: "camiseta", color: "turquesa" },
    bottom: { id: "pantalon", color: "marino" },
    shoes: { id: "zapatillas", color: "blanco" },
    hat: { id: "none" },
    glasses: { id: "none" },
    back: { id: "none" },
    neck: { id: "none" },
  };
}

export function findItem(slot, id) {
  if (slot === "skin") return SKINS.find((s) => s.id === id);
  return ITEMS[slot]?.find((i) => i.id === id);
}

export function colorOf(name, fallback = 0xffffff) {
  return COLORS[name] ?? fallback;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Look aleatorio para peatones y clientes: mismo estilo, mucha variedad.
export function randomLook() {
  const bright = [
    "rojo",
    "naranja",
    "amarillo",
    "menta",
    "turquesa",
    "azul",
    "morado",
    "rosa",
  ];
  const calm = ["marino", "gris", "negro", "blanco", "marron", "azul"];
  const r = Math.random;
  return {
    skin: pick(SKINS.slice(0, 4)).id,
    top: {
      id: pick(["camiseta", "camiseta", "sudadera", "chaqueta"]),
      color: pick(bright),
    },
    bottom: { id: pick(["pantalon", "shorts", "vaqueros"]), color: pick(calm) },
    shoes: {
      id: pick(["zapatillas", "zapatillas", "altas", "botas"]),
      color: pick(["blanco", "rojo", "negro", "azul"]),
    },
    hat:
      r() < 0.35
        ? { id: pick(["gorra", "gorro", "sombrero"]), color: pick(bright) }
        : { id: "none" },
    glasses:
      r() < 0.25
        ? { id: pick(["sol", "redondas"]), color: pick(bright) }
        : { id: "none" },
    back: r() < 0.2 ? { id: "mochila", color: pick(bright) } : { id: "none" },
    neck: { id: "none" },
  };
}

// Uniforme de trabajo con delantal.
export function workerLook(color) {
  return {
    ...defaultLook(),
    top: { id: "camiseta", color },
    bottom: { id: "pantalon", color: "marino" },
    hat: { id: "gorra", color },
  };
}
