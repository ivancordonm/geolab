# Generalizar la homotecia "point ratio" a objetos no-punto

Fecha: 2026-07-14
Rama sugerida: `fix/homothety-point-ratio-objects`

## Contexto y objetivo

GeoLab tiene **dos** construcciones de homotecia:

1. `Homothety(centro, objeto, ratioNumérico)` — ratio escalar. Ya está
   generalizada a `point | line | segment | circle | polygon` en ambos
   runtimes (introducido en el commit `f4b4946`).
2. `Homothety(centro, punto, puntoQueDefineRatio)` — "point ratio": el ratio
   `k` se deriva de las distancias de dos puntos al centro en lugar de
   escribirse como número. Esta variante está codificada de punta a punta
   (schema, parser, validador, evaluador, UI, en frontend y backend) para
   aceptar **únicamente puntos** como objeto a transformar.

El objetivo de este trabajo es generalizar la variante (2) para que acepte
también `line`, `segment`, `circle` y `polygon`, igual que ya hace la
variante (1).

## Decisión de diseño confirmada con el usuario

Hoy el cálculo es `k = dist(centro, ratioPoint) / dist(centro, punto)`,
donde `punto` cumple doble función: es el objeto que se transforma y la
referencia para calcular `k`. Un objeto no-punto no tiene una única
"distancia al centro", así que generalizar exige elegir un punto
representativo por tipo.

**Se elige mantener la interacción actual de 3 pasos** (centro, objeto,
puntoRatio), sin arity nueva ni pasos adicionales en la UI. El punto
representativo usado para calcular `k` es:

| kind      | punto representativo                                   |
|-----------|----------------------------------------------------------|
| `point`   | el propio punto (sin cambios, compatibilidad total)      |
| `circle`  | el centro del círculo                                    |
| `segment` | el punto medio                                           |
| `line`    | el pie de la perpendicular desde el centro                |
| `polygon` | el centroide (media aritmética de los vértices)           |

Se descartó la alternativa de 4 clics (objeto y punto-de-referencia como
argumentos separados, matemáticamente inequívoca) por requerir arity
variable en la UI y un paso extra de interacción, para una generalización
que en la práctica se ajusta arrastrando `ratioPoint` hasta que el
resultado se ve bien.

Una vez calculado `k`, se aplica con la función genérica **ya existente**
`_scale_value` (Python, `backend/app/geometry/engine.py:955-981`) /
`scaleValue` (TS) — la misma que usa `homothety_scalar` — para reconstruir
el objeto transformado. No se duplica lógica de reconstrucción.

## Fuera de alcance

- La herramienta de agente/MCP `create_homothety`
  (`backend/app/agent/tools.py:981-996`) solo expone la variante **escalar**,
  y además fuerza `point` como kind del objeto incluso en esa variante
  (`_resolve_kind(access, input_model.point, "point")`, línea 986) — es una
  limitación preexistente separada, no relacionada con este trabajo. No se
  toca.
- No existe ninguna herramienta de agente para la variante point-ratio; no
  se añade en este trabajo.
- El ratio derivado de `k = dist/dist` es siempre no-negativo (a diferencia
  de la variante escalar, que admite ratios negativos). Ese comportamiento
  ya existe hoy para puntos y no cambia.

## Cambios por capa

### 1. Esquema (ambos runtimes)

- Backend (`backend/app/geometry/models.py`):
  - `HomothetyPointDefinition` (línea 198-202): renombrar el campo `point`
    a `object_id`, con
    `validation_alias=AliasChoices("object", "point")` y
    `serialization_alias="object"` — el mismo patrón que ya usan
    `HomothetyScalarDefinition` (línea 188-195) y
    `ReflectionOverPointDefinition` (línea 180-185). Esto da compatibilidad
    automática con documentos guardados que usan el campo `point`.
  - `HomothetyPoint` (línea 344-346): `kind` pasa de `Literal["point"] =
    "point"` a `Literal["point", "line", "segment", "circle", "polygon"]`
    (igual que `HomothetyScalar`, línea 339-341), sin default fijo.

- Frontend (`frontend/src/types/geometry.ts`):
  - `HomothetyPoint` (línea 139-142) deja de ser una interfaz fija con
    `kind: "point"` y pasa a ser genérica por `ReflectableKind`, siguiendo
    el mismo patrón que `HomothetyScalarForKind`/`HomothetyScalar` (línea
    127-137): tipo unión con `object`/`point` como alias de lectura, y
    `object` como forma canónica de escritura.

### 2. Parser (`backend/app/geometry/script.py:584-586`)

En la rama no-numérica de `Homothety(...)` (cuando el tercer argumento no
es un literal numérico):

