# Jelly Rumble

Juego 3D multijugador online para navegador: parkour, combate y supervivencia con
criaturas gelatinosas. Cinco rondas, cinco mapas, armas que caen del cielo y un
único campeón.

- **Cliente:** Three.js + TypeScript (Vite).
- **Servidor:** Node.js + WebSocket (`ws`). Es **autoritativo**: simula la física, valida
  ataques, recogidas, eliminaciones y rondas, y decide el ganador. Los clientes
  solo envían entradas (teclas, dirección de cámara).
- **Física compartida** (`shared/physics.ts`): el mismo código corre en el servidor
  (autoridad) y en el cliente (predicción del jugador local + reconciliación).
- Sin recursos externos: modelos, texturas, música y sonidos se generan por código.

## Requisitos

- Node.js 20 o superior (probado con Node 22).

## Instalar y jugar en local

```bash
cd jelly-rumble
npm install
npm run dev
```

Abre <http://localhost:5173>. Para probar el multijugador en el mismo ordenador
abre una segunda pestaña (o ventana de incógnito), crea una sala privada en una y
únete con el código desde la otra.

### Modo producción (un único puerto)

```bash
npm run build      # comprueba tipos y compila el cliente en dist/
npm start          # sirve el juego y el WebSocket en http://localhost:2567
```

Cambia el puerto con `PORT=8080 npm start`.

### Jugar en red local (LAN)

Con `npm start`, los demás equipos de tu red entran en `http://IP-DE-TU-PC:2567`
(con `npm run dev`, en `http://IP-DE-TU-PC:5173`). Puede que tengas que permitir
el puerto en el cortafuegos.

## Jugar online por internet

El servidor sirve el cliente y el WebSocket en el mismo puerto, así que basta con
publicar ese único proceso. Opciones:

1. **Túnel rápido (para probar con amigos):** con el juego en marcha (`npm start`),
   ejecuta `cloudflared tunnel --url http://localhost:2567` (o `ngrok http 2567`) y
   comparte la URL https que te den. El cliente usa `wss://` automáticamente.
2. **Servidor en la nube (permanente):** el repositorio incluye un `Dockerfile`.
   Sirve en cualquier plataforma que ejecute contenedores con WebSockets
   (Render, Railway, Fly.io, un VPS…):
   ```bash
   docker build -t jelly-rumble .
   docker run -p 2567:2567 jelly-rumble
   ```
   Sin Docker: `npm ci && npm run build && npm start` en el servidor.
3. **Cliente y servidor separados:** si alojas el cliente estático (`dist/`) en otro
   sitio, indícale el servidor con `?server=`:
   `https://tu-cliente.example/?server=wss://tu-servidor.example/ws`.

`GET /health` devuelve el número de salas y jugadores conectados.

> El modo online se ha probado entre clientes distintos conectados al mismo
> servidor (navegadores y clientes WebSocket independientes). Aún no se ha
> desplegado en un servidor público: para jugar desde internet hay que usar una
> de las opciones de arriba.

## Jugar en el móvil

- **Controles táctiles:** se activan solos en pantallas táctiles. Mitad izquierda: joystick
  (empújalo hasta el borde para correr). Mitad derecha: arrastra para girar la cámara.
  Botones: 👊 atacar, ⤒ saltar, 🛡️ bloquear, ✋ coger arma, ❚❚ pausa. Mejor en horizontal.
- **Online desde el móvil:** arranca el servidor en un PC (`npm run dev` o `npm start`) y abre
  `http://IP-DEL-PC:5173` (o `:2567`) en el móvil, conectado a la misma wifi; o usa un túnel
  / servidor en la nube (ver abajo).
- **Sin servidor (solo entrenamiento):** `npm run build:single` genera
  `dist-single/jelly-rumble.html`, un único archivo que funciona sin servidor: al no poder
  conectarse, ejecuta la misma lógica de salas dentro del navegador y juegas contra bots.
  También se puede forzar con `?offline`.

## Cómo se juega

