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
navegador necesita conexión la primera vez. Así solo funciona el modo de un
jugador; el multijugador necesita el servidor de abajo.

## Multijugador

El modo online es real: un servidor Node.js (`server/`) sirve el juego y
mantiene una conexión WebSocket con cada navegador. Hace falta Node.js 18 o
superior en el ordenador que haga de servidor; los jugadores solo necesitan
un navegador.

```sh
cd games/de-cero-a-millonario/server
npm install     # instala ws y three (para servir three.js sin internet)
npm start       # http://localhost:8080  ·  WebSocket ws://localhost:8080/ws
npm test        # pruebas de economía y de integración con clientes reales
```

Variables opcionales: `PORT` (8080 por defecto) y `DATA_DIR` (carpeta de
la base de datos; por defecto `server/data/`).

Para jugar desde otros dispositivos de la misma red (otro ordenador, un
móvil):

1. Averigua la IP local del servidor (`ipconfig` en Windows, `ip addr` o
   `ifconfig` en Linux/macOS), por ejemplo `192.168.1.40`.
2. En cada dispositivo abre `http://192.168.1.40:8080`. Si el cortafuegos
   pregunta, permite conexiones entrantes al puerto 8080.
3. Pulsa **MULTIJUGADOR**. La dirección del servidor se rellena sola con la
   de la página (`ws://192.168.1.40:8080/ws`); puedes escribir otra.
4. Escribe tu nombre y pulsa **Conectar**. Un jugador crea una ciudad
   (pública o privada) y comparte el **código** de 5 letras; los demás la
   eligen de la lista o escriben el código.

Para jugar por internet hay que publicar el servidor tú mismo (un VPS, o
reenviar el puerto del router) y, en páginas `https`, ponerlo detrás de un
proxy con TLS para usar `wss://`. El proyecto no incluye ningún servicio
alojado, cuenta ni credencial.

Qué hace el servidor:

- **Ciudades de hasta 4 empresarios**, uno por local (tienda de la esquina,
  oeste, este y sur). Cada jugador puede crear 5 ciudades como mucho.
  Muestra la lista de ciudades públicas con jugadores conectados.
- **Economía autoritativa**: el dinero, las unidades de cada producto, las
  mejoras, el personal, las propiedades y la ropa se guardan y validan en el
  servidor. Las ventas tienen precio máximo y límite de frecuencia, las
  misiones se cobran una sola vez y los gastos del día los descuenta el
  servidor. La cafetería, el minimercado, el supermercado y Villa Bonita
  son únicos por ciudad: si dos jugadores los compran a la vez, solo uno lo
  consigue.
- **Compras entre jugadores**: entra en la tienda de otro jugador y compra
  de sus estanterías; el cobro y el traspaso de unidades son atómicos.
  Cada jugador decide en Gestión si vende a otros.
- **Sincronización**: posiciones a 10 Hz con interpolación, ropa, gestos
  (saludar, aplaudir, bailar), el estado de cada tienda y sus clientes, y el
  stock compartido del Mayorista. Si alguien se mueve más rápido de lo
  posible, el servidor lo devuelve a su sitio.
- **Chat** de ciudad con límite de mensajes, mensajes repetidos filtrados,
  texto limpiado en el servidor y silenciado por jugador (clic en el nombre
  o desde la clasificación).
- **Clasificación** por patrimonio dentro de la ciudad.
- **Persistencia**: el progreso de cada jugador en cada ciudad se guarda en
  `server/data/db.json` (escritura atómica). Al volver con el mismo
  navegador se recupera todo.

Límites conocidos:

- La identidad es una clave aleatoria guardada en el navegador (el servidor
  solo guarda su hash). No hay cuentas: otro navegador u otro dispositivo es
  otro jugador, y borrar los datos del navegador pierde el acceso.
- El progreso online es por ciudad e independiente de la partida de un
  jugador.
- Los peatones, el tráfico y el reloj visual se simulan en cada navegador;
  solo los jugadores, las tiendas, sus clientes y el Mayorista se
  comparten.
- La base de datos es un archivo JSON pensado para unas pocas ciudades en
  un servidor pequeño. Se ha probado con dos navegadores a la vez; no está
  diseñado ni probado para cientos de jugadores.
- La vista previa publicada en claude.ai no permite conexiones WebSocket:
  allí solo funciona el modo de un jugador.

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

