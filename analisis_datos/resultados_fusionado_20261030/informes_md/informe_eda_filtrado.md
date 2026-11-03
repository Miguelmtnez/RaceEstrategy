# Archivo: endomondoHR.json.gz

Informe convertido desde `informe.txt`.
Actividades incluidas: 229,413  
Actividades excluidas por otros deportes: 23,607  
Total de registros deportivos leídos: 253,020  
Filtro exacto: run, bike, mountain bike (sin incluir bike (transport), cycling indoor ni otras etiquetas)  
Usuarios distintos identificados: 1,090  
Filas ilegibles omitidas: 0  

```text
Deportes exactos originales (top 20, antes del filtro):
run                        117902
bike                        98001
mountain bike               13510
bike (transport)            10445
walk                         3831
indoor cycling               2606
core stability training      1262
orienteering                 1197
cross-country skiing          949
skate                         512
roller skiing                 408
fitness walking               402
hiking                        357
kayaking                      255
weight training               237
circuit training              218
gymnastics                    162
downhill skiing               144
rowing                        127
elliptical                     83
```

```text
Modalidades agrupadas:
modalidad
Carrera      117902
Bicicleta     98001
MTB           13510
```

Usuarios con al menos 10 entrenamientos: 992  
Usuarios con al menos 20 entrenamientos: 931  
Usuarios con al menos 50 entrenamientos: 825  
Usuarios con al menos 10 entrenamientos de carrera: 698  
Usuarios con al menos 10 entrenamientos de bicicleta: 622  
Usuarios con al menos 10 entrenamientos de MTB: 170  
Actividades con duracion nula/negativa: 14  
Actividades con duracion ausente: 102  
Actividades con distancia GPS 0 o ausente: 210  
Actividades con menos de 2 puntos temporales: 102  
Actividades con secuencias latitud/longitud de diferente longitud: 0  
IDs de actividad repetidos (no vacios): 0  

```text
Entrenamientos por usuario, percentiles:
count    1090.000000
mean      210.470642
std       244.287257
min         1.000000
25%        53.000000
50%       139.500000
75%       286.750000
90%       476.100000
95%       642.550000
99%      1079.000000
max      2903.000000
```

## Disponibilidad de campos


```text
Disponibilidad por modalidad:
           tiene_gps  tiene_fc  tiene_altitud  tiene_velocidad_original
modalidad                                                              
Bicicleta      0.999       1.0            1.0                     0.232
Carrera        1.000       1.0            1.0                     0.188
MTB            1.000       1.0            1.0                     0.098
  tiene_gps: 100.0%
  tiene_fc: 100.0%
  tiene_altitud: 100.0%
  tiene_velocidad_original: 20.2%
```

```text
Distribución de duraciones en min (intervalo entre primera y última marca temporal):
              count        mean           std           min        25%      50%         75%           max
modalidad                                                                                                
Bicicleta   97939.0  591.625887  48326.644479 -8.005000e+01  45.300000   88.550  149.233333  9.908696e+06
Carrera    117862.0  110.378729  26544.632409 -2.411572e+06  26.033333   45.950   68.433333  7.019319e+06
MTB         13510.0  362.831811  23627.388682 -3.714833e+02  57.554167  104.675  159.112500  2.741984e+06
```

```text
Distribución de distancias GPS en km SIN FILTRAR saltos:
              count       mean         std  min        25%        50%        75%           max
modalidad                                                                                     
Bicicleta   97939.0  41.402411   88.829892  0.0  15.218735  32.966743  56.581308  12684.720873
Carrera    117862.0   9.885187  101.236564  0.0   4.667774   8.059954  11.924642  31066.219303
MTB         13510.0  30.969020   21.727527  0.0  14.523266  26.906685  42.174658    301.225510
```

## Nº de actividades con saltos GPS > 2 km entre puntos (solo indicador de revisión)

1635  

## Campos presentes en al menos un registro (top 60)

  altitude: 229,413 registros (100.0%)  
  gender: 229,413 registros (100.0%)  
  heart_rate: 229,413 registros (100.0%)  
  id: 229,413 registros (100.0%)  
  url: 229,413 registros (100.0%)  
  userId: 229,413 registros (100.0%)  
  timestamp: 229,413 registros (100.0%)  
  longitude: 229,413 registros (100.0%)  
  latitude: 229,413 registros (100.0%)  
  sport: 229,413 registros (100.0%)  
  speed: 46,240 registros (20.2%)
