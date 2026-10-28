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
- **Expansión validada en el servidor**: vehículos (etapa, distrito),
  grúa, la casita, cada mueble (hace falta casa, etapa, tope por mueble y
  que quepa), cada distribución de la casa completa (muebles comprados,
  dentro de una habitación, sin tapar puertas ni dejar habitaciones sin
  paso), el desbloqueo del distrito financiero, los objetivos (se pagan una
  vez y solo si se cumplen con los datos del servidor) y el gimnasio.
- **Tienda automática en el servidor**: el orden de las mejoras (personal
  antes del camión), su mantenimiento diario, el reparto gratis del camión
  propio y la caja fuerte. Las ganancias de fuera las calcula el servidor
  desde la última vez que te vio jugar (nivel de automatización de sus
  datos, con tope) y solo se cobran una vez; el cliente no puede fijarlas.
- **Casas y visitas**: cada jugador ve los muebles de las casas de los
  demás en su parcela. Solo se entra en una casa ajena si su dueño deja
  visitas (Decorar o Inventario → Casa); el servidor devuelve a la puerta a
  quien intente entrar en una casa cerrada.
- **Compras entre jugadores**: entra en la tienda de otro jugador y compra
  de sus estanterías; el cobro y el traspaso de unidades son atómicos.
  Cada jugador decide en Gestión si vende a otros.
- **Sincronización**: posiciones a 10 Hz con interpolación, ropa, gestos
  (saludar, aplaudir, bailar), el estado de cada tienda y sus clientes, y el
  stock compartido del Mayorista, y el vehículo en el que va cada uno
  (bici, monopatín, moto o coche, con su animación). Si alguien se mueve
  más rápido de lo que permite el vehículo que lleva (que debe ser suyo, o
  el de la prueba en la pista), sale del mapa o cruza las obras del
  distrito sin haberlo desbloqueado, el servidor lo devuelve a su sitio.
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

El juego se juega **en horizontal**. En el móvil, al primer toque intenta
ponerse a pantalla completa y bloquear la orientación (solo si el
navegador lo permite); si el teléfono está en vertical aparece un aviso
para girarlo, con la opción de jugar en vertical igualmente. En
horizontal el HUD se compacta para dejar libre el centro.

### Controles

| Acción                                           | Ordenador                            | Móvil                              |
| ------------------------------------------------ | ------------------------------------ | ---------------------------------- |
| Moverse                                          | WASD / flechas                       | Toca la mitad izquierda (joystick) |
| Correr                                           | Shift                                | Botón 🏃 (alterna)                 |
| Saltar                                           | Espacio                              | Botón ⤒                            |
| Interactuar                                      | E                                    | Botón ✋ (se ilumina si puedes)    |
| Girar cámara / zoom                              | Arrastrar ratón / rueda              | Arrastrar en la mitad derecha      |
| Gestión / mapa                                   | G / M                                | Botones de arriba a la derecha     |
| Inventario                                       | I                                    | Botón 🎒                           |
| Bici / skate / scooter                           | V                                    | Botón 🛴                           |
| Subir/bajar del coche o moto                     | E                                    | Botón ✋                           |
| Coche: acelerar, frenar, girar                   | W / S / A D, Espacio = freno de mano | Joystick                           |
| Decorar la casa                                  | B (dentro de tu casa)                | Botón 🛋️ Decorar                   |
| Decoración: girar, cuadrícula, colocar, cancelar | R, T, E, Esc                         | Botones de la barra                |
| Pausa                                            | Esc / P                              | Botón ⏸                            |

### Bucle de juego

Al abrir el juego aparece la pantalla de inicio con la ciudad en movimiento
detrás: **Continuar** (si hay partida), **Jugar**, **Personalizar
personaje**, **Opciones** y **Créditos**.

La partida empieza en la puerta de tu tienda, con algo de género ya en las
estanterías. Un **tutorial de primeros pasos** enseña el ciclo completo en
ocho pasos muy cortos, con icono, una frase y flecha en el mundo: conocer la
tienda → ir al Mayorista → coger cajas con el carro → pagar → volver →
reponer → los clientes eligen → cobrar. Cada paso se celebra (sonido, «+$»;
confeti en la primera venta) y al terminar se presenta la tienda
automática. Se puede saltar, no se repite en partidas guardadas (las de
antes del tutorial lo dan por visto) y se puede repetir desde Ayuda.
Después se alternan metas rápidas con objetivos de progreso.

