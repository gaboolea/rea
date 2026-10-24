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
volando. El bloqueo reduce el empuje si miras hacia el atacante (el martillo lo
atraviesa en parte). Las armas caen del cielo con un haz de luz y una marca en el
suelo, y se rompen tras unos cuantos usos.

| Arma | Estilo |
| --- | --- |
| Puños | Rápidos, poco empuje |
| Espada | Tajo rápido de alcance medio (10 usos) |
| Martillo | Lento, enorme empuje e interrumpe ataques (6 usos) |
| Mazo Sísmico (especial) | Onda expansiva en círculo (3 usos, rondas 3–5) |

**Rondas.**

1. **Arena de Entrenamiento** — isla circular, plataformas móviles, trampolines, islas
   laterales con premio. 3 vidas.
2. **El Puente Roto** — recorrido con puentes estrechos, plataformas que desaparecen,
   barras giratorias y plataformas móviles. 2 vidas con puntos de control. Llegar a la
   meta te clasifica.
3. **La Arena Giratoria** — dos barras giratorias (una baja que hay que saltar y otra a
   media altura) y sectores del suelo que parpadean en rojo y caen. 2 vidas.
4. **Supervivencia Extrema** — dos capas de baldosas sobre lava: se derrumban al
   pisarlas, el borde se va desmoronando y hay empujadores móviles. 1 vida.
5. **La Gran Final** — ring que se encoge, plataformas doradas, barra giratoria y armas
   especiales frecuentes. 1 vida.

**Reglas de la partida.**

- Todos empiezan juntos en la zona de salida. Cada ronda tiene un tiempo límite.
- Caer al vacío (o a la lava) quita una vida; sin vidas quedas eliminado de la partida
  y pasas a espectador (clic para cambiar de jugador seguido).
- Al acabar una ronda, los supervivientes pasan a la siguiente. La ronda termina al
  acabarse el tiempo (todos los que siguen en pie avanzan), cuando todos los vivos han
  llegado a la meta (ronda 2) o al alcanzar el **cupo de eliminados**.
- **Cupo de eliminados (rondas 1–4):** cada ronda puede eliminar como máximo una
  fracción de los jugadores que superan los 2, para que siempre lleguen al menos 2 a la
  final. Si el cupo es 0 (por ejemplo, partidas de 2–3 jugadores), quien pierda su
  última vida termina la ronda pero se salva.
- **Gran Final:** gana el último en pie. Si se acaba el tiempo, gana el superviviente
  con menos daño recibido (desempate: más KO).
- Si en algún momento caen todos a la vez, se salvan los últimos en caer: la partida
  nunca se queda bloqueada.
- Al final aparece la pantalla de victoria; la sala vuelve sola a la sala de espera
  para jugar otra vez, o puedes volver al menú.

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

`npm test` comprueba que todas las apariciones tienen suelo y que el salto funciona,
simula partidas completas en el servidor con 2, 4, 8 y 12 participantes (verificando
que se juegan las 5 rondas y siempre hay campeón) y arranca el servidor real con dos
clientes WebSocket para comprobar la sala, la sincronización de posiciones y el rechazo
de acciones no autorizadas.

## Estructura

```
shared/      constantes, mapas (geometría determinista), física y protocolo
server/      servidor HTTP + WebSocket, salas autoritativas y bots
client/      index.html y src/: menú, escenario 3D, personaje, HUD, sonido, red
tests/       pruebas sin navegador
```

## Pendiente / limitaciones conocidas

- Sin controles táctiles: por ahora se juega con teclado y ratón.
- El servidor no compensa la latencia en los golpes (usa las posiciones actuales);
  con mucha latencia los golpes pueden sentirse algo tardíos.
- Las salas viven en memoria de un único proceso (no hay escalado horizontal ni
  cuentas de usuario).
- Los bots son sencillos (persiguen, recogen armas, evitan bordes y saltan barras).
