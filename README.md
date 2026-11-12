# RaceEstrategy

RaceEstrategy es un proyecto de análisis de actividad deportiva. Reúne herramientas para preparar y auditar datos de entrenamiento, visualizar recorridos GPS y consultar estadísticas personales desde una aplicación web integrada con Strava.

El repositorio contiene análisis de datos y una aplicación web funcional. Los conjuntos `Gold` preparan experimentos de Machine Learning. La web incluye un laboratorio experimental: usa un Random Forest preentrenado para estimar tiempos de carrera, cálculos estadísticos para otros modos y un servicio Gemini separado para recomendaciones de rutas. **La aplicación no entrena modelos durante su uso.**

## Funcionalidades

- Procesamiento de actividades deportivas en formatos `.FIT` y `.GPX`.
- Limpieza y estandarización de métricas como distancia, duración, velocidad y desnivel.
- Análisis exploratorio y auditorías de calidad sobre actividades y series temporales de FitRec.
- Generación de conjuntos de datos separados por disciplina para análisis y modelado.
- Visualización de rutas y perfiles deportivos a partir de GPX, FIT/FIT.GZ, PLT y FitRec.
- Aplicación web con cuentas de usuario, dashboard, historial de actividades y perfil deportivo.
- Conexión opcional con Strava mediante OAuth 2.0 o importación manual de una exportación ZIP/CSV.

## Componentes del repositorio

| Carpeta | Contenido |
|---|---|
| [`analisis_datos/`](./analisis_datos/) | Scripts de análisis exploratorio (EDA), validación de datos y auditoría de series temporales, principalmente sobre FitRec. |
| [`entrega de datos/`](./entrega%20de%20datos/) | Pipeline ETL local Bronze → Silver → Gold y documentación de las fuentes, preparación y variables. |
| [`GPX/`](./GPX/) | Herramientas auxiliares relacionadas con recorridos y datos GPX. |
| [`PruebaMostrarRutas/`](./PruebaMostrarRutas/) | Visor interactivo de rutas y actividades deportivas. Incluye sus propias instrucciones de uso. |
| [`informes_md/`](./informes_md/) | Informes consolidados de análisis, calidad y series temporales. |
| [`raceestrategy-web/`](./raceestrategy-web/) | Aplicación web React/TypeScript y API Node.js/Express con SQLite. Consulta su [README](./raceestrategy-web/README.md) para instalación y configuración detalladas. |

## Tecnologías

### Análisis y preparación de datos

- Python 3.
- Pandas y NumPy para análisis de datos.
- `fitparse` para lectura de archivos Garmin FIT.
- XML, CSV y JSON/JSON.GZ para las distintas fuentes de actividad.
- Transformaciones reproducibles y exportación a CSV.

### Visor geográfico

- Python 3.10 o posterior.
- Visualización en HTML de recorridos GPS y métricas derivadas.
- Admite GPX, Garmin FIT/FIT.GZ, GeoLife PLT y registros de FitRec.
- Usa cartografía OpenFreeMap/MapLibre; la visualización del mapa requiere conexión a Internet.

### Aplicación web

- Frontend: React 18, TypeScript 5, Vite 6, React Router y Recharts.
- Backend: Node.js 20 o posterior, Express 4 y SQLite (`better-sqlite3`).
- Autenticación con contraseñas protegidas mediante bcrypt y sesiones en cookies HttpOnly.
- Integración con Strava API v3 y OAuth 2.0.

## Flujo de datos

El proceso de preparación local se organiza en tres capas:

1. **Bronze / Raw:** archivos fuente de actividad, conservados como entrada del proceso.
2. **Silver:** datos validados y homogeneizados; se normalizan unidades, se clasifican deportes y se aplican filtros básicos de calidad.
3. **Gold:** tablas seleccionadas por disciplina para análisis o experimentos de Machine Learning.

El ETL de `entrega de datos/etl_bronze_silver_gold.py` procesa archivos `.gpx` y `.fit` ubicados en `GPX/activities/` y genera `silver_actividades.csv`, `gold_ciclismo.csv` y `gold_running_caminata.csv` en `entrega de datos/`.

Los análisis de FitRec se ejecutan con scripts específicos en `analisis_datos/`. Sus informes advierten que las alertas de calidad son indicadores para revisión y que las métricas GPS sin filtrar pueden contener valores atípicos; consulta los informes antes de interpretar o reutilizar resultados.

## Empezar

### Preparación de datos locales

Instala los requisitos del ETL:

```bash
python -m pip install fitparse
```

Coloca los archivos `.gpx` y `.fit` que quieras procesar en `GPX/activities/` y ejecuta desde la raíz:

```bash
python "entrega de datos/etl_bronze_silver_gold.py"
```

Para análisis de FitRec o visualización de recorridos, consulta las instrucciones específicas:

- [Preparación de datos](./docs/entregas/02_datos_y_preparacion.md)
- [Visor de rutas](./PruebaMostrarRutas/README.md)

### Aplicación web

El frontend y el backend se instalan por separado. Desde `raceestrategy-web/backend/` y `raceestrategy-web/frontend/`, ejecuta `npm install` y luego `npm run dev` en cada paquete. La configuración, variables de entorno y opciones de Strava están descritas en el [README de la aplicación web](./raceestrategy-web/README.md).

## Pruebas

La API web incluye pruebas automatizadas con el ejecutor integrado de Node.js:

```powershell
cd raceestrategy-web\backend
npm test
```

La compilación del frontend comprueba TypeScript y genera los archivos estáticos:

```powershell
cd raceestrategy-web\frontend
npm run build
```

## Datos, privacidad y licencias

- Los archivos de actividad pueden contener información sensible, como ubicaciones, horarios, métricas fisiológicas e identificadores. No publiques exportaciones personales, credenciales ni archivos `.env`.
- Los datos FitRec son para investigación académica y tienen condiciones de uso propias. No redistribuyas el conjunto original; verifica sus términos y cita la fuente antes de utilizarlo.
- Las actividades obtenidas mediante Strava API están sujetas a los términos de Strava. No las uses para entrenar modelos de IA; consulta las políticas vigentes de la plataforma.
- Los datos de rutas externas, como GeoLife o rutas IMBA/CNIG, conservan las licencias y requisitos de atribución de sus respectivos proveedores.
- El repositorio es un proyecto académico/prototipo, no un servicio listo para producción. La aplicación web requiere configuración segura, HTTPS, almacenamiento persistente y una revisión de privacidad antes de exponerse públicamente.

## Documentación adicional

- [Informe consolidado de análisis FitRec](./informes_md/informe_analisis_completo.md)
- [Documentación de preparación de datos](./docs/entregas/02_datos_y_preparacion.md)
- [Machine Learning y EDA](./docs/entregas/03_Machine_Learning.md)
- [README de la aplicación web](./raceestrategy-web/README.md)
- [README del visor de rutas](./PruebaMostrarRutas/README.md)