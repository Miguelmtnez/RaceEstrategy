# Prototipo TFM: visualizar recorridos y actividades deportivas

En este proyecto tenéis un visualizador básico para **GPX** de rutas como IMBA/FEDME/CNIG, **PLT** de Microsoft GeoLife y **JSON/JSON.GZ** de FitRec (Endomondo). Para cada recorrido muestra línea en mapa, punto de inicio, final, distancia, desnivel acumulado cuando hay altitudes y duración cuando los puntos tienen tiempo.

## 1. Instalar

Requiere Python >=3.10. En la carpeta del proyecto ejecutad:

```bash
python -m pip install -r requirements.txt
```

## 2. Probar directamente desde un enlace (GPX de prueba real)

```bash
python visualizar_rutas.py "https://raw.githubusercontent.com/tkrajina/gpxpy/master/test_files/cerknicko-jezero.gpx"
```

Este GPX es del repositorio de pruebas de gpxpy, NO una ruta IMBA ni una propuesta de senderismo. Sirve para comprobar que descarga, calcula y pinta la traza. Podéis cambiar la URL por cualquier enlace que devuelva directamente un GPX público.

## 3. Probar sin Internet (GPX sintético, NO transitabilidad verificada)

```bash
python visualizar_rutas.py EJEMPLO_SINTETICO_NO_NAVEGAR.gpx
```

Abrir `resultados/mapa_rutas.html` en el navegador. También se crea `resultados/resumen_rutas.csv` y uno o varios perfiles de altitud `perfil_XX.png`.

**Nota (versión corregida):** el mapa usa **OpenFreeMap + MapLibre**, NO solicita teselas al servidor `tile.openstreetmap.org` y no necesita clave API. Requiere Internet para la cartografía y la librería JavaScript. El GPX de demo es ficticio y no debe utilizarse para navegar. Conservad la atribución de OpenFreeMap/OpenMapTiles/OSM que aparece en el mapa.

## 4. Rutas oficiales IMBA del CNIG

1. Ir a https://centrodedescargas.cnig.es/CentroDescargas/rutas-imba-bicicleta
2. Buscar la ruta por nombre (p. ej. `IMBA0037-montecoche`). Seleccionar formato **GPX** y descargar el fichero. En ocasiones hay que añadirlo a la cesta y completar la descarga. La opción «localizar en mapa» puede mostrar solo el área de cobertura, no la línea GPS.
3. En la terminal (desde esta carpeta), ejecutar:

```bash
python visualizar_rutas.py descargas/IMBA0037_MONTECOCHE.GPX --salida mapas_imba
```

**Si falla el acceso automatizado al CNIG**: NO pegad la URL de la página del catálogo, porque no es un enlace directo al GPX. Descargad el fichero GPX desde el navegador y pasad la ruta local al programa. En septiembre de 2026 el CNIG cambió el procedimiento de descarga masiva; para pocas rutas, empezad con descargas individuales.

Créditos de datos derivados: «Obra derivada de RutasIMBA 2022-2025 CC-BY 4.0 IMBA». Confirmad formulación de atribución y fuentes concretas en la propia página del CNIG.

## 5. Microsoft GeoLife

Descargar datos originales desde https://www.microsoft.com/en-us/download/details.aspx?id=52367 y descomprimir el ZIP. Ejemplo:

```bash
python visualizar_rutas.py "Geolife Trajectories 1.3/Data/000/Trajectory/20081023025304.plt" --salida mapas_geolife
```

Se leen las primeras **6 líneas** como cabecera y a continuación cada punto: lat, lon, campo reservado, altitud en **pies**, fecha serial, fecha, hora; las altitudes se convierten a metros. Valor `-777` = altitud desconocida. El programa muestra distancia y duración total de la trayectoria; es tiempo transcurrido, no tiempo en movimiento. GeoLife mezcla transporte público, automóvil y deportes. Para estudiar solo ciclistas/corredores usad `--deporte bike` o `--deporte run`, por ejemplo:

```bash
python visualizar_rutas.py "Geolife Trajectories 1.3/Data/010/Trajectory/ARCHIVO.plt" --deporte bike --salida solo_bicis
```

Sustituid `ARCHIVO.plt` por un PLT real de ese usuario. El programa lee su `labels.txt` y filtra automáticamente intervalos etiquetados; si no hay etiquetas compatibles, **no tratará la trayectoria como deporte**. Tampoco representa por sí mismo niveles atléticos.

Estructura: `Data/ID_USUARIO/Trajectory/archivo.plt`; solo parte de los usuarios contienen `labels.txt`.

## 6. FitRec

Página del dataset: https://cseweb.ucsd.edu/~jmcauley/datasets/fitrec.html

