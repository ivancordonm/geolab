# Compartir un diagrama mediante enlace público

Fecha: 2026-07-10
Rama sugerida: `feature/share-diagram-link`

## Contexto y objetivo

GeoLab permite guardar construcciones geométricas en la nube por usuario
(`backend/app/documents/router.py`, `frontend/src/persistence/useCloudDocuments.ts`).
Hoy todos los endpoints de documentos exigen sesión y restringen el acceso al
dueño (`_get_owned_document` comprueba `document.user_id == user.id`).

El objetivo es añadir un botón de **Compartir** para que el dueño genere un
enlace y **otra persona pueda abrir ese diagrama** sin fricción.

## Decisiones de producto (confirmadas con el usuario)

1. **Acceso:** enlace **público** — cualquiera con la URL abre el diagrama
   **sin iniciar sesión** ni tener cuenta.
2. **Modo del que recibe:** **ver e interactuar en local**. El motor de
   geometría corre en el cliente, así que puede arrastrar puntos, hacer zoom y
   experimentar, pero **nada se persiste al documento original** del dueño. Si
   además inicia sesión, puede "Guardar como nuevo" en su propia cuenta
   (reutiliza el flujo existente, sin código nuevo).
3. **Contenido:** **siempre la versión actual** (contenido vivo). El enlace
   apunta al documento; refleja los últimos cambios guardados por el dueño. Si
   el dueño borra el documento, el enlace deja de funcionar.
4. **Revocación:** **revocable**. El dueño puede dejar de compartir en
   cualquier momento, invalidando el enlace.

## Fuera de alcance (MVP)

- Caducidad de enlaces.
- Permisos por persona / invitaciones por email.
- Edición colaborativa del mismo documento.
- Instantáneas congeladas (versionado).
- Varios enlaces por documento o analíticas de acceso.

## Arquitectura

**Enfoque elegido:** token secreto en la propia fila `Document` + endpoint
público de lectura. Se descartaron: una tabla `shared_links` aparte (flexible
pero innecesaria para el MVP) y un token firmado sin estado tipo JWT (no
permite revocación sin lista negra, choca con la decisión 4).

### Modelo de datos

Nueva columna en la tabla `documents` (`backend/app/models.py`):

- `share_token`: `String`, **único**, **indexado**, **nullable**.
  - `NULL` → documento no compartido.
  - valor → documento compartido; el token es la credencial del enlace.

Migración Alembic que añade la columna (nullable, sin backfill).

### Endpoints (backend)

En `backend/app/documents/router.py`:

- `POST /documents/{document_id}/share` — auth, solo dueño.
  - Si `share_token` es `NULL`, genera uno con `secrets.token_urlsafe(16)`.
  - Devuelve `ShareResponse { token: str }`. Idempotente: si ya hay token, lo
    devuelve sin cambiarlo.
- `DELETE /documents/{document_id}/share` — auth, solo dueño.
  - Pone `share_token = NULL`. Responde `204`. Idempotente.
- `GET /documents/shared/{token}` — **público, sin `Depends(get_current_user)`**.
  - Busca el documento por `share_token == token`.
  - `404` si no existe o fue revocado.
  - Devuelve `PublicDocument { title, document, updatedAt }` (sin `id` interno
    ni datos del dueño).

Notas de rutas:
- `/documents/{id}/share` y `/documents/shared/{token}` son rutas de **dos
  segmentos**; no colisionan con `GET /documents/{document_id}` (un segmento) y
  ya las cubre el proxy `/documents/:path*` de `frontend/vercel.json` (no hay
  que tocar `vercel.json`).
- El endpoint público se define en el mismo router pero **sin** la dependencia
  de auth; es la única ruta de documentos sin sesión.

### Esquemas (backend)

En `backend/app/documents/schemas.py`:

- `ShareResponse { token: str }`.
- `PublicDocument { title: str, document: GeometryDocument, updated_at: datetime }`
  (serializa `updatedAt` por alias, coherente con el resto).
