# PROYECTO FINAL - ENTREGA 02
## Datos y preparación: De la idea de producto a unos datos reales, trazables y utilizables

---

### 1. Qué datos necesita vuestro producto

* **Qué representa una observación:**
  En la capa final (Gold), cada fila representa **una actividad deportiva individual completada por un deportista** (o un tramo/segmento homogéneo de ruta).
* **Datos imprescindibles:**
  * `deporte` / `sub_deporte` / `modalidad`: Identificador de la disciplina (ciclismo de carretera / bicicleta, MTB, carrera a pie / running, caminata). Es inviable mezclar métricas de ritmos entre deportes.
  * `distancia_km`: Longitud total del recorrido en kilómetros.
  * `desnivel_positivo_m` y `ratio_subida_m_km`: Metros de ascenso acumulado y ratio de pendiente media.
  * `duracion_segundos` / `duracion_min` / `velocidad_media_kmh`: Variable objetivo para los futuros modelos de Machine Learning (predecir tiempo estimado o ritmo sostenible).
  * `id_atleta` / `usuario` (seudonimizado): Imprescindible para controlar el sesgo por usuario y evitar la fuga de datos (*data leakage*) entre entrenamiento y test.
* **Datos deseables:**
  * Frecuencia cardíaca media y serie temporal de pulso, potencia (vatios), cadencia y temperatura ambiente (disponibles en dispositivos avanzados y en el dataset FitRec).
* **Granularidad e histórico:**
  * Granularidad a nivel de actividad completa (agregada) para modelos macro de predicción de tiempo, con capacidad de descender a granularidad segundo a segundo (series temporales GPS, FC y altimetría) para perfiles de altitud, pendientes por tramos y análisis de esfuerzo.

---

### 2. Fuentes reales y viabilidad

* **Fuentes utilizadas e incorporadas:**
  1. **Datos propios y de campo (archivos `.fit` de Garmin):** 
     * **529 actividades outdoor:** extraídas de ciclo-computadores (*Garmin Edge Explore 20*, *Edge 830*). Cobertura temporal multianual, alta precisión con sensores de altimetría barométrica y frecuencia de muestreo de 1 segundo.
     * **81 actividades indoor sin GPS (`.fit`):** registradas en rodillo/entrenamiento estático (`indoor_sin_gps/`), con métricas fisiológicas y de potencia/cadencia.
  2. **Datos exportados de Strava (archivos `.gpx`):** 434 actividades registradas en móvil y dispositivos GPS con etiquetado manual del usuario.
  3. **Dataset masivo FitRec (Endomondo):** 
     * Incorporación y procesamiento de **229.413 actividades deportivas reales** procedentes de **1.090 usuarios distintos**, con cobertura completa de GPS, series temporales de frecuencia cardíaca y perfiles de elevación:
       * **Carrera a pie (*run*):** 117.902 actividades.
       * **Ciclismo en ruta (*bike*):** 98.001 actividades.
       * **Ciclismo de montaña (*mountain bike* / MTB):** 13.510 actividades.
  4. **Fuentes abiertas de referencia topográfica:** Catálogo de rutas oficiales del CNIG/IMBA (para validación de perfiles topográficos).
* **Viabilidad y estabilidad:**
  * El acceso a los archivos locales (`.fit`, `.gpx`, y extractos de FitRec) es 100% autónomo y offline; no depende de caídas de servidores ni de restricciones de cuota en APIs externas.
  * **Alternativa de contingencia:** Si faltase telemetría barométrica en un archivo GPX o hubiera deriva altimétrica, la elevación se puede imputar cruzando las coordenadas `(latitud, longitud)` con un Modelo Digital de Elevaciones (DEM) abierto (como SRTM o Copernicus EU-DEM).

---

### 3. Uso, privacidad y datos personales

* **Diagnóstico de privacidad en los datos brutos:**
  * Los archivos `.fit` de fábrica contenían metadatos sensibles: números de serie de dispositivos Garmin (`serial_number`), edad, peso corporal exacto y nombres de perfil.
  * Los archivos `.gpx` de Strava contenían en sus nombres los identificadores de actividad de la plataforma pública.
  * El dataset FitRec contiene identificadores numéricos de usuario (`userId`) y género.
* **Medidas de minimización y RGPD aplicadas:**
  * **Anonimización irreversible:** Se eliminó cualquier identificador directo y se transformaron los números de serie y cuentas en un hash seguro seudonimizado (`atleta_a1b2c3` / `userId` mapeado).
  * **Disociación de datos antropométricos:** Se desacoplaron el peso y la edad de la tabla de entrenamiento principal para evitar reidentificación.
  * **Protección de ubicaciones residenciales:** En producción se aplica máscara/recorte de los primeros y últimos 500 metros para no revelar la ubicación del domicilio del deportista.
  * **Buenas prácticas del repositorio Git:** No se sube el dataset gigante completo a Git (se gestiona vía `.gitignore` y scripts reproducibles), versionando únicamente el código ETL/EDA, informes de calidad y muestras representativas.

