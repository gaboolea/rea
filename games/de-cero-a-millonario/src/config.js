// Datos de diseño del juego: productos, etapas, mejoras, negocios y misiones.
// La lógica vive en otros módulos; aquí solo hay números y textos ajustables.

export const DAY_SECONDS = 300;
export const BOX_UNITS = 10;
// Cajas que caben en un carro de carga del Mayorista.
export const CART_CAPACITY = 10;
export const START_MONEY = 150;

// shape: forma del producto en estanterías; cat: zona del Mayorista.
// cold: va en refrigerador; frozen: congelador; fresh: puesto de frutas.
export const PRODUCTS = {
  agua: {
    cat: "bebidas",
    name: "Agua",
    cost: 0.8,
    base: 2.0,
    color: 0x3d8bff,
    shape: "bottle",
    kind: "grocery",
  },
  refresco: {
    cat: "bebidas",
    name: "Refresco",
    cost: 1.1,
    base: 2.6,
    color: 0xff4d4d,
    shape: "bottle",
    kind: "grocery",
  },
  cereal: {
    cat: "alimentos",
    name: "Cereal",
    cost: 1.8,
    base: 4.2,
    color: 0xffc22e,
    shape: "box",
    kind: "grocery",
  },
  galletas: {
    cat: "snacks",
    name: "Galletas",
    cost: 1.0,
    base: 2.4,
    color: 0xff8a3d,
    shape: "box",
    kind: "grocery",
  },
  fruta: {
    cat: "frescos",
    name: "Fruta",
    cost: 0.9,
    base: 2.1,
    color: 0xe8392f,
    shape: "fruit",
    kind: "grocery",
    fresh: true,
  },
  pasta: {
    cat: "alimentos",
    name: "Pasta",
    cost: 1.1,
    base: 2.6,
    color: 0x8a5cf5,
    shape: "box",
    kind: "grocery",
    stage: 1,
  },
  leche: {
    cat: "bebidas",
    name: "Leche",
    cost: 1.3,
    base: 3.0,
    color: 0xf4f4f4,
    shape: "carton",
    kind: "grocery",
    cold: true,
  },
  yogur: {
    cat: "frescos",
    name: "Yogur",
    cost: 1.0,
    base: 2.6,
    color: 0xff9ad5,
    shape: "cup",
    kind: "grocery",
    cold: true,
  },
  verdura: {
    name: "Verdura",
    cat: "frescos",
    cost: 0.8,
    base: 1.9,
    color: 0x4caf50,
    shape: "veg",
    kind: "grocery",
    fresh: true,
  },
  patatas: {
    name: "Patatas fritas",
    cat: "snacks",
    cost: 0.9,
    base: 2.2,
    color: 0xffb703,
    shape: "bag",
    kind: "grocery",
  },
  detergente: {
    name: "Detergente",
    cat: "limpieza",
    cost: 1.6,
    base: 3.6,
    color: 0x7b6cff,
    shape: "jug",
    kind: "grocery",
  },
  jabon: {
    name: "Jabón",
    cat: "limpieza",
    cost: 0.7,
    base: 1.7,
    color: 0x9fe3ff,
    shape: "can",
    kind: "grocery",
  },
  helado: {
    name: "Helado",
    cat: "frescos",
    cost: 1.4,
    base: 3.3,
    color: 0xffb3d1,
    shape: "tub",
    kind: "grocery",
    frozen: true,
  },
  pastel: {
    cat: "cafeteria",
    name: "Pastel",
    cost: 1.4,
    base: 4.2,
    color: 0xf7a8c4,
    shape: "cake",
    kind: "cafe",
  },
  sandwich: {
    cat: "cafeteria",
    name: "Sándwich",
    cost: 1.7,
    base: 4.6,
    color: 0xe7c27d,
    shape: "box",
    kind: "cafe",
  },
  granos: {
    cat: "cafeteria",
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
    cat: "cafeteria",
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
  congelador: {
    name: "Congelador",
    price: 220,
    desc: "Permite vender Helado. +$4/día de luz.",
    types: ["grocery"],
    stage: 1,
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
  casa: {
    name: "Casa grande",
    price: 8000,
    desc: "Una casa amplia en el barrio residencial.",
    kind: "property",
    stage: 2,
  },
};

// Vehículos que se compran y se usan de verdad. kind: board (monopatín),
// bike, scooter, moto (dos ruedas: se manejan como al caminar, pero más
// rápido) o car (conducción con acelerador, freno y dirección). speed en
// m/s. store: tienda donde se venden. cargo: reparto del Mayorista.
export const VEHICLES = {
  skate: {
    name: "Monopatín",
    price: 40,
    kind: "board",
    speed: 7.2,
    accel: 9,
    turn: 4.2,
    store: "vehiculos",
    desc: "Ligero y divertido. Salta con él (Espacio).",
  },
  bici: {
    name: "Bicicleta",
    price: 90,
    kind: "bike",
    speed: 8.6,
    accel: 7,
    turn: 3.6,
    store: "vehiculos",
    desc: "Pedalea por toda la ciudad sin gastar nada.",
  },
  scooter: {
    name: "Scooter eléctrico",
    price: 600,
    kind: "scooter",
    speed: 9.5,
    accel: 10,
    turn: 4,
    stage: 1,
    store: "vehiculos",
    desc: "Rápido y ágil por las aceras y calles.",
  },
  moto: {
    name: "Ciclomotor",
    price: 900,
    kind: "moto",
    speed: 12.5,
    accel: 8,
    turn: 3.1,
    stage: 1,
    store: "vehiculos",
    desc: "Dos ruedas con motor: para cruzar la ciudad.",
  },
  compacto: {
    name: "Coche compacto",
    price: 1800,
    kind: "car",
    speed: 15,
    accel: 7,
    turn: 1.9,
    stage: 1,
    color: 0xff6b6b,
    store: "vehiculos",
    desc: "Pequeño, barato y fácil de aparcar.",
  },
  familiar: {
    name: "Coche familiar",
    price: 3200,
    kind: "car",
    speed: 15.5,
    accel: 6.5,
    turn: 1.7,
    stage: 2,
    color: 0x4dabf7,
    store: "vehiculos",
    desc: "Espacioso y cómodo.",
  },
  furgoneta: {
    name: "Furgoneta de reparto",
    price: 2500,
    kind: "car",
    speed: 13,
    accel: 5.5,
    turn: 1.6,
    stage: 2,
    color: 0x2ec4c4,
    store: "barrio",
    cargo: true,
    desc: "El Mayorista entrega gratis en tus almacenes. Gastos: $10/día.",
  },
  deportivo: {
    name: "Deportivo",
    price: 9000,
    kind: "car",
    speed: 22,
    accel: 11,
    turn: 2.1,
    stage: 3,
    color: 0xffd23f,
    store: "vehiculos",
    desc: "Muy rápido. Para empresarios con éxito.",
  },
  lujo: {
    name: "Gran turismo de lujo",
    price: 20000,
    kind: "car",
    speed: 24,
    accel: 10,
    turn: 2,
    stage: 3,
    color: 0x1d2b44,
    store: "lujo",
    zone: "financiero",
    desc: "Exclusivo de la Galería de lujo del distrito financiero.",
  },
};

// Casita propia (zona residencial): pequeña y barata para empezar.
export const HOME = {
  price: 250,
  // Muebles que vienen con la casa.
  starter: [
    "cama_simple",
    "mesa_pequena",
    "silla",
    "lampara_pie",
    "encimera",
    "inodoro",
    "lavabo",
  ],
};

// Muebles y decoración. size: [ancho, fondo] en metros (huella en el
// suelo). wall: se cuelga en la pared. use: tv | sit | bed | lamp | pc |
// music (lo que se puede hacer con él). flat: se puede pisar (alfombras).
// store: muebles (Muebles y Decoración) o tecnologia (Tecnología).
export const FURNITURE_SECTIONS = {
  salon: "Sala de estar",
  dormitorio: "Dormitorio",
  cocina: "Cocina",
  bano: "Baño",
  iluminacion: "Iluminación",
  decoracion: "Decoración",
  tecnologia: "Tecnología",
};
export const FURNITURE = {
  sofa: {
    name: "Sofá",
    price: 120,
    section: "salon",
    size: [2.2, 0.9],
    use: "sit",
    color: 0xff9f43,
  },
  sillon: {
    name: "Sillón",
    price: 70,
    section: "salon",
    size: [1, 0.95],
    use: "sit",
    color: 0x7b5cff,
  },
  mesa_centro: {
    name: "Mesa de centro",
    price: 35,
    section: "salon",
    size: [1.2, 0.7],
  },
  mueble_tv: {
    name: "Mueble de TV",
    price: 60,
    section: "salon",
    size: [1.8, 0.5],
  },
  estanteria: {
    name: "Estantería",
    price: 55,
    section: "salon",
    size: [1.4, 0.4],
  },
  alfombra: {
    name: "Alfombra",
    price: 30,
    section: "salon",
    size: [2.4, 1.6],
    flat: true,
    color: 0xff7eb6,
  },
  cama_simple: {
    name: "Cama sencilla",
    price: 60,
    section: "dormitorio",
    size: [1.1, 2.0],
    use: "bed",
    color: 0x6ec6ff,
  },
  cama_doble: {
    name: "Cama doble",
    price: 180,
    section: "dormitorio",
    size: [1.7, 2.1],
    use: "bed",
    color: 0xffd166,
    stage: 1,
  },
  armario: {
    name: "Armario",
    price: 90,
    section: "dormitorio",
    size: [1.4, 0.6],
  },
  mesita: {
    name: "Mesita de noche",
    price: 25,
    section: "dormitorio",
    size: [0.5, 0.45],
  },
  escritorio: {
    name: "Escritorio",
    price: 75,
    section: "dormitorio",
    size: [1.3, 0.65],
  },
  silla: {
    name: "Silla",
    price: 20,
    section: "dormitorio",
    size: [0.5, 0.5],
    use: "sit",
  },
  mesa_pequena: {
    name: "Mesa pequeña",
    price: 30,
    section: "cocina",
    size: [0.9, 0.9],
  },
  mesa_comedor: {
    name: "Mesa de comedor",
    price: 70,
    section: "cocina",
    size: [1.5, 0.9],
  },
  nevera: { name: "Nevera", price: 150, section: "cocina", size: [0.8, 0.75] },
  cocina_horno: {
    name: "Cocina con horno",
    price: 130,
    section: "cocina",
    size: [0.8, 0.7],
  },
  encimera: {
    name: "Encimera",
    price: 60,
    section: "cocina",
    size: [1.6, 0.6],
  },
  banera: { name: "Bañera", price: 110, section: "bano", size: [1.7, 0.8] },
  lavabo: { name: "Lavabo", price: 40, section: "bano", size: [0.6, 0.45] },
  inodoro: { name: "Inodoro", price: 35, section: "bano", size: [0.5, 0.7] },
  lampara_pie: {
    name: "Lámpara de pie",
    price: 30,
    section: "iluminacion",
    size: [0.5, 0.5],
    use: "lamp",
  },
  lampara_mesa: {
    name: "Lámpara de mesa",
    price: 18,
    section: "iluminacion",
    size: [0.4, 0.4],
    use: "lamp",
  },
  planta: {
    name: "Planta grande",
    price: 15,
    section: "decoracion",
    size: [0.5, 0.5],
  },
  cuadro: {
    name: "Cuadro",
    price: 25,
    section: "decoracion",
    size: [1, 0.1],
    wall: true,
  },
  espejo: {
    name: "Espejo",
    price: 35,
    section: "decoracion",
    size: [0.8, 0.1],
    wall: true,
  },
  reloj: {
    name: "Reloj de pared",
    price: 20,
    section: "decoracion",
    size: [0.5, 0.1],
    wall: true,
  },
  tele: {
    name: "Televisor",
    price: 160,
    section: "tecnologia",
    size: [1.3, 0.4],
    use: "tv",
    store: "tecnologia",
  },
  ordenador: {
    name: "Ordenador",
    price: 120,
    section: "tecnologia",
    size: [1.0, 0.6],
    use: "pc",
    store: "tecnologia",
  },
  altavoz: {
    name: "Altavoz",
    price: 45,
    section: "tecnologia",
    size: [0.45, 0.45],
    use: "music",
    store: "tecnologia",
  },
  lavadora: {
    name: "Lavadora",
    price: 100,
    section: "tecnologia",
    size: [0.7, 0.65],
    store: "tecnologia",
  },
};

// Categorías del Mayorista (zonas señalizadas y pestañas de pedido).
export const CATEGORIES = {
  bebidas: { name: "BEBIDAS", color: "#3d8bff" },
  alimentos: { name: "ALIMENTOS", color: "#f2a531" },
  limpieza: { name: "LIMPIEZA", color: "#7b6cff" },
  snacks: { name: "SNACKS", color: "#ff8a3d" },
  frescos: { name: "PRODUCTOS FRESCOS", color: "#3fbf5f" },
  cafeteria: { name: "CAFETERÍA", color: "#8b5a3c" },
};

// Locales iniciales del modo online: cada jugador recibe uno.
export const PLOTS = ["tienda", "oeste", "este", "sur"];
export const ROOM_MAX_PLAYERS = PLOTS.length;

export const GOAL_NET_WORTH = 1000000;
