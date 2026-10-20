#!/usr/bin/env python3
"""Visor de recorridos GPX, GeoLife (.plt) y FitRec (.json/.json.gz) con OpenFreeMap.

Ejemplos:
 python visualizar_rutas.py ruta_imba.gpx
 python visualizar_rutas.py https://raw.githubusercontent.com/tkrajina/gpxpy/master/test_files/cerknicko-jezero.gpx
 python visualizar_rutas.py Data/010/Trajectory/20081101035927.plt
 python visualizar_rutas.py endomondoHR.json.gz --deporte bike --max-actividades 10
 python visualizar_rutas.py ruta_1.gpx ruta_2.gpx --salida resultados

Solo se descargarán enlaces directos de archivos GPX; las páginas HTML de CNIG
requieren obtener el GPX desde la web primero.
"""
from __future__ import annotations
import argparse
import webbrowser
import ast
import csv
import gzip
import html
import io
import json
import math
import statistics
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests


@dataclass
class Punto:
    lat: float
    lon: float
    ele: float | None = None
    fecha: datetime | None = None


@dataclass
class Actividad:
    nombre: str
    origen: str
    segmentos: list[list[Punto]] = field(default_factory=list)
    deporte: str = "sin especificar"


COLORES = ["#2266bb", "#ed6a23", "#0c8d76", "#8f5da3", "#d14267", "#a68012"]


def parse_fecha(raw):
    """Devuelve fechas con zona UTC si el dato no especifica una zona."""
    if raw is None or raw == "":
        return None
    if isinstance(raw, (int, float)):
        try:
            return datetime.fromtimestamp(raw, timezone.utc)
        except (ValueError, OverflowError, OSError):
            return None
    try:
        fecha = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        return fecha if fecha.tzinfo is not None else fecha.replace(tzinfo=timezone.utc)
    except (ValueError, OverflowError):
        return None


def distancia_m(a: Punto, b: Punto) -> float:
    """Haversine; distancia GPS aproximada sobre WGS84."""
    R = 6371008.8
    p1, p2 = math.radians(a.lat), math.radians(b.lat)
    dphi = p2 - p1
    dlambda = math.radians(b.lon - a.lon)
    h = math.sin(dphi / 2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dlambda / 2)**2
    return 2*R*math.asin(min(1.0, math.sqrt(h)))


def hijos_locales(elemento, nombre):
    return [e for e in elemento if e.tag.rsplit("}", 1)[-1] == nombre]


def primer_texto(elemento, nombre):
    for e in elemento:
        if e.tag.rsplit("}", 1)[-1] == nombre:
            return e.text
    return None


def parse_punto_gpx(elem):
    try:
        lat, lon = float(elem.attrib["lat"]), float(elem.attrib["lon"])
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return None
        s_ele = primer_texto(elem, "ele")
        elev = float(s_ele) if s_ele not in (None, "") else None
        if elev is not None and not math.isfinite(elev):
            elev = None
        return Punto(lat, lon, elev, parse_fecha(primer_texto(elem, "time")))
    except (ValueError, KeyError):
        return None


def leer_gpx(contenido: bytes, nombre: str, origen: str) -> list[Actividad]:
    try:
        raiz = ET.fromstring(contenido)
    except ET.ParseError as e:
        raise ValueError(f"No parece un GPX XML válido: {e}") from e
    if raiz.tag.rsplit("}", 1)[-1].lower() != "gpx":
        raise ValueError("El enlace no devuelve un archivo GPX (posiblemente una página web HTML).")
    actividades = []
    for elem in raiz:
        tag = elem.tag.rsplit("}", 1)[-1]
        if tag == "trk":
            segmentos = []
            for seg in hijos_locales(elem, "trkseg"):
                puntos = [p for x in hijos_locales(seg, "trkpt") if (p := parse_punto_gpx(x))]
                if len(puntos) >= 2:
                    segmentos.append(puntos)
            if segmentos:
                actividades.append(Actividad(primer_texto(elem, "name") or nombre, origen, segmentos))
        if tag == "rte":
            puntos = [p for x in hijos_locales(elem, "rtept") if (p := parse_punto_gpx(x))]
            if len(puntos) >= 2:
                actividades.append(Actividad(primer_texto(elem, "name") or nombre, origen, [puntos]))
    if not actividades:
        raise ValueError("GPX sin recorridos de al menos dos puntos (solo waypoints o segmentos vacíos).")
    return actividades


