## NUEVO EN FASE 3 — PERFIL DEPORTIVO

La página **/perfil** muestra estadísticas por deporte (carrera, bicicleta, MTB...), evolución semanal y mensual, comparación de periodos y una medida orientativa de constancia, sin requerir un modelo de Machine Learning. Consulta **FASE_3_PERFIL_DEPORTIVO.md** para la instalación y las limitaciones. La vista previa estática es `frontend/public/preview-perfil.html`.

# RaceEstrategy · Fase 1.2 — Cuentas, Strava, importación de archivos y dashboard

Primera implementación **independiente** para integrar con el repositorio actual de RaceEstrategy. Incluye registro/login real, dos formas de cargar el historial de Strava (OAuth2 o importación manual ZIP/CSV) y estadísticas para el propio titular de la cuenta. No utiliza el modelo de IA ni sustituye el visor GPX previo.

## Qué funciona

- Crear una cuenta / iniciar sesión / cerrar sesión.
- Contraseñas con hash bcrypt; sesión de servidor guardada como hash en SQLite y cookie HttpOnly/SameSite.
- Enlazar **tu propia** cuenta de Strava con OAuth2 (permisos `read` y `activity:read`). El usuario nunca entrega la contraseña de Strava a RaceEstrategy.
- Guardar tokens de Strava cifrados con AES-256-GCM en SQLite; renovar el access token cuando caduque.
- Leer hasta **200 actividades recientes por API**, o **todo el historial contenido en activities.csv** (hasta 100.000 filas en esta versión) si se importa manualmente. Mostrar kilómetros, tiempo, desnivel, gráficas mensuales, deportes y actividades recientes.
- Caché solo en memoria de 15 minutos para no solicitar las mismas actividades continuamente.
- **Informe de importación con motivos de exclusión**: filas con ID inválido, fecha no reconocida o duplicadas, y ejemplos para localizarlas en el CSV. Las actividades sin métricas se conservan con estadísticas parciales.
- Importar desde un **ZIP exportado desde Strava**, o desde su `activities.csv` extraído. El navegador abre únicamente el CSV del ZIP, sin enviar el resto de archivos al backend. Guardar por usuario solo los campos mínimos de cada actividad en SQLite. Reimportar reemplaza el historial manual anterior sin duplicarlo.
- Alternar entre estadísticas de API y de importación, si están disponibles ambas. Borrar solo los datos importados, desconectar/revocar Strava o eliminar la cuenta de RaceEstrategy y su información.
- Vista de demostración con **datos ficticios claramente etiquetados** que funciona sin conectar Strava.
- Diseño adaptable a móvil con colores naturales y paneles claros.

## Vista previa del diseño

Si solo quieres visualizar el diseño antes de instalar dependencias, abre `VISTA_PREVIA.html` (dashboard) o `VISTA_REGISTRO.html` (registro) con el navegador. **Es una maqueta estática con datos ficticios**, no sustituye al frontend funcional.

## Requisitos

- Node.js **20 o posterior** (compatible con Node.js 24 usando `better-sqlite3` 12.11.1)
- npm
- Solo para la opción API: una aplicación de desarrollador Strava; crearla requiere actualmente una suscripción del creador. **Para la importación de ZIP/CSV no se necesita API ni Strava Premium**.

## Primer arranque (Windows PowerShell)

Abre **dos terminales** en VS Code desde la carpeta `raceestrategy-web`.

### Terminal 1: backend

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Genera una clave aleatoria para cifrar tokens:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Pega el resultado tras `TOKEN_ENCRYPTION_KEY=` dentro de `backend/.env`. **No publiques ese archivo ni esa clave**.

Arranca:

```powershell
npm run dev
```

Backend: `http://localhost:3001`.

### Terminal 2: frontend

```powershell
cd frontend
npm install
npm run dev
```

Abre `http://localhost:5173`.

**Ya puedes crear un usuario e importar tu ZIP/CSV de Strava, o probar «Ver dashboard de ejemplo», sin crear una aplicación de desarrollador ni tener Strava Premium.**

## Configurar la API de Strava para datos reales

1. Entra con tu cuenta en https://www.strava.com/settings/api y crea una aplicación. La documentación actual indica que es necesaria una suscripción a Strava para crearla.
2. En **Authorization Callback Domain** indica `localhost` (sin puerto y sin `http://`).
3. En `backend/.env`, rellena:

