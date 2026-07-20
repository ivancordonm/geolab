# Modo estudio de poliedros 3D — Tetraedro (patrón reutilizable)

**Fecha:** 2026-07-20
**Estado:** Diseño aprobado, pendiente de plan de implementación

## Resumen

Al pulsar el tetraedro en el menú de poliedros de la barra de construcción, la app
entra en un **modo de estudio 3D a pantalla completa**: un visor interactivo
(rotar / acercar / alejar) del tetraedro regular, con un menú superpuesto en el
propio canvas para estudiar los elementos de su grupo de simetría (Td, orden 24):
rotaciones ±120°, medias vueltas 180°, reflexiones y rotoreflexiones S4. El menú
permite mostrar/ocultar cada clase de simetría, animar cada transformación
concreta (demostrando la invariancia de la figura), y ajustar la opacidad y el
color del poliedro.

El tetraedro es el **primer poliedro** de un patrón dirigido por datos: añadir el
resto (cubo, octaedro, dodecaedro, icosaedro) será una edición **solo de datos**,
sin tocar componentes ni lógica de render.

## Decisiones de fondo (confirmadas)

| Decisión | Elección |
|----------|----------|
| Tecnología de render 3D | **three.js** (WebGL) |
| Integración en React | **react-three-fiber + @react-three/drei** |
| Qué muestra una simetría | **Elementos geométricos (ejes/planos) + animación al pulsar** |
| Relación con el 2D | **Modo pantalla completa; el dibujo 2D se descarta** |
| Persistencia del estado 3D | **Efímero** (no se guarda en localStorage ni en la nube) |
| Alcance inicial | **Solo el tetraedro**; el resto quedan como placeholders |

## Principio arquitectónico y epistémico

El 3D es un **dominio nuevo del lado cliente**. **No** forma parte del
`GeometryDocument` 2D ni de su contrato dual-runtime (TS/Python), y **no toca el
backend**. La matemática de simetría (matrices, permutaciones de vértices) es
**pura y determinista** y vive en el frontend, coherente con el principio
"deterministic tools calculate": la geometría de estudio se deriva de la
definición del poliedro, no se dibuja a mano.

## 1. El patrón: `PolyhedronDefinition` (dirigido por datos)

La pieza central reutilizable. Cada poliedro se describe con datos; la lógica de
render y de simetría es genérica.

```ts
type Vec3 = readonly [number, number, number];

interface SymmetryElementAxis {
  kind: "axis";           // rotación propia (det +1)
  point: Vec3;            // punto por el que pasa el eje (origen para poliedro centrado)
  direction: Vec3;       // dirección del eje (unitaria)
  angle: number;         // radianes (p. ej. ±2π/3, π)
  label: string;
}

interface SymmetryElementPlane {
  kind: "plane";          // reflexión (det −1)
  point: Vec3;
  normal: Vec3;          // normal unitaria del plano
  label: string;
}

interface SymmetryElementImproper {
  kind: "improper";       // rotoreflexión S_n (det −1): rota θ y refleja en plano ⟂ al eje
  point: Vec3;
  direction: Vec3;
  angle: number;
  label: string;
}

type SymmetryElement =
  | SymmetryElementAxis
  | SymmetryElementPlane
  | SymmetryElementImproper;

type SymmetryClass =
  | "rotations3"       // ejes vértice–cara, ±120°
  | "halfTurns"        // ejes punto-medio de arista, 180°
  | "reflections"      // planos de reflexión
  | "rotoreflections"; // ejes S4

interface PolyhedronDefinition {
  id: string;                 // "tetrahedron", "cube", ...
  name: string;               // "Tetraedro"
  vertices: Vec3[];           // centrados en el origen, normalizados
  faces: number[][];          // bucles de índices de vértice (orientación CCW hacia afuera)
  edges: readonly [number, number][];
  symmetry: Record<SymmetryClass, SymmetryElement[]>;
  defaultColor: string;       // color inicial del sólido
}
```

