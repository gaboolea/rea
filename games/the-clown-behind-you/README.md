# THE CLOWN BEHIND YOU

Juego de terror psicológico en primera persona para el navegador. Despiertas en un
recuerdo de la infancia que nunca existió y un payaso deforme te persigue. No hay
armas: solo puedes correr, orientarte y escapar.

Todo el juego está en un único archivo, `index.html`: HTML, CSS, JavaScript,
Three.js r128 y Web Audio API. La geometría, las texturas, el payaso y los sonidos se
generan por código. El juego no usa modelos, imágenes ni audios externos.

## Cómo ejecutarlo

Necesitas un navegador moderno de escritorio o móvil con WebGL (Chrome, Edge, Firefox
o Safari).

1. Abre `index.html` con doble clic. Así funciona tal cual.
2. Si el navegador bloquea algo al abrir el archivo directamente, sírvelo en local:

   ```sh
   cd games/the-clown-behind-you
   python3 -m http.server 8000
   # abre http://localhost:8000
   ```

Three.js se carga desde cdnjs. Para jugar **sin conexión**, deja una copia de
`three.min.js` (versión r128) en `vendor/three.min.js`; el juego la carga
automáticamente si el CDN no responde:

```sh
mkdir -p vendor && cd vendor
npm pack three@0.128.0 && tar xzf three-0.128.0.tgz package/build/three.min.js
mv package/build/three.min.js . && rm -rf package three-0.128.0.tgz
```

Si no hay conexión ni copia local, el menú muestra un aviso en lugar de fallar en
silencio. Las fuentes de Google son opcionales y tienen alternativas del sistema.

## Controles

| Acción | PC | Móvil |
| --- | --- | --- |
| Moverse | W A S D o flechas | Joystick izquierdo |
| Mirar | Ratón (Pointer Lock; clic en la escena para capturarlo) | Arrastrar en la mitad derecha |
| Correr (resistencia limitada) | SHIFT | Mantener CORRER |
| Saltar | ESPACIO | SALTAR |
| Agacharse | CTRL o C | AGACHAR (alterna) |
| Pausa y liberar el cursor | ESC | Botón II |
| Silenciar | M | Opciones |

En algunos navegadores CTRL+W cierra la pestaña. Si te agachas mientras avanzas,
usa **C**.

Si Pointer Lock no está disponible, puedes mirar arrastrando con el botón del ratón
pulsado.

## Qué hay en el juego

**Fases** (los mapas se generan a partir de una semilla nueva en cada partida):

1. **El pasillo imposible**: Backrooms de alfombra húmeda y fluorescentes que
   zumban. Despiertas mirando un pasillo largo; al fondo, el payaso espera inmóvil y
   detrás de ti se oyen pasos. Incluye el tutorial integrado (moverse, correr,
   saltar, agacharse y seguir la canción de la salida).
2. **El parque infantil**: parque interior con cielo artificial turquesa, toboganes,
   piscinas de bolas, columpios que se mueven solos, bloques gigantes, caballitos de
   muelle y túneles por los que hay que pasar agachado.
3. **El hotel de los sueños**: cuadrícula de pasillos rectos interminables, luces
   rosas, alfombra de hexágonos y puertas numeradas. Hay tres puertas iluminadas:
   las que tienen número te devuelven a otro punto del hotel. La salida correcta es
   la puerta sin número.
4. **La pesadilla**: muros inclinados y flotantes sobre un vacío oscuro, sillas que
   flotan, ojos que parpadean en el horizonte, una luna que sonríe y un horizonte
   que se balancea. El payaso es más rápido.
5. **Final**: la puerta blanca te devuelve al primer pasillo. El payaso te espera y
   aparece «NUNCA DESPERTASTE».

**El payaso** se construye por código: cuerpo y extremidades demasiado largos, traje
desteñido, gorguera, sonrisa enorme con dientes, ojos asimétricos (uno desviado),
pelo de colores y un gorro torcido. Su IA es una máquina de estados sobre la
cuadrícula del nivel:

- **Observar**: se queda quieto mirándote, con la cabeza girando más de lo humanamente
  posible. Si te acercas, ataca.
- **Acechar**: avanza despacio hacia ti.
- **Perseguir**: busca el camino con BFS sobre la cuadrícula, suaviza la ruta
  comprobando la holgura a ambos lados y choca con muros y mobiliario. Si se queda
  atascado, vuelve al centro de su celda.
- **Congelarse**: a veces se detiene en seco, te mira y luego arranca con un
  acelerón.
- **Desaparecer**: solo si llevas un rato sin verlo y está lejos (con un tiempo de
  espera de 26 s). Reaparece más adelante en tu camino hacia la salida, en una celda
  que no estás viendo.
- **Presión**: si pasas más de 22 s sin acercarte a la salida, se vuelve más rápido
  y ríe más a menudo.
- **Captura**: un susto breve (cara a centímetros, chillido y destello rojo) y
  después la pantalla «TE ENCONTRÓ» con el botón para reintentar la fase.

Para pasar los obstáculos, el payaso se contorsiona: se aplasta bajo los huecos bajos
(allí avanza más lento) y salta las vallas. No atraviesa muros ni muebles.

**Sonido** (Web Audio, todo sintetizado): zumbido fluorescente, viento, dron de
tensión que sube al acercarse el payaso, latidos, y respiración, pasos y risas
infantiles distorsionadas con sonido posicional HRTF. Además hay silencios
repentinos tras los que a veces suenan pasos a tu espalda, risas en habitaciones
silenciosas, golpes en puertas diminutas y una canción de cuna que suena desde la
salida y sirve de guía. Úsalo con auriculares.

**Terror visual**: las luces parpadean cuando el payaso está cerca. Hay viñeta,
grano, interferencias, desenfoque breve al verlo, desaturación cuando estás
agotado, pulsos de perspectiva y cambios de color de la niebla. Los textos de las
paredes, las ventanas a paisajes imposibles, los cuadros y las sombras cambian
cuando dejas de mirarlos. Las figuras inmóviles desaparecen cuando te acercas.

**Rendimiento**: los muros y las luminarias usan geometría instanciada y solo se
dibujan las caras expuestas. Las luces dinámicas son un grupo fijo que se reasigna a
las luminarias más cercanas, y solo un foco proyecta sombras. Las colisiones usan una
rejilla espacial. Con la calidad **BAJA** desaparecen las sombras y baja la
resolución interna; es la calidad por defecto en móviles.
