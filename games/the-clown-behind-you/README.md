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
| Mirar atrás sin dejar de correr | Mantener Q o clic derecho | Mantener ATRÁS |
| Linterna (encender/apagar) | F | LUZ |
| Esconderse / salir del escondite | E (junto a un armario) | USAR |
| Contener la respiración (escondido) | Mantener ESPACIO | Mantener AGUANTAR |
| Pausa y liberar el cursor | ESC | Botón II |
| Silenciar | M | Opciones |

En algunos navegadores CTRL+W cierra la pestaña. Si te agachas mientras avanzas,
usa **C**.

Si Pointer Lock no está disponible, puedes mirar arrastrando con el botón del ratón
pulsado.

## Qué hay en el juego

**Objetivo**: en cada fase hay 3 recuerdos repartidos lejos de la entrada, de la
salida y entre sí: cintas de vídeo, juguetes, llaves de hotel y fotografías. La
puerta de salida está tapiada hasta que los reúnes todos. Arriba a la izquierda
ves cuántos llevas. El recuerdo más cercano suena como una campanilla y, al
reunirlos, la salida empieza a cantar una nana. Recoger un recuerdo hace ruido, y
eso atrae antes al payaso.

**Historia**: cada recuerdo muestra un fragmento de la historia, y hay dibujos
infantiles con ceras en las paredes que cambian cuando no los miras. Juntas, las
piezas explican quién eres y por qué nunca despertaste.

**Linterna**: tiene pilas limitadas (unos 75 s de luz con la carga completa) y en
cada fase hay pilas de recambio. Si iluminas al payaso de frente, se tapa la cara
y queda cegado unos segundos, pero las pilas se gastan tres veces más rápido y,
después, vuelve a perseguirte con más fuerza. Tener la luz encendida también hace
que reaparezca antes. La carga de las pilas se ve abajo a la izquierda.

**Escondites**: en cada fase hay taquillas, casitas de juguete o armarios. Dentro
miras entre las rendijas.
- Si el payaso te ve entrar, viene directo a sacarte.
- Si no te ve, te pierde la pista y empieza a buscarte: merodea y abre
  escondites cercanos.
- Cuando se detiene a olfatear delante del tuyo, tienes que contener la
  respiración (con la misma resistencia de correr) hasta que se vaya. Si respiras
  o te quedas sin aliento, te encuentra.
- Esconderte mucho tiempo o repetir escondite hace que sospeche más.

**Sustos que cambian en cada partida**: en cada fase se eligen al azar 4 de estos
8, en momentos distintos:
- imita la nana de la salida desde el lugar equivocado;
- apagón de luces con un susurro a tu espalda;
- se asoma un instante al fondo del pasillo;
- aparece al otro lado de un hueco justo cuando te agachas;
- una pelota o una cabeza de muñeca rueda hacia ti;
- un mensaje aparece escrito en la pared a tu espalda;
- un teléfono suena en una habitación lejana;
- pasos que corren detrás de ti.

**Dificultad y récords**: se elige en el menú.

| Dificultad | Payaso | Pilas por fase | Escondites | Ayudas |
| --- | --- | --- | --- | --- |
| Sueño ligero | más lento | 3 | 5 | campanilla, nana y tutorial |
| Pesadilla | normal | 2 | 4 | campanilla, nana y tutorial |
| Terror nocturno | más rápido | 1 | 3 | ninguna; además te busca mejor y aguantas menos la respiración |

El cronómetro de la cinta mide cada fase. El menú RÉCORDS guarda en el navegador
el mejor tiempo de cada fase, de la partida completa y la partida con menos
muertes, por dificultad. Al terminar una fase se ve tu tiempo frente al récord.

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

**El payaso** se construye por código. Tiene el cuerpo consumido y encorvado, con la
columna marcada, y brazos que le llegan a las rodillas, rematados en garras con
uñas negras. La piel está agrietada y con venas, con lágrimas negras bajo los ojos.
Una de sus cuencas está vacía, con un punto de luz; el otro ojo, inyectado en
sangre, mira hacia otro lado. La boca le llega de oreja a oreja, con cortes en
las mejillas y dientes afilados, y la mandíbula se le desencaja cuando se acerca.
Lleva el traje sucio y manchado de sangre, el pelo apelmazado y un gorro aplastado.
Tiene tics bruscos, la cabeza le gira casi media vuelta y, cuando te persigue,
estira las garras hacia ti. Su IA es una máquina de estados sobre la
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
- **Captura**: si te alcanza, te mata. Se abalanza a tu cara con la mandíbula
  desencajada y te golpea con las garras: la pantalla tiembla y se salpica de
  sangre. Caes al suelo y lo ves inclinado sobre ti, riendo, hasta que todo se
  funde a negro y aparece «TE ENCONTRÓ».

Para pasar los obstáculos, el payaso se contorsiona: se aplasta bajo los huecos bajos
(allí avanza más lento) y salta las vallas. No atraviesa muros ni muebles.

**Piano de fondo**: una nana en re menor, desafinada y con notas equivocadas,
generada en tiempo real con reverberación. Cuanto más cerca está el payaso, más
rápido se toca, hasta convertirse en arpegios frenéticos con golpes en los
graves. Se detiene de golpe cuando te atrapa. Su volumen se ajusta en
Opciones → PIANO.

**Sonido** (Web Audio, todo sintetizado): risa desquiciada que se acelera y se
superpone, con una voz infantil y otra grave, cuando el payaso está cerca;
zumbido fluorescente, viento, dron de
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

**Gráficos y físicas**: tonemapping fílmico, relieve en paredes y suelos, conos
de luz en la niebla bajo los fluorescentes, motas de polvo flotando y sombra de
contacto bajo el payaso. Hay objetos sueltos que se empujan, ruedan, rebotan y
chocan entre sí (cajas, pelotas, maletas y cabezas de muñeca), y el payaso los
patea al pasar. El salto tiene búfer y margen al borde, la cámara se hunde al
aterrizar y los escalones suben con suavidad.

**Rendimiento**: los muros y las luminarias usan geometría instanciada y solo se
dibujan las caras expuestas. Las luces dinámicas son un grupo fijo que se reasigna a
las luminarias más cercanas, y solo un foco proyecta sombras. Las colisiones usan una
rejilla espacial. Con la calidad **BAJA** desaparecen las sombras y baja la
resolución interna; es la calidad por defecto en móviles.