| Acción | Control |
| --- | --- |
| Moverse | `WASD` o flechas |
| Correr | `Shift` |
| Saltar | `Espacio` |
| Cámara | Ratón (clic en la pantalla para capturarlo, rueda para el zoom) |
| Atacar | Clic izquierdo (o `J`) |
| Bloquear | Clic derecho (o `F`) |
| Recoger arma | `E` |
| Ayuda de controles | `H` |
| Pausa / salir | `Esc` |

**Combate.** Cada golpe suma daño (%) y, cuanto más daño tienes, más lejos sales
volando. El bloqueo (clic derecho) reduce el empuje si miras hacia el atacante. Cada arma
tiene alcance, velocidad, empuje, tiempo de recuperación y usos distintos; se esquiva
moviéndose y saltando. Las armas caen del cielo con un haz de luz y una marca en el suelo
(se recogen con `E` o ✋), en oleadas repartidas por el mapa y sin repetir a la vez las
especiales (Mazo Sísmico y escudo).

| Objeto | Estilo |
| --- | --- |
| Puños | Rápidos, poco empuje |
| Espada | Tajo rápido de alcance medio (10 usos) |
| Martillo | Lento, enorme empuje e interrumpe ataques (6 usos) |
| Guantes de impacto | Puñetazo corto que lanza al rival hacia atrás (8 usos) |
| Escudo temporal | Burbuja que anula casi todo el empuje durante 8 s o 3 golpes |
| Mazo Sísmico (especial) | Onda expansiva en círculo (3 usos, solo en la final) |

## El torneo: 5 rondas

| Ronda | Objetivo | Quién pasa |
| --- | --- | --- |
| 1. **La Carrera Mortal** | Cruzar el circuito (puentes, plataformas que desaparecen y móviles, barras, martillos gigantes y un trampolín obligatorio hacia la plataforma alta). Caer elimina. | Primero quienes llegan a la meta, en orden de llegada; si sobran plazas al acabar el tiempo, los vivos que llegaron más lejos. |
| 2. **El Ring de las Armas** | Sobrevivir en la arena giratoria (barras que aceleran y sectores del suelo que caen) mientras caen espadas, martillos, guantes y escudos. 1 vida. | Los supervivientes; si al acabar el tiempo quedan más que plazas, los que mejor combatieron (KO y daño hecho). |
| 3. **El Robo de Energía** | Recoger núcleos ⚡ (al tocarlos, máx. 3, frenan un poco) y entregarlos en la zona brillante, que cambia de sitio cada 18 s. Un golpe te hace soltar núcleos que cualquiera puede robar; si caes, quedan donde pisaste por última vez. 3 vidas. | Los que más puntos entregaron (3 de golpe dan +1); desempata seguir vivo. Esconderse no da puntos. |
| 4. **El Suelo Desaparece** | Aguantar sobre baldosas que caen al pisarlas, un borde que se desmorona y empujadores que van cada vez más rápido. 1 vida. | Todos los que sigan vivos al final; la ronda acaba antes si solo quedan tantos como plazas. |
| 5. **La Gran Final** | Ser el último en pie en un ring que encoge, con plataformas que desaparecen y armas cada 6 s. Al acabar el tiempo, **muerte súbita** (empujones ×1,6) durante 30 s. | El último en pie. Si la muerte súbita termina con varios, gana el que tenga menos daño; si caen todos a la vez, el último en caer con menos daño. |

**Reglas generales.**

- Todos empiezan en la ronda 1; antes de cada ronda aparece una tarjeta con el nombre, el
  objetivo, las reglas y cuántas plazas hay.
- Plazas: cada ronda clasifica a una parte de los que la empiezan (80 %, 75 %, 70 % y
  60 % en las rondas 1–4; siempre se elimina al menos a uno si hay más de dos).
- **Repesca**: si en una ronda se clasificaran menos de 2, pasan los mejor colocados entre
  los eliminados hasta completar 2, para que siempre haya final. Se marca como «repesca».
- Los eliminados no reaparecen en esa ronda (salvo las vidas de la ronda 3) y pasan a ser
  espectadores (clic o toque para cambiar de jugador seguido).
- Entre rondas se muestra la clasificación: quién pasa, quién queda fuera y el motivo
  (puesto en meta, metros recorridos, puntos, KO, supervivencia).