```ini
STRAVA_CLIENT_ID=TU_CLIENT_ID
STRAVA_CLIENT_SECRET=TU_CLIENT_SECRET
STRAVA_REDIRECT_URI=http://localhost:3001/api/strava/callback
FRONTEND_URL=http://localhost:5173
TOKEN_ENCRYPTION_KEY=TU_CLAVE_ALEATORIA_DE_64_CARACTERES_HEX
```

4. Reinicia el backend (`Ctrl+C` y `npm run dev`).
5. Crea una cuenta RaceEstrategy y pulsa **Conectar con Strava**. Strava mostrará su propia página de permisos. Autoriza la lectura de las actividades y volverás al dashboard.

**No pegues nunca el Client Secret, los access tokens ni los refresh tokens en el frontend, un commit ni una captura.**

### Limitación inicial de Strava

Según la documentación actual, las aplicaciones nuevas comienzan con **1 deportista conectado** (Single Player Mode). Puedes solicitar la ampliación inicial en el panel de API y, para escalar, pasar por una revisión de Strava. Por tanto, el registro en RaceEstrategy funcionará para varias personas, pero no todas podrán conectar Strava hasta que amplíes la capacidad de la app.

Se solicitan únicamente `read,activity:read`: las actividades configuradas como «Solo tú» no están incluidas; para ellas haría falta solicitar `activity:read_all` y revisar la privacidad antes de ampliar la aplicación.

## Opción B — Importar la cuenta Strava manualmente (sin Strava Premium)

No hace falta crear ni vincular ninguna aplicación API. La descarga masiva de los datos de la cuenta funciona a través del sitio web de Strava.

1. Ve a https://www.strava.com/settings (en el navegador, no en la app móvil), luego **Mi cuenta**.
2. En **Descargar tu cuenta**, haz clic en **Comenzar** y **Solicitar descarga**.
3. Strava te enviará un enlace por correo electrónico; puede tardar horas.
4. Descarga el **ZIP** completo y guárdalo en tu ordenador. No necesitas descomprimirlo: en RaceEstrategy pulsa **Elegir archivo** y selecciónalo. Si el ZIP es muy grande, descomprímelo localmente y selecciona solo `activities.csv`.
5. El navegador lee únicamente `activities.csv` dentro del ZIP. RaceEstrategy envía ese contenido al backend y guarda las estadísticas de cada actividad en SQLite, asignadas al usuario que ha iniciado sesión.
6. Si importas otra copia más reciente, se **sustituye el historial importado anterior**; no se añaden duplicados. Si prefieres, puedes pulsar **Borrar importación**. Esto no modifica tu Strava original.

El archivo de Strava no se sincroniza de forma automática: para incorporar nuevos entrenamientos tendrás que repetir la descarga e importación. El usuario **no necesita Strava Premium** para exportar su propio historial. Una suscripción a Strava **sí** es necesaria actualmente para quien quiera **crear la aplicación de desarrollador API**; no es un requisito universal de los deportistas que autorizan una app existente.

**Alcance actual:** se importa el CSV de resumen. No se analizan todavía las trazas GPS, la frecuencia cardiaca detallada ni los archivos `.fit`, `.tcx`, `.gpx`, `.gz` del directorio `activities/`. Para la futura estrategia por tramos habrá que desarrollar esa importación por separado. La importación manual muestra todo el historial válido del CSV, mientras que la API del MVP consulta solo las 200 actividades más recientes.

**Privacidad y límites:** el ZIP completo **permanece en el navegador**, pero **los datos de actividades del CSV sí se envían a tu propio backend** y se almacenan en `backend/data/app.sqlite` hasta que los borres. Evita subir exportaciones personales a servidores que no controles. Límite 20 MB de CSV y hasta 100.000 filas. No se guardan fotos, archivos GPS ni ficheros originales. El parser espera columnas conocidas de la exportación de Strava (normalmente encabezados en inglés), considera distancias en metros y tiempos en segundos, y puede omitir filas inválidas. Si las estadísticas no coinciden con Strava, revisa las columnas y unidades antes de usar esos valores.

Referencia oficial: https://support.strava.com/es/articles/15401919-como-puedo-exportar-mis-datos-de-strava

## Estructura del proyecto

```text
raceestrategy-web/
├── frontend/                   # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/Brand.tsx
│   │   ├── pages/AuthPage.tsx
│   │   ├── pages/DashboardPage.tsx
│   │   ├── lib/api.ts
│   │   ├── lib/importStrava.ts   # Lee ZIP/CSV en navegador
│   │   ├── main.tsx
│   │   └── styles.css
│   └── vite.config.ts          # Proxy /api → localhost:3001
├── backend/                    # Node + Express + SQLite
│   ├── src.js                  # Cuentas, sesiones, OAuth e importación CSV
│   ├── strava-import.js        # Normalización y validación de activities.csv
│   ├── metrics.js              # Agregación de estadísticas
│   ├── tests/metrics.test.js
│   ├── tests/strava-import.test.js
│   ├── .env.example
│   └── data/                   # Creada localmente; ignorada por Git
└── README.md
```

