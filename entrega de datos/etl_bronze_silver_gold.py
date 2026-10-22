"""
Pipeline de datos para Entrega 02: De Bronze/Raw a Silver y Gold.
RaceEstrategy - Preparación y tratamiento de datos deportivos.
"""

import os
import glob
import math
import hashlib
import csv
from datetime import datetime
import xml.etree.ElementTree as ET
import fitparse

def haversine(lat1, lon1, lat2, lon2):
    """Calcula la distancia de círculo máximo entre dos puntos en metros."""
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def parse_iso_time(t_str):
    if not t_str:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            return datetime.strptime(t_str, fmt)
        except ValueError:
            pass
    return None

def anonymize_id(raw_identifier):
    """Genera un seudónimo anónimo irreversible tipo 'atleta_a1b2c3' a partir del serial o perfil."""
    if not raw_identifier:
        return "atleta_anonimo"
    hash_str = hashlib.sha256(str(raw_identifier).strip().encode('utf-8')).hexdigest()[:6]
    return f"atleta_{hash_str}"

def classify_sport(sport, sub_sport, name=""):
    s = (sport or "").lower()
    sub = (sub_sport or "").lower()
    n = (name or "").lower()

    if not s or s in ("desconocido", "sin_tipo"):
        if any(w in n for w in ["bici", "ciclismo", "cycling", "bike", "mtb", "carretera", "rodillo", "ride"]):
            s = "cycling"
        elif any(w in n for w in ["run", "carrera", "running", "jogging"]):
            s = "running"
        elif any(w in n for w in ["caminata", "walk", "walking", "senderismo", "hike", "hiking"]):
            s = "walking"

    if s in ["cycling", "biking"]:
        return "ciclismo", s, sub or "generic"
    elif s in ["running", "walking", "hiking"]:
        return "running_caminata", s, sub or "generic"
    return "otros", s or "desconocido", sub

# ----------------- EXTRACCIÓN RAW (BRONZE) -----------------

def parse_gpx_raw(filepath):
    filename = os.path.basename(filepath)
    name = ""
    sport = ""
    pts = []
    times = []
    eles = []

    try:
        tree = ET.parse(filepath)
        root = tree.getroot()
        for elem in root.iter():
            tag = elem.tag.split('}')[-1]
            if tag == 'name' and not name and elem.text:
                name = elem.text.strip()
            elif tag == 'type' and not sport and elem.text:
                sport = elem.text.strip().lower()
            elif tag == 'trkpt':
                try:
                    lat = float(elem.attrib['lat'])
                    lon = float(elem.attrib['lon'])
                    pts.append((lat, lon))
                    for child in elem:
                        ctag = child.tag.split('}')[-1]
                        if ctag == 'ele' and child.text:
                            eles.append(float(child.text))
                        elif ctag == 'time' and child.text:
                            times.append(child.text.strip())
                except (ValueError, KeyError):
                    pass
    except Exception:
        return None

    dist_m = sum(haversine(p1[0], p1[1], p2[0], p2[1]) for p1, p2 in zip(pts[:-1], pts[1:]))
    ascent_m = sum(max(0, e2 - e1) for e1, e2 in zip(eles[:-1], eles[1:])) if eles else 0.0

    start_time_str = times[0] if times else ""
    dur_sec = 0.0
    if len(times) >= 2:
        dt1 = parse_iso_time(times[0])
        dt2 = parse_iso_time(times[-1])
        if dt1 and dt2:
            dur_sec = max(0.0, (dt2 - dt1).total_seconds())

    categoria, deporte, sub_deporte = classify_sport(sport, "", name)
    strava_id = os.path.splitext(filename)[0] if os.path.splitext(filename)[0].isdigit() else ""

    return {
        "archivo": filename,
        "formato": "GPX",
        "categoria": categoria,
        "deporte": deporte,
        "sub_deporte": sub_deporte,
        "nombre_actividad": name,
        "fecha_inicio": start_time_str,
        "distancia_m": dist_m,
        "duracion_s": dur_sec,
        "desnivel_positivo_m": ascent_m,
        "calorias": None,
        "raw_user_identifier": strava_id or "gpx_user",
        "num_puntos_gps": len(pts)
    }

