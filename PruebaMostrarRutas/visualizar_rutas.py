#!/usr/bin/env python3
"""Visor de GPX, Garmin FIT/FIT.GZ, GeoLife (.plt) y FitRec con OpenFreeMap.

Ejemplos:
 python visualizar_rutas.py ruta_imba.gpx
 python visualizar_rutas.py https://raw.githubusercontent.com/tkrajina/gpxpy/master/test_files/cerknicko-jezero.gpx
 python visualizar_rutas.py Data/010/Trajectory/20081101035927.plt
 python visualizar_rutas.py endomondoHR.json.gz --deporte bike --max-actividades 10
 python visualizar_rutas.py ruta_1.gpx ruta_2.fit.gz --salida resultados
 python visualizar_rutas.py GPX/activities                   # carpeta con GPX y FIT.GZ

Solo se descargarán enlaces directos de archivos GPX; las páginas HTML de CNIG
requieren obtener el GPX desde la web primero.
"""
from __future__ import annotations
import argparse
import webbrowser
import ast
import csv
import gzip
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
    datos_fit: dict = field(default_factory=dict)  # métricas originales del dispositivo


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




def _num_valido(valor):
    """float finito o None, sin convertir False en un valor biométrico."""
    if valor is None or isinstance(valor, bool):
        return None
    try:
        n = float(valor)
        return n if math.isfinite(n) else None
    except (TypeError, ValueError, OverflowError):
        return None


def _normalizar_deporte(raw):
    if raw is None:
        return "sin especificar"
    txt = str(raw).strip().lower()
    if txt in ("running", "run"):
        return "run"
    if txt in ("cycling", "bike", "biking"):
        return "bike"
    return txt or "sin especificar"


def _coord_semicirculos(raw):
    """FIT position_lat/long: semicircles enteros (2^31 = 180 grados)."""
    valor = _num_valido(raw)
    return valor * 180.0 / (2 ** 31) if valor is not None else None


