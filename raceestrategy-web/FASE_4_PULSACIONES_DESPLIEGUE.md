# RaceEstrategy fase 4 — pulsaciones, webhooks y despliegue (noviembre 2026)

## Qué incluye
- Resumen de FC media/máxima (`average_heartrate`, `max_heartrate`) al consultar actividades con Strava API.
- Gráfico de frecuencia cardiaca desde `/api/strava/activities/:id/heart-rate`, con puntos reducidos y caché de 15 min (no persiste la serie en la base de datos). Solo se accede a actividades del usuario autenticado dentro de las 200 de la consulta actual.
- Webhooks: ruta `GET/POST /api/strava/webhook/:secret` que verifica la suscripción, responde rápidamente y **invalida la caché**. El navegador consulta el estado cada 60 segundos y vuelve a pedir datos cuando hay un evento. No persistimos una copia de las actividades por API.
- Backend SQLite con ruta configurable `DB_PATH`, Netlify build que genera `_redirects` con `BACKEND_URL` y script de registro de webhook.
- Importación ZIP/CSV conservada. **No lee las pulsaciones del ZIP**; para eso habrá que añadir FIT/TCX en otra fase.

## Sustituir localmente con seguridad
1. Cierra terminales. Haz copia de `raceestrategy-web/backend/data` (incluidos `app.sqlite`, `app.sqlite-wal` y `app.sqlite-shm` si existen) y del archivo `backend/.env`.
2. Sustituye el **código** por la carpeta completa de este ZIP, sin copiar `node_modules` ni `dist`. No sobreescribas `backend/data` ni tu `.env`.
3. Restituye `backend/data` y `backend/.env` en el nuevo proyecto.
4. En `backend`: `npm install` y `npm run dev`. En `frontend`: `npm install` y `npm run dev`. O ejecuta `INICIAR_WINDOWS.bat`.
5. Abre el detalle de una actividad de **Strava conectado** desde `Mis actividades`; verás FC y, cuando exista, el gráfico.

