# Google login y persistencia en la nube de documentos geométricos

Fecha: 2026-07-08
Rama: `feature/google-auth-persistence`

## Contexto y objetivo

GeoLab no tiene hoy persistencia más allá de un único documento autoguardado en
`localStorage` del navegador (`frontend/src/persistence/documentPersistence.ts`,
`useAutoSaveDocument.ts`). Se ha aprovisionado una base de datos PostgreSQL en
Neon (vía Vercel) y sus credenciales están en `backend/.env` (ya cubierto por
`.gitignore`, no se versiona).

El objetivo de este trabajo es permitir que un usuario inicie sesión con su
cuenta de Google y, a partir de ahí, guarde múltiples construcciones
geométricas con nombre en la nube, las liste, las abra y las borre desde
cualquier dispositivo. El uso sin sesión iniciada (modo invitado) debe seguir
funcionando exactamente igual que hoy.

## Decisiones de producto (confirmadas con el usuario)

1. **Modelo de guardado:** múltiples documentos con nombre por usuario (no un
   único documento sincronizado), similar a "Mis archivos" de GeoGebra.
2. **Login:** obligatorio para las prestaciones de nube, pero **opcional**
   para usar la aplicación — sin sesión, la app se comporta igual que hoy
   (autoguardado local, exportar/importar JSON).
3. **Mecanismo de login:** Google Identity Services (GIS) en el frontend +
   verificación del ID token en el backend. No se implementa el flujo OAuth
   Authorization Code completo (sin necesidad de manejar el `client_secret`
   de Google para intercambio de código, ni refresh tokens de Google).
4. **Sesión:** JWT propio sin estado (HS256), en cookie `httpOnly`. Sin tabla
   de sesiones — el logout borra la cookie; un token robado seguiría siendo
   válido hasta su expiración. Aceptable para esta fase.
5. **Despliegue:** frontend y backend en dominios distintos (cross-site).
   Esto implica cookies `SameSite=None; Secure` en producción y CORS con
   origen explícito (no `"*"`) para poder usar `allow_credentials=True`.
6. **Google Client ID:** aún no existe; hay que crearlo en Google Cloud
   Console antes de poder probar el login end-to-end (paso manual, fuera del
   alcance del código).

## Arquitectura

### Backend — nuevos módulos

Seguimos el patrón existente de módulos con router propio incluido en
`app/main.py` (como `app/geometry/`, `app/agent/`):

- `app/db.py` — engine y factory de sesión async de SQLAlchemy 2.0
  (`asyncpg`), leyendo `DATABASE_URL` desde el entorno. Fallo rápido y
  explícito en el arranque si falta.
- `app/models.py` — modelos ORM `User` y `Document`.
- `app/auth/`
  - `google.py` — verificación del ID token de Google (`google-auth`)
    contra `GOOGLE_CLIENT_ID`.
  - `jwt.py` — emisión/verificación del JWT propio de sesión (`PyJWT`,
    `JWT_SECRET`, expiración configurable, por defecto 30 días).
  - `dependencies.py` — `get_current_user` (401 si falta sesión) y
    `get_current_user_optional`.
  - `router.py` — `/auth/google`, `/auth/logout`, `/auth/me`.
- `app/documents/`
  - `router.py` — CRUD de documentos guardados.
  - `schemas.py` — modelos Pydantic de entrada/salida.
- `alembic/` — migraciones versionadas (`alembic revision --autogenerate`,
  `alembic upgrade head`).

Elegimos **SQLAlchemy async + asyncpg + Alembic** en vez de SQL crudo con
`asyncpg` directo porque `docs/ARCHITECTURE.md` ya prevé evolucionar hacia
colaboración/versionado sobre esta misma capa de persistencia
(`JsonDocumentRepository` → repositorio en BBDD); tener modelos tipados y
migraciones hace esa evolución mucho más segura, a cambio de algo más de
dependencias que un MVP mínimo con SQL a pelo.

### Esquema de base de datos

```
users
  id            uuid pk (default gen_random_uuid())
  google_sub    text unique not null   -- claim "sub" del token de Google
  email         text not null
  name          text
  picture_url   text
  created_at    timestamptz not null default now()
  last_login_at timestamptz not null default now()

documents
  id             uuid pk (default gen_random_uuid())
  user_id        uuid not null references users(id) on delete cascade
  title          text not null
  schema_version int not null
  data           jsonb not null        -- GeometryDocument serializado
  created_at     timestamptz not null default now()
  updated_at     timestamptz not null default now()

index documents(user_id)
```

### Configuración nueva (variables de entorno del backend)

- `DATABASE_URL` (ya presente en `.env`, provisto por Neon).
- `GOOGLE_CLIENT_ID` — Client ID de Google Cloud Console.
- `JWT_SECRET` — secreto para firmar el JWT propio.
- `JWT_EXPIRE_DAYS` — opcional, por defecto `30`.
- `FRONTEND_ORIGIN` — origen(es) permitido(s) para CORS (sustituye a `"*"`).
- `COOKIE_SECURE` / `APP_ENV` — para distinguir local (`SameSite=Lax`, sin
  `Secure`) de producción (`SameSite=None`, `Secure`).

