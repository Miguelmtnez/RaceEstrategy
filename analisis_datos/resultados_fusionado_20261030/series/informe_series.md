# AUDITORÍA DE SERIES — MUESTRA DIRIGIDA (NO REPRESENTATIVA)

Informe convertido desde `informe_series.txt`.
NO se han borrado registros ni se han aplicado filtros definitivos.  
Actividades solicitadas: 536  
Encontradas y analizadas: 536  
Registros ilegibles: 0  

```text
Actividades analizadas por modalidad:
modalidad
Carrera      207
Bicicleta    196
MTB          133
```

## Actividades con al menos un problema de cada tipo

  intervalos_tiempo_no_positivos: 65  
  huecos_mayores_10min: 223  
  tramos_velocidad_sospechosa: 102  
  saltos_2km_con_velocidad_sospechosa: 32  
  saltos_altitud_mayores_100m: 46  
  pulso_no_plausible: 5  

IMPORTANTE: los resultados no estiman tasas del dataset completo.  
Las velocidades por tramo son distancia GPS entre puntos / tiempo entre puntos.  
Una FC fuera de 30–240 bpm y saltos de altitud >100m son alertas orientativas.  
No subas estos CSV a un repositorio público: contienen IDs y datos del historial.
