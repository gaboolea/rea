# De Cero a Millonario

Simulador 3D de negocios y vida en una pequeña ciudad, hecho con Three.js.
Empiezas con $150 y una tienda de barrio; compras mercadería, repones
estanterías, cobras a los clientes, contratas personal y vas comprando
locales, vehículos y una casa mejor hasta llegar al millón.

Es independiente del resto del repositorio: no usa su `package.json` ni su
build.

## Cómo jugar

Sirve la carpeta con cualquier servidor estático (los módulos ES no se cargan
desde `file://`) y abre `index.html`:

```sh
cd games/de-cero-a-millonario
python3 -m http.server 8080
# abre http://localhost:8080
```

Three.js 0.170.0 se carga desde jsDelivr mediante un `importmap`, así que el
navegador necesita conexión la primera vez.

### Controles

| Acción              | Ordenador               | Móvil                              |
| ------------------- | ----------------------- | ---------------------------------- |
| Moverse             | WASD / flechas          | Toca la mitad izquierda (joystick) |
| Correr              | Shift                   | Botón 🏃 (alterna)                 |
| Saltar              | Espacio                 | Botón ⤒                            |
| Interactuar         | E                       | Botón ✋ (se ilumina si puedes)    |
| Girar cámara / zoom | Arrastrar ratón / rueda | Arrastrar en la mitad derecha      |
| Gestión / mapa      | G / M                   | Botones de arriba a la derecha     |
| Inventario          | I                       | Botón 🎒                           |
| Scooter             | V                       | Botón 🛴                           |
| Pausa               | Esc / P                 | Botón ⏸                            |

### Bucle de juego

Al abrir el juego aparece la pantalla de inicio con la ciudad en movimiento
detrás: **Continuar** (si hay partida), **Jugar**, **Personalizar
personaje**, **Opciones** y **Créditos**.

La partida empieza en la puerta de tu tienda, con algo de género ya en las
estanterías: el primer cliente llega en segundos. El tutorial son misiones
cortas (entrar, cobrar, reponer desde el almacén, 5 ventas, comprar en el
Mayorista, llevar la mercadería…) y después se alternan metas rápidas con
objetivos de progreso.

1. Compra en el **Mayorista** (mostrador PEDIDOS): recoge las cajas en
   **RECOGIDA** o pide que el **camión de reparto** las lleve a tu almacén.
2. Repón estanterías, cobra en la caja, ajusta precios y contrata personal.
3. Mientras tanto surgen **eventos**: ofertas flash del Mayorista con reto
   de ventas, hora punta, clientes VIP que pagan el doble y monedas perdidas
   por la ciudad.
4. Los comerciantes del barrio (Chef Paco, Rosa la florista, Leo del
   quiosco) piden **encargos**: llévales la mercadería antes de que acabe el
   tiempo. Completarlos desbloquea prendas especiales.
5. Explorar da dinero: cada lugar nuevo descubierto suma $10.
6. Cada día dura 5 minutos; al terminar se pagan alquiler, salarios, luz y
   vehículos y aparece un resumen breve sin detener el juego.

Etapas: Principiante → Comerciante ($300 en ventas) → Empresario ($1.500) →
Magnate ($8.000).

## Qué incluye

- **Pantalla de inicio** con logotipo animado, el personaje en primer plano
  y la ciudad viva detrás; transición con fundido al empezar.
- **Personalización** en un estudio 3D giratorio: camisetas, sudaderas,
  chaquetas, trajes, pantalones, shorts, vaqueros, zapatillas, botas,
  zapatos, gorras, gorros, sombreros, chistera, corona, lentes de sol y de
  colores, mochilas, pajarita, bufanda, cadenas y tono de piel. Todas las
  prendas son geometría 3D montada en las articulaciones del personaje, así
  que se mueven con él. Hay un conjunto gratuito; el resto se compra o se
  gana jugando (encargos, etapa Magnate).
- **Ciudad viva**: peatones con ropa variada que pasean, cruzan por los
  pasos de cebra, entran en comercios, charlan, saludan, esperan y suben al
  autobús; tráfico con semáforos funcionales en el cruce, autobús con
  parada, camiones de reparto, papeleras, bancos, puestos de fruta, terraza
  de café, fuente, mariposas, nubes y árboles que se mecen.
- **Día y tarde**: la luz cambia poco a poco hasta el anochecer; las
  farolas y las luces interiores de las tiendas se encienden.
- **Audio sintetizado** en tiempo real (Web Audio, sin archivos): música
  distinta en el inicio y en la ciudad, efectos de venta, compra, cajas,
  misiones, pasos y saltos, y ambiente urbano (rumor de calle, coches,
  conversaciones lejanas, pájaros). Empieza tras el primer toque o clic.
- **Movimiento**: aceleración y frenado suaves, polvo al correr, rebote al
  aterrizar, pasos con sonido.
- **HUD compacto**: dinero y ganancia del día, hora, objetivo con barra de
  progreso, eventos y encargos con cuenta atrás, avisos breves y «+$» al
  ganar dinero.
- **Opciones**: volumen de música y de efectos, silencio, sensibilidad de
  cámara, invertir eje vertical, correr siempre y calidad gráfica
  (baja/media/alta: sombras, resolución y cantidad de peatones).
- Todo lo de la versión anterior: tienda con existencias reales, clientes y
  empleados con navegación A\*, mejoras, cafetería, minimercado,
  supermercado, scooter, furgoneta, Villa Bonita y misiones.
- **Guardado** automático en `localStorage`: dinero, inventario, negocios,
  mejoras, misiones, ropa, descubrimientos, repartos en curso y posición
  (solo si es segura). Los ajustes se guardan aparte. Las partidas de la
  versión 1 se migran.

## Código

| Archivo              | Responsabilidad                                                |
| -------------------- | -------------------------------------------------------------- |
| `src/config.js`      | Datos ajustables: productos, etapas, mejoras, personal, bienes |
| `src/look.js`        | Catálogo de ropa y accesorios, looks por defecto y aleatorios  |
| `src/main.js`        | Arranque, modos (inicio, armario, partida), economía, guardado |
| `src/world.js`       | Ciudad, decoración, interiores fijos y animaciones ambientales |
| `src/building.js`    | Edificio genérico: paredes, puertas, techo, letreros, luces    |
| `src/business.js`    | Negocios: mobiliario, existencias, cajas, clientes y empleados |
| `src/npc.js`         | Agentes con navegación; clientes (y VIP) y empleados           |
| `src/pedestrians.js` | Peatones y sus actividades                                     |
| `src/vehicles.js`    | Coches, autobús, camiones, semáforos                           |
| `src/events.js`      | Eventos, encargos, monedas y descubrimientos                   |
| `src/audio.js`       | Música, efectos y ambiente sintetizados                        |
| `src/wardrobe.js`    | Pantalla de personalización 3D                                 |
| `src/player.js`      | Movimiento del jugador y cámara                                |
| `src/physics.js`     | Colisiones, altura del suelo, rejilla A\* con coste de calzada |
| `src/character.js`   | Personajes de juguete, ropa 3D y animación                     |
| `src/props.js`       | Muebles y expositores con productos instanciados               |
| `src/ui.js`          | HUD y paneles                                                  |
| `src/missions.js`    | Misiones y progreso                                            |

## Pendiente

- El restaurante está construido pero cerrado («en obras»).
- El equilibrio económico de la etapa Magnate hasta el millón está poco
  probado; los valores están en `src/config.js`.
- La música es generativa y sencilla; no hay pistas grabadas.