---

### 4. Del dato bruto al dato utilizable (Flujo Bronze $\rightarrow$ Silver $\rightarrow$ Gold)

```
[Bronze / Raw]                    [Silver / Cleaned]                   [Gold / ML-Ready]
Archivos brutos y datasets        Limpieza, tipos y auditoría         Datasets listos para ML
• 963 tracks (.fit y .gpx)        • Filtro duración (<2 min, >24h)    • gold_ciclismo.csv (934 filas base)
• 81 fit indoor sin GPS           • Descarte anomalías de velocidad   • gold_running_caminata.csv (17 filas base)
• 229.413 actividades FitRec ──> • Saltos GPS (>2 km) y altitud ───> • FitRec ML-Ready (>229.000 acts:
  (117.9k run, 98.0k bike,        • Estandarización unidades (SI)       117.8k running, 97.8k ciclismo,
   13.5k MTB)                     • Auditoría series temporales         13.5k MTB)
```

#### 🥉 Capa Bronze / Raw (Adquisición)
* **Datos locales:** 963 archivos de actividades de campo (434 `.gpx` y 529 `.fit`) más 81 archivos `.fit` indoor en `GPX/activities/`.
* **Dataset externo integrado:** 229.413 registros filtrados por modalidades objetivo (*run, bike, mountain bike*) a partir de `endomondoHR.json`.
* Se conservan tal cual fueron generados por los dispositivos GPS y sensores, preservando el dato original sin alteraciones.

#### 🥈 Capa Silver (Limpieza, Calidad y Homogeneización)
El pipeline automatizado y los scripts de auditoría (`etl_bronze_silver_gold.py`, `eda_calidad_fitrec.py`, `eda_series_detalle.py`) realizan:
* **Filtro de integridad y ruido temporal:** Se descartan actividades con duración inferior a 2 minutos o distancia menor a 200 metros, así como duraciones irreales (>24 horas o marcas de tiempo no monótonas).
* **Control de anomalías físicas y GPS:** Detección y filtrado de saltos GPS superiores a 2 km entre puntos sucesivos (1.635 casos detectados para revisión), saltos bruscos de altitud (>100 m) y velocidades medias no plausibles (>100 km/h en ciclismo o >35 km/h en carrera).
* **Estandarización de unidades:** Conversión de coordenadas, ritmos y campos heterogéneos a unidades del SI: `distancia_km`, `duracion_min`, `duracion_segundos`, `desnivel_positivo_m`, `velocidad_media_kmh`.
* **Resultado Silver:** 
  * Conjunto local: 951 actividades limpias consolidadas en `silver_actividades.csv` (12 descartadas por ruido/inconsistencias).
  * Conjunto FitRec: 229.190 actividades candidatas válidas (99,9% del total procesado superó los filtros básicos de tiempo y distancia).

#### 🥇 Capa Gold (Consumo para Machine Learning)
Separación por dominios deportivos y selección estricta de variables de entrada para los modelos:
1. **Modelos de Ciclismo y MTB:**
   * **Base local:** `gold_ciclismo.csv` (934 actividades de alta fidelidad barométrica).
   * **Base masiva (FitRec):** 97.865 actividades de ciclismo en ruta y 13.506 actividades de Mountain Bike listas para entrenamiento generalizable.
   * **Variables:** `[distancia_km, desnivel_positivo_m, ratio_subida_m_km, velocidad_media_kmh, duracion_min, duracion_segundos, tiene_fc]`.
2. **Modelos de Carrera a Pie (Running):**
   * **Base local:** `gold_running_caminata.csv` (17 actividades locales de campo).
   * **Base masiva (FitRec):** 117.819 actividades de carrera válidas para ML, resolviendo por completo el desbalanceo inicial.

---

### 5. Riesgos y limitaciones

1. **Resolución del desbalanceo entre disciplinas:** La limitación original del proyecto (escasez de muestras en carrera a pie con solo 17 actividades) ha quedado solventada con la incorporación del dataset FitRec (117.819 carreras válidas de 698 usuarios recurrentes).
2. **Disponibilidad de métricas fisiológicas:** En los datos de campo locales no todas las rutas contaban con pulso o potenciómetro. En FitRec, el 100% de los registros cuenta con serie temporal de frecuencia cardíaca, lo que permite entrenar modelos avanzados de esfuerzo además de los modelos base topográficos.
3. **Calidad y ruido en señales GPS:** Se han auditado y aislado anomalías (1.635 saltos GPS > 2 km y tramos de pérdida de señal) mediante reglas de filtrado para asegurar que los modelos supervisados no se contaminen.
4. **Plan de contingencia y reproducibilidad:** Todo el flujo Bronze $\rightarrow$ Silver $\rightarrow$ Gold y los análisis exploratorios (EDA) se encuentran automatizados en scripts reproducibles de Python, permitiendo procesar nuevos lotes de datos GPS/FIT de forma inmediata.
