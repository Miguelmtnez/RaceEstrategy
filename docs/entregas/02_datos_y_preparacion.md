# Entrega 02 — Datos y preparación

## Objetivo y alcance

Este documento describe las fuentes, variables y controles de preparación de
RaceEstrategy, a partir del PDF de la entrega y de los scripts y resultados que
están en el repositorio. La unidad de análisis prevista para la capa Gold es
una actividad deportiva completada; para estudios de esfuerzo también pueden
analizarse sus series temporales.

La preparación produce datos para análisis y experimentos de Machine Learning;
por sí sola no entrena un modelo. El identificador de atleta debe conservarse
como grupo de validación para separar entrenamiento y prueba por persona y
reducir la fuga de datos (*data leakage*).

## Fuentes de datos

| Fuente | Volumen indicado en la entrega | Formato | Uso |
|---|---:|---|---|
| Actividades de campo Garmin outdoor | 529 | FIT | Actividades multianuales; algunos dispositivos proporcionan altimetría barométrica y registros de alta frecuencia. |
| Entrenamientos indoor | 81 | FIT | Rodillo o entrenamiento estático, sin GPS necesariamente. |
| Exportación de actividades Strava | 434 | GPX | Recorridos con datos GPS y etiquetas de actividad. |
| FitRec / Endomondo | 229.413 actividades de 1.090 usuarios | JSON por registro, también distribuido como JSON comprimido | Análisis de carrera, ciclismo y MTB; sus registros incluyen señales como GPS, tiempo, altitud y frecuencia cardiaca. |
| Referencias topográficas CNIG/IMBA | Catálogo de referencia | Datos vectoriales | Contraste de perfiles de ruta; no es una fuente de sesiones de entrenamiento. |

El PDF desglosa las 229.413 actividades iniciales de FitRec en 117.902 de
carrera, 98.001 de ciclismo y 13.510 de MTB. En la auditoría de calidad
posterior, 229.190 pasan los controles básicos: 117.819 de carrera, 97.865 de
ciclismo y 13.506 de MTB. El informe de auditoría con los recuentos por
modalidad está en
[resultados_fusionado_20261030/calidad/informe_calidad.md](../../analisis_datos/resultados_fusionado_20261030/calidad/informe_calidad.md).

El archivo original completo de FitRec no está incluido en el repositorio. Los
scripts permiten indicar una copia local autorizada; no se debe publicar ni
redistribuir el conjunto bruto sin comprobar sus condiciones de acceso y uso.
El repositorio sí contiene informes, resultados derivados y muestras Gold.

## Variables y unidades

La selección Gold local conserva estas columnas:

| Campo | Unidad / significado |
|---|---|
| `id_actividad` | Identificador de la actividad. Se conserva en los CSV de muestra y puede ser enlazable. |
| `id_atleta` | Identificador seudónimo del atleta, útil para agrupar la validación. |
| `fecha_inicio` | Fecha y hora de inicio; las muestras usan UTC (`Z`). |
| `deporte`, `sub_deporte` | Modalidad y subtipo normalizados. |
| `distancia_km` | Distancia en kilómetros. |
| `desnivel_positivo_m` | Ascenso acumulado en metros. |
| `ratio_subida_m_km` | Ascenso positivo dividido por distancia, en metros por kilómetro. |
| `velocidad_media_kmh` | Velocidad media en kilómetros por hora. |
| `duracion_min`, `duracion_segundos` | Duración en minutos y segundos. |

Frecuencia cardiaca, potencia, cadencia y temperatura son variables deseables
para análisis más detallados cuando la fuente las proporciona. No forman parte
de las columnas de los CSV Gold locales actuales.

## Flujo Bronze → Silver → Gold

### Bronze — datos de entrada

El ETL local lee ficheros `.gpx` y `.fit` desde `GPX/activities/`. Extrae
distancia, duración, deporte, fecha y desnivel disponible; las entradas
originales no se modifican. El script local no procesa directamente el JSON
bruto de FitRec.

Para FitRec se usan scripts separados que aceptan un archivo JSON por línea o
`.json.gz`, clasifican las modalidades objetivo y generan resúmenes para EDA y
auditoría.

### Silver — limpieza, controles y normalización

El ETL local convierte las unidades a kilómetros, minutos, segundos,
kilómetros por hora y metros por kilómetro. En su código descarta actividades
con distancia inferior a 200 m o duración inferior a 120 s. También descarta
velocidades fuera de estos rangos:

- Ciclismo: de 3 a 100 km/h.
- Carrera y caminata: de 1 a 35 km/h.

Para FitRec, `eda_fitrec_filtrado.py` crea resúmenes y conserva la modalidad y
el usuario. Después, `eda_calidad_fitrec.py` señala problemas básicos de
duración, distancia, número de marcas temporales y consistencia de las listas
GPS. Las comprobaciones de saltos GPS superiores a 2 km, velocidades altas,
fechas y duraciones superiores a 24 horas son **alertas para revisar**, no
borrados automáticos. Un salto GPS aislado no demuestra por sí mismo que la
actividad sea incorrecta. El informe disponible registra 1.635 alertas de
saltos superiores a 2 km.

**Diferencia entre el PDF y el código:** el PDF enumera duraciones superiores a
24 horas entre los filtros. En el código actual, el ETL local no impone ese
límite; la auditoría FitRec lo marca para revisión. Por tanto, no debe
interpretarse como una regla de descarte aplicada automáticamente a todas las
fuentes.

### Gold — tablas de análisis y modelado