## GitHub y Netlify (no arrastrar dist)
1. Sube solo código a `main`, comprobando que no incluyes `.env`, `data/`, bases SQLite ni credenciales. Tu `.gitignore` debe excluirlos.
2. En Netlify (https://app.netlify.com/) → Add new project → Import an existing project → GitHub → `Miguelmtnez/RaceEstrategy`, rama `main`.
3. Configura **Base directory** = `raceestrategy-web/frontend`; **Build command** = `npm run build`; **Publish directory** = `dist`. Si Netlify detecta automáticamente este frontend en el monorepo, comprueba que la configuración equivalente esté seleccionada y evita duplicar `Package directory` con `Base directory`.
4. En Site configuration → Environment variables añade `BACKEND_URL=https://TU-BACKEND.onrender.com` (sin `/api`). Este valor NO es secreto. Vuelve a desplegar tras configurarlo.
5. El build crea `dist/_redirects` con `/api/* https://TU-BACKEND.onrender.com/api/:splat 200` y `/* /index.html 200`. Esto permite cookies de sesión de mismo origen vía proxy de Netlify.
6. Comprueba `https://TU-FRONTEND.netlify.app/api/health` (debe responder JSON de Render). No bastaría que abra el HTML del dashboard.

## Backend Render (requiere datos persistentes)
1. En Render (https://dashboard.render.com/) → New → Web Service → GitHub → repositorio `Miguelmtnez/RaceEstrategy`, rama `main`.
2. **Root Directory** = `raceestrategy-web/backend`; **Build Command** = `npm install`; **Start Command** = `npm start`; health check `/api/health`; versión Node >=20.
3. Para mantener SQLite, utiliza **plan que admita disco persistente** y adjunta un disco montado en `/var/data`. Configura `DB_PATH=/var/data/app.sqlite`. Copiar `backend/data` desde tu PC NO copia la base de datos al disco de Render: las cuentas locales no aparecerán automáticamente en producción. Comienza con cuentas beta nuevas o planifica una migración segura.
4. En Environment configura **sin publicarlos en GitHub**:
   - `NODE_ENV=production`
   - `FRONTEND_URL=https://TU-FRONTEND.netlify.app`
   - `STRAVA_CLIENT_ID` (de Strava)
   - `STRAVA_CLIENT_SECRET` (privado: regenerar si se compartió)
   - `STRAVA_REDIRECT_URI=https://TU-FRONTEND.netlify.app/api/strava/callback`
   - `TOKEN_ENCRYPTION_KEY` (clave privada hex de 64 caracteres, conservar estable)
   - `STRAVA_WEBHOOK_SECRET` (secreto aleatorio de al menos 32 caracteres)
   - `STRAVA_WEBHOOK_VERIFY_TOKEN` (otro secreto aleatorio de al menos 32 caracteres)
   - `DB_PATH=/var/data/app.sqlite`
   No uses `localhost` en estas variables. No registres las claves en Netlify.
5. Comprueba `https://TU-BACKEND.onrender.com/api/health` y después la URL del punto 6 de Netlify.
6. En Strava → https://www.strava.com/settings/api → **Authorization Callback Domain** = `TU-FRONTEND.netlify.app` (solo host), porque el OAuth pasa por Netlify. La ruta de webhook es independiente y se publica directamente en Render.

## Webhook Strava (solo después de desplegar Render)
1. En `backend/.env` **local**, añade `STRAVA_WEBHOOK_SECRET` y `STRAVA_WEBHOOK_VERIFY_TOKEN` iguales a los de Render; mantén `STRAVA_CLIENT_ID` y `STRAVA_CLIENT_SECRET` configurados. Genera cada secreto con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. En la terminal de `backend` ejecuta `npm run webhook:list` para comprobar que aún no hay una suscripción para esta aplicación (Strava admite una por aplicación).
3. Regístrala con `npm run webhook:register -- https://TU-BACKEND.onrender.com`. Strava hará una petición GET de verificación al servidor; debe estar activo y responder en menos de dos segundos.
4. El script mostrará el ID de la suscripción. Puedes añadirlo como `STRAVA_WEBHOOK_SUBSCRIPTION_ID` en Render y redeplegar, para filtrar eventos ajenos a esa suscripción.
5. Una nueva actividad en Strava generará un webhook (si la visibilidad y los permisos lo permiten). Al abrir la aplicación, el backend pedirá actividades actualizadas; si la página ya está abierta, el frontend comprueba el estado cada minuto. Un evento **no implica una descarga de FIT ni sincroniza la importación ZIP**, que sigue siendo manual.
6. Nota: el endpoint lleva un secreto en la **ruta**, porque los webhooks de Strava no incluyen una firma HMAC documentada. No publiques la dirección completa ni el valor secreto. Puedes rotarlo y registrar de nuevo la suscripción si se expone.

## Limitaciones y precauciones
- No usar Render Free + SQLite para usuarios reales: el almacenamiento local se pierde en suspensiones y redeploys y el servidor gratuito duerme tras inactividad; Strava exige responder en 2 segundos.
- Al configurar Strava en producción, usa una cuenta y datos de **prueba autorizados**. Cambiar de clave de cifrado hace ilegibles los tokens guardados; es mejor generar la de producción antes de vincular cuentas.
- Hay datos personales y de salud en las actividades. No subas la base de datos ni la exportación de tu cuenta al repositorio. Implementa información al usuario, retención/borrado y controles de seguridad antes de abrir registro público.
- Strava tiene límites de API y condiciones de uso, incluida una restricción en el uso de datos obtenidos de su API para aplicaciones de IA. Mantén el entrenamiento del ML separado y verifica las condiciones antes de conectar ambos sistemas.
- Las URL con `TU-...` son **ejemplos**, nunca se han creado ni probado de forma remota.
- El ZIP no contiene tus credenciales ni tu base de datos. Copia los ficheros privados localmente, nunca al repositorio.
