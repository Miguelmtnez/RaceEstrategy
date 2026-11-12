# Entrega 03 — Machine Learning, EDA y laboratorio

Este documento reúne los componentes del repositorio relacionados con análisis
exploratorio, preparación de datos y Machine Learning, y distingue el modelo
entrenado de los cálculos estadísticos y la IA generativa. Para las fuentes,
unidades y el flujo local Bronze → Silver → Gold, consulta también
[02 — Datos y preparación](./02_datos_y_preparacion.md).

## Resumen ejecutivo

En RaceEstrategy hay varias piezas diferentes que la interfaz agrupa bajo
«Laboratorio IA»:

1. **Machine Learning entrenado:** un Random Forest de 60 árboles para estimar
   la duración de una ruta de carrera. El modelo está incluido como artefacto
   JSON y se ejecuta en el backend. La aplicación no contiene el código de
   entrenamiento.
2. **Métodos estadísticos:** una ficha deportiva basada en percentiles de
   referencia y proyecciones basadas en resultados propios anteriores. No son
   modelos ML entrenados por la aplicación.
3. **IA generativa:** generación externa de propuestas de ruta mediante Gemini.
   Es un servicio independiente del Random Forest.
4. **EDA:** scripts Python que describen FitRec/Endomondo y auditan sus
   registros y series temporales. No entrenan modelos ni corrigen o eliminan
   automáticamente las anomalías detectadas.

## 1. EDA de FitRec / Endomondo

El EDA estudia el archivo `endomondoHR.json.gz` registro a registro. La fuente
original no se incluye en el repositorio; los scripts reciben su ubicación por
parámetro. Los resultados analíticos y los informes generados sí están
disponibles en `analisis_datos/`.

### Fases y scripts

| Fase | Script | Qué hace |
|---|---|---|
| Exploración general | [eda_fitrec.py](../../analisis_datos/eda_fitrec.py) | Cuenta deportes y usuarios, revisa presencia de campos, resume distribuciones de duración/distancia y genera gráficas. Lee JSON por línea o `.json.gz`. |
| Selección por deporte | [eda_fitrec_filtrado.py](../../analisis_datos/eda_fitrec_filtrado.py) | Conserva las etiquetas exactas `run`, `bike` y `mountain bike`, calcula resúmenes y excluye otras etiquetas de deporte del conjunto filtrado. |
| Auditoría de calidad | [eda_calidad_fitrec.py](../../analisis_datos/eda_calidad_fitrec.py) | Marca datos básicos inválidos y advertencias (saltos, velocidad, fecha y duración) y produce informes CSV/texto. No elimina registros automáticamente. |
| Auditoría de series | [eda_series_fitrec.py](../../analisis_datos/eda_series_fitrec.py) | Selecciona una muestra dirigida de actividades con alertas y controles sin alertas; compara GPS, timestamps, altitud y frecuencia cardiaca. No es una muestra representativa. |
| Diagnóstico por intervalo | [eda_series_detalle.py](../../analisis_datos/eda_series_detalle.py) | Examina punto a punto los registros de la muestra: alineación de listas, tiempos, huecos, saltos GPS/altitud, velocidad y valores de FC. No reordena, corrige ni elimina puntos. |

### Resultados registrados

Los siguientes valores corresponden a los informes versionados; no son una
medición ejecutada en tiempo real al abrir la aplicación.

**Exploración general**

- Archivo original: 253.020 registros y 1.104 usuarios identificados.
- El EDA general encontró 100 % de presencia de las listas de GPS, altitud y
  frecuencia cardiaca. Esto indica presencia de campos, no que todos sus
  valores o longitudes sean válidos.
- Se detectaron 1.822 actividades con al menos un salto GPS superior a 2 km en
  esa exploración inicial. El salto se considera una señal para revisar, no una
  prueba automática de error.

**Conjunto filtrado por modalidad**

- 229.413 actividades de `run`, `bike` y `mountain bike`; 23.607 registros de
  otras etiquetas quedan fuera del resumen filtrado.
- Distribución: 117.902 carrera, 98.001 ciclismo y 13.510 MTB.
- Usuarios del conjunto filtrado: 1.090.
- La velocidad original solo está presente en aproximadamente el 20,2 %; la
  velocidad derivada de distancia y tiempo debe tratarse con cautela cuando
  estas magnitudes contienen anomalías.

**Auditoría de calidad**

- 223 registros no pasan los controles básicos de tiempo, distancia, marcas
  temporales o longitudes GPS; quedan 229.190 candidatos básicos.
- Se registran 3.104 actividades con al menos una advertencia. Las alertas se
  solapan y no se deben sumar como si fueran actividades distintas.
- Entre las alertas: 1.635 actividades con un salto GPS >2 km, 134 con
  velocidad media sospechosa, 1.008 fechas a revisar y 475 duraciones >24 h.