Los CSV locales que están en el repositorio contienen 951 actividades Silver:
934 de ciclismo en `gold_ciclismo.csv` y 17 de carrera/caminata en
`gold_running_caminata.csv`. Son los resultados del ETL local, no los
229.190 registros de FitRec.

El PDF describe adicionalmente estos conjuntos FitRec después de los controles
básicos:

| Modalidad FitRec | Actividades candidatas válidas indicadas |
|---|---:|
| Carrera | 117.819 |
| Ciclismo | 97.865 |
| MTB | 13.506 |
| **Total** | **229.190** |

Estos recuentos proceden de los resultados de EDA y auditoría. El ETL
`etl_bronze_silver_gold.py` no genera esos CSV Gold FitRec: procesa los FIT y
GPX locales. El script `generar_75k.py` es una etapa separada de selección e
integración; actualmente contiene una ruta absoluta local al archivo
`endomondoHR.json.gz`, por lo que requiere ajustar esa ruta antes de ejecutarlo
en otro equipo.

## Reproducir la preparación

### FIT y GPX locales

Desde la raíz del repositorio, instala el lector FIT y coloca los ficheros de
entrada en `GPX/activities/`:

```powershell
python -m pip install fitparse
python "entrega de datos\etl_bronze_silver_gold.py"
```

El script escribe o reemplaza `silver_actividades.csv`,
`gold_ciclismo.csv` y `gold_running_caminata.csv` dentro de `entrega de datos/`.
Guarda una copia si no quieres sobrescribir los resultados actuales.

### FitRec / Endomondo

Obtén el archivo bruto desde una fuente autorizada y guárdalo localmente; no
hace falta añadirlo a Git. Instala las dependencias de análisis y ejecuta el
filtrado pasando su ruta:

```powershell
python -m pip install pandas numpy matplotlib
python "analisis_datos\eda_fitrec_filtrado.py" "C:\ruta\endomondoHR.json.gz" --max 0 --salida "analisis_datos\resultados_filtrados"
python "analisis_datos\eda_calidad_fitrec.py" "analisis_datos\resultados_filtrados\resumen_actividades.csv" --salida "analisis_datos\resultados_calidad"
```

`--max 0` indica procesar todos los registros; sin ese argumento, el script
usa un máximo de 10.000. Los resultados incluyen recuentos, resúmenes por
usuario y modalidad, alertas e informes. La auditoría no sustituye la revisión
manual de los registros marcados.

El script `generar_75k.py` requiere además `actividades_20_columnas.csv` y
busca FitRec en `C:\Users\migue\Downloads\endomondoHR.json.gz` según su
configuración actual. Antes de usarlo, adapta esa ruta y verifica que el CSV
de entrada corresponda al lote que quieres procesar.

## Muestras y artefactos disponibles

- [Muestra Gold de ciclismo](../../entrega%20de%20datos/muestra_gold_ciclismo.csv)
- [Muestra Gold de carrera y caminata](../../entrega%20de%20datos/muestra_gold_running.csv)
- [Gold local de ciclismo](../../entrega%20de%20datos/gold_ciclismo.csv)
- [Gold local de carrera y caminata](../../entrega%20de%20datos/gold_running_caminata.csv)
- [Silver local](../../entrega%20de%20datos/silver_actividades.csv)
- [ETL local Bronze → Silver → Gold](../../entrega%20de%20datos/etl_bronze_silver_gold.py)
- [EDA inicial de FitRec](../../analisis_datos/eda_fitrec.py)
- [EDA FitRec filtrado por modalidad](../../analisis_datos/eda_fitrec_filtrado.py)
- [Auditoría de calidad FitRec](../../analisis_datos/eda_calidad_fitrec.py)
- [Auditoría de series temporales](../../analisis_datos/eda_series_detalle.py)
- [PDF de la entrega](../../entrega%20de%20datos/RaceEstrategy_MiguelMartinezMiguelGambin.pdf)
- [README del repositorio](../../README.md)

Las muestras no incluyen la serie GPS completa, pero conservan
`id_actividad`, fechas y un identificador de atleta seudónimo. Deben tratarse
como datos potencialmente enlazables, no como datos anónimos garantizados.

## Privacidad, sesgo y limitaciones

- El código local genera `id_atleta` mediante un prefijo corto de SHA-256 del
  identificador de origen. Esto es **seudonimización**, no anonimización
  irreversible garantizada; los CSV conservan además `id_actividad`.
- El PDF menciona recortar 500 m al inicio y final para proteger domicilios.
  Esa máscara no aparece implementada en el ETL local enlazado aquí. No se
  deben publicar tracks GPS sin aplicar y verificar esa protección.
- Edad y peso no forman parte de las columnas Gold locales. Aun así, hay que
  revisar los datos brutos antes de compartirlos.
- La presencia de listas de frecuencia cardiaca o altitud no garantiza que
  todas sus mediciones sean válidas. Hay que comprobar longitudes, tiempos,
  unidades y valores atípicos.
- Para evaluar modelos, separar los datos por `id_atleta`/`usuario`; una
  partición aleatoria de actividades podría colocar sesiones de la misma
  persona tanto en entrenamiento como en prueba. Los scripts de preparación
  descritos aquí no implementan por sí mismos esa validación ni entrenan un
  modelo.
- Los recuentos FitRec son los reflejados en la entrega y sus informes
  guardados. Para reproducirlos desde el origen se necesita acceso local al
  dataset y ejecutar los scripts con ese archivo.

Para más contexto del proyecto y sus instrucciones generales, consulta el
[README principal](../../README.md). Las condiciones de uso del dataset FitRec
y de las actividades exportadas deben respetarse antes de reutilizar o
redistribuir cualquier dato.
