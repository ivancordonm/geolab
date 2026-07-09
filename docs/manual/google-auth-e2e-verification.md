# Verificación manual E2E de Google Auth y persistencia cloud

Esta guía documenta la validación manual completa del flujo de autenticación con Google y persistencia de documentos en la nube.

## Objetivo

Verificar en navegador real que:

- el login con Google funciona
- la sesión persiste tras recargar
- la persistencia cloud guarda, abre, renombra y elimina documentos
- el modo invitado sigue comportándose como antes
- los datos quedan almacenados en la base de datos

## Prerrequisitos

Antes de empezar, debe estar completada la configuración documentada en:

- `docs/manual/google-oauth-client-id-setup.md`

Además:

- `backend/.env` debe tener `GOOGLE_CLIENT_ID`, `JWT_SECRET` y `FRONTEND_ORIGIN` configurados.
- `frontend/.env` debe tener `VITE_GOOGLE_CLIENT_ID`.
- Los servidores de backend y frontend deben estar corriendo.
- La prueba debe hacerse en un navegador real, no solo con tests automatizados.

## Paso 1: Login completo

1. Abrir `http://localhost:5173`.
2. Hacer click en el botón de Google sign-in.
3. Completar el login real con Google.
4. Verificar que:
   - el avatar y el menú de cuenta reemplazan el botón de sign-in
   - al recargar la página, la sesión sigue activa
   - al hacer sign out, reaparece el botón de sign-in y desaparecen las opciones cloud

## Paso 2: Persistencia cloud

Con la sesión iniciada:

1. Crear una construcción pequeña.
2. Ejecutar **Save as new...** y asignar un título.
3. Recargar la página.
4. Abrir **Open from cloud**.
5. Confirmar que la misma construcción se carga con los mismos objetos.
6. Renombrar el documento desde el panel.
7. Eliminar el documento.
8. Confirmar que desaparece del listado.

## Paso 3: Verificar modo invitado

1. Cerrar sesión o abrir una ventana de incógnito sin login.
2. Confirmar que el comportamiento sigue igual que antes del feature:
   - autosave en localStorage
   - export/import JSON
   - no se muestran opciones cloud

## Paso 4: Verificar base de datos directamente

Ejecutar:

```bash
cd backend && source .venv/bin/activate
python -c "
from sqlalchemy import text
from app.db import get_session_factory
session = get_session_factory()()
print(session.execute(text('select email, created_at from users')).fetchall())
print(session.execute(text('select title, updated_at from documents')).fetchall())
"
```

## Resultado esperado

La salida debe mostrar:

- el usuario creado durante el login
- los documentos creados durante la prueba de persistencia cloud

## Checklist final sugerido

- [ ] Login con Google completado correctamente
- [ ] La sesión persiste tras refresh
- [ ] Sign out restaura el estado anónimo
- [ ] Save as new funciona
- [ ] Open from cloud recupera el documento correcto
- [ ] Rename funciona
- [ ] Delete funciona
- [ ] Guest mode sigue intacto
- [ ] La base de datos refleja usuarios y documentos creados

## Referencia

Fuente original: `docs/superpowers/plans/2026-07-08-google-auth-persistence.md` (Task 9).