- Sustituir `_resolve_point_argument(arguments[1], ...)` por
  `_resolve_reference(arguments[1], ...)` seguido de una comprobación de
  que `kind` esté en `{point, line, segment, circle, polygon}`, con el
  mismo mensaje de error que ya usan `Reflection` y la rama escalar de
  `Homothety` ("Argument 2 of Homothety must reference a transformable
  object, but '...' is a ...").
- El objeto resultante (`HomothetyPoint(...)`) hereda `kind=src.kind` en
  lugar de dejarlo implícito a `"point"`.
- El tercer argumento (`ratio_pt`) sigue exigiendo `kind == "point"` sin
  cambios.

El parser TypeScript equivalente recibe el mismo cambio.

### 3. Validador de grafo (`backend/app/geometry/engine.py:293-296`)

Reemplazar el bloque actual:

```python
elif isinstance(definition, HomothetyPointDefinition):
    require_kind(definition.center, "point")
    require_kind(definition.point, "point")
    require_kind(definition.ratio_point, "point")
```

por el mismo patrón que ya usa `HomothetyScalarDefinition` (línea 279-292):
verificar que el kind real del objeto referenciado por `object_id` esté en
el conjunto invertible, que `obj.kind` coincida con ese kind real, y que
`ratio_point` sea un punto. `center` sigue exigiendo `point`.

El validador TS equivalente recibe el mismo cambio.

### 4. Evaluador (`backend/app/geometry/engine.py:579-596`)

- Nueva función auxiliar `_reference_point_for_ratio(value: EvaluatedValue,
  center: PointValue) -> PointValue` con las 5 ramas de la tabla de arriba.
  Para `LineValue`, usa la forma normalizada `a·x+b·y+c=0` para calcular el
  pie de la perpendicular: `foot = (cx - a·(a·cx+b·cy+c), cy - b·(a·cx+b·cy+c))`.
  Para `PolygonValue`, centroide = media aritmética de `vertices` (no
  centroide de área).
- El evaluador de `HomothetyPointDefinition` pasa de resolver `pt` como
  `PointValue` fijo a resolver `source = self._require_value(obj.id,
  definition.object_id, obj.kind)` (con el kind real del objeto).
- Calcula `refPoint = _reference_point_for_ratio(source, ctr)`,
  `dop = hypot(refPoint.x - ctr.x, refPoint.y - ctr.y)`. Si `dop <=
  GEOMETRY_EPSILON` → `UndefinedValue(code="coincident_points", ...)`
  (igual que hoy, mensaje generalizado a "Center and reference point
  coincide").
- Calcula `k = hypot(rp.x - ctr.x, rp.y - ctr.y) / dop`. Si `k == 0` y
  `source.kind != "point"` → nuevo `UndefinedValue(code="zero_ratio",
  message="A zero homothety ratio is only supported for points")` (mismo
  mensaje que ya usa la validación estática de `homothety_scalar`, aquí
  como chequeo dinámico porque `k` depende de posiciones en tiempo de
  evaluación, no de un literal).
- Devuelve `_scale_value(source, ctr, k)` en lugar de construir un
  `PointValue` a mano.

El evaluador TS equivalente (`frontend/src/geometry/engine.ts:650-668`)
recibe el mismo cambio, reutilizando `scaleValue`.

### 5. UI (`frontend/src/geometry/constructionTools.ts`)

- `MULTI_STEP_REQUIREMENTS.homothety` (línea 129): `["point", "point",
  "point"]` → `["point", "invertible", "point"]`.
- `TOOL_INSTRUCTIONS.homothety` (línea 104): "Click center, then source
  point, then a point defining the ratio." → "Click center, then the
  object to transform, then a point defining the ratio."
- Caso `"homothety"` del constructor (línea 545-548): igual que
  `"homothety_scalar"` (línea 550-566), validar `isReflectableObject(source)`
  y lanzar el mismo mensaje de error si no lo es ("Homothety requires a
  point, line, segment, circle, or polygon"); fijar `kind: source.kind` en
  el objeto construido en lugar de `"point"` fijo.

### 6. Fixture de conformidad

No existe ningún fixture de homotecia en `shared/fixtures/` (ni para la
variante escalar ni para esta). Se añade uno nuevo,
`shared/fixtures/homothety_point_ratio_segment.json`, generado con
`backend/scripts/generate_conformance_fixture.py` a partir de un script que
aplique `Homothety` point-ratio sobre un segmento, para validar ambos
runtimes bit a bit dentro de la tolerancia `1e-9`.

## Manejo de errores

- Objeto en la posición 2 con `kind` no transformable (p. ej. una función)
  → error de parseo `invalid_reference_type` (tiempo de script, no de
  evaluación).
- Punto de referencia coincidente con el centro → `UndefinedValue
  coincident_points` (dinámico, en tiempo de evaluación — p. ej. si el
  centro de un círculo se arrastra hasta el centro de homotecia).
- Ratio derivado `k == 0` sobre un objeto no-punto → `UndefinedValue
  zero_ratio` (dinámico — p. ej. si `ratioPoint` se arrastra hasta
  coincidir con el centro).
- Documentos guardados con el campo legado `point` en
  `HomothetyPointDefinition` se siguen leyendo sin migración, vía el alias
  de validación.

## Pruebas

**Backend** (`backend/tests/`):
- Parser: `Homothety` point-ratio sobre `line`, `segment`, `circle`,
  `polygon` construye el objeto con el `kind` correcto.
- Parser: objeto no transformable en la posición 2 → error
  `invalid_reference_type`.
- Validador: `HomothetyPoint` con `obj.kind` distinto al kind real del
  padre → `GeometryValidationError`.
- Evaluador: homotecia point-ratio sobre cada kind produce el valor
  esperado (comparando con aplicar `_scale_value` manualmente con el `k`
  esperado).
- Evaluador: punto de referencia coincidente con el centro →
  `UndefinedValue coincident_points`.
- Evaluador: `ratioPoint` coincidente con el centro sobre un objeto
  no-punto → `UndefinedValue zero_ratio`.
- Compatibilidad: un documento con `definition.point` (campo legado) en vez
  de `object` se sigue leyendo y evaluando igual.

**Frontend**:
- `constructionTools`: construir `homothety` sobre cada kind invertible
  produce el `kind` correcto; sobre un objeto no invertible lanza el error
  esperado.
- `engine.ts`: mismos casos de evaluación que en backend (paridad).

**Conformidad**:
- El nuevo fixture `homothety_point_ratio_segment.json` pasa en ambos
  runtimes.