def parse_fit_raw(filepath):
    filename = os.path.basename(filepath)
    sport = ""
    sub_sport = ""
    start_time = None
    dist_m = None
    elapsed_time_s = None
    timer_time_s = None
    ascent_m = 0.0
    calories = None
    serial = ""
    user_name = ""

    try:
        fit = fitparse.FitFile(filepath)
        for msg in fit.get_messages('session'):
            for d in msg:
                if d.value is None: continue
                if d.name == 'sport': sport = str(d.value)
                elif d.name == 'sub_sport': sub_sport = str(d.value)
                elif d.name == 'start_time': start_time = d.value
                elif d.name == 'total_distance': dist_m = float(d.value)
                elif d.name == 'total_elapsed_time': elapsed_time_s = float(d.value)
                elif d.name == 'total_timer_time': timer_time_s = float(d.value)
                elif d.name == 'total_ascent': ascent_m = float(d.value)
                elif d.name == 'total_calories': calories = float(d.value)

        if not sport:
            for msg in fit.get_messages('sport'):
                for d in msg:
                    if d.name == 'sport' and d.value: sport = str(d.value)
                    elif d.name == 'sub_sport' and d.value: sub_sport = str(d.value)

        for msg in fit.get_messages('file_id'):
            for d in msg:
                if d.name == 'serial_number' and d.value:
                    serial = str(d.value)
                    break
            if serial: break

        for msg in fit.get_messages('user_profile'):
            for d in msg:
                if d.name == 'friendly_name' and d.value:
                    user_name = str(d.value)
                    break
            if user_name: break

    except Exception:
        return None

    dur_sec = timer_time_s if timer_time_s is not None else (elapsed_time_s or 0.0)
    categoria, deporte, sub_deporte = classify_sport(sport, sub_sport, "")
    
    # Identificador de origen para anonimizar
    raw_id = serial or user_name or os.path.splitext(filename)[0]

    return {
        "archivo": filename,
        "formato": "FIT",
        "categoria": categoria,
        "deporte": deporte,
        "sub_deporte": sub_deporte,
        "nombre_actividad": "",
        "fecha_inicio": str(start_time) if start_time else "",
        "distancia_m": dist_m or 0.0,
        "duracion_s": dur_sec,
        "desnivel_positivo_m": ascent_m,
        "calorias": calories,
        "raw_user_identifier": raw_id,
        "num_puntos_gps": 1 if dist_m and dist_m > 0 else 0
    }

# ----------------- TRANSFORMACIÓN SILVER -----------------

def transform_to_silver(raw_record):
    """
    Aplica limpieza, anonimización, corrección de unidades y validación de calidad.
    Descarta registros corruptos, estáticos o sin movimiento.
    """
    # 1. Filtros de calidad mínimos
    dist_m = raw_record.get("distancia_m", 0.0)
    dur_s = raw_record.get("duracion_s", 0.0)

    # Descartar si distancia < 200m o duración < 120s (ruido, pruebas o errores de grabación)
    if dist_m < 200.0 or dur_s < 120.0:
        return None

    # 2. Unidades estandarizadas
    dist_km = round(dist_m / 1000.0, 2)
    dur_min = round(dur_s / 60.0, 2)
    vel_media_kmh = round((dist_km / (dur_s / 3600.0)), 2) if dur_s > 0 else 0.0
    desnivel_m = round(raw_record.get("desnivel_positivo_m", 0.0), 1)

    # Descartar velocidades biológicamente o físicamente absurdas
    # (ej. errores de señal GPS > 130 km/h en bici o > 40 km/h corriendo)
    cat = raw_record["categoria"]
    if cat == "ciclismo" and (vel_media_kmh > 100.0 or vel_media_kmh < 3.0):
        return None
    if cat == "running_caminata" and (vel_media_kmh > 35.0 or vel_media_kmh < 1.0):
        return None

    # 3. Anonimización del usuario
    atleta_id = anonymize_id(raw_record.get("raw_user_identifier"))

    # 4. Pendiente media aproximada (m/km)
    ratio_subida_m_km = round(desnivel_m / dist_km, 1) if dist_km > 0 else 0.0

    return {
        "id_actividad": os.path.splitext(raw_record["archivo"])[0],
        "id_atleta": atleta_id,
        "formato_origen": raw_record["formato"],
        "categoria": cat,
        "deporte": raw_record["deporte"],
        "sub_deporte": raw_record["sub_deporte"],
        "fecha_inicio": raw_record["fecha_inicio"],
        "distancia_km": dist_km,
        "duracion_min": dur_min,
        "duracion_segundos": round(dur_s, 0),
        "velocidad_media_kmh": vel_media_kmh,
        "desnivel_positivo_m": desnivel_m,
        "ratio_subida_m_km": ratio_subida_m_km,
        "calorias": round(raw_record["calorias"], 0) if raw_record.get("calorias") else ""
    }

