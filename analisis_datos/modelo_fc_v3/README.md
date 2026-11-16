# RaceEstrategy — Experimento FC V3 (investigación)

No modifica backend, frontend, base de datos ni V2. Ejecutar desde la raíz del repositorio. Utiliza únicamente datos FitRec locales para investigación académica. No subir los datasets ni los resultados individuales al repositorio.

```powershell
python -m pip install -r .\analisis_datos\modelo_fc_v3\requirements.txt
python -m unittest discover -s .\analisis_datos\modelo_fc_v3 -v
python .\analisis_datos\modelo_fc_v3\experimento.py `
  --csv ".\analisis_datos\actividades_completo_con_detalle_fusionado.csv" `
  --fitrec "C:\Users\Usuario\Desktop\MASTER\TFM\RaceEstrategy\analisis_datos\datos\endomondoHR.json" `
  --salida ".\analisis_datos\resultados_fc_v3"
```

Añadir `--jobs 2` para limitar paralelismo si hay problemas de memoria. Añadir `--evaluar-test` únicamente para una comparación exploratoria con el test V2 ya consultado (no es validación final independiente). El informe queda en `analisis_datos/resultados_fc_v3/informe_comparacion.json`. Los modelos no se exportan aún a producción.

## Protocolo

- Mismos filtros, elegibilidad cardíaca básica, variables V1/V2, partición por usuario (semilla 42) y parámetros de Random Forest que V2. Se recalculan los tres modelos con las mismas filas. Se excluye el día objetivo completo del historial.
- FC media básica: media de muestras, igual que V2. Series avanzadas: intervalos temporales positivos, de hasta 120 segundos, con ambas muestras válidas y al menos 70% de tiempo cubierto; se exigen 10 muestras y 60 segundos de duración. Se aproxima FC constante durante cada intervalo válido. No se interpolan huecos largos. Si no hay series fiables, se conservan las estadísticas básicas. Imputación de medianas ajustada únicamente en entrenamiento; se informa de cobertura. Los usuarios sin FC básica quedan fuera de esta comparación pareada.
- Referencia individual: percentil 90 de máximos observados de las últimas 30 actividades, nunca FC máxima fisiológica. Fracción alta: proporción de tiempo válido con FC >= 85% de esa referencia aproximada (redondeo de muestras a ppm). Variabilidad: desviación estándar y rango p90-p10 ponderados por tiempo. Cambio entre mitades: diferencia de FC media entre mitades temporales; no equivale a deriva cardíaca a velocidad constante.
- Eficiencia: velocidad media por ppm; cambio relativo últimas 10 vs hasta 20 anteriores, mínimo 3 observaciones por ventana. No corrige pendiente, clima ni esfuerzo. Carga: suma de minutos * (FC media / referencia)^2, últimos 7 y 28 días, requiere al menos 70% de actividades con FC; no es TRIMP ni fatiga medida. Se incluyen proporción de series temporales y cantidad de entrenamientos recientes con FC.
- MAE, RMSE, MAPE, mediana APE, sesgo y MAE macro por usuario. Bootstrap pareado de 2000 réplicas por corredor; IC95% de diferencia de MAE (V3 - comparador). Segmentos por distancia, desnivel, historial y cobertura; análisis descriptivo, no múltiples pruebas confirmatorias. Selección por MAE de validación. Test anterior reutilizado solo opcionalmente.
- No se ha evaluado con datos externos ni con series reducidas de Strava. Antes de integrar en el backend, verificar paridad de variables, permisos, cobertura, datos reales y disponer de evaluación independiente. No se predice una marca de competición, sino duración de una actividad.

Fuente FitRec: https://cseweb.ucsd.edu/~jmcauley/datasets/fitrec.html — Ni, Muhlstein y McAuley, *Modeling heart rate and activity data for personalized fitness recommendation*, WWW 2019. Uso académico únicamente.
