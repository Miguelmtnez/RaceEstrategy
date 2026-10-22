import os
import glob
import math
import csv
from datetime import datetime
import xml.etree.ElementTree as ET
import fitparse

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0  # metros
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

def normalize_sport(sport, sub_sport, name=""):
    s = (sport or "").lower()
    sub = (sub_sport or "").lower()
    n = (name or "").lower()

    # Si no hay deporte explícito, deducir por el nombre
    if not s or s in ("desconocido", "sin_tipo"):
        if any(w in n for w in ["bici", "ciclismo", "cycling", "bike", "mtb", "carretera", "rodillo"]):
            s = "cycling"
        elif any(w in n for w in ["run", "carrera", "running", "jogging"]):
            s = "running"
        elif any(w in n for w in ["caminata", "walk", "walking", "senderismo", "hike", "hiking"]):
            s = "walking"

    # Clasificación general en 2 grupos pedidos:
    if s in ["cycling", "biking"]:
        categoria = "ciclismo"
    elif s in ["running", "walking", "hiking"]:
        categoria = "running_caminata"
    else:
        categoria = "otros"

    return categoria, s, sub

def extract_gpx_info(filepath):
    filename = os.path.basename(filepath)
    strava_id = os.path.splitext(filename)[0] if os.path.splitext(filename)[0].isdigit() else ""
    
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
    except Exception as e:
        return None

    # Distancia y desnivel
    dist_m = sum(haversine(p1[0], p1[1], p2[0], p2[1]) for p1, p2 in zip(pts[:-1], pts[1:]))
    dist_km = round(dist_m / 1000.0, 2)
    ascent_m = round(sum(max(0, e2 - e1) for e1, e2 in zip(eles[:-1], eles[1:])), 1) if eles else None

    # Tiempos
    start_time_str = times[0] if times else ""
    dur_min = None
    if len(times) >= 2:
        dt1 = parse_iso_time(times[0])
        dt2 = parse_iso_time(times[-1])
        if dt1 and dt2:
            dur_sec = max(0, (dt2 - dt1).total_seconds())
            dur_min = round(dur_sec / 60.0, 1)

    categoria, deporte, sub_deporte = normalize_sport(sport, "", name)

    return {
        "archivo": filename,
        "formato": "GPX",
        "categoria": categoria,
        "deporte": deporte or "desconocido",
        "sub_deporte": sub_deporte,
        "nombre": name,
        "fecha_inicio": start_time_str,
        "distancia_km": dist_km,
        "duracion_min": dur_min,
        "desnivel_positivo_m": ascent_m,
        "calorias": "",
        "dispositivo_usuario": "",
        "dispositivo_serial": "",
        "edad": "",
        "peso_kg": "",
        "strava_activity_id": strava_id
    }

def extract_fit_info(filepath):
    filename = os.path.basename(filepath)
    name_clean = os.path.splitext(filename)[0].replace("_ACTIVITY", "")
    strava_id = name_clean if name_clean.isdigit() else ""

    sport = ""
    sub_sport = ""
    start_time = None
    dist_m = None
    elapsed_time_s = None
    timer_time_s = None
    ascent_m = None
    calories = None
    
    user_name = ""
    age = ""
    weight = ""
    serial = ""

    try:
        fit = fitparse.FitFile(filepath)
        
        # 1. Sesión
        for msg in fit.get_messages('session'):
            for d in msg:
                if d.value is None:
                    continue
                if d.name == 'sport':
                    sport = str(d.value)
                elif d.name == 'sub_sport':
                    sub_sport = str(d.value)
                elif d.name == 'start_time':
                    start_time = d.value
                elif d.name == 'total_distance':
                    dist_m = float(d.value)
                elif d.name == 'total_elapsed_time':
                    elapsed_time_s = float(d.value)
                elif d.name == 'total_timer_time':
                    timer_time_s = float(d.value)
                elif d.name == 'total_ascent':
                    ascent_m = round(float(d.value), 1)
                elif d.name == 'total_calories':
                    calories = d.value

        # 2. Deporte si no vino en session
        if not sport:
            for msg in fit.get_messages('sport'):
                for d in msg:
                    if d.name == 'sport' and d.value:
                        sport = str(d.value)
                    elif d.name == 'sub_sport' and d.value:
                        sub_sport = str(d.value)

        # 3. Dispositivo / Perfil
        for msg in fit.get_messages('user_profile'):
            for d in msg:
                if d.name == 'friendly_name' and d.value:
                    user_name = str(d.value)
                elif d.name == 'age' and d.value:
                    age = str(d.value)
                elif d.name == 'weight' and d.value:
                    weight = str(d.value)

        for msg in fit.get_messages('file_id'):
            for d in msg:
                if d.name == 'serial_number' and d.value:
                    serial = str(d.value)
                    break
            if serial:
                break

    except Exception as e:
        return None

    dist_km = round(dist_m / 1000.0, 2) if dist_m is not None else None
    dur_sec = timer_time_s or elapsed_time_s
    dur_min = round(dur_sec / 60.0, 1) if dur_sec is not None else None

    categoria, deporte, sub_deporte = normalize_sport(sport, sub_sport, "")

    return {
        "archivo": filename,
        "formato": "FIT",
        "categoria": categoria,
        "deporte": deporte or "desconocido",
        "sub_deporte": sub_deporte,
        "nombre": "",
        "fecha_inicio": str(start_time) if start_time else "",
        "distancia_km": dist_km,
        "duracion_min": dur_min,
        "desnivel_positivo_m": ascent_m,
        "calorias": calories if calories is not None else "",
        "dispositivo_usuario": user_name,
        "dispositivo_serial": serial,
        "edad": age,
        "peso_kg": weight,
        "strava_activity_id": strava_id
    }

def main():
    gpx_files = sorted(glob.glob('GPX/activities/*.gpx'))
    fit_files = sorted(glob.glob('GPX/activities/*.fit'))
    total_files = len(gpx_files) + len(fit_files)
    print(f"Procesando {len(gpx_files)} GPX y {len(fit_files)} FIT (Total: {total_files})...")

    rows = []
    
    # GPX
    for idx, f in enumerate(gpx_files, 1):
        info = extract_gpx_info(f)
        if info:
            rows.append(info)
        if idx % 100 == 0 or idx == len(gpx_files):
            print(f"GPX: {idx}/{len(gpx_files)} listos")

    # FIT
    for idx, f in enumerate(fit_files, 1):
        info = extract_fit_info(f)
        if info:
            rows.append(info)
        if idx % 100 == 0 or idx == len(fit_files):
            print(f"FIT: {idx}/{len(fit_files)} listos")

    fieldnames = [
        "archivo", "formato", "categoria", "deporte", "sub_deporte",
        "nombre", "fecha_inicio", "distancia_km", "duracion_min",
        "desnivel_positivo_m", "calorias", "dispositivo_usuario",
        "dispositivo_serial", "edad", "peso_kg", "strava_activity_id"
    ]

    output_csv = "actividades.csv"
    with open(output_csv, mode="w", newline="", encoding="utf-8-sig") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)

    print(f"\n¡Éxito! Se han guardado {len(rows)} actividades en '{output_csv}'.")

if __name__ == "__main__":
    main()