# ----------------- EJECUCIÓN PRINCIPAL -----------------

def main():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    gpx_dir = os.path.join(base_dir, "GPX", "activities")
    out_dir = os.path.abspath(os.path.dirname(__file__))

    gpx_files = sorted(glob.glob(os.path.join(gpx_dir, "*.gpx")))
    fit_files = sorted(glob.glob(os.path.join(gpx_dir, "*.fit")))

    print(f"=== ETL: Procesando Capa Bronze ===")
    print(f"Encontrados: {len(gpx_files)} GPX y {len(fit_files)} FIT (Total: {len(gpx_files) + len(fit_files)})")

    silver_records = []
    descartados = 0

    # Procesar GPX
    for f in gpx_files:
        raw = parse_gpx_raw(f)
        if raw:
            silver = transform_to_silver(raw)
            if silver:
                silver_records.append(silver)
            else:
                descartados += 1

    # Procesar FIT
    for f in fit_files:
        raw = parse_fit_raw(f)
        if raw:
            silver = transform_to_silver(raw)
            if silver:
                silver_records.append(silver)
            else:
                descartados += 1

    print(f"\n=== Capa Silver Generada ===")
    print(f"Actividades válidas tras limpieza y filtros: {len(silver_records)}")
    print(f"Actividades descartadas (ruido, <2 min, errores GPS): {descartados}")

    # Guardar Silver general
    silver_csv = os.path.join(out_dir, "silver_actividades.csv")
    fieldnames_silver = list(silver_records[0].keys())
    with open(silver_csv, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames_silver)
        writer.writeheader()
        writer.writerows(silver_records)

    # ----------------- GENERAR CAPA GOLD (DATASETS PARA ML) -----------------
    gold_ciclismo = [r for r in silver_records if r["categoria"] == "ciclismo"]
    gold_running = [r for r in silver_records if r["categoria"] == "running_caminata"]

    # Columnas preparadas específicamente para modelado de ML
    cols_gold = [
        "id_actividad", "id_atleta", "fecha_inicio", "deporte", "sub_deporte",
        "distancia_km", "desnivel_positivo_m", "ratio_subida_m_km",
        "velocidad_media_kmh", "duracion_min", "duracion_segundos"
    ]

    ciclismo_csv = os.path.join(out_dir, "gold_ciclismo.csv")
    with open(ciclismo_csv, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=cols_gold)
        writer.writeheader()
        for r in gold_ciclismo:
            writer.writerow({k: r[k] for k in cols_gold})

    running_csv = os.path.join(out_dir, "gold_running_caminata.csv")
    with open(running_csv, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=cols_gold)
        writer.writeheader()
        for r in gold_running:
            writer.writerow({k: r[k] for k in cols_gold})

    print(f"\n=== Capa Gold Generada (Listos para Machine Learning) ===")
    print(f"Dataset Ciclismo: {len(gold_ciclismo)} filas guardadas en '{os.path.basename(ciclismo_csv)}'")
    print(f"Dataset Running/Caminata: {len(gold_running)} filas guardadas en '{os.path.basename(running_csv)}'")

if __name__ == "__main__":
    main()