- Ninguna ronda puede bloquearse: todas tienen tiempo límite y condición de final.
- Al terminar: pantalla de campeón con celebración (confeti u otro efecto desbloqueado),
  recompensas y botones para jugar otra vez o volver al menú.

## Progresión y recompensas

- Al terminar un torneo ganas **monedas** y **XP** por participar, por cada ronda
  superada, por eliminaciones, por núcleos entregados y por ganar. La XP sube de nivel.
- En **PROGRESO** ves tu nivel, monedas y estadísticas (partidas, victorias, eliminaciones,
  rondas superadas, núcleos entregados, mejor puesto) y la tienda de cosméticos: colores
  extra, disfraces (accesorios nuevos), gestos (`T` o `1-5`, botón 😀 en el móvil),
  celebraciones de victoria y títulos. Algunos piden un nivel mínimo.
- Los cosméticos son opcionales y se añaden encima del personaje base; **no cambian
  ninguna estadística**: un jugador veterano no pega más fuerte que uno nuevo.
- El servidor valida todas las compras y que solo uses lo que tienes desbloqueado.

**Dónde se guarda el progreso (importante):**

- **Con servidor** (`npm start` / `npm run dev`): en el archivo `data/profiles.json` del
  servidor (cambia la carpeta con `DATA_DIR=/ruta`). Cada navegador tiene un identificador
  anónimo propio guardado en su `localStorage`; no hay cuentas ni contraseñas. Si borras
  los datos del navegador, o juegas desde otro dispositivo, empiezas un perfil nuevo. En
  plataformas con disco efímero (por ejemplo, planes gratuitos que reinician el
  contenedor) hay que montar un disco persistente en `DATA_DIR` o el progreso se pierde al
  redesplegar.
- **Sin conexión** (archivo único o `?offline`): se guarda solo en ese navegador. Si el
  navegador no permite guardar, el juego lo indica y el progreso se pierde al cerrar.

## Salas y bots

- **Partida rápida:** entra en una sala pública en espera (o crea una). Con 2 o más
  personas empieza una cuenta atrás de 15 s; el anfitrión puede empezar antes.
- **Sala privada:** genera un código de 4 letras y un enlace (`?room=CODE`).
- **Entrenar con bots:** crea una sala privada con 5 bots. Los bots solo aparecen si el
  anfitrión los añade, se muestran con 🤖 y la etiqueta BOT, y nunca se usan para
  simular jugadores reales. Quien entra con la partida empezada mira y juega la
  siguiente. Máximo 12 participantes por sala.

## Pruebas

```bash
npm run typecheck
npm test
```

`npm test` comprueba la física (apariciones con suelo, trampolín de la carrera, frenado al
llevar núcleos), la tienda (compra válida, rechazo por nivel, aspectos bloqueados),
simula torneos completos de 2, 4, 8 y 12 participantes a través del registro de salas
(5 rondas, al menos 2 clasificados por ronda, motivo de cada puesto, campeón, recompensa
guardada en el perfil) y arranca el servidor real con dos clientes WebSocket para comprobar
la sala, la sincronización de posiciones, el envío del perfil y el rechazo de acciones no
autorizadas.

## Estructura

```
shared/      constantes, mapas (geometría determinista), física y protocolo
server/      servidor HTTP + WebSocket (index.ts), registro de salas (hub.ts, también usado
             por el modo sin conexión), salas autoritativas y bots
client/      index.html y src/: menú, escenario 3D, personaje, HUD, sonido, red
tests/       pruebas sin navegador
```

## Pendiente / limitaciones conocidas

- Los controles táctiles solo se han probado en un móvil emulado (Chromium), no en dispositivos reales.
- El servidor no compensa la latencia en los golpes (usa las posiciones actuales);
  con mucha latencia los golpes pueden sentirse algo tardíos.
- Las salas viven en memoria de un único proceso (no hay escalado horizontal ni
  cuentas de usuario).
- Los bots son sencillos: en la carrera siguen una ruta, esperan a las plataformas y saltan barras, pero muchos caen; en la ronda de energía recogen, entregan y roban. Sirven para entrenar, no son rivales expertos.
- El progreso no tiene cuentas: depende del identificador guardado en el navegador.
