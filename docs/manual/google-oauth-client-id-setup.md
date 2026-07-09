# Google OAuth Client ID y variables de entorno

Esta guía documenta la tarea manual previa necesaria para probar el login con Google en local.

## Objetivo

Crear un OAuth Client ID de Google para el frontend local y configurar las variables de entorno requeridas en backend y frontend.

## Prerrequisitos

- Una cuenta de Google con acceso a Google Cloud Console.
- Acceso local al repositorio.
- El frontend corre en `http://localhost:5173`.

## Paso 1: Crear el proyecto y la pantalla de consentimiento

1. Ir a https://console.cloud.google.com/.
2. Crear un proyecto nuevo o seleccionar uno existente.
3. Abrir **APIs & Services → OAuth consent screen**.
4. Elegir **External**.
5. Completar al menos:
   - nombre de la app
   - support email
6. Guardar los cambios.

## Paso 2: Crear el OAuth Client ID

1. Ir a **APIs & Services → Credentials**.
2. Elegir **Create Credentials → OAuth client ID**.
3. Seleccionar **Web application** como tipo.
4. En **Authorized JavaScript origins**, agregar:

   ```text
   http://localhost:5173
   ```

5. Crear la credencial.
6. Copiar el Client ID generado. El formato esperado es similar a:

   ```text
   1234567890-abc...apps.googleusercontent.com
   ```

## Paso 3: Generar el secret para JWT

Ejecutar:

```bash
openssl rand -hex 32
```

Guardar el valor generado para usarlo como `JWT_SECRET`.

## Paso 4: Configurar `backend/.env`

Agregar estas claves al archivo `backend/.env`:

```env
GOOGLE_CLIENT_ID=<client id generado en Google Cloud>
JWT_SECRET=<salida de openssl rand -hex 32>
JWT_EXPIRE_DAYS=30
APP_ENV=development
FRONTEND_ORIGIN=http://localhost:5173
```

## Paso 5: Configurar `frontend/.env`

Crear o completar `frontend/.env` con:

```env
VITE_GOOGLE_CLIENT_ID=<el mismo client id usado en backend>
```

## Verificación rápida

Confirmar que:

- `backend/.env` contiene las 5 claves requeridas.
- `frontend/.env` contiene `VITE_GOOGLE_CLIENT_ID`.
- El Client ID es el mismo en backend y frontend.
- Ningún secret real se commitea al repositorio.

## Referencia

Fuente original: `docs/superpowers/plans/2026-07-08-google-auth-persistence.md` (Task 0).
