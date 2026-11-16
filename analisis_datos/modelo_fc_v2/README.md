# RaceEstrategy v1.12 — Experimento de frecuencia cardíaca (fase 1)

No modifica backend, frontend, Supabase ni el Random Forest activo. No usa los datos privados de los usuarios ni la API de Strava. No incluye datos FitRec ni modelos entrenados con ellos.

## Ejecución desde la raíz del repositorio (PowerShell)

```powershell
python -m pip install -r .\analisis_datos\modelo_fc_v2\requirements.txt
python -m unittest discover -s .\analisis_datos\modelo_fc_v2 -p "test_*.py" -v
python .\analisis_datos\modelo_fc_v2\experimento.py --csv .\analisis_datos\actividades_completo_con_detalle_fusionado.csv --fitrec "C:\RUTA\endomondoHR.json.gz" --salida .\analisis_datos\resultados_fc_v2
```

Sustituir C:\RUTA por el directorio real del fichero original (no el CSV ni el fichero normalizado). Puede tardar por la lectura del dataset original de ~1,9 GB comprimidos. No es necesario descomprimirlo. Si se ha perdido: https://cseweb.ucsd.edu/~jmcauley/datasets/fitrec.html

## Protocolo

- Mismo CSV de distancias, tiempos y desniveles que el modelo previo. Mismos filtros de calidad de Carrera, sin utilizar GPS de la aplicación.
- Unión por usuario e ID de actividad con el JSONL original, leyendo secuencialmente. Se exige un mínimo de 10 muestras entre 25 y 250 ppm y al menos 80% de muestras plausibles. Los límites son filtros técnicos, no clínicos. La media es de muestras y no ponderada por tiempo; el máximo es el máximo observado.
- Se conservan los registros sin FC; para el experimento pareado solo se comparan ejemplos con al menos 3 medias válidas en las últimas 10 actividades previas y 3 máximas en las últimas 30. Se excluyen actividades del día objetivo y posteriores de cualquier variable histórica. Los ejemplos con datos insuficientes no sirven para evaluar V2 y el futuro predictor podrá utilizar V1.
- Cuatro características adicionales: mediana de medias FC entre las últimas 10, P90 de máximas entre las últimas 30, mediana de (velocidad km/h / FC media) entre las últimas 10 y fracción de últimas 10 con media válida. Las ventanas cuentan actividades, no muestras.
- Separación 70/15/15 aproximada por deportista, semilla 42. Los usuarios de entrenamiento, validación y prueba son disjuntos. Dentro de cada deportista, cada predicción utiliza su pasado. Se comparan dos RF con idénticos parámetros y ejemplos: 60 árboles, profundidad 16, hoja mínima 8, logaritmo del ritmo como objetivo. También se mide ritmo histórico. Esto es un nuevo experimento controlado, no reproducción exacta del RF anterior (su partición histórica es diferente).
- MAE, RMSE, MAPE, mediana del error relativo y sesgo, además de cobertura. La validación elige el candidato; el test reservado solo lo evalúa. No ajustar parámetros sobre el test. Para afirmar una mejora generalizada, revisar test y validación, sensibilidad por usuario/distancia, y validar con datos externos antes de publicar.
- Modelos JSON experimentales con `approved_for_beta: false`. NO reemplazar `backend/ml-model/modelo_carrera.json`. V2 aún no está conectada a la API. Fase 2: adaptar historial autorizado (CSV/FIT, migración, preservar FC en reimportación), implementar características equivalentes en Node, fallback V1 y pruebas de paridad. No afecta a proyección de competición ni a ciclismo/MTB.

## Resultados

`cobertura.json` se crea antes de entrenar, incluso si faltan usuarios suficientes; `informe_comparacion.json` recoge las métricas y particiones. Los dos JSON de modelos son locales. No publicar estos ficheros ni datos sin revisar las condiciones de FitRec; su sitio restringe el uso a fines académicos y prohíbe redistribuir los datos o utilizarlos comercialmente.

Referencia: Ni, Muhlstein y McAuley (2019), *Modeling heart rate and activity data for personalized fitness recommendation*, WWW 2019.

Pruebas realizadas en el entorno de preparación: 4 pruebas unitarias y ejecución integral con datos sintéticos de 30 usuarios. No constituyen evidencia del rendimiento real de V2.