- Un salto >2 km puede deberse a un hueco temporal o una pausa; el indicador no
  decide por sí solo si se descarta la actividad.

**Auditoría de series temporales**

- Se revisaron 536 actividades seleccionadas de forma dirigida: 207 de
  carrera, 196 de bicicleta y 133 de MTB. Esta muestra sobrerrepresenta
  advertencias y **no permite estimar tasas para todo FitRec**.
- En la muestra se detectaron 65 actividades con intervalos temporales no
  positivos, 223 con huecos >10 min, 102 con tramos de velocidad sospechosa,
  32 con saltos GPS acompañados de velocidad sospechosa, 46 con saltos de
  altitud >100 m y 5 con pulsaciones no plausibles.
- El diagnóstico detallado encontró 11.888 intervalos marcados en 340 de las
  536 actividades. Una actividad puede tener varios intervalos o alertas.

### Informes y artefactos EDA

- [Informe consolidado FitRec](../../analisis_datos/resultados_fusionado_20261030/informe_analisis_completo.md)
- [Informe EDA general](../../analisis_datos/resultados_fusionado_20261030/eda_general/informe.md)
- [Informe EDA filtrado](../../analisis_datos/resultados_fusionado_20261030/eda_filtrado/informe.md)
- [Informe de calidad](../../analisis_datos/resultados_fusionado_20261030/calidad/informe_calidad.md)
- [Informe de auditoría de series](../../analisis_datos/resultados_fusionado_20261030/series/informe_series.md)
- [Informe de detalle por intervalo](../../analisis_datos/resultados_fusionado_20261030/detalle/informe_detalle.md)

Los directorios `informes_md/` contienen además copias de informes convertidos
para lectura. Algunos CSV de diagnóstico conservan IDs de actividad/usuario:
no deben publicarse junto con el FitRec original.

### Reproducir el EDA

Desde la raíz del repositorio, instala las dependencias Python del análisis y
proporciona la ruta local autorizada al archivo FitRec:

```powershell
python -m pip install pandas numpy matplotlib
python "analisis_datos\eda_fitrec_filtrado.py" "C:\ruta\endomondoHR.json.gz" --max 0 --salida "analisis_datos\resultados_filtrados"
python "analisis_datos\eda_calidad_fitrec.py" "analisis_datos\resultados_filtrados\resumen_actividades.csv" --salida "analisis_datos\resultados_calidad"
```

`--max 0` solicita procesar todos los registros; el valor predeterminado es
10.000. Para auditar las series, el script
`eda_series_fitrec.py` recibe además el JSON original, el resumen y el CSV de
alertas; luego `eda_series_detalle.py` recibe la muestra creada por esa fase.
Ambos aceptan `--help` para mostrar sus argumentos.

## 2. Preparación de datos para análisis y ML

### ETL local Bronze → Silver → Gold

[etl_bronze_silver_gold.py](../../entrega%20de%20datos/etl_bronze_silver_gold.py)
procesa los FIT y GPX locales de `GPX/activities/`; no procesa directamente
el JSON bruto de FitRec. Sus salidas actuales contienen 951 registros Silver:
934 de ciclismo y 17 de carrera/caminata.

El ETL descarta actividades inferiores a 200 m o 120 segundos y aplica rangos
de velocidad plausibles por categoría. Convierte a unidades comunes y genera
`id_atleta` como seudónimo. Los CSV preparados son:

- [Silver local](../../entrega%20de%20datos/silver_actividades.csv)
- [Gold local de ciclismo](../../entrega%20de%20datos/gold_ciclismo.csv)
- [Gold local de carrera/caminata](../../entrega%20de%20datos/gold_running_caminata.csv)
- [Muestra Gold de ciclismo](../../entrega%20de%20datos/muestra_gold_ciclismo.csv)
- [Muestra Gold de carrera/caminata](../../entrega%20de%20datos/muestra_gold_running.csv)

Para más detalle sobre fuentes, columnas y ejecución reproducible, consulta
[02 — Datos y preparación](./02_datos_y_preparacion.md).

### Selección adicional de 75.000 registros

[generar_75k.py](../../entrega%20de%20datos/generar_75k.py) selecciona
actividades a partir de `actividades_20_columnas.csv`, prioriza las actividades
Garmin y busca en el archivo FitRec la altitud de registros seleccionados. Usa
una semilla fija para la selección. La ruta del JSON de entrada está
configurada actualmente como `C:\Users\migue\Downloads\endomondoHR.json.gz`;
hay que cambiarla para otro equipo. Este script no forma parte del ETL local
Gold descrito arriba.

## 3. Machine Learning entrenado: estimación de carrera

### Modelo e inferencia