def leer_plt(ruta: Path, deporte: str | None = None) -> list[Actividad]:
    """GeoLife PLT: seis líneas de cabecera, altitud en pies (-777=sin dato).

    Con --deporte (bike/run) selecciona SOLO intervalos etiquetados en labels.txt
    ubicado un nivel sobre Trajectory/; una trayectoria puede tener varios modos.
    """
    puntos = []
    with ruta.open(encoding="utf-8-sig", errors="replace") as f:
        for i, linea in enumerate(f):
            if i < 6:
                continue
            cols = linea.strip().split(",")
            if len(cols) < 7:
                continue
            try:
                lat, lon = float(cols[0]), float(cols[1])
                if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                    continue
                alt_pies = float(cols[3])
                alt_m = None if alt_pies == -777 else alt_pies * 0.3048
                momento = parse_fecha(f"{cols[5]}T{cols[6]}+00:00")
                puntos.append(Punto(lat, lon, alt_m, momento))
            except ValueError:
                continue
    if len(puntos) < 2:
        raise ValueError(f"Archivo PLT sin suficientes puntos: {ruta}")
    if not deporte:
        return [Actividad(ruta.stem, "GeoLife", [puntos], "desconocido (ver labels.txt)")]

    labels_file = ruta.parent.parent / "labels.txt"
    if not labels_file.exists():
        raise ValueError(f"No hay labels.txt para validar '{deporte}' en {labels_file}; evita interpretar el PLT como entrenamiento")
    intervalos = []
    with labels_file.open(encoding="utf-8-sig", errors="replace") as f:
        for linea in f:
            partes = linea.split()
            if len(partes) != 5 or partes[-1].lower() != deporte.lower():
                continue
            inicio = parse_fecha(partes[0].replace("/", "-") + "T" + partes[1] + "+00:00")
            fin = parse_fecha(partes[2].replace("/", "-") + "T" + partes[3] + "+00:00")
            if inicio is not None and fin is not None:
                intervalos.append((inicio, fin))
    resultado = []
    for i, (inicio, fin) in enumerate(intervalos):
        intervalo = [p for p in puntos if p.fecha is not None and inicio <= p.fecha <= fin]
        if len(intervalo) >= 2:
            resultado.append(Actividad(f"{ruta.stem} {deporte} #{i+1}", "GeoLife etiquetado", [intervalo], deporte))
    if not resultado:
        raise ValueError(f"Este PLT no contiene intervalos etiquetados como '{deporte}'")
    return resultado


def leer_registro_fitrec(linea):
    try:
        obj = json.loads(linea)
    except json.JSONDecodeError:
        try:
            obj = ast.literal_eval(linea)  # datos históricos pueden estar en repr Python, nunca usar eval()
        except (ValueError, SyntaxError, MemoryError):
            return None
    return obj if isinstance(obj, dict) else None


def leer_fitrec(ruta: Path, deporte: str | None, max_actividades: int) -> list[Actividad]:
    """Lee bajo demanda unas pocas actividades, sin descomprimir todo FitRec en RAM."""
    opener = gzip.open if ruta.suffix.lower() == ".gz" else open
    resultado = []
    with opener(ruta, "rt", encoding="utf-8", errors="replace") as f:
        for linea in f:
            obj = leer_registro_fitrec(linea)
            if not obj:
                continue
            sport = str(obj.get("sport", "unknown")).lower()
            if deporte and deporte.lower() not in sport:
                continue
            lats, lons = obj.get("latitude"), obj.get("longitude")
            if not isinstance(lats, list) or not isinstance(lons, list):
                continue
            heights = obj.get("altitude") or []
            epochs = obj.get("timestamp") or []
            puntos = []
            for i in range(min(len(lats), len(lons))):
                try:
                    lat, lon = float(lats[i]), float(lons[i])
                    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                        continue
                    alt = float(heights[i]) if i < len(heights) and heights[i] is not None else None
                    stamp = parse_fecha(epochs[i]) if i < len(epochs) else None
                    puntos.append(Punto(lat, lon, alt, stamp))
                except (TypeError, ValueError, OverflowError):
                    continue
            if len(puntos) >= 2:
                titulo = f"FitRec {sport} · actividad {obj.get('id', len(resultado) + 1)}"
                resultado.append(Actividad(titulo, "FitRec (Endomondo)", [puntos], sport))
            if len(resultado) >= max_actividades:
                break
    if not resultado:
        raise ValueError("No se hallaron actividades FitRec que cumplan el filtro.")
    return resultado