1. Compra en el **Mayorista**, que es de autoservicio: toma un **carro**
   a la izquierda de la entrada (lleva hasta 10 cajas; sin carro solo
   llevas una en la mano), ve a las **estanterías** por categoría (bebidas,
   alimentos, limpieza, snacks, frescos y cafetería) y mete cajas con
   **+**; luego paga en la **CAJA**. Las antenas de la puerta no te dejan
   salir con cajas sin pagar. Al pagar puedes llevártelo tú o mandarlo con
   el **camión de reparto** (o tu furgoneta) a uno de tus negocios. En tu
   almacén descargas el carro entero de una vez.
2. Repón estanterías, cobra en la caja, ajusta precios y contrata personal.
3. Mientras tanto surgen **eventos**: ofertas flash del Mayorista con reto
   de ventas, hora punta, clientes VIP que pagan el doble y monedas perdidas
   por la ciudad.
4. Los comerciantes del barrio (Chef Paco, Rosa la florista, Leo del
   quiosco) piden **encargos**: llévales la mercadería antes de que acabe el
   tiempo. Completarlos desbloquea prendas especiales.
5. Explorar da dinero: cada lugar nuevo descubierto suma $10.
6. Cada día dura 5 minutos; al terminar se pagan alquiler, salarios,
   mantenimiento de mejoras y vehículos y aparece un resumen breve sin
   detener el juego.

### Mejorar la tienda y contratar personal

Tras el tutorial hay siempre a mano un botón amarillo **⬆️ MEJORAR**
(debajo del minimapa, tecla U) que dice cuál es el siguiente paso; se
ilumina y muestra «!» cuando ya se puede pagar, y la primera vez avisa con
un mensaje. Abre la gestión del local en el que estás (o de tu tienda) con
una tarjeta **Siguiente paso** y un solo botón: en la tienda sigue la ruta
automática (reponedor, cajero, camión...); en los demás negocios, primero
el personal que falta y después la mejora más barata. Si el paso de la ruta
espera una etapa, la tarjeta lo dice («🔒 Después: Reponedor, al llegar a
la etapa Comerciante»). Cada negocio propio tiene además un cartel amarillo
**MEJORAR TIENDA + PERSONAL** en el escaparate, junto a la puerta, que abre
lo mismo con E. Las pestañas de Gestión llevan icono (⬆️ Mejoras, 👥
Personal, 💲 Precios, 📋 Resumen). Contratar y comprar usan las mismas
acciones de siempre, así que en online las sigue validando el servidor.

### Tienda automática

Desde **Gestión → ⚙️ Automática** (o el indicador `🏪 +$/min` del HUD) la
tienda se automatiza en orden; cada paso exige el anterior y se ve en el
mundo:

| Paso                    | Precio            | Qué hace                                                                                                      |
| ----------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| 1. Reponedor            | $18/día (etapa 1) | Rellena las estanterías desde el almacén                                                                      |
| 2. Cajero               | $22/día (etapa 1) | Cobra solo                                                                                                    |
| 3. Camión propio        | $350 + $4/día     | Compra en el Mayorista cuando el almacén baja del 20/40/60 % elegido                                          |
| 4. Cinta transportadora | $550 + $2/día     | Cajas que viajan por el techo del almacén a las estanterías                                                   |
| 5. Ampliaciones         | $60–$1.200        | Más estanterías, segunda caja, cartel luminoso, fachada de lujo y segunda planta (almacén +120, más clientes) |

Con reponedor y cajero la tienda vende sola mientras conduces, decoras o
juegas con amigos: el HUD muestra la ganancia por minuto y, si estás lejos,
monedas volando hacia tu dinero. Mientras no juegas, la **caja fuerte**
junto al almacén guarda ganancias ($0,50–$2,50/min según el nivel) hasta un
tope de 30 min–6 h, y se cobran al volver a la tienda. Siempre se puede
seguir haciendo todo a mano.

Equilibrio medido con un jugador simulado que solo atiende la tienda (sin
misiones, objetivos ni otros negocios): primera automatización a los ~9
minutos de juego, cinta a los ~42 y fachada a los ~150; con la segunda
planta la tienda queda completa en unas 4 horas (antes si además se hacen
misiones, objetivos y encargos).

Etapas: Principiante → Comerciante ($300 en ventas) → Empresario ($1.500) →
Magnate ($8.000).

## Qué incluye

### Edificios según el rubro

Todos los edificios comparten la misma base (paredes, puerta, cartel), pero
cada negocio lleva piezas propias (`src/storefronts.js`):

