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

| Acción              | Ordenador               | Móvil                           |
| ------------------- | ----------------------- | ------------------------------- |
| Moverse             | WASD / flechas          | Joystick virtual                |
| Correr              | Shift                   | Botón 🏃 (alterna)              |
| Saltar              | Espacio                 | Botón ⤒                         |
| Interactuar         | E                       | Botón ✋ (se ilumina si puedes) |
| Girar cámara / zoom | Arrastrar ratón / rueda | Arrastrar en la pantalla        |
| Gestión / mapa      | G / M                   | Botones de arriba a la derecha  |
| Scooter             | V                       | Botón 🛴                        |
| Menú                | Esc                     | Botón ☰                        |

### Bucle de juego

1. Ve al **Mayorista** (cruzando la calle), haz un pedido en el mostrador
   **PEDIDOS** y recoge las cajas en **RECOGIDA**.
2. Llévalas a **Mi Tiendita** y repón las estanterías (o déjalas en el
   **ALMACÉN** para tus reponedores).
3. Los clientes entran desde la calle, buscan productos, hacen fila y pagan
   en la caja. Cóbrales tú o contrata cajeros. Si esperan demasiado, o no
   encuentran lo que buscan, se van y baja tu reputación.
4. Ajusta precios en **Gestión** (más margen = menos clientes dispuestos),
   compra mejoras con efecto real y contrata personal.
5. Cada día dura 5 minutos; al final se pagan alquiler, salarios, luz y
   vehículos y aparece el informe de resultados.

Etapas: Principiante → Comerciante ($400 en ventas) → Empresario ($1.500) →
Magnate ($8.000). Cada etapa desbloquea productos, mejoras, personal,
locales y bienes.

## Qué incluye

- Ciudad recorrible: tienda, mayorista, cafetería, boutique, minimercado,
  supermercado, casa, villa, concesionario, parque, restaurante (en obras,
  marcado como no visitable), calles con tráfico que frena ante peatones.
- Personaje de juguete con animaciones procedurales (reposo, caminar, correr,
  saltar, cargar cajas, reponer, cobrar, celebrar), colisiones, gravedad y
  aceras con bordillo.
- Cámara en tercera persona que sigue al jugador; las paredes y techos que
  tapan la vista se vuelven translúcidos y el techo se oculta al entrar.
- Clientes y empleados con rutas A\* sobre una rejilla de navegación.
- Inventario real: almacén, estanterías y refrigeradores con productos
  visibles (uno por unidad), máquina de café que convierte granos en cafés.
- Economía: costes, precios por producto, demanda según precio y reputación,
  ingresos, ganancia bruta, gastos diarios y patrimonio.
- Mejoras: estanterías, refrigerador, segunda caja, ampliación (derriba la
  pared trasera), plantas, letrero luminoso, suelo nuevo, vitrina.
- Bienes: carretilla (3 cajas), scooter, furgoneta (entrega directa al
  almacén), Villa Bonita, ropa y accesorios.
- 20 misiones encadenadas con recompensas moderadas.
- Guardado automático en `localStorage` (cada 30 s y tras acciones clave);
  también al descansar en la cama o desde el menú.

## Código

| Archivo            | Responsabilidad                                                  |
| ------------------ | ---------------------------------------------------------------- |
| `src/config.js`    | Datos ajustables: productos, etapas, mejoras, personal, bienes   |
| `src/main.js`      | Arranque, bucle, economía, día/noche, guardado                   |
| `src/world.js`     | Ciudad, decoración, interiores fijos                             |
| `src/building.js`  | Edificio genérico: paredes, puertas automáticas, techo, letreros |
| `src/business.js`  | Negocios: mobiliario, existencias, cajas, clientes y empleados   |
| `src/npc.js`       | Agentes con navegación; máquinas de estado de clientes/empleados |
| `src/player.js`    | Movimiento del jugador y cámara                                  |
| `src/physics.js`   | Colisiones, altura del suelo, rejilla A\*                        |
| `src/character.js` | Personajes de juguete y animación                                |
| `src/props.js`     | Muebles y expositores con productos instanciados                 |
| `src/ui.js`        | HUD y paneles                                                    |
| `src/missions.js`  | Misiones                                                         |

## Pendiente

- El restaurante está construido pero cerrado («en obras»).
- El equilibrio económico de la etapa Magnate hasta el millón está poco
  probado; los valores están en `src/config.js`.
- Sin sonido.