**Generación de la matriz 3×3** de cada elemento (helper genérico):
- `axis` → matriz de rotación de Rodrigues (`direction`, `angle`), det +1.
- `plane` → matriz de Householder `I − 2·n·nᵀ`, det −1.
- `improper` → rotación de Rodrigues compuesta con reflexión en el plano ⟂ al
  eje (`R·(I − 2·d·dᵀ)`), det −1.

### Definición del tetraedro (Td, orden 24)

Vértices en alternancia del cubo, centrados en el origen:
`(1,1,1), (1,−1,−1), (−1,1,−1), (−1,−1,1)` (se normalizarán a radio 1).

Los 24 elementos del grupo, clasificados:
- **identidad** (1) — implícita, no se lista como elemento seleccionable.
- **rotations3** (8): 4 ejes vértice↔centro-de-cara opuesta, ±120° cada uno.
- **halfTurns** (3): 3 ejes que unen puntos medios de aristas opuestas, 180°.
- **reflections** (6): 6 planos, cada uno contiene una arista y el punto medio de
  la opuesta.
- **rotoreflections** (6): 3 ejes S4 (coinciden con los ejes de las medias vueltas),
  S4 y S4³ en cada uno.

Total: 1 + 8 + 3 + 6 + 6 = 24 = |Td|.

## 2. Componentes React (react-three-fiber + drei)

- **`PolyhedronStudio`** — contenedor del modo a pantalla completa. Estado de
  estudio: `definition`, `opacity`, `color`, `visibleClasses: Set<SymmetryClass>`,
  `activeAnimation: { element, progress } | null`. Renderiza el `<Canvas>` de
  r3f y la UI superpuesta (`SymmetryMenu` + botón "Salir a 2D").
- **`PolyhedronMesh`** — caras (material con `opacity`/`color`, `transparent`,
  `side: DoubleSide`), aristas (líneas) y vértices (puntos). Aplica la
  transformación de animación activa (ver §3).
- **`SymmetryOverlay`** — dibuja, para las clases visibles, los ejes (líneas que
  atraviesan la figura) y los planos (polígonos semitransparentes). Cada elemento
  es clicable y dispara su animación.
- **`SymmetryMenu`** — menú flotante dentro del canvas, con el mismo lenguaje
  visual que `GridMenu` / `CaptureMenu`. Contiene:
  - un toggle por cada clase de simetría (rotaciones ±120°, medias vueltas,
    reflexiones, rotoreflexiones),
  - slider de **opacidad** (0–100 %),
  - selector de **color**,
  - botón **"Restablecer vista"** (resetea la cámara de OrbitControls).
- **`OrbitControls`** de drei → rotar / acercar / alejar con ratón y táctil.
- Luces: una `ambientLight` + una `directionalLight` para dar volumen.

**Carga diferida:** el módulo 3D completo (incluidas las deps three.js) se importa
con `React.lazy` / `Suspense`, de modo que three.js **solo entra en el bundle al
entrar en modo 3D**. La app 2D arranca ligera.

## 3. Semántica de la animación de simetrías

Al activar una clase aparecen sus elementos geométricos. Al **pulsar un elemento
concreto**, el tetraedro ejecuta su transformación de forma animada y **vuelve al
estado inicial**, demostrando que la figura queda invariante. Regla según el
determinante de la matriz `M` del elemento:

- **Rotaciones propias** (`rotations3`, `halfTurns`; det +1): rotación **real**
  animada alrededor del eje, ángulo `0 → θ → 0` (interpolación angular, arco real).
- **Reflexiones y rotoreflexiones** (det −1): un espejo no es un movimiento rígido
  continuo, así que se anima **interpolando linealmente cada vértice** desde su
  posición `v` hasta su imagen `M·v` (`t: 0 → 1 → 0`). La figura se "dobla" a
  mitad de camino pero termina coincidiendo consigo misma, mostrando el
  emparejamiento de vértices.

La animación se conduce con `useFrame` de r3f sobre un `progress` temporal
(ida-vuelta con easing). Solo puede haber una animación activa a la vez; pulsar
otro elemento la reinicia.