| Edificio          | Qué lo distingue                                                     |
| ----------------- | -------------------------------------------------------------------- |
| Tiendas de barrio | Máquina de refrescos roja junto a la esquina                         |
| Café Aroma        | Pilares de madera y taza gigante humeante en la azotea               |
| Minimercado Sol   | Una planta, sol del logotipo (brilla de noche), cartel «24 H», hielo |
| Súper Millonario  | Una planta, marquesina con luz, tótem, carritos y placas solares     |
| Mayorista         | Nave de chapa con tejado curvo, bolardos, palés y muelle de carga    |
| Boutique          | Arbustos podados y molduras doradas                                  |
| Restaurante       | Tejado a dos aguas, chimenea, farolillos y pizarra del menú          |
| Ropa              | Banderines sobre los escaparates y camiseta gigante en la azotea     |
| Vehículos         | Neumático gigante y franja de cuadros de meta                        |
| Muebles           | Sillón gigante y lámpara de pie en la azotea                         |
| Tecnología        | Antena parabólica, mástil con luz y franja LED                       |
| Gimnasio          | Mancuerna gigante en la azotea                                       |
| Galería de lujo   | Alfombra roja con postes dorados y corona en la azotea               |

Las piezas de cada edificio se funden en pocas mallas; las de la azotea se
ocultan al entrar, como el techo, y solo las que estorban al paso tienen
colisión.

### Plantas, materiales y tejados

`Building` admite de 1 a 3 plantas (`floors`), material de fachada
(`facade`: revoco, ladrillo, madera, piedra o paneles), ventanas
(`windows`: con jardinera, contraventanas, balcón, de medio punto o franja
corrida moderna) y tejado (`roof`: plano con aire acondicionado, a dos
aguas, a cuatro aguas, con pretil o azotea jardín). Ejemplos: el local
oeste tiene 3 plantas de ladrillo con contraventanas; el este, 1 planta de
madera con tejado a cuatro aguas; la boutique, 3 plantas con balcones;
Tecnología, 3 plantas de paneles con ventanas corridas; Vehículos y el
gimnasio, 1 planta.

### Árboles, palomas y mascotas

- Cinco especies de árbol: frondoso, pino, cerezo en flor, abedul y
  palmera (en la plaza del distrito financiero). Sin especie indicada se
  elige una fija según la posición.
- **Palomas** (`src/critters.js`) en la plaza de las palomas, junto a la
  fuente, en el parque residencial y en el distrito financiero: picotean y
  salen volando si te acercas; vuelven cuando te alejas.
- **Mascotas**: perros (Toby vive en el jardín de tu casa, con caseta;
  Luna y Rocky en el barrio residencial) y gatos (Misi, Nube y Tigre).
  Pasean, se sientan, mueven la cola y los perros se acercan a saludar.
  Con E se acarician (corazones). Son solo ambiente: no se guardan ni se
  sincronizan en online.

### La gran expansión

El barrio inicial no cambia; la ciudad crece a su alrededor y se recorre
andando o en vehículo, sin teletransportes:

- **Zona comercial** (al norte, por la avenida): tiendas físicas con
  fachada, escaparates e interior.
  - **Tienda de ropa**: maniquíes, percheros, zapatero, probadores,
    espejos y caja. «VER PRENDA» enseña el precio y te la pone para
    verla en tu personaje; puedes elegir color, probártela por la tienda
    (si sales sin pagar te la quitas), comprarla o cancelar.
  - **Concesionario VEHÍCULOS**: monopatín, bici, scooter, moto, coche
    compacto, familiar y deportivo (en plataforma giratoria). «EXAMINAR
    VEHÍCULO» con precio y datos; **prueba gratis en la pista** de al lado.
  - **Muebles y Decoración**: salas de salón, dormitorio, cocina, baño,
    iluminación y un muro de decoración. «COMPRAR MUEBLE»: lo comprado va
    al inventario y nunca se coloca solo.
  - **Tecnología**: televisor, ordenador, altavoz y lavadora, que se usan
    en casa.
  - **Gimnasio**: un entrenamiento ($25) te hace correr un 12 % más rápido
    durante 3 minutos.
- **Vehículos de verdad**: los pequeños se llevan encima y se usan con V
  (pedaleo, impulso del monopatín, inclinación en las curvas); la moto y
  los coches se aparcan donde los dejas y se sube con E. Los coches
  aceleran, frenan, dan marcha atrás, giran según la velocidad, chocan con
  todo su chasis y no entran en los edificios. Servicio de grúa ($15) desde
  el inventario.
- **Tu casa** («MI CASA», donde se descansa y se guarda la partida) está
  en la zona residencial, en la calle transversal; su sitio en el barrio
  inicial es ahora la **plaza de las palomas**.