- Añadir `shared: bool` a `DocumentDetail` para que la UI conozca el estado de
  compartición tras recargar (derivado de `share_token is not None`).

### API cliente (frontend)

En `frontend/src/api/documentsApi.ts`:

- `shareDocument(id: string): Promise<{ token: string }>` → `POST …/share`.
- `unshareDocument(id: string): Promise<void>` → `DELETE …/share`.
- `fetchSharedDocument(token: string): Promise<PublicDocumentDetail>` →
  `GET /documents/shared/{token}` (sin requerir sesión; `credentials: "include"`
  es inofensivo).

Tipos nuevos en `frontend/src/types/documents.ts` según los esquemas.

### UI de compartir

Nueva entrada en el menú de `PersistenceControls`
(`frontend/src/components/persistence/PersistenceControls.tsx`), junto a las
acciones de nube:

- **"Compartir…"**:
  - Si no hay sesión → aviso "Inicia sesión para compartir".
  - Si el documento actual no está en la nube (`cloudId === null`) → primero
    "Guardar como nuevo" (pide título), y con el `id` resultante comparte.
  - Llama a `shareDocument(id)`, construye la URL
    `${window.location.origin}/?share=${token}`, la **copia al portapapeles**
    (`navigator.clipboard.writeText`) y muestra el aviso "Enlace copiado".
- **"Dejar de compartir"** (visible solo si el doc actual está compartido):
  - Llama a `unshareDocument(id)` y actualiza el estado.

El estado "compartido" del documento actual se conoce por `DocumentDetail.shared`
(al abrir/guardar) y se mantiene en el estado de `useCloudDocuments`/`App`.

### Abrir un enlace compartido

En el arranque de la app (`frontend/src/App.tsx`), en un `useEffect` inicial
(la carga es asíncrona, así que **no** va en el `restoreStartupDocument`
síncrono; se lee el token una vez al montar):

- Detectar `?share=<token>` en `window.location`.
- Si existe: `fetchSharedDocument(token)`, cargar el diagrama con
  `replaceConstruction(...)`, **desasociar** de cualquier doc de nube
  (`detachCloudDocument`), y **limpiar** el query param con
  `window.history.replaceState`.
- Mostrar un **banner** persistente mientras se ve un diagrama compartido:
  "Estás viendo un diagrama compartido. Los cambios no se guardan en el
  original; inicia sesión y 'Guardar como nuevo' para conservarlo."
- El usuario puede interactuar con normalidad (nada se persiste al original;
  el autoguardado local a `localStorage` sigue igual y es aceptable).
- Si el token no existe / fue revocado (`404`) → aviso "Este enlace ya no está
  disponible" y arranque normal (documento de ejemplo o el local restaurado).

## Manejo de errores

- `POST/DELETE …/share` sobre un doc que no es del usuario → `404` (igual que el
  resto, no revela existencia).
- `GET /documents/shared/{token}` con token inválido/revocado → `404`.
- Fallo de `navigator.clipboard` (contexto no seguro o permiso denegado) → el
  aviso muestra igualmente la URL para copiar manualmente.
- Fallo de red al abrir un enlace → banner de error y arranque normal.

## Pruebas

**Backend** (`backend/tests/`):
- Compartir genera token y es idempotente.
- Revocar pone el token a `NULL` y el enlace pasa a `404`.
- Lectura pública devuelve el documento por token, sin auth.
- Compartir/revocar un documento ajeno → `404`.
- Token inexistente → `404`.

**Frontend**:
- `documentsApi`: `shareDocument`, `unshareDocument`, `fetchSharedDocument`
  (rutas, método, manejo de error) en `documentsApi.test.ts`.
- Detección de `?share=<token>` en el arranque (carga el doc y limpia la URL).

## Pasos manuales de despliegue

- Ejecutar la migración Alembic en el backend de producción
  (`alembic upgrade head`) tras desplegar.
- No requiere cambios en variables de entorno ni en `vercel.json`.