## 4. Entrada y salida del modo 3D

- `App` gana estado `mode: "2d" | "3d"` y `activePolyhedron: PolyhedronDefinition | null`.
- Los cinco tools de poliedro de la barra (`tetrahedron`, `cube`, …) se
  **interceptan** en `App`: en vez de llamar a `constructionTools.activateTool`,
  se abre un **diálogo de confirmación**: *"Se borrará el dibujo actual y se
  abrirá el visor 3D. ¿Continuar?"*.
- Al **aceptar** (solo para poliedros con definición disponible): el documento 2D
  se reemplaza por uno **vacío**, `mode = "3d"`, `activePolyhedron = <def>`. El
  visor ocupa el canvas; la barra de construcción 2D y demás UI 2D se ocultan.
- Un botón **"Salir a 2D"** dentro del modo 3D devuelve a `mode = "2d"` mostrando
  el canvas 2D (vacío). El estado 3D **no se conserva** entre entradas.
- Poliedros aún sin definición (`cube`, `octahedron`, `dodecahedron`,
  `icosahedron`): mantienen su comportamiento de placeholder ("próximamente"); no
  entran en modo 3D todavía. Añadir su `PolyhedronDefinition` los activa
  automáticamente (patrón solo-datos).

## 5. Dependencias, testing y límites

### Dependencias nuevas (frontend)
`three`, `@react-three/fiber`, `@react-three/drei`, `@types/three` (dev).

### Testing
- **Matemática de simetría** (unitario, sin WebGL): dada la definición del
  tetraedro, verificar que
  - cada matriz de simetría **permuta el conjunto de vértices** sobre sí mismo
    (dentro de tolerancia `1e-9`),
  - el grupo generado tiene exactamente **24 elementos**,
  - los signos de determinante son correctos por clase (+1 para rotaciones, −1
    para reflexiones y rotoreflexiones).
- **UI del menú** (React / jsdom): toggles de clase, slider de opacidad, selector
  de color y botón "Salir a 2D" como componentes React normales (sin WebGL).
- **Interceptación de entrada** en `App`: pulsar el tetraedro abre el diálogo;
  aceptar cambia a modo 3D y vacía el documento.
- La escena WebGL (`<Canvas>` y mallas) es **pegamento fino**; no se testea en
  jsdom.

### Límites explícitos (fuera de alcance ahora)
- Sin cambios en el backend ni en el contrato dual-runtime 2D.
- Sin persistencia del estado 3D.
- Sin composición de transformaciones (cada animación es un único elemento que va
  y vuelve).
- Solo el tetraedro tiene definición; el resto de poliedros son trabajo posterior
  (solo-datos gracias a este patrón).

## Archivos afectados (previsión)

| Archivo | Cambio |
|---------|--------|
| `frontend/package.json` | Añadir deps three.js / r3f / drei |
| `frontend/src/geometry/polyhedra/types.ts` | Tipos `PolyhedronDefinition`, `SymmetryElement`, helpers de matriz (nuevo) |
| `frontend/src/geometry/polyhedra/tetrahedron.ts` | Definición del tetraedro (nuevo) |
| `frontend/src/geometry/polyhedra/*.test.ts` | Tests de simetría (nuevo) |
| `frontend/src/components/polyhedra/PolyhedronStudio.tsx` | Contenedor modo 3D (nuevo) |
| `frontend/src/components/polyhedra/PolyhedronMesh.tsx` | Malla del sólido (nuevo) |
| `frontend/src/components/polyhedra/SymmetryOverlay.tsx` | Ejes y planos (nuevo) |
| `frontend/src/components/polyhedra/SymmetryMenu.tsx` | Menú de estudio (nuevo) |
| `frontend/src/App.tsx` | Estado `mode`, interceptación de tools de poliedro, diálogo, render condicional |
| `frontend/src/geometry/constructionTools.ts` | Mapa `polyhedron tool → PolyhedronDefinition` (o "próximamente") |