1. Compra en el **Mayorista**. Al entrar, flechas amarillas en el suelo y
   un cartel llevan a la **CAJA**, un mostrador grande con el pórtico
   «🛒 CAJA · COMPRA AQUÍ»: ahí se paga todo. Las estanterías del fondo
   también abren el pedido de su categoría. La primera visita activa un
   tutorial de 6 pasos (se puede repetir desde Ayuda). Zonas:
   **A · CAJA** (categorías, stock disponible, cantidad, total y lo que te
   falta), **B · RECOGER PEDIDO** (las cajas aparecen en el palé cuando el
   pedido está listo) y **C · CARGA Y SALIDA**. Junto a la entrada hay
   **carros**: con uno cargas hasta 10 cajas de una vez y en el almacén de
   tu tienda las descargas todas juntas. También puedes pedir que el
   **camión de reparto** las lleve a tu almacén.
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
- **Personajes tipo gominola**: cuerpo de una sola pieza en forma de
  judía, cabeza pequeña fundida con él, brazos y piernas cortos y gruesos
  que salen del propio cuerpo, acabado brillante y rebote de gelatina al
  andar, frenar y aterrizar. Igual para el jugador, clientes, empleados,
  peatones y los demás jugadores.
- **Personalización** en un estudio 3D giratorio: camisetas, sudaderas,
  chaquetas, trajes, pantalones, shorts, vaqueros, zapatillas, botas,
  zapatos, gorras, gorros, sombreros, chistera, corona, lentes de sol y de
  colores, mochilas, pajarita, bufanda, cadenas y tono de piel. Todas las
  prendas son geometría 3D montada en las articulaciones del personaje, así
  que se mueven con él. Hay un conjunto gratuito; el resto se compra o se
  gana jugando (encargos, etapa Magnate).
- **Aspecto de ciudad costera**: cielo con degradado y nubes grandes,
  montañas al fondo, mar con playa al final de la avenida, edificios de dos
  plantas con ventanas y jardineras, farolas negras clásicas con
  banderolas, árboles frondosos en alcorques, jardineras junto a las
  puertas, pizarras, aceras de baldosas y césped con textura.
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
- **Navegación**: icono y letrero «MI TIENDITA» sobre tu tienda, puerta
  iluminada, flecha en el borde de la pantalla con la distancia, botón
  **IR A MI TIENDA**, ruta marcada por las calles hasta el objetivo actual
  y minimapa circular con tu tienda, el Mayorista y los demás jugadores.
- **Tienda más completa**: neveras, congelador, frutería con fruta y
  verdura, estanterías de pared, etiquetas de precio, segunda caja,
  carritos, cestas, reloj, carteles y más productos (verdura, patatas,
  detergente, jabón, helado).
- **Mayorista grande**: estanterías por categorías (BEBIDAS, ALIMENTOS,
  LIMPIEZA, SNACKS, PRODUCTOS FRESCOS), carretilla elevadora, carros,
  lámparas y trabajadores que mueven cajas.
- **Tráfico de personas sin atascos**: se entra por un lado de la puerta y
  se sale por el otro, las filas de caja no salen del local, quien se
  atasca se desvía o pasa de largo, y los coches no se paran encima de los
  pasos de cebra.
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
| `src/scenery.js`     | Cielo, montañas, mar y terreno exterior (solo decorativo)      |
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
| `src/decor.js`       | Decoración: carritos, relojes, estanterías industriales...     |
| `src/guide.js`       | Indicadores de tienda, flecha, ruta y minimapa                 |
| `src/warehouse.js`   | Stock del Mayorista, pedidos y trabajadores                    |
| `src/tutorial.js`    | Tutorial del Mayorista                                         |
| `src/icons.js`       | Iconos de productos dibujados en canvas                        |
| `src/net.js`         | Conexión WebSocket (peticiones y mensajes)                     |
| `src/online.js`      | Modo online: avatares remotos, tiendas ajenas, chat, ranking   |
| `server/server.js`   | Servidor HTTP + WebSocket: ciudades, sincronización, chat      |
| `server/economy.js`  | Reglas de economía validadas en el servidor                    |
| `server/store.js`    | Persistencia en JSON                                           |

## Pendiente

- El restaurante está construido pero cerrado («en obras»).
- El equilibrio económico de la etapa Magnate hasta el millón está poco
  probado; los valores están en `src/config.js`.
- La música es generativa y sencilla; no hay pistas grabadas.