### Flujo de login

1. El frontend renderiza el botón oficial de Google (GIS), que devuelve un
   `credential` (ID token) tras el login del usuario en el propio dominio de
   Google.
2. El frontend hace `POST /auth/google { idToken }` con
   `credentials: 'include'`.
3. El backend verifica firma, audiencia (`aud === GOOGLE_CLIENT_ID`) y
   vigencia del token; hace *upsert* del usuario por `google_sub`; emite su
   propio JWT y lo fija en una cookie `httpOnly`.
4. Devuelve el perfil `{ id, email, name, pictureUrl }`.
5. En cargas posteriores, el frontend llama a `GET /auth/me` para restaurar
   la sesión a partir de la cookie ya presente.

### Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/auth/google` | — | Login con ID token de Google |
| POST | `/auth/logout` | — | Borra la cookie de sesión |
| GET | `/auth/me` | opcional | Perfil actual o 401 |
| GET | `/documents` | requerida | Lista `{ id, title, updatedAt }[]` del usuario |
| POST | `/documents` | requerida | Crea `{ title, document }` → registro con `id` |
| GET | `/documents/{id}` | requerida | Documento completo (404 si no es del usuario) |
| PUT | `/documents/{id}` | requerida | Actualiza título y/o contenido |
| DELETE | `/documents/{id}` | requerida | Borra el documento |

### Frontend — nuevos módulos

- `frontend/src/auth/`
  - `useAuth.ts` — hook/contexto `{ user, loading, signIn, signOut }`;
    restaura sesión llamando a `GET /auth/me` al montar la app.
  - `GoogleSignInButton.tsx` — carga el script de GIS y renderiza el botón
    oficial; al recibir el `credential` llama a `signIn(idToken)`.
- `frontend/src/api/documentsApi.ts` — cliente fetch para `/documents/*`,
  siempre con `credentials: 'include'`.
- Barra superior: sin sesión, botón "Iniciar sesión con Google"; con sesión,
  avatar + nombre + menú "Cerrar sesión".
- `PersistenceControls` se extiende (junto a exportar/importar JSON local,
  que se mantienen intactos) con, solo si `user !== null`:
  - **Guardar** — `PUT` si el documento abierto ya tiene `cloudId`, si no
    pide título y hace `POST`.
  - **Guardar como...** — siempre pide título nuevo y crea un registro.
  - **Abrir** — panel/modal con la lista de documentos guardados (título +
    fecha de actualización), click para cargar, menú para renombrar/borrar.

El autoguardado local en `localStorage` se mantiene siempre activo como red
de seguridad, con o sin sesión iniciada. El guardado en la nube es una acción
explícita del usuario, no un autoguardado en cada cambio del documento.

## Manejo de errores

- ID token de Google inválido/expirado → `401` (`invalid_google_token`); el
  frontend muestra un aviso y no cambia el estado de sesión.
- JWT propio ausente/expirado/inválido → `401` en `get_current_user`; el
  frontend, al recibir un 401 de `/auth/me` o de cualquier `/documents/*`,
  cae a modo invitado (limpia el usuario del estado, oculta los controles de
  nube) sin tocar el documento abierto en el canvas.
- Guardar/actualizar/borrar un documento que no existe o no pertenece al
  usuario → `404` con mensaje claro.
- Fallo de red o de BBDD al guardar → el documento del canvas no se toca
  (misma atomicidad que ya garantiza `evaluate-script`); se informa el error
  y el usuario puede reintentar o exportar a JSON local como respaldo.
- Variables de entorno obligatorias ausentes (`GOOGLE_CLIENT_ID`,
  `JWT_SECRET`, `DATABASE_URL`) → el backend falla al arrancar, no en la
  primera petición.

## Plan de pruebas

- **Backend:**
  - Unitarias de emisión/verificación del JWT propio (expiración,
    manipulación del payload), con la verificación de Google mockeada.
  - Integración (`test_api_auth.py`, `test_api_documents.py`, vía `httpx`)
    cubriendo: alta de usuario en el primer login, CRUD completo de
    documentos, y aislamiento entre usuarios (el usuario A no puede leer,
    modificar ni borrar documentos del usuario B).
- **Frontend:**
  - `useAuth` con `fetch` mockeado (login, restauración de sesión, logout,
    caída a invitado ante 401).
  - `documentsApi.ts` (mapeo de requests/responses).
  - `PersistenceControls`: los controles de nube solo aparecen con sesión
    iniciada; guardar/guardar como/abrir llaman a los endpoints correctos.
- **Manual:** flujo de login real con Google en local, de principio a fin,
  antes de dar la funcionalidad por terminada (requiere el Client ID ya
  creado en Google Cloud Console).

## Fuera de alcance (fase actual)

- Compartir documentos entre usuarios o colaboración en tiempo real.
- Revocación instantánea de sesión / cierre de sesión en todos los
  dispositivos (requeriría sesiones en BBDD, descartado por complejidad para
  esta fase).
- Otros proveedores de login además de Google.
- Migración de documentos guardados en `localStorage` a la nube de forma
  automática al iniciar sesión por primera vez.