def descargar_gpx(url):
    u = urlparse(url)
    if u.scheme not in {"http", "https"}:
        raise ValueError("Solo se admiten URLs http(s).")
    if not u.path.lower().endswith(".gpx"):
        raise ValueError("Pega un enlace DIRECTO a un .gpx, no a la página de CNIG. Desde CNIG descarga primero el archivo.")
    respuesta = requests.get(url, timeout=25, headers={"User-Agent": "TFM-Rutas/1.0"})
    respuesta.raise_for_status()
    if len(respuesta.content) > 15_000_000:
        raise ValueError("Archivo remoto demasiado grande (>15 MB).")
    return leer_gpx(respuesta.content, Path(u.path).stem, url)


def calcular_metricas(act: Actividad):
    distancia = 0.0
    ascenso = 0.0
    descenso = 0.0
    tiempos = []
    n_altos = 0
    n_total = 0
    perfil = []
    for seg in act.segmentos:
        for i, pt in enumerate(seg):
            n_total += 1
            if pt.ele is not None:
                n_altos += 1
            if pt.fecha is not None:
                tiempos.append(pt.fecha)
            if i:
                distancia += distancia_m(seg[i-1], pt)
            if pt.ele is not None:
                perfil.append((distancia / 1000, pt.ele))
        # Cálculo aproximado de desnivel: mediana deslizante (9 puntos)
        # para mitigar ruido de GPS. No une segmentos separados.
        validos = [p.ele for p in seg if p.ele is not None]
        if len(validos) >= 3 and len(validos) / len(seg) >= 0.8:
            elev = [p.ele for p in seg]
            if any(x is None for x in elev):
                continue
            suavizados = [statistics.median(elev[max(0, i-4):min(len(elev),i+5)]) for i in range(len(elev))]
            for a, b in zip(suavizados, suavizados[1:]):
                diferencia = b-a
                if abs(diferencia) > 60:  # descartar saltos verticales aberrantes entre lecturas
                    continue
                ascenso += max(0, diferencia)
                descenso += max(0, -diferencia)
    ini = act.segmentos[0][0]
    fin = act.segmentos[-1][-1]
    tiempo_h = None
    if len(tiempos) >= 2:
        inicio, fin_t = min(tiempos), max(tiempos)
        delta = (fin_t-inicio).total_seconds()
        if delta > 0:
            tiempo_h = delta / 3600
    alt_cobertura = n_altos / n_total if n_total else 0
    return {
        "nombre": act.nombre, "origen": act.origen, "deporte": act.deporte,
        "distancia_km": round(distancia/1000, 3),
        "desnivel_positivo_m": round(ascenso) if alt_cobertura >= 0.8 else None,
        "desnivel_negativo_m": round(descenso) if alt_cobertura >= 0.8 else None,
        "tiempo_total_min": round(tiempo_h*60, 1) if tiempo_h is not None else None,
        "velocidad_media_kmh": round(distancia/1000/tiempo_h, 2) if tiempo_h else None,
        "lat_inicio": round(ini.lat, 6), "lon_inicio": round(ini.lon, 6),
        "lat_final": round(fin.lat, 6), "lon_final": round(fin.lon, 6),
        "puntos_gps": n_total, "altitud_disponible_pct": round(100*alt_cobertura, 1),
    }, perfil


