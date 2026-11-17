# Comparación temporal de predictores de carrera

Corte global: entrenamiento hasta 2014, validación de enero a junio de 2015 y prueba desde julio de 2015 hasta el final de FitRec. Historial estrictamente anterior al día objetivo. Modelos congelados antes de 2015; evaluación secuencial con historial real ya observado.

**Advertencia:** el artefacto actual tiene procedencia temporal desconocida; su evaluación es descriptiva y podría incluir carreras vistas durante su entrenamiento. La comparación controlada es RF sin FC reentrenado frente a V3. FitRec ya se exploró anteriormente: este cierre es una evaluación retrospectiva, no una confirmación externa independiente.

## Validación

16.012 actividades; 485 deportistas.

| Método | MAE (min) | RMSE (min) | MAPE (%) | Mediana APE (%) | MAE por usuario (min) | Sesgo (min) |
|---|---:|---:|---:|---:|---:|---:|
| Mediana del ritmo reciente | 6.726 | 15.401 | 10.823 | 6.416 | 7.400 | -1.465 |
| Modelo actual (artefacto web)* | 5.947 | 12.607 | 10.147 | 6.477 | 6.906 | -0.980 |
| RF sin FC reentrenado | 6.194 | 13.484 | 10.477 | 6.754 | 7.096 | -1.427 |
| RF V3 con FC | 6.103 | 13.517 | 10.305 | 6.593 | 7.038 | -1.293 |

Diferencia MAE V3 − RF sin FC: -0.0903 min. IC 95 % por bootstrap de deportistas: [-0.2031, -0.0070] min. Valores negativos favorecen V3.

## Prueba temporal

14.639 actividades; 444 deportistas.

| Método | MAE (min) | RMSE (min) | MAPE (%) | Mediana APE (%) | MAE por usuario (min) | Sesgo (min) |
|---|---:|---:|---:|---:|---:|---:|
| Mediana del ritmo reciente | 6.271 | 15.513 | 10.384 | 6.406 | 6.774 | -1.494 |
| Modelo actual (artefacto web)* | 5.792 | 12.915 | 10.067 | 6.620 | 6.865 | -0.985 |
| RF sin FC reentrenado | 5.949 | 13.195 | 10.290 | 6.778 | 7.066 | -1.248 |
| RF V3 con FC | 5.877 | 13.129 | 10.202 | 6.667 | 6.739 | -1.025 |

Diferencia MAE V3 − RF sin FC: -0.0719 min. IC 95 % por bootstrap de deportistas: [-0.2298, 0.0792] min. Valores negativos favorecen V3.

### Test por distancia_km (MAE en minutos)

| Tramo | n | Usuarios | Ritmo | Actual* | RF sin FC | V3 | Δ V3 − RF sin FC |
|---|---:|---:|---:|---:|---:|---:|---:|
| 10-21.1 | 5378 | 357 | 7.539 | 6.818 | 7.034 | 6.992 | -0.042 |
| 5-10 | 5395 | 403 | 4.443 | 4.305 | 4.445 | 4.338 | -0.107 |
| <=5 | 3113 | 357 | 2.908 | 2.823 | 2.879 | 2.820 | -0.059 |
| >21.1 | 753 | 200 | 24.226 | 21.388 | 21.670 | 21.583 | -0.088 |

*Actual: posible solapamiento con entrenamiento original. Subgrupos exploratorios; — indica muestra insuficiente.

### Test por ascenso_m_km (MAE en minutos)

| Tramo | n | Usuarios | Ritmo | Actual* | RF sin FC | V3 | Δ V3 − RF sin FC |
|---|---:|---:|---:|---:|---:|---:|---:|
| 5-20 | 6208 | 387 | 5.480 | 5.421 | 5.535 | 5.387 | -0.147 |
| >20 | 3301 | 266 | 9.789 | 7.993 | 8.443 | 8.352 | -0.092 |
| <=5 | 5130 | 324 | 4.965 | 4.824 | 4.845 | 4.877 | 0.032 |

*Actual: posible solapamiento con entrenamiento original. Subgrupos exploratorios; — indica muestra insuficiente.

### Test por descenso_m_km (MAE en minutos)

| Tramo | n | Usuarios | Ritmo | Actual* | RF sin FC | V3 | Δ V3 − RF sin FC |
|---|---:|---:|---:|---:|---:|---:|---:|
| 5-20 | 6137 | 390 | 5.597 | 5.543 | 5.669 | 5.514 | -0.155 |
| >20 | 3213 | 263 | 9.882 | 8.028 | 8.466 | 8.361 | -0.106 |
| <=5 | 5289 | 324 | 4.860 | 4.722 | 4.744 | 4.790 | 0.045 |

*Actual: posible solapamiento con entrenamiento original. Subgrupos exploratorios; — indica muestra insuficiente.

### Test por historial (MAE en minutos)

| Tramo | n | Usuarios | Ritmo | Actual* | RF sin FC | V3 | Δ V3 − RF sin FC |
|---|---:|---:|---:|---:|---:|---:|---:|
| >30 | 14110 | 391 | 6.313 | 5.829 | 5.974 | 5.878 | -0.096 |
| 11-30 | 426 | 59 | 5.187 | 4.841 | 5.385 | 6.031 | 0.646 |
| 5-10 | 103 | 34 | 5.058 | 4.661 | 4.785 | 5.051 | 0.266 |

*Actual: posible solapamiento con entrenamiento original. Subgrupos exploratorios; — indica muestra insuficiente.

### Test por cobertura_series_fc (MAE en minutos)

| Tramo | n | Usuarios | Ritmo | Actual* | RF sin FC | V3 | Δ V3 − RF sin FC |
|---|---:|---:|---:|---:|---:|---:|---:|
| 30-70% | 496 | 71 | 5.549 | 5.448 | 5.127 | 5.244 | 0.117 |
| >70% | 14051 | 423 | 6.271 | 5.783 | 5.961 | 5.881 | -0.079 |
| <=30% | 92 | 21 | — | — | — | — | — |

*Actual: posible solapamiento con entrenamiento original. Subgrupos exploratorios; — indica muestra insuficiente.

### Test por usuario_en_train (MAE en minutos)

| Tramo | n | Usuarios | Ritmo | Actual* | RF sin FC | V3 | Δ V3 − RF sin FC |
|---|---:|---:|---:|---:|---:|---:|---:|
| si | 13890 | 404 | 6.335 | 5.844 | 5.991 | 5.861 | -0.130 |
| no | 749 | 40 | 5.084 | 4.819 | 5.165 | 6.172 | 1.007 |

*Actual: posible solapamiento con entrenamiento original. Subgrupos exploratorios; — indica muestra insuficiente.

## Limitaciones

- El artefacto actual no tiene fechas/IDs de entrenamiento verificables; no se puede excluir solapamiento con el test.
- El corte global permite usuarios repetidos en fechas posteriores; mide predicción longitudinal, no exclusivamente generalización a usuarios nuevos.
- FitRec fue explorado en V2 y V3; la prueba temporal retrospectiva no es una confirmación externa independiente.
- Se evalúan actividades filtradas con historial y FC suficiente; no se garantiza mejora en usuarios sin pulsómetro.
- Los filtros de calidad usan la duración real para definir la cohorte retrospectiva; no son un filtro disponible antes de predecir.
- Distancia y desniveles de la actividad realizada aproximan la ruta prevista; no se evalúan cambios de recorrido.
- Se estima duración de entrenamientos, no marcas de competición; características cardíacas son aproximaciones no clínicas.
- Subgrupos exploratorios, sin corrección por comparaciones múltiples. FitRec: uso académico.
