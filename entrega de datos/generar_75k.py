"""
Selecciona 75.000 actividades limpias, equilibradas y de calidad,
calculando su altimetría y desnivel acumulado directamente desde endomondoHR.json.gz.
"""
import gzip
import json
import ast
import csv
import os
import random

def calculate_elevation(altitudes):
    if not altitudes or len(altitudes) < 2:
        return "", "", "", ""
    valid_alts = [float(a) for a in altitudes if a is not None]
    if len(valid_alts) < 2:
        return "", "", "", ""
    
    alt_min = round(min(valid_alts), 1)
    alt_max = round(max(valid_alts), 1)

    gain = 0.0
    loss = 0.0
    for j in range(len(valid_alts) - 1):
        diff = valid_alts[j+1] - valid_alts[j]
        if diff >= 0.5:
            gain += diff
        elif diff <= -0.5:
            loss += abs(diff)

    return round(gain, 1), round(loss, 1), alt_min, alt_max

def main():
    json_path = r"c:\Users\migue\Downloads\endomondoHR.json.gz"
    csv_in = "actividades_20_columnas.csv"
    csv_out = "actividades_75k_con_desnivel.csv"
    target_count = 75000

    print("1. Seleccionando 75.000 actividades de alta calidad del dataset...")
    candidatos_bici = []
    candidatos_carrera = []
    locales_garmin = []

    with open(csv_in, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Descartar las que tienen errores graves marcados
            if row.get("calidad_gps") == "sospechoso":
                continue

            dist = float(row.get("distancia_km") or 0)
            dur = float(row.get("duracion_min") or 0)
            if dist < 0.5 or dur < 3.0: # Descartar raras/pruebas
                continue

            # Priorizar siempre las 963 locales de Garmin
            if row.get("desnivel_positivo_m"):
                locales_garmin.append(row)
                continue

            mod = row.get("modalidad")
            if mod in ("Bicicleta", "MTB", "Ciclismo"):
                candidatos_bici.append(row)
            elif mod == "Carrera":
                candidatos_carrera.append(row)

    print(f"Disponibles limpias -> Ciclismo: {len(candidatos_bici)} | Carrera: {len(candidatos_carrera)} | Locales Garmin: {len(locales_garmin)}")

    # Fijar semilla para reproducibilidad exacta
    random.seed(42)

    # Cuota: ~37.000 de ciclismo y ~37.000 de carrera + las locales
    restante = target_count - len(locales_garmin)
    cuota_cada = restante // 2

    seleccionadas_bici = random.sample(candidatos_bici, min(cuota_cada, len(candidatos_bici)))
    seleccionadas_carrera = random.sample(candidatos_carrera, min(cuota_cada, len(candidatos_carrera)))

    # Si sobra cuota, rellenar
    seleccionadas_totales = locales_garmin + seleccionadas_bici + seleccionadas_carrera
    if len(seleccionadas_totales) < target_count:
        extras = [r for r in candidatos_bici if r not in seleccionadas_bici][:target_count - len(seleccionadas_totales)]
        seleccionadas_totales += extras

    print(f"Total seleccionadas para el dataset final: {len(seleccionadas_totales)}")

    # Crear mapa de IDs a procesar
    target_ids = {str(r["actividad_id"]): r for r in seleccionadas_totales if not r.get("desnivel_positivo_m")}
    print(f"Actividades de Endomondo a las que se les calculará desnivel: {len(target_ids)}")

    print(f"\n2. Extrayendo altimetría y calculando desnivel desde {json_path}...")
    encontradas = 0
    lineas = 0

    with gzip.open(json_path, "rt", encoding="utf-8") as f_gz:
        for line in f_gz:
            lineas += 1
            if lineas % 50000 == 0:
                print(f"  Procesadas {lineas} líneas... (Calculadas {encontradas}/{len(target_ids)})")

            try:
                data = json.loads(line)
            except Exception:
                try: data = ast.literal_eval(line)
                except Exception: continue

            aid = str(data.get("id"))
            if aid in target_ids:
                alt = data.get("altitude", [])
                gain, loss, amin, amax = calculate_elevation(alt)
                row_ref = target_ids[aid]
                row_ref["desnivel_positivo_m"] = gain
                row_ref["desnivel_negativo_m"] = loss
                row_ref["altitud_min_m"] = amin
                row_ref["altitud_max_m"] = amax
                encontradas += 1

                if encontradas == len(target_ids):
                    print(f"¡Completadas todas las {encontradas} actividades objetivo!")
                    break

    print(f"\n3. Guardando {len(seleccionadas_totales)} actividades en '{csv_out}'...")
    fieldnames = list(seleccionadas_totales[0].keys())
    with open(csv_out, "w", newline="", encoding="utf-8-sig") as f_out:
        writer = csv.DictWriter(f_out, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(seleccionadas_totales)

    print(f"¡Dataset de 75.000 actividades generado con éxito!")
    print(f"Ruta: {os.path.abspath(csv_out)} ({round(os.path.getsize(csv_out)/(1024*1024), 2)} MB)")

if __name__ == "__main__":
    main()
