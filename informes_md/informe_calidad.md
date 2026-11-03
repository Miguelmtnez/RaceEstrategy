# AUDITORÍA DE CALIDAD PRELIMINAR — FITREC

Informe convertido desde `informe_calidad.txt`.
NO se han eliminado entrenamientos; los límites son indicadores de revisión.  
Un salto >2 km NO prueba un error sin examinar el tiempo entre puntos.  
Duración calculada = último timestamp - primer timestamp (no tiempo en movimiento).  
Velocidad = distancia GPS sin filtrar / duración; también puede estar contaminada por errores.  
100% de listas de FC/altitud presentes NO equivale a 100% de mediciones válidas.  

```text
RECUENTOS POR MODALIDAD
modalidad  actividades  fallo_tiempo  fallo_distancia  fallo_puntos_temporales  fallo_longitud_gps  fallo_basico_union  candidatas_basicas  salto_gps_mayor_2km  velocidad_media_sospechosa  fecha_a_revisar  duracion_mayor_24h  alguna_advertencia_union  mediana_distancia_km_candidatas  mediana_duracion_min_candidatas  mediana_velocidad_kmh_candidatas
    TOTAL       229413           116              210                      102                   0                 223              229190                 1635                         134             1008                 475                      3104                            12.70                            60.10                             12.83
  Carrera       117902            48               76                       40                   0                  83              117819                  174                         113              352                  66                       677                             8.06                            45.95                             10.72
Bicicleta        98001            67              131                       62                   0                 136               97865                 1345                          21              631                 362                      2247                            32.99                            88.60                             23.47
      MTB        13510             1                3                        0                   0                   4               13506                  116                           0               25                  47                       180                            26.91                           104.68                             16.80
```

## SIGUIENTE PASO

Revisar una muestra de actividades señaladas; comprobar monotonía temporal,  
consistencia de tamaños (GPS/tiempo/FC/altitud), velocidades entre puntos y saltos de altitud.  
Después definir reglas de limpieza justificadas y auditar cuántas actividades  
conserva cada modalidad y cada usuario, antes de entrenar.
