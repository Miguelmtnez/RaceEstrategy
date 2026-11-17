# Model card — Random Forest integrado de carrera

## Objetivo y estado

Estimación de duración de una actividad de carrera para una ruta conocida y un historial manual autorizado. Artefacto beta integrado en el backend; no es una predicción de marca competitiva ni una recomendación médica. No se reentrena al importar actividades. Esta ficha describe el artefacto evaluado en el cierre temporal, no una auditoría de modificaciones posteriores del backend.

## Implementación

- [Artefacto JSON](../../raceestrategy-web/backend/ml-model/modelo_carrera.json) y [predictor](../../raceestrategy-web/backend/ml-predict.js).
- Random Forest de 60 árboles; formato `raceestrategy-rf-logpace-v1`. Predice logaritmo del ritmo y lo transforma en duración.
- Nueve variables: distancia, ascenso y descenso por km de la ruta; número de sesiones previas, mediana de ritmo de las últimas 10, P75 de distancia y mediana de ascenso por km de las últimas 30, km de los últimos 28 días y días desde la última sesión.
- Al menos cinco actividades anteriores válidas. No incluye frecuencia cardíaca como entrada.
- Entrenado offline con FitRec; fechas e identificadores exactos del entrenamiento original no disponibles.

## Resultados

MAE original registrado: 6,1796 min (`test_mae_minutes`); no directamente comparable con otros protocolos. En el [cierre temporal](../../analisis_datos/resultados_fc_temporal/comparacion_temporal.md), el artefacto obtuvo MAE 5,792 min, RMSE 12,915 min y MAPE 10,067 % sobre 14.639 carreras de 444 deportistas. Esta evaluación es descriptiva: no puede descartarse solapamiento con su entrenamiento original.

SHA-256 del artefacto evaluado: `8992a72fbf3bec039317f51f8e162badb6d7b6e0fb192eebf032c57f3362933f`.

## Limitaciones y decisión

Los errores aumentan en rutas largas y con desnivel. FitRec procede de dispositivos y fechas históricos; falta validación externa con datos actuales y de usuarios nuevos. No garantiza precisión individual. Se mantiene el predictor existente: V3 no demuestra una mejora global concluyente frente al RF sin FC reentrenado. No se deduce superioridad del artefacto web por su menor MAE descriptivo.

[Informe reproducible](../../analisis_datos/resultados_fc_temporal/informe_temporal.json) · [Entrega 03](../entregas/03_Machine_Learning.md)