[modelo_carrera.json](../../raceestrategy-web/backend/ml-model/modelo_carrera.json)
es un artefacto versionado de un Random Forest para la modalidad Carrera.
Contiene 60 árboles, el formato `raceestrategy-rf-logpace-v1` y los metadatos
`approved_for_beta=true` y `test_mae_minutes=6.1796` (aprox. 6,18 minutos).
El error reportado corresponde al conjunto de prueba del modelo; no garantiza
ese margen para cada persona o recorrido, y el protocolo completo de
evaluación no está incluido aquí.

[ml-predict.js](../../raceestrategy-web/backend/ml-predict.js) implementa la
inferencia del bosque y prepara nueve variables:

1. Distancia de la ruta objetivo.
2. Ascenso por kilómetro.
3. Descenso por kilómetro.
4. Número de actividades anteriores válidas.
5. Mediana del ritmo de las últimas 10 actividades.
6. Percentil 75 de distancia de las últimas 30 actividades.
7. Mediana del ascenso por kilómetro de las últimas 30 actividades.
8. Kilómetros acumulados en los últimos 28 días.
9. Días desde la actividad más reciente.

El modelo promedia árboles sobre el logaritmo del ritmo y convierte la salida
en una duración estimada para la distancia objetivo. El código calcula también
un baseline basado en la mediana reciente del usuario.

El modelo se generó fuera de la aplicación a partir de FitRec; el repositorio
incluye el artefacto y su ejecutor, no un pipeline completo para reentrenar ni
la evaluación detallada del entrenamiento. El contrato y el artefacto se
describen en el [README del modelo](../../raceestrategy-web/backend/ml-model/README.md).

### Entrada y límites de la predicción

La predicción se habilita con al menos cinco actividades válidas de carrera
anteriores a la fecha objetivo. El backend limita y valida fechas, distancia,
desniveles, duración y ritmos; no utiliza actividades posteriores al día de la
ruta. La predicción acepta únicamente historial aportado voluntariamente
mediante archivo FIT o exportación manual y consentimiento explícito. No lee la
API de Strava.

## 4. Métodos del Laboratorio que no son ML entrenado

La interfaz presenta varios métodos bajo «Laboratorio IA». Es importante
identificar el método concreto utilizado por cada modo:

| Funcionalidad | Implementación | Clasificación |
|---|---|---|
| Carrera — rodaje | Random Forest de carrera aplicado al historial seleccionado | **ML entrenado** |
| Carrera — competición | Marca manual anterior y ecuación de Riegel (exponente 1,06) | Proyección matemática; no estima la forma actual |
| Bicicleta, MTB y senderismo — rodaje | Mediana de tiempos anteriores comparables, escalados linealmente por distancia | Estadística descriptiva; no hay modelo ML entrenado |
| Ficha deportiva | Percentiles de referencia FitRec para resistencia, velocidad, desnivel y constancia | Comparación estadística; no es ML |
| Sugerencia del tipo de actividad | Reglas sobre el nombre de la actividad | Heurística, no clasificador aprendido |
| Recomendación de rutas | Solicitud a Gemini con parámetros de ruta y resumen de actividades | IA generativa externa; no es el Random Forest del proyecto |

### Proyecciones estadísticas

- [ml-race-projection.js](../../raceestrategy-web/backend/ml-race-projection.js)
  usa una competición anterior confirmada manualmente y de distancia
  comparable. No corrige por terreno, desnivel, fatiga, clima ni estado
  reciente; incluye advertencias al usuario.
- [ml-sport-projection.js](../../raceestrategy-web/backend/ml-sport-projection.js)
  compara las actividades anteriores seleccionadas del mismo deporte. Requiere
  al menos tres sesiones comparables de dos días distintos, elige hasta diez y
  devuelve la mediana de la duración escalada por distancia.
- [ml-rating.js](../../raceestrategy-web/backend/ml-rating.js) compara
  indicadores de la persona con percentiles de
  [ml-rating-reference.json](../../raceestrategy-web/backend/ml-rating-reference.json).
  La referencia estática se describe como perfiles FitRec 2010–2016; no se
  entrena ni actualiza durante el uso. El rating usa el historial manual
  completo, no solo las sesiones seleccionadas para una predicción. Senderismo
  no tiene referencia de rating.

### Recomendación generativa

[route-recommender.js](../../raceestrategy-web/backend/routes/route-recommender.js)
envía a Gemini parámetros de ruta y un resumen de hasta diez actividades
recientes para generar una recomendación textual. Requiere `GEMINI_API_KEY` en
el servidor. Es un servicio de generación de texto separado del predictor
personal de tiempos; sus respuestas deben verificarse, especialmente los
topónimos y enlaces de rutas.

## 5. Integración del Laboratorio web