Descargar el archivo raw **endomondoHR.json.gz** (no el `processed_endomondoHR_proper.npy` normalizado). Ejemplo:

```bash
python visualizar_rutas.py endomondoHR.json.gz --deporte bike --max-actividades 8 --salida mapas_fitrec_bici
python visualizar_rutas.py endomondoHR.json.gz --deporte run --max-actividades 8 --salida mapas_fitrec_running
```

El programa lee cada línea de JSON y acepta los antiguos literales de Python **sin usar `eval()`**; procesa solo hasta encontrar N actividades válidas. Es un primer explorador, no un proceso masivo de limpieza de FitRec. **Cuidado con `endomondoHR_proper.json` y versiones normalizadas:** algunos campos (velocidad/distancia/pulso, etc.) se transformaron en z-scores y no deben interpretarse como unidades físicas.

**Licencia FitRec:** disponible para investigación académica; **no redistribuir** los datos originales, y no usar para fines comerciales. Citad: Ni, Muhlstein & McAuley (WWW 2019), *Modeling heart rate and activity data for personalized fitness recommendation*. Comprobad también el tratamiento legal de datos sensibles / GPS; no publicad mapas individuales identificables sin autorización.

## 7. Cómo interpretar los resultados

- Distancia: suma de distancias Haversine entre puntos sucesivos **del mismo segmento**. Si hay tramos faltantes, se subestima.
- Ascenso/descenso: se calculan solo si >=80% de puntos incluyen elevación. Se aplica mediana de nueve puntos para suavizar ruido; es una **estimación**, no referencia altimétrica, y debe validarse con DEM o datos de calidad. En segmentos con altitudes parciales es aproximado.
- Tiempo total: último timestamp menos primero. Incluye pausas y no sirve si los timestamps son erróneos/incompletos. No confundir con tiempo en movimiento.
- Los GPX de rutas planificadas pueden no incluir timestamps: el tiempo aparecerá como «sin tiempos».
- Las rutas y actividades pueden tener datos GPS irregulares o segmentos discontinuos; revisad manualmente los outliers antes de entrenar ML.
- No calculéis «nivel deportivo» a partir de una ruta individual; separad `run`, `trail`, `road bike`, `MTB`, y usad los historiales de cada usuario, esfuerzos, tiempos y pendientes comparables.

## 8. Siguiente paso para la recomendación

- Dataset rutas: tabla `rutas(id, deporte, geometria_gpx, km, subida_m, superficie, dificultad_tecnica, fuente_licencia)`.
- Dataset actividad: tabla `actividades(id, deportista_anon, deporte, geometry, duration_s, km, subida_m, fecha, procedencia)`.
- Usad cada recorrido para estimar el tiempo con un modelo base (`km`, `subida`, `deporte`, `usuario`). Para evitar fuga de datos, separad por usuarios (y temporalmente si se puede), no solo filas aleatorias.
- Aviso: los resultados de una trayectoria de movilidad GeoLife no son rendimiento deportivo; seleccionad deportes etiquetados antes de entrenar.

Fuentes: CNIG, Microsoft GeoLife, McAuley Lab FitRec, gpxpy (repositorio de ejemplo). La licencia del **código** generado en este prototipo es libre para vuestro TFM; las licencias **de los datos externos** continúan siendo las de sus autores.


## 9. Corrección del error «403 Access blocked»

Si un mapa anterior se veía lleno de cuadros negros y amarillos, el servidor de teselas de OpenStreetMap estaba bloqueando las peticiones. **Esta versión ya no utiliza dicho servidor.** Descargad la versión actualizada del script y regenerad vuestro HTML desde el GPX original:

```bash
python visualizar_rutas.py IMBA0037_MONTECOCHE.GPX --salida mapas_imba
```

Abrir `mapas_imba/mapa_rutas.html` con Chrome/Firefox. Si los proveedores externos restringen archivos `file://`, abrid la terminal dentro de `mapas_imba` y ejecutad:

```bash
python -m http.server 8000
```

A continuación abrid <http://localhost:8000/mapa_rutas.html> en el navegador. Mantened esa terminal abierta mientras veis el mapa.

Si no disponéis del fondo cartográfico pero queréis ver la línea, también existe una opción sin teselas (muestra fondo liso, igualmente requiere conexión para cargar la librería JS):

```bash
python visualizar_rutas.py IMBA0037_MONTECOCHE.GPX --sin-fondo --salida mapas_sin_fondo
```

- OpenFreeMap: https://openfreemap.org/ (servicio público sin API key, atribución obligatoria).
- Guía de integración: https://openfreemap.org/quick_start/ .
- Información sobre el error 403 original: https://wiki.openstreetmap.org/wiki/Blocked_Tiles .
