# Cierre experimental: evaluación temporal de RaceEstrategy

Experimento offline para comparar la mediana del ritmo reciente, el predictor web actual y el Random Forest V3 con frecuencia cardíaca sobre las mismas carreras posteriores. Añade un cuarto comparador, un RF sin FC reentrenado, para aislar el efecto de las características cardíacas. No modifica la aplicación ni sustituye su artefacto.

## Protocolo fijado antes de calcular errores

| Partición | Fechas de las actividades objetivo |
|---|---|
| Entrenamiento | Hasta 31/12/2014 inclusive |
| Validación | 01/01/2015–30/06/2015 |
| Prueba temporal | Desde 01/07/2015 hasta el final de FitRec |

Se escogen cortes globales por volumen de datos, no por resultados predictivos: tras los filtros del V3 hay únicamente 17 actividades válidas de 2016 en el CSV revisado. Reservar solo 2016 no permitiría una comparación suficientemente amplia. No se cambian los cortes después de consultar errores.

- Se reutilizan `read_and_filter`, `enrich` y `make_rows` del experimento V3. La unidad es una carrera; las características históricas se construyen a partir de actividades del mismo deportista en días estrictamente anteriores, incluidas las carreras anteriores de la fase de prueba si ya ocurrieron. Las actividades del mismo día se incorporan juntas al historial al terminar ese día.
- Se exige un mínimo de cinco sesiones previas válidas y disponibilidad de las cuatro características básicas de FC. Se evalúa exactamente el mismo subconjunto en los cuatro métodos; el informe registra cobertura respecto a todas las filas predictivas. Se usan distancia y desniveles observados como aproximación de la ruta conocida. No se emplean el tiempo ni la FC de la carrera objetivo como características.
- La mediana del ritmo de las últimas 10 sesiones se multiplica por la distancia objetivo. El artefacto real se evalúa con `predictFromModel` de `raceestrategy-web/backend/ml-predict.js`, usando las nueve características equivalentes (comprobadas en tests). Se registra su SHA-256. No se conoce la división temporal original: sus métricas pueden ser optimistas y no acreditan una prueba independiente.
- Los RF sin FC y V3 se entrenan exclusivamente con las mismas filas elegibles anteriores a 2015. Se mantiene la arquitectura e hiperparámetros de V3 (60 árboles, profundidad 16, hoja mínima 8, semilla 42). Imputación de mediana ajustada solo en train. Predicen logaritmo del ritmo, convertido a minutos. Se aplica a todos la resolución de la aplicación de 0,1 min. No se reajusta el modelo en validación ni en test.
- Métricas: MAE, RMSE, MAPE, mediana APE, MAE promedio por deportista y sesgo. Bootstrap pareado agrupado por deportista (2.000 réplicas). Se analiza el MAE por distancia, ascenso/descenso por km, historial, cobertura de series FC y presencia del deportista en entrenamiento. Los grupos pequeños se informan sin métricas; el análisis de subgrupos es exploratorio.

Este diseño mide predicción longitudinal con información disponible en cada fecha, no exclusivamente transferencia a usuarios nuevos. FitRec ya se utilizó en los experimentos previos, por lo que el nuevo test es una prueba temporal retrospectiva para este entrenamiento, no una confirmación externa independiente. La comparación causal del aporte de variables FC no es el artefacto actual frente al V3, sino los dos RF reentrenados bajo idéntico protocolo (sin implicar causalidad fisiológica).

## Ejecución (PowerShell, raíz del repositorio)

Requiere Python, Node.js y el directorio `analisis_datos/modelo_fc_v3` ya presente. No es necesario iniciar la web ni Supabase. Utilizar una copia local autorizada de FitRec (el JSON o GZ).

```powershell
python -m pip install -r .\analisis_datos\modelo_fc_temporal\requirements.txt
python -m unittest discover -s .\analisis_datos\modelo_fc_temporal -v
python .\analisis_datos\modelo_fc_temporal\experimento.py `
  --csv ".\analisis_datos\actividades_completo_con_detalle_fusionado.csv" `
  --fitrec "C:\ruta\endomondoHR.json" `
  --salida ".\analisis_datos\resultados_fc_temporal"
```

La ruta de ejemplo debe sustituirse por la ubicación real. El argumento `--jobs 2` limita el paralelismo si se necesita. El artefacto web y el backend se resuelven por defecto desde la raíz del repo; se pueden indicar mediante `--modelo-actual` y `--backend` para reproducir una revisión concreta.

## Resultados y publicación

- `informe_temporal.json`: métricas completas agregadas, cobertura, particiones, intervalos, subgrupos, versiones y huellas del predictor actual.
- `comparacion_temporal.md`: tablas de validación, prueba temporal y errores por tipo de ruta para la entrega.
- Opcional `--guardar-modelos-locales`: guarda los dos pipelines entrenados en formato joblib; no subir estos archivos hasta verificar permisos y necesidad de distribución.

Versionar los scripts, pruebas, dependencias, README y ambos informes agregados. No publicar FitRec, exportaciones de deportistas, filas individuales, credenciales, cachés ni artefactos entrenados sin revisar permisos. No sustituir el predictor web sin evaluar la transferencia de características a los datos reales, permisos y cobertura cardíaca.

Las métricas del antiguo predictor (6,18 min en otra evaluación) y del V3 anterior (6,214 min en validación por usuarios) no son directamente comparables con este nuevo test. No elegir nuevos hiperparámetros tras ver el test; si se realizan nuevos cambios, reservar otra evaluación independiente.