## API del backend

| Ruta | Función |
|---|---|
| `POST /api/auth/register` | Crear cuenta |
| `POST /api/auth/login` | Acceder |
| `GET /api/auth/me` | Recuperar sesión |
| `POST /api/auth/logout` | Cerrar sesión |
| `DELETE /api/auth/account` | Eliminar cuenta y revocar conexión |
| `GET /api/strava/connect` | Ir a la página oficial OAuth |
| `GET /api/strava/callback` | Validar `state` y guardar tokens cifrados |
| `GET /api/strava/status` | Comprobar la vinculación |
| `GET /api/strava/overview` | Recibir estadísticas de las últimas 200 actividades |
| `DELETE /api/strava/disconnect` | Revocar Strava y borrar conexión |
| `POST /api/import/strava-csv` | Importar CSV (Content-Type: text/csv) |
| `GET /api/import/status` | Datos y fecha de la última importación |
| `GET /api/import/overview` | Dashboard de la importación histórica |
| `DELETE /api/import` | Eliminar actividades importadas |

### ¿Qué significan las estadísticas?

- **Actividades:** número de actividades de las 200 últimas devueltas por la API, o número de actividades válidas del CSV importado. Se excluyen actividades con distancia o duración no numérica.
- **Distancia:** suma de las distancias de esas actividades, en km. El CSV original de Strava suele indicar distancia en metros; si tu CSV difiere, las cifras pueden no coincidir.
- **Tiempo:** suma del tiempo en movimiento, en horas. En el CSV, los entrenamientos sin `Moving Time` cuentan como 0 h; se informa de cuántos faltan para no confundir tiempo transcurrido con tiempo en movimiento.
- **Desnivel:** suma del ascenso positivo informado por Strava.
- **Gráfico:** distribución de esas mismas actividades durante los últimos seis meses.
- **Deportes:** carrera, ciclismo, senderismo y otros; agrupación de los `sport_type` de Strava.

**En modo API** no son estadísticas históricas completas si la cuenta tiene más de 200 actividades. **En modo importación**, los totales se calculan sobre todas las filas válidas del CSV. Ninguno es resultado calculado por el modelo del TFM.

## Pruebas

En `backend/`:

```powershell
npm test
```

En `frontend/`:

```powershell
npm run build
```

## Seguridad, privacidad y despliegue

Este entregable es un **MVP local**, no un servicio listo para publicar en Internet sin revisión. Antes de desplegarlo para usuarios reales:

1. Configura HTTPS, cabeceras de seguridad y protección de intentos de inicio de sesión, monitorización y copias de seguridad del almacenamiento SQLite; en un hosting sin disco persistente tendrás que cambiar a una BD persistente.
2. Redacta una política de privacidad pública, condiciones de uso y contacto de soporte adecuados al RGPD; solicita consentimiento y explica qué datos se acceden, cómo y cómo revocarlos o eliminarlos.
3. Sigue las normas de marca de Strava y sustituye el botón visual por el **asset oficial «Connect with Strava»** (no incluido aquí); añade la atribución obligatoria que corresponda, incluida Garmin cuando proceda. Recursos: https://developers.strava.com/guidelines/
4. Para Netlify: el frontend puede seguir alojado allí, pero **Express + SQLite no se ejecutan como un sitio estático en Netlify**. Necesitarás alojar el backend en un servicio persistente (o adaptarlo a funciones serverless y una BD externa), configurar rutas `/api/*` como proxy seguro de mismo origen, URLs OAuth correctas y cookies `Secure` sobre HTTPS.
5. En este MVP, los datos recuperados por API se cachean **solo en memoria durante 15 min**; los datos importados manualmente **sí quedan guardados** en la SQLite por usuario. No se comparten entre usuarios ni se incluyen en el repositorio.
6. No uses las actividades de Strava descargadas mediante la API para entrenar el modelo de IA: el acuerdo actual de API de Strava lo **prohíbe**. Usa FitRec o datasets con licencia adecuada para el entrenamiento.

Documentación consultada: https://developers.strava.com/docs/authentication/ · https://developers.strava.com/docs/rate-limits/ · https://www.strava.com/legal/api · https://developers.strava.com/guidelines/