La página
[MLPage.tsx](../../raceestrategy-web/frontend/src/pages/MLPage.tsx) permite
seleccionar modalidad e historial, importar actividades manualmente, elegir
una ruta y pedir una estimación o referencia. Los componentes
[MLActivityPicker.tsx](../../raceestrategy-web/frontend/src/components/MLActivityPicker.tsx)
y
[SportsRatingCard.tsx](../../raceestrategy-web/frontend/src/components/SportsRatingCard.tsx)
presentan la selección de actividades y la ficha deportiva.

El backend agrupa las rutas protegidas en
[ml-owned-routes.js](../../raceestrategy-web/backend/ml-owned-routes.js), que se
monta desde [src.js](../../raceestrategy-web/backend/src.js). Incluye:

- Diagnóstico de historial manual y perfil por deporte.
- Importación y selección de actividades de FIT o de `activities.csv` de un
  ZIP descargado manualmente.
- Clasificación de actividades y confirmación de competiciones.
- Parseo de archivos GPX/FIT o enlaces de Google Maps para obtener datos de
  ruta.
- Consulta de rating y proyección/predicción según el deporte y el objetivo.
- Eliminación del historial del Laboratorio.

El almacenamiento de las actividades del Laboratorio conserva resúmenes
deportivos, no las series GPS ni las pulsaciones, y está asociado al usuario
autenticado. La reutilización de archivos requiere consentimiento explícito.
La integración no consume actividades de la API de Strava como datos de
entrenamiento.

La aplicación no vuelve a entrenar el Random Forest al importar actividades:
el historial seleccionado aporta características para la inferencia y para
los métodos estadísticos. El entrenamiento del modelo sigue siendo un proceso
offline.

## 6. Validaciones y pruebas del Laboratorio

Los módulos independientes de backend validan modalidad, fechas, rangos
físicos y cantidad mínima de datos. El etiquetado de una competición requiere
confirmación manual; las sugerencias basadas en nombres nunca convierten por sí
solas una actividad en competición.

Pruebas disponibles:

- [ml-race-projection.test.js](../../raceestrategy-web/backend/tests/ml-race-projection.test.js)
- [ml-multisport-rating.test.js](../../raceestrategy-web/backend/tests/ml-multisport-rating.test.js)
- [ml-history-diagnostics.test.js](../../raceestrategy-web/backend/tests/ml-history-diagnostics.test.js)
- [ml-owned-selection.test.js](../../raceestrategy-web/backend/tests/ml-owned-selection.test.js)
- [ml-owned-metrics.test.mjs](../../raceestrategy-web/backend/tests/ml-owned-metrics.test.mjs)
- [ml-archive-import.test.js](../../raceestrategy-web/backend/tests/ml-archive-import.test.js)
- [ml-activity-types.test.js](../../raceestrategy-web/backend/tests/ml-activity-types.test.js)

Desde `raceestrategy-web/backend/` se ejecutan con `npm test`.

## 7. Privacidad, validez y limitaciones

- FitRec contiene identificadores de usuario y datos de ubicación/fisiología.
  Su archivo original no se distribuye con el repositorio; respeta las
  condiciones de acceso, licencia y citación de la fuente.
- Los informes de detalle contienen IDs de actividad/usuario y medidas
  geográficas. Mantén esos artefactos fuera de repositorios públicos cuando
  puedan identificar a personas o recorridos.
- `id_atleta` se usa para vincular sesiones de una persona. La evaluación
  futura debe separar entrenamiento y prueba por usuario; una división
  aleatoria por actividad puede filtrar información de la misma persona entre
  ambos conjuntos.
- El EDA de series es una muestra intencionada, no representativa. Sus
  porcentajes o conteos no deben extrapolarse al conjunto completo.
- Las alertas no equivalen a correcciones: antes de entrenar hay que definir,
  justificar y medir reglas de limpieza sobre las señales afectadas.
- Las muestras Gold locales contienen `id_actividad`, fecha e ID seudónimo;
  no son una garantía de anonimato.
- La máscara residencial de 500 m descrita en la documentación de datos no
  está implementada por el ETL local enlazado en esta entrega.
- La ficha de percentiles depende de una referencia histórica estática. No es
  una clasificación clínica ni mide directamente la capacidad fisiológica.
- El modelo de carrera está etiquetado como experimental; los tiempos son
  estimaciones, no garantías ni asesoramiento médico.

## Referencias del repositorio

- [README principal](../../README.md)
- [02 — Datos y preparación](./02_datos_y_preparacion.md)
- [Código y resultados EDA](../../analisis_datos/)
- [ETL y datasets Gold locales](../../entrega%20de%20datos/)
- [Backend del Laboratorio IA](../../raceestrategy-web/backend/)
- [Frontend del Laboratorio IA](../../raceestrategy-web/frontend/src/)