def html_mapa(datos, bounds, sin_fondo=False):
    """Genera un mapa MapLibre + OpenFreeMap (NO usa el servidor de teselas OSM)."""
    # Escape adicional para incrustar JSON dentro de <script> sin cerrar la etiqueta.
    def to_json(obj):
        return json.dumps(obj, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")

    bg_style = {"version": 8, "sources": {}, "layers": [
        {"id": "fondo-liso", "type": "background", "paint": {"background-color": "#eaf0f4"}}
    ]}
    style = bg_style if sin_fondo else "https://tiles.openfreemap.org/styles/liberty"
    style_js = to_json(style)
    data_js = to_json(datos)
    bounds_js = to_json(bounds)
    return r'''<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rutas deportivas · Visor TFM</title>
  <link href="https://unpkg.com/maplibre-gl@5.17.0/dist/maplibre-gl.css" rel="stylesheet">
  <script src="https://unpkg.com/maplibre-gl@5.17.0/dist/maplibre-gl.js"></script>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #172536; }
    .contenedor { display: grid; grid-template-columns: 310px 1fr; width: 100%; height: 100%; }
    aside { background:#fff; overflow:auto; border-right:1px solid #dce2e8; z-index:2; padding:22px 16px; }
    h1 { font-size:19px; margin:0 0 8px; letter-spacing:-.4px; }
    .intro { font-size:13px; color:#5b6878; line-height:1.5; margin:0 0 18px; }
    .ruta { display:block; width:100%; text-align:left; border:1px solid #dfe5ec; border-radius:11px; background:#fff; padding:13px; margin-bottom:9px; cursor:pointer; }
    .ruta:hover, .ruta:focus { outline:2px solid #62b8dc; outline-offset:0; }
    .titulo { font-weight:750; font-size:13px; overflow-wrap:anywhere; }
    .dato { margin-top:6px; font-size:12px; color:#415168; line-height:1.6; }
    .chip { display:inline-block; height:10px; width:10px; border-radius:50%; margin-right:8px; }
    .leyenda { font-size:12px; color:#526377; border-top:1px solid #e5eaf0; padding-top:14px; margin-top:20px; }
    .leyenda p { margin:6px 0; }
    .leyenda strong { color:#172536; }
    main { position:relative; min-height:300px; }
    #map { height:100%; width:100%; }
    #estado { position:absolute; bottom:24px; left:20px; max-width:370px; background:#fff; border-radius:9px; box-shadow:0 3px 16px #0002; padding:10px 14px; z-index:5; font-size:12px; color:#334155; display:none; }
    .maplibregl-popup-content { font-size:13px; line-height:1.55; }
    @media(max-width:700px) { .contenedor { display:flex; flex-direction:column-reverse; } aside { height:37%; border-right:0; border-top:1px solid #dce2e8; padding:12px; } main { height:63%; } h1 { font-size:17px; } }
  </style>
</head>
<body>
<div class="contenedor">
  <aside>
    <h1>Rutas deportivas</h1>
    <p class="intro">Explora el recorrido completo, consulta la distancia, el desnivel y la duración grabada. Pulsa una ruta para centrarla.</p>
    <div id="lista"></div>
    <div class="leyenda">
      <p><strong>Inicio:</strong> marcador verde · <strong>Final:</strong> marcador rojo</p>
      <p>El desnivel es estimado a partir de los puntos de altitud disponibles.</p>
      <p>Cartografía: OpenFreeMap / OpenMapTiles / OpenStreetMap (atribución dentro del mapa).</p>
    </div>
  </aside>
  <main><div id="map"></div><div id="estado" role="status"></div></main>
</div>
<script>
const recorridos = __DATOS__;
const límites = __BOUNDS__;
const estilo = __ESTILO__;
const aviso = document.getElementById('estado');
function estado(mensaje) { aviso.textContent=mensaje; aviso.style.display='block'; }
if (typeof maplibregl === 'undefined') {
  estado('No se ha podido cargar MapLibre. Comprueba la conexión a Internet o prueba a abrir el HTML desde localhost.');
} else {
  const map = new maplibregl.Map({
    container:'map',
    style:estilo,
    center:[(límites[0][0]+límites[1][0])/2, (límites[0][1]+límites[1][1])/2],
    zoom: 11,
    attributionControl:true
  });
  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  const features = [];
  const markers = [];
  for (const r of recorridos) {
    for (const c of r.segmentos) {
      if (c.length > 1) features.push({type:'Feature', properties:{nombre:r.nombre, color:r.color, km:r.km, asc:r.asc}, geometry:{type:'LineString', coordinates:c}});
    }
    const btn=document.createElement('button');
    btn.className='ruta'; btn.type='button';
    const header=document.createElement('div'); header.className='titulo';
    const chip=document.createElement('span'); chip.className='chip'; chip.style.backgroundColor=r.color;
    header.append(chip, document.createTextNode(r.nombre));
    const desc=document.createElement('div'); desc.className='dato';
    desc.textContent=r.km.toFixed(2)+' km · '+(r.asc===null?'desnivel s/d':'+'+r.asc+' m')+' · '+(r.min===null?'sin tiempo':r.min+' min');
    btn.append(header,desc);
    btn.addEventListener('click', () => map.fitBounds(r.bounds, {padding:60, maxZoom:15, duration:650}));
    document.getElementById('lista').appendChild(btn);
  }
  function crearMarcadores() {
    for (const r of recorridos) {
      for (const [coor, color, tipo] of [[r.inicio,'#15995f','Inicio'],[r.final,'#d94142','Final']]) {
        const popup=new maplibregl.Popup({offset:14}).setText(tipo+' · '+r.nombre);
        markers.push(new maplibregl.Marker({color, scale:0.78}).setLngLat(coor).setPopup(popup).addTo(map));
      }
    }
  }
  map.on('load', () => {
    map.addSource('trazados',{type:'geojson',data:{type:'FeatureCollection',features}});
    map.addLayer({id:'contorno',type:'line',source:'trazados',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#fff','line-width':7,'line-opacity':.88}});
    map.addLayer({id:'rutas',type:'line',source:'trazados',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':['get','color'],'line-width':4,'line-opacity':.95}});
    crearMarcadores();
    map.fitBounds(límites, {padding:55, maxZoom:14, duration:0});
    map.on('click','rutas',e => {
       const f=e.features[0]; if (!f) return;
       new maplibregl.Popup().setLngLat(e.lngLat).setText(f.properties.nombre+' · '+Number(f.properties.km).toFixed(2)+' km').addTo(map);
    });
    map.on('mouseenter','rutas',()=>map.getCanvas().style.cursor='pointer');
    map.on('mouseleave','rutas',()=>map.getCanvas().style.cursor='');
  });
  let nError=0;
  map.on('error', err => {
    nError++;
    if (nError===3) estado('No ha cargado correctamente el mapa base. Revisa la conexión y abre el HTML mediante http://localhost:8000.');
  });
}
</script>
</body>
</html>'''.replace("__DATOS__", data_js).replace("__BOUNDS__", bounds_js).replace("__ESTILO__", style_js)


def visualizar(actividades: list[Actividad], salida: Path, sin_fondo: bool=False):
    salida.mkdir(parents=True, exist_ok=True)
    # Los perfiles antiguos podrían pertenecer a una ejecución con más rutas.
    # Solo borramos los PNG con el patrón que genera este propio programa.
    for perfil_antiguo in salida.glob("perfil_[0-9][0-9].png"):
        perfil_antiguo.unlink()
    metricas=[]
    datos=[]
    latitudes=[]
    longitudes=[]
    for idx, act in enumerate(actividades):
        color=COLORES[idx % len(COLORES)]
        met, perfil=calcular_metricas(act)
        metricas.append(met)
        segmentos=[]
        for seg in act.segmentos:
            coords=[[p.lon,p.lat] for p in seg]
            segmentos.append(coords)
            longitudes.extend([c[0] for c in coords])
            latitudes.extend([c[1] for c in coords])
        pri, fin=act.segmentos[0][0],act.segmentos[-1][-1]
        bounds=[[min(c[0] for seg in segmentos for c in seg),min(c[1] for seg in segmentos for c in seg)],
                [max(c[0] for seg in segmentos for c in seg),max(c[1] for seg in segmentos for c in seg)]]
        datos.append({'nombre':act.nombre,'color':color,'km':met['distancia_km'],'asc':met['desnivel_positivo_m'],
                      'min':met['tiempo_total_min'],'segmentos':segmentos,
                      'inicio':[pri.lon,pri.lat],'final':[fin.lon,fin.lat],'bounds':bounds})
        if len(perfil)>=2:
            try:
                import matplotlib
                matplotlib.use('Agg')
                import matplotlib.pyplot as plt
                fig, ax=plt.subplots(figsize=(9,3))
                ax.plot([d for d,_ in perfil],[e for _,e in perfil],linewidth=1.25)
                ax.set_xlabel('Distancia acumulada (km)')
                ax.set_ylabel('Altitud (m)')
                ax.set_title(act.nombre[:85])
                fig.tight_layout()
                fig.savefig(salida/f'perfil_{idx+1:02d}.png',dpi=130)
                plt.close(fig)
            except ImportError: pass
    bounds_global=[[min(longitudes),min(latitudes)],[max(longitudes),max(latitudes)]]
    (salida/'mapa_rutas.html').write_text(html_mapa(datos,bounds_global,sin_fondo),encoding='utf-8')
    with (salida/'resumen_rutas.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=metricas[0].keys(),delimiter=';')
        writer.writeheader()
        writer.writerows(metricas)
    return metricas

def main():
    p = argparse.ArgumentParser(description="Ver GPX, GeoLife PLT y FitRec en un mapa HTML interactivo.")
    p.add_argument("entradas", nargs="+", help="Rutas .gpx, .plt, .json/.json.gz, o URL directa .gpx")
    p.add_argument(
        "--salida", type=Path,
        default=Path(__file__).resolve().parent / "resultados",
        help="Carpeta de salida (por defecto, 'resultados' junto a este script)",
    )
    p.add_argument(
        "--no-abrir", action="store_true",
        help="No abrir automáticamente el mapa HTML al terminar.",
    )
    p.add_argument("--deporte", default=None, help="Filtro FitRec (bike, run)")
    p.add_argument("--max-actividades", type=int, default=5, help="Número máximo de actividades FitRec")
    p.add_argument("--sin-fondo", action="store_true", help="Dibuja fondo liso sin solicitar teselas; muestra igualmente la ruta.")
    a = p.parse_args()
    actividades = []
    for origen in a.entradas:
        try:
            if origen.startswith(("http://", "https://")):
                actividades += descargar_gpx(origen)
                continue
            ruta = Path(origen)
            if not ruta.is_file():
                raise FileNotFoundError(f"No existe: {ruta}")
            ext = ruta.suffix.lower()
            if ext == ".gpx":
                actividades += leer_gpx(ruta.read_bytes(), ruta.stem, str(ruta))
            elif ext == ".plt":
                actividades += leer_plt(ruta, a.deporte)
            elif ext in {".json", ".gz"}:
                actividades += leer_fitrec(ruta, a.deporte, max(1, a.max_actividades))
            else:
                raise ValueError("Solo se admiten GPX, GeoLife .plt y FitRec .json/.json.gz")
        except Exception as e:
            print(f"AVISO: No se pudo leer {origen}: {e}", file=sys.stderr)
    if not actividades:
        sys.exit("No se pudieron cargar recorridos. Revisa los mensajes de error.")
    metricas = visualizar(actividades, Path(a.salida), sin_fondo=a.sin_fondo)
    for m in metricas:
        txt_alt = f"+{m['desnivel_positivo_m']} m" if m['desnivel_positivo_m'] is not None else "sin altitud"
        txt_t = f"{m['tiempo_total_min']} min" if m['tiempo_total_min'] is not None else "sin tiempos"
        print(f"{m['nombre']}: {m['distancia_km']} km | {txt_alt} | {txt_t}")
    mapa_html = a.salida.resolve() / "mapa_rutas.html"
    print(f"\nArchivos generados en {a.salida.resolve()}: mapa_rutas.html, resumen_rutas.csv, perfil_XX.png")
    if not a.no_abrir:
        print(f"Abriendo el mapa en el navegador: {mapa_html}")
        try:
            abierto = webbrowser.open(mapa_html.as_uri(), new=2)
            if not abierto:
                print("No se pudo abrir el navegador automáticamente. Abre el HTML manualmente.")
        except (OSError, webbrowser.Error) as exc:
            print(f"No se pudo abrir el navegador ({exc}). Abre el HTML manualmente.")


if __name__ == "__main__":
    main()
