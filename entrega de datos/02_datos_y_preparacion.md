# PROYECTO FINAL - ENTREGA 02
## Datos y preparación: De la idea de producto a unos datos reales, trazables y utilizables

---

### 1. Qué datos necesita vuestro producto

* **Qué representa una observación:**
  En la capa final (Gold), cada fila representa **una actividad deportiva individual completada por un deportista** (o un tramo/segmento homogéneo de ruta).
* **Datos imprescindibles:**
  * `deporte` / `sub_deporte`: Identificador de la disciplina (ciclismo de carretera, MTB, carrera a pie, caminata). Es inviable mezclar métricas de ritmos entre deportes.
  * `distancia_km`: Longitud total del recorrido en kilómetros.
  * `desnivel_positivo_m` y `ratio_subida_m_km`: Metros de ascenso acumulado y ratio de pendiente media.
  * `duracion_segundos` / `velocidad_media_kmh`: Variable objetivo para los futuros modelos de Machine Learning (predecir tiempo estimado o ritmo sostenible).
  * `id_atleta` (seudonimizado): Imprescindible para controlar el sesgo por usuario y evitar la fuga de datos (*data leakage*) entre entrenamiento y test.
* **Datos deseables:**
  * Frecuencia cardíaca media, potencia (vatios), cadencia y temperatura ambiente (disponibles parcialmente en dispositivos avanzados).
* **Granularidad e histórico:**
  * Granularidad a nivel de actividad completa (agregada) para modelos macro de predicción de tiempo, con capacidad de descender a granularidad segundo a segundo (series temporales GPS) para perfiles de altitud y pendientes por tramos.

---

### 2. Fuentes reales y viabilidad

* **Fuentes utilizadas:**
  1. **Datos propios y de campo (archivos `.fit` de Garmin):** 529 archivos extraídos de ciclo-computadores (*Garmin Edge Explore 20*, *Edge 830*). Cobertura temporal multianual, alta precisión con sensores de altimetría barométrica y frecuencia de muestreo de 1 segundo.
  2. **Datos exportados de Strava (archivos `.gpx`):** 434 actividades registradas en móvil y dispositivos GPS con etiquetado manual del usuario.
  3. **Fuentes abiertas de referencia (rutas base):** Catálogo de rutas oficiales del CNIG/IMBA (para perfiles topográficos) y datasets académicos abiertos de fitness (*FitRec Endomondo*).
* **Viabilidad y estabilidad:**
  * El acceso a los archivos locales `.fit` y `.gpx` es 100% autónomo y offline; no depende de caídas de servidores ni de restricciones de cuota en APIs externas.
  * **Alternativa de contingencia:** Si faltase telemetría barométrica en un archivo GPX, la altitud se puede imputar cruzando las coordenadas `(latitud, longitud)` con un Modelo Digital de Elevaciones (DEM) abierto (como SRTM o Copernicus EU-DEM).

---

### 3. Uso, privacidad y datos personales

* **Diagnóstico de privacidad en los datos brutos:**
  * Los archivos `.fit` de fábrica contenían metadatos sensibles: números de serie de dispositivos Garmin (`serial_number`), edad, peso corporal exacto y nombres de perfil.
  * Los archivos `.gpx` de Strava no incluyen nombres directos pero sus nombres de archivo corresponden a los identificadores públicos de actividad en Strava.
* **Medidas de minimización y RGPD aplicadas:**
  * **Anonimización irreversible:** Se eliminó cualquier identificador directo y se transformaron los números de serie en un hash seguro seudonimizado (`atleta_a1b2c3`).
  * **Disociación de datos antropométricos:** Se desacoplaron el peso y la edad de la tabla de entrenamiento principal para evitar reidentificación.
  * **Protección de ubicaciones residenciales:** En producción se aplica máscara/recorte de los primeros y últimos 500 metros para no revelar la ubicación del domicilio del deportista.
  * **Buenas prácticas del repositorio:** No se suben datasets masivos al repositorio Git, únicamente muestras representativas limpias.

---

### 4. Del dato bruto al dato utilizable (Flujo Bronze $\rightarrow$ Silver $\rightarrow$ Gold)

```
[Bronze / Raw]                    [Silver / Cleaned]                   [Gold / ML-Ready]
Archivos brutos               Limpieza, tipos y filtros           Datasets listos para ML
(.fit y .gpx)                 • Filtrado de ruido (<2 min)        • gold_ciclismo.csv (934 filas)
963 archivos          ──>     • Descarte anomalías de velocidad ──> • gold_running.csv (17 filas)
                              • Conversión unidades (km, s, m)    • Features listas para regresión
                              • Anonimización del atleta
```

#### 🥉 Capa Bronze / Raw (Adquisición)
* **Contenido:** 963 archivos en bruto (434 `.gpx` y 529 `.fit`) en la carpeta `GPX/activities/`.
* Se conservan tal cual fueron generados por los dispositivos GPS, preservando el dato original sin alteraciones.

#### 🥈 Capa Silver (Limpieza y Homogeneización)
El pipeline automatizado `etl_bronze_silver_gold.py` realiza las siguientes transformaciones:
* **Filtro de integridad y ruido:** Se descartan actividades con duración inferior a 2 minutos o distancia menor a 200 metros (pruebas accidentales, grabaciones estáticas).
* **Control de anomalías físicas:** Se eliminan errores de señal GPS con velocidades medias imposibles (>100 km/h en ciclismo o >35 km/h en running).
* **Estandarización de unidades:** Conversión de coordenadas y campos heterogéneos a unidades del SI: `distancia_km`, `duracion_min`, `duracion_segundos`, `desnivel_positivo_m`, `velocidad_media_kmh`.
* **Resultado Silver:** 951 actividades limpias consolidadas en `silver_actividades.csv` (12 descartadas por ruido/inconsistencias).

#### 🥇 Capa Gold (Consumo para Machine Learning)
Separación por dominios deportivos y selección estricta de variables de entrada para los modelos:
1. **`gold_ciclismo.csv`** (934 actividades):
   * Columnas: `[id_actividad, id_atleta, fecha_inicio, deporte, sub_deporte, distancia_km, desnivel_positivo_m, ratio_subida_m_km, velocidad_media_kmh, duracion_min, duracion_segundos]`.
   * **Uso:** Entrenamiento de modelos de regresión supervisada (Random Forest, Gradient Boosting) para predecir tiempo de ruta y ritmo en función de la distancia y el desnivel acumulado.
2. **`gold_running_caminata.csv`** (17 actividades):
   * Estructura análoga para modelado de actividades a pie.

---

### 5. Riesgos y limitaciones

1. **Desbalanceo entre disciplinas:** Contamos con un volumen excelente de ciclismo (934 actividades), pero un volumen reducido en carrera a pie (17 actividades). Para running será necesario incorporar datos abiertos (ej. FitRec) si se desea entrenar un modelo robusto.
2. **Falta de métricas fisiológicas completas:** No todas las actividades disponen de sensor de pulso o potenciómetro, por lo que el modelo base debe depender principalmente de variables topográficas (distancia, desnivel, pendiente).
3. **Dependencia de la calidad del GPS:** En cañones o zonas de montaña profunda la altimetría GPS puede acumular deriva; se mitiga calculando el desnivel positivo con filtros de umbral y validación con modelos de elevación.
4. **Plan de contingencia:** Si una fuente dejara de estar disponible, el flujo Bronze $\rightarrow$ Silver $\rightarrow$ Gold es totalmente reproducible a partir de cualquier archivo de track GPS estándar.