- **Zona residencial** (al sur): la **casita** ($250, con muebles básicos)
  tiene salón con cocina, dormitorio y baño, jardín, buzón con número y
  farola. Con **🛋️ Decorar** se colocan, mueven, giran (cuadrícula
  opcional), guardan o recolocan muebles con vista desde arriba: verde si
  cabe, rojo con el motivo si no (dentro de una habitación, sin tapar
  puertas, sin chocar con otros muebles y dejando paso a todas las
  habitaciones). Los cuadros, espejos y relojes se cuelgan en las paredes.
  Se puede encender la tele (dibujos animados), las lámparas, sentarse,
  dormir hasta la mañana, usar el ordenador (gestión) y poner música.
- **Distrito financiero** (lejos, al oeste, al final de una avenida):
  rascacielos, plazas, fuente con una moneda gigante, tráfico propio y la
  **Galería de lujo** (traje de millonario, cadena de oro y un gran turismo).
  Las obras con el cartel «DISTRITO FINANCIERO — ACCESO BLOQUEADO» cortan
  la avenida hasta que acumulas **$1.500 en ventas** (etapa Empresario); el
  cartel muestra tu progreso y al cumplirlo se abre para siempre con un
  aviso y confeti.
- **Inventario** por pestañas: cajas y almacenes, ropa (ponértela),
  vehículos (elegir el de V, ir a donde está aparcado, grúa), muebles
  (colocados y guardados), casa (ir, permitir visitas) y objetivos.
- **Objetivos opcionales** con recompensa única: primer vehículo, casa,
  10 muebles colocados, un coche, el distrito y 4 vehículos.
- **Mapa** con iconos de cada zona y tienda y lista de destinos; el
  elegido se marca con la flecha en el borde de la pantalla y la distancia.
  Avisos «ENTRAR A LA TIENDA», «EXAMINAR VEHÍCULO», «COMPRAR MUEBLE» y
  «ENTRAR A CASA».
- **Rendimiento**: las zonas lejanas no se dibujan, el tráfico y los
  peatones lejanos se retiran, los maniquíes y piezas estáticas se funden
  en pocas mallas y las colisiones usan un índice espacial.

### Todo lo demás

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
- **Aspecto de ciudad costera**, con colores vivos (mapeo de tonos
  neutro y paleta saturada): cielo azul intenso con nubes grandes,
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
| `src/tutorial.js`    | Tutorial de primeros pasos                                     |
| `src/automation.js`  | Tienda automática: camión, $/min, caja fuerte                  |
| `src/shopfit.js`     | Cinta transportadora, fachada y segunda planta                 |
| `src/storefronts.js` | Fachada propia de cada rubro (azotea, acera, carteles)         |
| `src/critters.js`   | Palomas y mascotas de ambiente                                 |
| `src/icons.js`       | Iconos de productos dibujados en canvas                        |
| `src/net.js`         | Conexión WebSocket (peticiones y mensajes)                     |
| `src/online.js`      | Modo online: avatares remotos, tiendas ajenas, chat, ranking   |
| `src/city/`          | Zonas nuevas: comercial, residencial, distrito financiero      |
| `src/stores/`        | Interiores: ropa, vehículos, muebles, tecnología, lujo, gym    |
| `src/shopping.js`    | Ver, probar y comprar ropa en las tiendas                      |
| `src/rides.js`       | Vehículos: comprar, probar, subir/bajar, aparcar, grúa         |
| `src/furnishop.js`   | Comprar muebles y aparatos en las tiendas                      |
| `src/furniture.js`   | Modelos 3D de los muebles                                      |
| `src/homelayout.js`  | Reglas de la casa (cliente y servidor): huecos, puertas, paso  |
| `src/home.js`        | Casita propia y casas ajenas, usos de los muebles              |
| `src/decorate.js`    | Modo decoración                                                |
| `src/district.js`    | Barrera y desbloqueo del distrito financiero                   |
| `src/goals.js`       | Gimnasio y objetivos opcionales                                |
| `src/mapdraw.js`     | Dibujo de la ciudad en el mapa y el minimapa                   |
| `server/server.js`   | Servidor HTTP + WebSocket: ciudades, sincronización, chat      |
| `server/economy.js`  | Reglas de economía validadas en el servidor                    |
| `server/store.js`    | Persistencia en JSON                                           |

## Pendiente

- El restaurante está construido pero cerrado («en obras»).
- El equilibrio económico de la etapa Magnate hasta el millón está poco
  probado; los valores están en `src/config.js`.
- La música es generativa y sencilla; no hay pistas grabadas.
