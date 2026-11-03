# RaceEstrategy — Fase 3: perfil deportivo

Esta entrega completa añade `/perfil` al menú y a las rutas del frontend, y el endpoint autenticado `GET /api/profile?source=import|api&sport=all|run|cycle|mtb|hike|other` en el backend.

## Incluye

- Historial de todas las actividades importadas, o hasta 200 de la API actual.
- Filtros independientes para carrera, bicicleta, MTB, senderismo y otros.
- Estadísticas globales del historial seleccionado (número, distancia, tiempo, desnivel).
- Gráficos de los últimos 12 meses y 12 semanas.
- Comparación de los últimos 30 días con los 30 anteriores.
- Mediana de ritmos y velocidades de actividades con métricas plausibles.
- Indicador descriptivo de constancia de los últimos 90 días. **No es IA, ni valoración médica, ni nivel físico objetivo**.
- Tratamiento conservador de métricas ausentes.

## Cómo instalar (Windows)

1. Detén el backend y frontend antiguos.
2. Cambia el nombre de la carpeta `raceestrategy-web` antigua a `raceestrategy-web_backup`.
3. Extrae este ZIP en la raíz `RaceEstrategy`, de modo que quede `RaceEstrategy/raceestrategy-web`.
4. Si tenías usuarios, copia **solo** `raceestrategy-web_backup/backend/data/` y `raceestrategy-web_backup/backend/.env` a las rutas equivalentes de la nueva carpeta (no borres la antigua hasta comprobar la nueva).
5. Abre `raceestrategy-web/INICIAR_WINDOWS.bat`, o ejecuta `npm install` y `npm run dev` por separado dentro de `backend` y `frontend`.
6. Entra en `http://localhost:5173`, inicia sesión y pulsa **Perfil deportivo** o ve a `http://localhost:5173/perfil`.

La base de datos existente no se migra ni se modifica estructuralmente. El nuevo perfil se calcula de manera temporal cuando abres la pantalla. Para la opción de importación ZIP no necesitas configurar la API de Strava.

## Vista previa móvil sin backend

Puedes ejecutar `npm run build` en `frontend`, subir la carpeta `frontend/dist` a Netlify y abrir `https://tu-sitio.netlify.app/preview-perfil.html`. Esta página es **una maqueta estática con datos ficticios**, útil para ver el estilo desde el móvil; las funciones reales requieren un backend accesible.

## Comprobación de calidad

- Ejecuta `node COMPROBAR_ARCHIVOS.cjs` desde la carpeta `raceestrategy-web`.
- Ejecuta `npm test` dentro de `backend` para comprobar el motor de estadísticas.
- Ejecuta `npm run build` dentro de `frontend` en tu ordenador antes de publicar.

El código se ha comprobado con las pruebas unitarias y análisis sintáctico. El entorno de preparación no tuvo acceso al registro de npm para ejecutar el build de producción; debes verificar ese paso localmente.

## Precauciones

La importación antigua representa algunos valores ausentes como cero en SQLite: en el panel se marcan como indisponibles para los cálculos de ritmo y como filas sin métricas. El informe del perfil no permite reconstruir si un cero original era una medición real. Para disponer de datos más fiables, habrá que implementar una migración que preserve `NULL` en el futuro, sin sobrescribir históricos existentes.

La conexión mediante API sigue limitada a las últimas 200 actividades. Las estadísticas no combinan la API y el ZIP, para evitar duplicaciones. Ninguna actividad de la API de Strava se utiliza para entrenar IA; se reserva para visualización y estadísticas.