## Integración con el RaceEstrategy actual

Este paquete está aislado deliberadamente. Se ha podido inspeccionar una versión archivada de `RaceEstrategy` que contiene herramientas Python de `PruebaMostrarRutas`, pero **no confirmar su frontend React actual ni su árbol más reciente de GitHub**. Copia esta carpeta a una rama nueva, pruébala y después integra las rutas/componentes deseados en tu frontend real sin sobrescribir el visor de rutas.

Sugerencia de Git:

```powershell
git checkout -b feature/frontend-usuarios-strava
# Copia aquí la carpeta raceestrategy-web (sin .env ni data)
git add raceestrategy-web
git commit -m "feat: registro y dashboard con OAuth Strava"
```

### Prueba de importación sin usar tus datos personales

Puedes comprobar el flujo con `ejemplo_importacion/EJEMPLO_ACTIVIDADES_FICTICIAS.csv` o `ejemplo_importacion/EJEMPLO_STRAVA_FICTICIO.zip`. Son **cuatro entrenamientos inventados** solo para pruebas. Después usa el botón de borrar importación y selecciona el ZIP verdadero de tu cuenta Strava. No publiques el ZIP o CSV auténtico en GitHub.

## Cambio en v3 — corrección de actividades omitidas

En la versión anterior se omitían actividades válidas si no aparecía ninguna cifra legible de distancia, tiempo en movimiento o tiempo total. Ahora se conservan si tienen ID y fecha válidos. Sus métricas ausentes se almacenan como 0 (esto indica **dato no disponible**, no que realmente su distancia o tiempo haya sido 0). Al importar, despliega **Ver por qué se han omitido ... filas** para consultar los motivos y ejemplos. Se aceptan también fechas como `30 octubre 2026 08:20` y `Oct 30, 2026, 7:15:00 AM`.

Reimportar reemplaza la importación anterior por la nueva; **no borres `backend/data/` ni el `.env`** al actualizar código. Mantén el archivo `activities.csv` original sin editar, sobre todo si contiene IDs largos que Excel podría convertir a notación científica.

Si una actividad reciente no aparece en el CSV porque el ZIP se solicitó antes de registrarla, hace falta solicitar una exportación más reciente de Strava. El dashboard enseña solo las 8 actividades más recientes de las importadas, mientras las estadísticas agregadas incluyen todas.

## Entrega completa — solución a las pantallas en blanco

Este ZIP reúne **todo** el código de `frontend/` y `backend/` (no es un parche), incluidos los `package.json`, el `index.html`, todos los módulos TypeScript/React y los cálculos/lectura CSV del backend. Incluye la corrección del importador v3 y una pantalla de error visible si React falla durante el renderizado.

**Actualización desde una instalación anterior**

1. Detén las terminales en las que se ejecutaba `npm run dev`.
2. Renombra tu carpeta anterior `raceestrategy-web` a `raceestrategy-web_backup`.
3. Extrae el ZIP en la raíz del repositorio `RaceEstrategy`, de modo que quede una nueva carpeta `RaceEstrategy/raceestrategy-web/`.
4. Si ya creaste cuentas o importaste datos, copia desde la copia de seguridad `backend/data/` y `backend/.env` a esas mismas rutas de la **nueva** carpeta. Mantener la clave de `.env` es importante para recuperar una conexión Strava existente. No copies las carpetas `node_modules` antiguas.
5. En Windows, haz doble clic en `INICIAR_WINDOWS.bat`. El asistente verifica que estén los archivos, genera `.env` solo si falta, instala paquetes y abre las dos terminales.
6. Entra en **http://localhost:5173/** y, si ves la versión anterior, pulsa `Ctrl+F5`.

Si prefieres arrancar manualmente: ejecuta `npm install` y `npm run dev` **por separado** en `backend` y en `frontend`, manteniendo ambas terminales abiertas. Prueba `http://localhost:3001/api/health` para confirmar que el backend está disponible (responde con `ok: true`).

**Diagnóstico:** `node COMPROBAR_ARCHIVOS.cjs` revisa la presencia de los principales archivos del proyecto antes de instalar nada. Si vuelve a aparecer la página blanca o un aviso de error, copia el primer error rojo de **F12 → Consola** y lo que muestren ambas terminales.

El ZIP no incluye tu base de datos privada, tu `.env` ni los `node_modules`. La instalación de dependencias necesita conexión a Internet. Las pruebas de funciones de backend no requieren credenciales Strava; comprobar toda la aplicación visualmente y el OAuth de Strava requiere arrancarla con las dependencias instaladas y, para OAuth, tus propias credenciales.

