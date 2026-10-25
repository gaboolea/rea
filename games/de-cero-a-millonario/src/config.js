// Datos de diseño del juego: productos, etapas, mejoras, negocios y misiones.
// La lógica vive en otros módulos; aquí solo hay números y textos ajustables.

export const DAY_SECONDS = 300;
export const BOX_UNITS = 10;
export const START_MONEY = 150;

// shape: forma del producto en estanterías; cold: requiere refrigerador.
export const PRODUCTS = {
  agua: {
    name: "Agua",
    cost: 0.8,
    base: 2.0,
    color: 0x3d8bff,
    shape: "bottle",
    kind: "grocery",
  },
  refresco: {
    name: "Refresco",
    cost: 1.1,
    base: 2.6,
    color: 0xff4d4d,
    shape: "bottle",
    kind: "grocery",
  },
  cereal: {
    name: "Cereal",
    cost: 1.8,
    base: 4.2,
    color: 0xffc22e,
    shape: "box",
    kind: "grocery",
  },
  galletas: {
    name: "Galletas",
    cost: 1.0,
    base: 2.4,
    color: 0xff8a3d,
    shape: "box",
    kind: "grocery",
  },
  fruta: {
    name: "Fruta",
    cost: 0.9,
    base: 2.1,
    color: 0xe8392f,
    shape: "fruit",
    kind: "grocery",
  },
  pasta: {
    name: "Pasta",
    cost: 1.1,
    base: 2.6,
    color: 0x8a5cf5,
    shape: "box",
    kind: "grocery",
    stage: 1,
  },
  leche: {
    name: "Leche",
    cost: 1.3,
    base: 3.0,
    color: 0xf4f4f4,
    shape: "carton",
    kind: "grocery",
    cold: true,
  },
  yogur: {
    name: "Yogur",
    cost: 1.0,
    base: 2.6,
    color: 0xff9ad5,
    shape: "cup",
    kind: "grocery",
    cold: true,
  },
  pastel: {
    name: "Pastel",
    cost: 1.4,
    base: 4.2,
    color: 0xf7a8c4,
    shape: "cake",
    kind: "cafe",
  },
  sandwich: {
    name: "Sándwich",
    cost: 1.7,
    base: 4.6,
    color: 0xe7c27d,
    shape: "box",
    kind: "cafe",
  },
  granos: {
    name: "Granos de café",
    cost: 0.5,
    base: 0,
    color: 0x6b3f22,
    shape: "box",
    kind: "cafe",
    ingredient: true,
    boxUnits: 20,
  },
  cafe: {
    name: "Café",
    cost: 0,
    base: 3.6,
    color: 0xffffff,
    shape: "cup",
    kind: "cafe",
    crafted: true,
  },
};

export const STAGES = [
  { name: "Principiante", revenue: 0 },
  { name: "Comerciante", revenue: 300 },
  { name: "Empresario", revenue: 1500 },
  { name: "Magnate", revenue: 8000 },
];

export const STAFF = {
  cajero: {
    name: "Cajero/a",
    salary: 22,
    stage: 1,
    desc: "Cobra a los clientes en la caja.",
  },
  reponedor: {
    name: "Reponedor/a",
    salary: 18,
    stage: 1,
    desc: "Lleva mercadería del almacén a las estanterías.",
  },
  barista: {
    name: "Barista",
    salary: 24,
    stage: 2,
    desc: "Prepara café en la máquina.",
  },
};

// Tipos de negocio. Las coordenadas de layout son locales al edificio
// (centro del edificio, puerta hacia +z).
export const BUSINESSES = {
  tienda: {
    name: "Mi Tiendita",
    type: "grocery",
    price: 0,
    rent: 15,
    owned: true,
    staff: ["cajero", "reponedor"],
  },
  cafeteria: {
    name: "Café Aroma",
    type: "cafe",
    price: 1200,
    rent: 40,
    stage: 2,
    staff: ["cajero", "barista", "reponedor"],
  },
  minimercado: {
    name: "Minimercado Sol",
    type: "grocery",
    price: 3000,
    rent: 50,
    stage: 2,
    staff: ["cajero", "reponedor"],
  },
  supermercado: {
    name: "Súper Millonario",
    type: "grocery",
    price: 15000,
    rent: 180,
    stage: 3,
    staff: ["cajero", "reponedor"],
  },
};

// Mejoras por negocio. needs: ids de mejoras previas.
export const UPGRADES = {
  estanteria1: {
    name: "Estantería extra",
    price: 60,
    desc: "Un mueble más para exponer productos.",
    types: ["grocery"],
  },
  estanteria2: {
    name: "Estantería extra II",
    price: 120,
    desc: "Otra estantería en la tienda.",
    needs: ["estanteria1"],
    types: ["grocery"],
  },
  refrigerador: {
    name: "Refrigerador",
    price: 200,
    desc: "Permite vender Leche y Yogur. +$5/día de luz.",
    types: ["grocery"],
    stage: 1,
  },
  caja2: {
    name: "Segunda caja registradora",
    price: 300,
    desc: "Una segunda fila para atender más clientes.",
    stage: 1,
  },
  ampliacion: {
    name: "Ampliación del local",
    price: 700,
    desc: "Derriba la pared trasera: +3 estanterías y más clientes.",
    types: ["grocery"],
    stage: 1,
  },
  estanteria3: {
    name: "Estantería de ampliación",
    price: 200,
    desc: "Requiere la ampliación.",
    needs: ["ampliacion"],
    types: ["grocery"],
  },
  estanteria4: {
    name: "Estantería de ampliación II",
    price: 240,
    desc: "Requiere la ampliación.",
    needs: ["estanteria3"],
    types: ["grocery"],
  },
  plantas: {
    name: "Plantas decorativas",
    price: 25,
    desc: "Un ambiente agradable: +5 reputación.",
  },
  letrero: {
    name: "Letrero luminoso",
    price: 120,
    desc: "Atrae a más clientes de la calle (+15%).",
  },
  suelo: {
    name: "Suelo nuevo",
    price: 200,
    desc: "Baldosas brillantes: +10 reputación.",
  },
  vitrina2: {
    name: "Vitrina extra",
    price: 220,
    desc: "Más espacio para pasteles y sándwiches.",
    types: ["cafe"],
  },
};

export const SHOP_ITEMS = {
  carretilla: {
    name: "Carretilla",
    price: 180,
    desc: "Lleva hasta 3 cajas a la vez.",
    kind: "tool",
  },
  scooter: {
    name: "Scooter",
    price: 600,
    desc: "Muévete el doble de rápido (tecla V).",
    kind: "vehicle",
    stage: 1,
  },
  furgoneta: {
    name: "Furgoneta de reparto",
    price: 2500,
    desc: "El mayorista entrega directamente en tus almacenes.",
    kind: "vehicle",
    stage: 2,
  },
  casa: {
    name: "Casa grande",
    price: 8000,
    desc: "Una casa amplia en el barrio residencial.",
    kind: "property",
    stage: 2,
  },
};

export const GOAL_NET_WORTH = 1000000;
