# GeoLab Roadmap

Estado: julio 2026. El corto plazo (documentación sincronizada, fixtures de
conformidad, registry completo, refactor de `App.tsx`) se ejecuta en
`docs/superpowers/plans/2026-07-12-consolidacion-geolab.md`. Este documento
recoge lo que viene después.

## Medio plazo (producto)

### 1. Deslizadores y parámetros
Un objeto `slider` (nombre, mín, máx, paso, valor actual) que otras
definiciones puedan referenciar donde hoy aceptan un número literal
(`Rotation(A, B, k)`, `Homothety(B, P, k)`). Convierte construcciones
estáticas en dinámicas y encaja de forma natural en el DAG: mover el slider
es análogo a mover un punto libre (recomputación topológica de dependientes).
Requiere: variante de definición en ambos runtimes, control UI en el canvas,
soporte en el parser de scripts y fixture de conformidad.

### 2. Medidas como objetos
`Distance(A, B)`, `Angle(A, O, B)`, `Area(poly)`, `Slope(l)` como objetos del
grafo con `EvaluatedValue` numérico que se recalcula con sus padres.
Imprescindible para uso docente. Se renderizan como etiquetas ancladas y
aparecen en la lista de objetos.

### 3. Planner con tool-calling nativo
Sustituir el contrato actual "devuélveme un script en JSON" por function
calling real: el registry ya exporta JSON-Schema por herramienta
(`ToolDefinition.descriptor()`), así que el planner puede pasar los
descriptores como `tools` al proveedor y ejecutar la propuesta tool a tool
contra un workspace efímero. Beneficios: reparación de errores por paso,
trazas limpias, menor tasa de scripts inválidos. El boundary de aprobación
no cambia: el resultado sigue siendo una propuesta que el usuario aplica.

### 4. Streaming del asistente
Respuestas del planner en streaming (SSE) para percepción de latencia.
Afecta a `/agent/plan`, al cliente `frontend/src/agent/planner.ts` y al
`AssistantPanel`.

### 5. Workspace REST sin estado global
`GET /geometry/graph` y `POST /agent/execute-tool` usan hoy un workspace
global por proceso (ver "Important limitations" del README): inutilizable en
serverless y entre usuarios. Migrar al modelo del MCP: el documento viaja en
la petición y vuelve en la respuesta. Eliminar `app/services.py` como estado
compartido.

### 6. Particionar los módulos grandes del frontend
- `frontend/src/geometry/engine.ts` (~1150 líneas): separar evaluadores por
  familia (puntos/líneas, círculos/intersecciones, transformaciones,
  polígonos/arcos) manteniendo `engine.ts` como fachada re-exportadora.
- `frontend/src/geometry/constructionTools.ts` (~1220 líneas): separar la
  máquina de estados de cada herramienta de la definición del catálogo.
Los suites existentes (`engine.test.ts`, `constructionTools.test.ts`) actúan
como red de seguridad; el refactor no cambia comportamiento.

### 7. Paginación y búsqueda de documentos cloud
`GET /documents` sin paginación no escala. Añadir `limit/offset` + orden por
`updated_at`, y filtro por título.

## Largo plazo (visión)

### 8. Módulo simbólico real (SymPy)
El paquete `backend/app/symbolic/` es hoy un placeholder. Objetivo: parsing
seguro con allowlist (patrón ya probado en
`app/geometry/function_expression.py`), `simplify`, `solve`, y el endpoint
`/geometry/validate` para validar propiedades de una construcción
simbólicamente (p. ej. "¿M equidista de A y B?"). Límites de tamaño de
expresión y tiempo de ejecución.

### 9. Colaboración en tiempo real
CRDT sobre el DAG (el documento ya es declarativo y por objetos, encaja
bien). Requiere IDs estables, resolución de conflictos por objeto y un canal
WebSocket. Antes de esto debe existir el workspace sin estado (punto 5).

### 10. Modo aula
Compartir una construcción con una clase, ver los lienzos de los alumnos en
mosaico, y clonar plantillas. Se apoya en los share-tokens existentes más un
concepto de grupo/rol en la base de datos.

### 11. Export a TikZ y GeoGebra
Generadores deterministas desde el `GeometryDocument` para material
didáctico. TikZ primero (texto puro, testeable con snapshots).

### 12. Ejecución Python aislada
Sandbox con límites de CPU/memoria/tiempo para scripts numéricos del
usuario. Servicio separado; nunca dentro del proceso API.

### 13. PWA / offline
El frontend ya es local-first (autosave en localStorage); empaquetarlo como
PWA con service worker para uso sin red en aulas.

## Deuda técnica registrada

- Validar longitud mínima de `JWT_SECRET` (≥32 bytes) en `app/config.py`.
- Rate limiting en `/agent/plan` y `/documents/shared/{token}`.
- Los exports SVG/PNG del backend no dibujan arcos (el frontend interactivo sí).
- Sustituir `window.prompt` por un diálogo propio al guardar/compartir.