def leer_fit(ruta: Path, permitir_sin_gps: bool = False) -> list[Actividad]:
    """Lee Garmin FIT y FIT.GZ; mantiene metadatos originales de sesión.

    fitparse convierte automáticamente las escalas de velocidad, distancia y altitud.
    Los campos de posición sí necesitan semicircles -> grados.
    """
    try:
        from fitparse import FitFile
    except ImportError as e:
        raise RuntimeError(
            "Falta fitparse. Instálalo con: python -m pip install -r requirements.txt"
        ) from e

    es_gzip = ruta.name.lower().endswith(".fit.gz")
    abrir = gzip.open if es_gzip else open
    puntos = []
    sesiones = []
    detalles = {"primera_fecha_registro": None, "ultima_fecha_registro": None}
    contadores = {"heart_rate": [0, 0.0], "power": [0, 0.0], "cadence": [0, 0.0]}
    tipo = None
    with abrir(ruta, "rb") as archivo:
        fit = FitFile(archivo)
        for mensaje in fit.get_messages():
            if mensaje.name == "session":
                sesiones.append(mensaje.get_values())
            elif mensaje.name == "sport":
                tipo = mensaje.get_value("sport") or tipo
            elif mensaje.name == "record":
                fecha = parse_fecha(mensaje.get_value("timestamp"))
                if fecha is not None:
                    if detalles["primera_fecha_registro"] is None or fecha < detalles["primera_fecha_registro"]:
                        detalles["primera_fecha_registro"] = fecha
                    if detalles["ultima_fecha_registro"] is None or fecha > detalles["ultima_fecha_registro"]:
                        detalles["ultima_fecha_registro"] = fecha
                for campo, (conteo, suma) in contadores.items():
                    val = _num_valido(mensaje.get_value(campo))
                    if val is not None:
                        contadores[campo] = [conteo + 1, suma + val]
                lat = _coord_semicirculos(mensaje.get_value("position_lat"))
                lon = _coord_semicirculos(mensaje.get_value("position_long"))
                if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
                    continue
                ele = _num_valido(mensaje.get_value("enhanced_altitude"))
                if ele is None:
                    ele = _num_valido(mensaje.get_value("altitude"))
                puntos.append(Punto(lat, lon, ele, fecha))

    # La inmensa mayoría de actividades tiene una sesión. Si hay varias,
    # marcamos esa particularidad para evitar confundir deportes combinados.
    sesion = sesiones[0] if sesiones else {}
    if not tipo:
        tipo = sesion.get("sport")
    if not puntos and not permitir_sin_gps:
        raise ValueError("FIT sin puntos GPS: puede ser una actividad indoor; no hay ruta para dibujar")
    for campo in contadores:
        n, suma = contadores[campo]
        detalles[f"media_{campo}_registros"] = (suma / n) if n else None
    for campo in ("total_distance", "total_elapsed_time", "total_timer_time", "total_ascent",
                  "total_descent", "avg_heart_rate", "max_heart_rate", "avg_power",
                  "avg_cadence", "total_calories"):
        detalles[campo] = _num_valido(sesion.get(campo))
    detalles["sesiones_en_fit"] = len(sesiones)
    detalles["fecha_sesion"] = parse_fecha(sesion.get("start_time"))
    nombre = ruta.name[:-7] if es_gzip else ruta.stem
    return [Actividad(nombre, str(ruta), [puntos] if len(puntos) >= 2 else [],
                      _normalizar_deporte(tipo), detalles)]



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
    """Métricas del GPS + datos originales FIT, preservando diferencias de origen."""
    distancia = 0.0
    ascenso = 0.0
    descenso = 0.0
    tiempos = []
    n_altos = 0
    n_total = 0
    perfil = []
    todas_elevaciones = []
    for seg in act.segmentos:
        for i, pt in enumerate(seg):
            n_total += 1
            if pt.ele is not None:
                n_altos += 1
                todas_elevaciones.append(pt.ele)
            if pt.fecha is not None:
                tiempos.append(pt.fecha)
            if i:
                distancia += distancia_m(seg[i-1], pt)
            if pt.ele is not None:
                perfil.append((distancia / 1000, pt.ele))
        # Mediana de 9 puntos para reducir ruido altimétrico.
        validos = [p.ele for p in seg if p.ele is not None]
        if len(validos) >= 3 and len(validos) / len(seg) >= 0.8:
            elev = [p.ele for p in seg]
            if any(x is None for x in elev):
                continue
            suavizados = [statistics.median(elev[max(0, i-4):min(len(elev),i+5)]) for i in range(len(elev))]
            for a, b in zip(suavizados, suavizados[1:]):
                diferencia = b-a
                if abs(diferencia) > 60:
                    continue
                ascenso += max(0, diferencia)
                descenso += max(0, -diferencia)
    ini = act.segmentos[0][0] if act.segmentos else None
    fin = act.segmentos[-1][-1] if act.segmentos else None
    d = act.datos_fit
    inicio_t = min(tiempos) if tiempos else d.get("primera_fecha_registro") or d.get("fecha_sesion")
    fin_t = max(tiempos) if tiempos else d.get("ultima_fecha_registro")
    tiempo_h = None
    if inicio_t is not None and fin_t is not None:
        delta = (fin_t - inicio_t).total_seconds()
        if delta > 0:
            tiempo_h = delta / 3600
    tiempo_gps_h = tiempo_h
    # Priorizar la duración de sesión declarada por el reloj cuando existe;
    # mostrar aparte la duración deducida de los puntos GPS para auditoría.
    if d.get("total_elapsed_time") and d["total_elapsed_time"] > 0:
        tiempo_h = d["total_elapsed_time"] / 3600
    distancia_gps_km = distancia / 1000 if n_total >= 2 else None
    distancia_fit_km = d.get("total_distance") / 1000 if d.get("total_distance") is not None else None
    distancia_uso_km = distancia_gps_km if distancia_gps_km is not None else distancia_fit_km
    alt_cobertura = n_altos / n_total if n_total else 0
    fit_ascenso = d.get("total_ascent")
    fit_descenso = d.get("total_descent")
    ascenso_uso = fit_ascenso if fit_ascenso is not None else (ascenso if alt_cobertura >= 0.8 else None)
    descenso_uso = fit_descenso if fit_descenso is not None else (descenso if alt_cobertura >= 0.8 else None)
    def fecha_iso(fecha):
        return fecha.isoformat() if fecha else None
    datos = {
        "nombre": act.nombre, "origen": act.origen, "deporte": act.deporte,
        "distancia_km": round(distancia_uso_km, 3) if distancia_uso_km is not None else None,
        "distancia_gps_km": round(distancia_gps_km, 3) if distancia_gps_km is not None else None,
        "distancia_dispositivo_km": round(distancia_fit_km, 3) if distancia_fit_km is not None else None,
        "desnivel_positivo_m": round(ascenso_uso) if ascenso_uso is not None else None,
        "desnivel_negativo_m": round(descenso_uso) if descenso_uso is not None else None,
        "desnivel_gps_estimado_m": round(ascenso) if alt_cobertura >= 0.8 else None,
        "tiempo_total_min": round(tiempo_h * 60, 1) if tiempo_h is not None else None,
        "tiempo_gps_min": round(tiempo_gps_h * 60, 1) if tiempo_gps_h is not None else None,
        "tiempo_movimiento_min": round(d["total_timer_time"] / 60, 1) if d.get("total_timer_time") is not None else None,
        "velocidad_media_kmh": round(distancia_uso_km / tiempo_h, 2) if distancia_uso_km is not None and tiempo_h else None,
        "velocidad_movimiento_kmh": round(distancia_uso_km * 3600 / d["total_timer_time"], 2)
        if distancia_uso_km is not None and d.get("total_timer_time") else None,
        "lat_inicio": round(ini.lat, 6) if ini else None,
        "lon_inicio": round(ini.lon, 6) if ini else None,
        "lat_final": round(fin.lat, 6) if fin else None,
        "lon_final": round(fin.lon, 6) if fin else None,
        "altitud_inicio_m": round(ini.ele, 2) if ini and ini.ele is not None else None,
        "altitud_final_m": round(fin.ele, 2) if fin and fin.ele is not None else None,
        "altitud_min_m": round(min(todas_elevaciones), 2) if todas_elevaciones else None,
        "altitud_max_m": round(max(todas_elevaciones), 2) if todas_elevaciones else None,
        "fecha_inicio_utc": fecha_iso(inicio_t), "fecha_fin_utc": fecha_iso(fin_t),
        "frecuencia_cardiaca_media_ppm": d.get("avg_heart_rate") or d.get("media_heart_rate_registros"),
        "frecuencia_cardiaca_max_ppm": d.get("max_heart_rate"),
        "potencia_media_w": d.get("avg_power") or d.get("media_power_registros"),
        "cadencia_media": d.get("avg_cadence") or d.get("media_cadence_registros"),
        "calorias_kcal": d.get("total_calories"),
        "sesiones_en_fit": d.get("sesiones_en_fit"),
        "puntos_gps": n_total, "altitud_disponible_pct": round(100 * alt_cobertura, 1),
    }
    return datos, perfil


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
    .ruta.seleccionada { border:2px solid #146eac; background:#edf7ff; padding:12px; }
    .cabecera-rutas { display:flex; justify-content:space-between; align-items:center; margin:0 0 8px; gap:8px; }
    .etiqueta { font-size:12px; color:#526377; }
    .seleccion { background:#eff8fd; border:1px solid #b9d8ec; padding:12px; border-radius:11px; margin:0 0 15px; }
    .seleccion h2 { font-size:14px; margin:0 0 7px; overflow-wrap:anywhere; }
    .seleccion .dato { margin:0 0 10px; }
    #buscar { display:block; width:100%; padding:9px; border:1px solid #cad5e1; border-radius:9px; margin-bottom:10px; }
    .oculta { display:none !important; }
    .titulo { font-weight:750; font-size:13px; overflow-wrap:anywhere; }
    .dato { margin-top:6px; font-size:12px; color:#415168; line-height:1.6; }
    .controles-ruta { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:11px; }
    .accion { border:1px solid #cad5e1; border-radius:8px; padding:9px 11px; background:#f6f9fc; color:#16304d; font-weight:650; font-size:12px; cursor:pointer; }
    .accion:hover { background:#e9f2fb; }
    .accion:focus { outline:3px solid #65a9e5; }
    .accion.principal { background:#176c51; color:#fff; border-color:#176c51; }
    #estado-gps { font-size:12px; border-radius:8px; background:#ecf5f9; padding:10px; line-height:1.55; margin:11px 0; overflow-wrap:anywhere; }
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
    <p class="intro">Visualiza todas las rutas. Selecciona una ruta en la lista o pulsa su trazado para elegirla y usar las acciones móviles.</p>
    <div class="seleccion" id="panel-seleccion" hidden>
      <h2 id="nombre-seleccion">Ninguna ruta seleccionada</h2>
      <div class="dato" id="datos-seleccion"></div>
      <div class="controles-ruta" id="acciones-seleccion"></div>
    </div>
    <div class="cabecera-rutas"><strong>Rutas</strong><span class="etiqueta" id="contador-rutas"></span></div>
    <input id="buscar" type="search" placeholder="Buscar una ruta por nombre" aria-label="Buscar rutas">
    <div id="lista"></div>
    <div id="estado-gps" role="status">GPS desactivado. En el móvil, abre esta página mediante HTTPS para activar «Seguir ruta».</div>
    <button id="detener-gps" class="accion" type="button" hidden>Detener seguimiento GPS</button>
    <div class="leyenda">
      <p><strong>Inicio:</strong> marcador verde · <strong>Final:</strong> marcador rojo</p>
      <p>«Seguir ruta» muestra la posición del móvil y la distancia aproximada al recorrido; no proporciona instrucciones giro a giro ni garantiza que el camino sea seguro.</p>
      <p>En Wikiloc/OsmAnd/Komoot, usa «Compartir GPX» y selecciona la aplicación. En Strava, importa el GPX desde «Mis rutas» en su web.</p>
      <p>Para usar el GPS del móvil es necesario <strong>HTTPS</strong>, permiso de ubicación y mantener abierta la página. Los mapas de fondo requieren Internet.</p>
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
  const tarjetas = [];
  let indiceSeleccionado = null;
  const panel = document.getElementById('panel-seleccion');
  const tituloPanel = document.getElementById('nombre-seleccion');
  const datosPanel = document.getElementById('datos-seleccion');
  const accionesPanel = document.getElementById('acciones-seleccion');
  const buscar = document.getElementById('buscar');
  const lista = document.getElementById('lista');
  document.getElementById('contador-rutas').textContent = recorridos.length+' en el mapa';
  const estadoGps = document.getElementById('estado-gps');
  const detenerGps = document.getElementById('detener-gps');
  let gpsWatch = null;
  let gpsMarker = null;
  let rutaActiva = null;
  const R = 6371008.8;
  function escapeXML(valor) {
    return String(valor).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;').replaceAll("'",'&apos;');
  }
  function xmlGPX(r) {
    // Rutas planificadas: sin timestamps de actividades reales.
    const partes = r.segmentos.map((segmento,indice) => '<trkseg>'+segmento.map((c,i) => {const ele=r.elevaciones[indice][i];return '<trkpt lat="'+c[1]+'" lon="'+c[0]+'">'+(ele===null?'':'<ele>'+ele+'</ele>')+'</trkpt>';}).join('')+'</trkseg>').join('');
    return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="RaceEstrategy" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>'+escapeXML(r.nombre)+'</name>'+partes+'</trk></gpx>';
  }
  function archivoGPX(r) {
    return new File([xmlGPX(r)], r.archivo_gpx, {type:'application/gpx+xml'});
  }
  function descargarArchivo(r) {
    const url=URL.createObjectURL(new Blob([xmlGPX(r)],{type:'application/gpx+xml'}));
    const link=document.createElement('a'); link.href=url; link.download=r.archivo_gpx;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  async function compartirGPX(r) {
    const fichero=archivoGPX(r);
    try {
      if (navigator.share && navigator.canShare && navigator.canShare({files:[fichero]})) {
        await navigator.share({files:[fichero],title:r.nombre});
        return;
      }
    } catch(error) {
      if (error.name==='AbortError') return;
    }
    descargarArchivo(r);
    estadoGps.textContent='Se ha descargado el GPX. En el móvil, abre el archivo y selecciona Wikiloc, OsmAnd o Komoot.';
  }
  function distMetros(lat1, lon1, lat2, lon2) {
    const x=(lon2-lon1)*Math.PI/180*Math.cos((lat1+lat2)*Math.PI/360);
    const y=(lat2-lat1)*Math.PI/180;
    return Math.sqrt(x*x+y*y)*R;
  }
  function distanciaAlTrazado(lat,lon,r) {
    let mejor=Infinity;
    // Proyección local equirectangular de cada tramo; adecuada para distancias próximas.
    const escalaLon=Math.cos(lat*Math.PI/180)*Math.PI/180*R;
    const escalaLat=Math.PI/180*R;
    for(const seg of r.segmentos){
      for(let i=1;i<seg.length;i++){
        const a=seg[i-1],b=seg[i];
        const ax=(a[0]-lon)*escalaLon,ay=(a[1]-lat)*escalaLat;
        const bx=(b[0]-lon)*escalaLon,by=(b[1]-lat)*escalaLat;
        const dx=bx-ax,dy=by-ay;
        const t=Math.max(0,Math.min(1, -(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
        const d=Math.hypot(ax+t*dx,ay+t*dy);
        if(d<mejor) mejor=d;
      }
    }
    return mejor;
  }
  function detenerSeguimiento(){
    if(gpsWatch!==null) navigator.geolocation.clearWatch(gpsWatch);
    gpsWatch=null; rutaActiva=null; detenerGps.hidden=true;
    if(gpsMarker){gpsMarker.remove();gpsMarker=null;}
    estadoGps.textContent='GPS detenido. Tu ubicación no se ha guardado ni enviado a nuestro servidor.';
  }
  detenerGps.addEventListener('click', detenerSeguimiento);
  function empezarSeguimiento(r) {
    if(!navigator.geolocation){estadoGps.textContent='Este navegador no admite geolocalización.';return;}
    if(!window.isSecureContext){estadoGps.textContent='Para activar el GPS abre el visor desde una web HTTPS (o localhost para probar en este mismo equipo).';return;}
    detenerSeguimiento(); rutaActiva=r; detenerGps.hidden=false;
    estadoGps.textContent='Solicitando permiso de ubicación del dispositivo...';
    gpsWatch=navigator.geolocation.watchPosition(pos=>{
      const {latitude:lat,longitude:lon,accuracy}=pos.coords;
      if(!rutaActiva) return;
      const distancia=distanciaAlTrazado(lat,lon,rutaActiva);
      if(!gpsMarker) gpsMarker=new maplibregl.Marker({color:'#1068df',scale:1.1}).setLngLat([lon,lat]).addTo(map);
      else gpsMarker.setLngLat([lon,lat]);
      map.easeTo({center:[lon,lat],zoom:Math.max(map.getZoom(),15),duration:400});
      const inexacto=accuracy>80;
      estadoGps.textContent='GPS activo · Distancia aproximada a ruta: '+Math.round(distancia)+' m · Precisión GPS ±'+Math.round(accuracy)+' m'+(inexacto?' · Señal imprecisa':(distancia>75?' · Atención: podrías estar fuera de la ruta':' · Cerca del trazado'));
    },error=>{
      const mensajes={1:'Permiso de ubicación denegado.',2:'No se puede obtener la posición GPS.',3:'Se agotó el tiempo de espera del GPS.'};
      estadoGps.textContent=mensajes[error.code]||'Error al consultar la ubicación.';
    },{enableHighAccuracy:true,maximumAge:3000,timeout:16000});
  }
  function crearBoton(texto, accion, principal=false){
    const b=document.createElement('button');b.className='accion'+(principal?' principal':'');b.type='button';b.textContent=texto;b.addEventListener('click',accion);return b;
  }
  function mensajeMetricas(r) {
    return (r.km === null ? 'distancia s/d' : Number(r.km).toFixed(2)+' km') + ' · ' +
      (r.asc===null ? 'desnivel s/d' : '+'+r.asc+' m') + ' · ' +
      (r.min===null ? 'sin tiempo' : r.min+' min');
  }
  function limpiarMarcadores(){
    for(const m of markers) m.remove();
    markers.length=0;
  }
  function marcadoresSeleccionados(r){
    limpiarMarcadores();
    for(const [coor,color,tipo] of [[r.inicio,'#15995f','Inicio'],[r.final,'#d94142','Final']]){
      const popup=new maplibregl.Popup({offset:14}).setText(tipo+' · '+r.nombre);
      markers.push(new maplibregl.Marker({color,scale:.84}).setLngLat(coor).setPopup(popup).addTo(map));
    }
  }
  function seleccionarRuta(indice, centrar=true){
    if (indice < 0 || indice >= recorridos.length) return;
    if(indiceSeleccionado!==indice && gpsWatch!==null) detenerSeguimiento();
    indiceSeleccionado=indice;
    const r=recorridos[indice];
    tarjetas.forEach((btn,i)=>{
      btn.classList.toggle('seleccionada',i===indice);
      btn.setAttribute('aria-pressed',i===indice?'true':'false');
    });
    panel.hidden=false;
    tituloPanel.textContent=r.nombre;
    datosPanel.textContent=mensajeMetricas(r);
    accionesPanel.replaceChildren(
      crearBoton('Seguir ruta (GPS)',()=>empezarSeguimiento(r),true),
      crearBoton('Compartir GPX',()=>compartirGPX(r)),
      crearBoton('Descargar GPX',()=>descargarArchivo(r)),
      crearBoton('Ir al inicio (Google Maps)',()=>{
        const punto=encodeURIComponent(r.inicio[1]+','+r.inicio[0]);
        window.open('https://www.google.com/maps/dir/?api=1&destination='+punto+'&dir_action=navigate','_blank','noopener');
      })
    );
    // Mostrar marcadores únicamente en la ruta elegida: evita saturar el mapa.
    marcadoresSeleccionados(r);
    if(map.getLayer('seleccionado')){
      map.setFilter('seleccionado',['==',['get','indice'],indice]);
    }
    if(centrar) map.fitBounds(r.bounds, {padding:65,maxZoom:15,duration:650});
  }
  for (const [indice,r] of recorridos.entries()) {
    for (const c of r.segmentos) {
      if (c.length > 1) features.push({type:'Feature', properties:{indice,nombre:r.nombre,color:r.color,km:r.km}, geometry:{type:'LineString',coordinates:c}});
    }
    const btn=document.createElement('button');
    btn.className='ruta'; btn.type='button';
    const header=document.createElement('div');header.className='titulo';
    const chip=document.createElement('span');chip.className='chip';chip.style.backgroundColor=r.color;
    header.append(chip,document.createTextNode(r.nombre));
    const desc=document.createElement('div');desc.className='dato';
    desc.textContent=mensajeMetricas(r);
    btn.append(header,desc);
    btn.addEventListener('click',()=>seleccionarRuta(indice));
    lista.appendChild(btn);
    tarjetas.push(btn);
  }
  buscar.addEventListener('input',()=>{
    const termino=buscar.value.trim().toLocaleLowerCase();
    tarjetas.forEach((btn,i)=>btn.classList.toggle('oculta',!recorridos[i].nombre.toLocaleLowerCase().includes(termino)));
  });
  map.on('load', () => {
    map.addSource('trazados',{type:'geojson',data:{type:'FeatureCollection',features}});
    map.addLayer({id:'contorno',type:'line',source:'trazados',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#fff','line-width':7,'line-opacity':.88}});
    map.addLayer({id:'rutas',type:'line',source:'trazados',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':['get','color'],'line-width':4,'line-opacity':.87}});
    map.addLayer({id:'seleccionado',type:'line',source:'trazados',filter:['==',['get','indice'],-1],layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#132f55','line-width':8,'line-opacity':.9}},'rutas');
    map.fitBounds(límites, {padding:55, maxZoom:14, duration:0});
    if(recorridos.length===1) seleccionarRuta(0,false);
    else if(indiceSeleccionado!==null) seleccionarRuta(indiceSeleccionado,false);
    map.on('click','rutas',e => {
      const f=e.features[0]; if (!f) return;
      const indice=Number(f.properties.indice);
      if(Number.isInteger(indice)) seleccionarRuta(indice);
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


def exportar_gpx_navegable(actividad: Actividad, destino: Path):
    """Exporta solo el recorrido como track GPX, sin timestamps de una actividad privada."""
    ns = "http://www.topografix.com/GPX/1/1"
    ET.register_namespace("", ns)
    root = ET.Element(f"{{{ns}}}gpx", {"version": "1.1", "creator": "RaceEstrategy"})
    track = ET.SubElement(root, f"{{{ns}}}trk")
    ET.SubElement(track, f"{{{ns}}}name").text = actividad.nombre
    for segmento in actividad.segmentos:
        tramo = ET.SubElement(track, f"{{{ns}}}trkseg")
        for p in segmento:
            punto = ET.SubElement(tramo, f"{{{ns}}}trkpt", {"lat": str(p.lat), "lon": str(p.lon)})
            if p.ele is not None:
                ET.SubElement(punto, f"{{{ns}}}ele").text = str(p.ele)
    ET.ElementTree(root).write(destino, encoding="utf-8", xml_declaration=True)


def visualizar(actividades: list[Actividad], salida: Path, sin_fondo: bool=False):
    salida.mkdir(parents=True, exist_ok=True)
    # Los perfiles antiguos podrían pertenecer a una ejecución con más rutas.
    # Solo borramos los PNG con el patrón que genera este propio programa.
    for perfil_antiguo in salida.glob("perfil_[0-9][0-9].png"):
        perfil_antiguo.unlink()
    # Elimina solamente exportaciones navegables del programa anterior; evita GPX obsoletos.
    for anterior in salida.glob("ruta_navegable_[0-9][0-9].gpx"):
        anterior.unlink()
    metricas=[]
    datos=[]
    latitudes=[]
    longitudes=[]
    for idx, act in enumerate(actividades):
        color=COLORES[idx % len(COLORES)]
        nombre_gpx=f"ruta_navegable_{idx+1:02d}.gpx"
        exportar_gpx_navegable(act, salida/nombre_gpx)
        met, perfil=calcular_metricas(act)
        metricas.append(met)
        segmentos=[]
        elevaciones=[]
        for seg in act.segmentos:
            coords=[[p.lon,p.lat] for p in seg]
            segmentos.append(coords)
            elevaciones.append([p.ele for p in seg])
            longitudes.extend([c[0] for c in coords])
            latitudes.extend([c[1] for c in coords])
        pri, fin=act.segmentos[0][0],act.segmentos[-1][-1]
        bounds=[[min(c[0] for seg in segmentos for c in seg),min(c[1] for seg in segmentos for c in seg)],
                [max(c[0] for seg in segmentos for c in seg),max(c[1] for seg in segmentos for c in seg)]]
        datos.append({'nombre':act.nombre,'color':color,'km':met['distancia_km'],'asc':met['desnivel_positivo_m'],
                      'archivo_gpx':nombre_gpx,
                      'min':met['tiempo_total_min'],'segmentos':segmentos,'elevaciones':elevaciones,
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

EXTENSIONES_RUTA = ('.gpx', '.fit', '.fit.gz', '.plt', '.json', '.json.gz')
DIRECTORIOS_IGNORADOS = {'.git', '__pycache__', 'node_modules', '.venv', 'venv', 'resultados', 'resultados_csv', 'publicar_movil'}


def es_archivo_ruta(ruta: Path) -> bool:
    return ruta.name.lower().endswith(EXTENSIONES_RUTA)


def expandir_entradas(entradas: list[str], recursivo: bool, salida: Path):
    """Acepta archivos, directorios (GPX/FIT/FIT.GZ/GeoLife/FitRec) y URL GPX.

    Orden estable al recorrer una carpeta y deduplicación de rutas explícitas.
    Nunca entra en la carpeta de salida ni en carpetas de artefactos conocidas.
    """
    encontrados = []
    vistos = set()
    salida_absoluta = salida.resolve()
    for entrada in entradas:
        if entrada.startswith(('https://', 'http://')):
            if entrada not in vistos:
                encontrados.append(entrada)
                vistos.add(entrada)
            continue
        ruta = Path(entrada).expanduser()
        if ruta.is_dir():
            candidatas = ruta.rglob('*') if recursivo else ruta.iterdir()
            for archivo in sorted(candidatas, key=lambda x: str(x).lower()):
                if not archivo.is_file() or not es_archivo_ruta(archivo):
                    continue
                absoluta = archivo.resolve()
                if absoluta == salida_absoluta or salida_absoluta in absoluta.parents:
                    continue
                if any(carpeta in DIRECTORIOS_IGNORADOS for carpeta in archivo.parts):
                    continue
                if absoluta not in vistos:
                    encontrados.append(archivo)
                    vistos.add(absoluta)
        else:
            clave = ruta.resolve()
            if clave not in vistos:
                encontrados.append(ruta)
                vistos.add(clave)
    return encontrados


def cargar_archivo(ruta: Path, deporte: str | None, max_actividades: int) -> list[Actividad]:
    nombre = ruta.name.lower()
    if nombre.endswith('.gpx'):
        resultado = leer_gpx(ruta.read_bytes(), ruta.stem, str(ruta))
    elif nombre.endswith(('.fit', '.fit.gz')):
        resultado = leer_fit(ruta)
    elif nombre.endswith('.plt'):
        resultado = leer_plt(ruta, deporte)
    elif nombre.endswith(('.json', '.json.gz')):
        resultado = leer_fitrec(ruta, deporte, max_actividades)
    else:
        raise ValueError('Extensión no compatible; usa GPX, FIT, FIT.GZ, PLT o FitRec JSON')
    if deporte:
        # GPX sin etiqueta de deporte: se mantiene porque no debe inferirse su modalidad.
        deporte_normalizado = _normalizar_deporte(deporte)
        resultado = [a for a in resultado if a.deporte in ('sin especificar', 'desconocido (ver labels.txt)')
                     or deporte_normalizado in _normalizar_deporte(a.deporte)]
    return [a for a in resultado if any(len(seg) >= 2 for seg in a.segmentos)]


def main():
    p = argparse.ArgumentParser(description='Visualiza varios GPX/FIT.GZ de una carpeta, selecciona rutas y navega/compártelas desde el HTML.')
    p.add_argument('entradas', nargs='+', help='Archivos, carpetas o enlaces DIRECTOS a archivos .gpx')
    p.add_argument('--salida', type=Path, default=Path(__file__).resolve().parent / 'resultados',
                   help='Carpeta de resultados (se reutiliza, no se crea una nueva por ejecución)')
    p.add_argument('--no-recursivo', action='store_true', help='En carpetas, no entrar en subcarpetas')
    p.add_argument('--no-abrir', action='store_true', help='No abrir el HTML automáticamente')
    p.add_argument('--deporte', default=None, help='Filtrar actividades con deporte identificado: bike / run')
    p.add_argument('--max-actividades', type=int, default=5, help='Máximo de registros en cada FitRec JSON (predeterminado 5)')
    p.add_argument('--max-rutas', type=int, default=0, help='Limitar rutas en el mapa (0 = sin límite); útil con directorios grandes')
    p.add_argument('--sin-fondo', action='store_true', help='Fondo liso sin servidor cartográfico')
    a = p.parse_args()
    rutas_encontradas = expandir_entradas(a.entradas, not a.no_recursivo, a.salida)
    if not rutas_encontradas:
        p.error('No hay archivos compatibles en las rutas o carpetas indicadas.')
    actividades = []
    errores = []
    for origen in rutas_encontradas:
        try:
            if isinstance(origen,str):
                nuevas = descargar_gpx(origen)
            elif not origen.is_file():
                raise FileNotFoundError(f'No existe: {origen}')
            else:
                nuevas = cargar_archivo(origen, a.deporte, max(1,a.max_actividades))
            if a.max_rutas > 0:
                nuevas = nuevas[:max(0,a.max_rutas - len(actividades))]
            actividades.extend(nuevas)
            if a.max_rutas > 0 and len(actividades) >= a.max_rutas:
                break
        except Exception as e:
            errores.append((str(origen),str(e)))
            print(f'AVISO: No se pudo leer {origen}: {e}', file=sys.stderr)
    if not actividades:
        sys.exit('No se pudieron cargar rutas con GPS. Revisa las extensiones y los errores anteriores.')
    metricas = visualizar(actividades, Path(a.salida), sin_fondo=a.sin_fondo)
    for m in metricas:
        alt = f"+{m['desnivel_positivo_m']} m" if m['desnivel_positivo_m'] is not None else 'desnivel s/d'
        dur = f"{m['tiempo_total_min']} min" if m['tiempo_total_min'] is not None else 'sin tiempos'
        print(f"{m['nombre']}: {m['distancia_km']} km | {alt} | {dur}")
    salida = a.salida.resolve()
    print(f"\n{len(metricas)} rutas procesadas. {len(errores)} archivos con error. Salida: {salida}")
    print('Generados: mapa_rutas.html, resumen_rutas.csv, perfil_XX.png, ruta_navegable_XX.gpx')
    mapa = salida / 'mapa_rutas.html'
    if not a.no_abrir:
        print(f'Abriendo mapa: {mapa}')
        try:
            if not webbrowser.open(mapa.as_uri(),new=2):
                print('No fue posible abrir el navegador automáticamente; abre el HTML manualmente.')
        except (OSError, webbrowser.Error) as exc:
            print(f'No fue posible abrir el navegador: {exc}')


if __name__ == "__main__":
    main()

