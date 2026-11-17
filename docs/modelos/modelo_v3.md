# Model card — Random Forest V3 con frecuencia cardíaca

## Objetivo y estado

Candidato de investigación offline para estimar la duración de entrenamientos de carrera. No está integrado en el predictor web. No predice marcas de competición ni ofrece asesoramiento clínico.

## Entrenamiento y entradas

- [Código V3](../../analisis_datos/modelo_fc_v3/) y [experimento temporal](../../analisis_datos/modelo_fc_temporal/).
- 60 árboles, profundidad máxima 16, mínimo 8 muestras por hoja, semilla 42; objetivo logaritmo del ritmo. Imputación por mediana ajustada exclusivamente en entrenamiento.
- 23 características: las nueve originales, cuatro de FC básica y diez avanzadas, que resumen intensidad relativa, dispersión, variación entre mitades, eficiencia histórica, carga aproximada y cobertura cardíaca. No se utiliza la FC de la actividad objetivo.
- FitRec/Endomondo de uso académico. La cohorte comparada exige historial de al menos cinco carreras previas y FC básica suficiente. El corte temporal entrena con 74.610 carreras anteriores a 2015, valida con 16.012 del primer semestre de 2015 y prueba con 14.639 desde julio de 2015 hasta enero de 2016. Historial de días estrictamente anteriores y modelos congelados.

## Resultados temporales

| Métrica (prueba) | RF sin FC reentrenado | V3 |
| --- | ---: | ---: |
| MAE (min) | 5,949 | 5,877 |
| RMSE (min) | 13,195 | 13,129 |
| MAPE (%) | 10,290 | 10,202 |
| MAE por usuario (min) | 7,066 | 6,739 |

Reducción de MAE: 1,21 % (4,32 s). IC 95 % pareado por deportista de la diferencia de MAE: [−0,230; +0,079] min; incluye cero. Frente a la mediana del ritmo reciente, el V3 reduce el MAE un 6,29 %. La comparación controlada para el aporte de FC es contra el RF sin FC reentrenado, no contra el artefacto web de procedencia temporal desconocida.

## Limitaciones y decisión de despliegue

En deportistas no presentes en entrenamiento, el MAE aumenta de 5,165 a 6,172 min frente al RF sin FC (749 carreras, 40 usuarios); también empeora con historiales cortos. Los subgrupos son exploratorios. Las carreras superiores a 21,1 km tienen MAE de 21,583 min. La carga y la FC relativa son proxies, no TRIMP ni FC máxima fisiológica. El diseño longitudinal permite usuarios repetidos; FitRec fue explorado antes y no constituye confirmación externa independiente. Sin validación de transferencia a Strava ni a usuarios sin pulsómetro.

Se conserva como candidato experimental, sin despliegue generalizado. Una estrategia condicionada por historial o cobertura requiere evaluación nueva antes de adoptarse.

[Informe temporal](../../analisis_datos/resultados_fc_temporal/informe_temporal.json) · [Comparación](../../analisis_datos/resultados_fc_temporal/comparacion_temporal.md) · [Gráficas](../../analisis_datos/resultados_fc_temporal/graficas/README.md)