## FASE 2 — Mis actividades

Se ha añadido una pantalla `/actividades`, con historial por usuario, selección entre exportación CSV y conexión API, búsqueda, filtros (deporte/fecha), ordenación, paginación (10/20/50) y detalle `/actividades/:id`. Los datos ausentes de distancia y tiempo aparecen como «No disponible» en el detalle, en vez de fingir que son cero. El historial importado se consulta en SQLite, sin volver a solicitar el CSV. La conexión actual con Strava consulta solo las 200 actividades más recientes.

**Instalación/actualización:** para actualizar una instalación anterior, primero haz copia de `backend/.env` y **toda** `backend/data` (incluidos ficheros `.sqlite`, `.sqlite-wal` y `.sqlite-shm`). Para no perder sesiones y usuarios, para ambos servidores antes de copiar/respaldar. Cambia la carpeta por la entrega completa y restaura `backend/.env` y `backend/data` antes de arrancar.

## Vista móvil, Netlify y limitaciones

El frontend es React + Vite. Para publicar **solo su parte estática**:

```powershell
cd raceestrategy-web\frontend
npm install
npm run build
```

Arrastra **`raceestrategy-web/frontend/dist`** a https://app.netlify.com/drop . El archivo `public/_redirects` se copia durante el build y permite recargar rutas como `/dashboard` sin error 404.

Puedes abrir en el despliegue las maquetas de diseño sin backend (solo datos ficticios):

- `/preview-dashboard.html` (dashboard ilustrativo)
- `/preview-registro.html` (formulario ilustrativo, no interactivo)

Importante: **la app real no funciona con un despliegue estático**. Para registro, inicio de sesión, importación de Strava y persistencia de usuarios se necesita desplegar y configurar un backend HTTPS y almacenamiento persistente. El backend Express actual y su SQLite local **no se despliegan arrastrando `dist` a Netlify**. No publiques `.env` ni `backend/data`.

Para probar el frontend con backend desde el móvil en la misma Wi-Fi, consulta la IP privada del ordenador (`ipconfig`) y, si es `192.168.1.35`, configura temporalmente `FRONTEND_URL=http://192.168.1.35:5173` en `backend/.env` y reinicia backend. Ejecuta el frontend con `npm run dev -- --host 0.0.0.0`. Entra desde el móvil a `http://192.168.1.35:5173`. Asegúrate de que el firewall permite conexiones entrantes desde la red privada. No abras puertos del router ni publiques el backend sin preparar antes una configuración de producción segura. La vinculación OAuth con Strava puede requerir una URL de retorno pública/registrada; para la prueba local usa la importación ZIP/CSV.


## Fase 2 — Mis actividades

Entra en `http://localhost:5173/actividades` después de iniciar sesión.

- Historial completo de la exportación de Strava que ya hayas importado.
- Si utilizas la API, se muestran como máximo las 200 actividades consultadas por la integración actual.
- Filtros por nombre, deporte, fechas; ordenación por fecha, distancia o duración; paginación.
- Detalle de actividad y ritmos/velocidad donde existan métricas válidas.
- Los datos se consultan únicamente para el usuario autenticado.

El archivo `FASE_2_Y_NETLIFY.txt` explica cómo probar la maqueta estática desde Netlify, incluso sin servidor.

### Prueba desde el móvil en la misma Wi-Fi

En `backend/.env`, mantén `FRONTEND_URL=http://localhost:5173` y agrega únicamente la IP local autorizada, por ejemplo:

```env
FRONTEND_ALLOWED_ORIGINS=http://192.168.1.35:5173
```

Arranca el frontend con `npm run dev -- --host 0.0.0.0`, reinicia el backend y entra desde el móvil en `http://IP_DEL_PC:5173`. El valor de la IP es un ejemplo; utiliza el que obtengas con `ipconfig`. No expongas estos servicios directamente a internet.

### Actualización segura desde la versión anterior

1. Apaga ambos servidores.
2. Renombra `raceestrategy-web` a `raceestrategy-web_backup`.
3. Extrae este ZIP en `RaceEstrategy` para recrear `raceestrategy-web`.
4. Copia desde el backup `backend/.env` y **todo** `backend/data` con los servidores apagados.
5. Ejecuta `INICIAR_WINDOWS.bat`.

No borres la copia hasta comprobar que funcionan el login, el resumen y el listado de actividades.
