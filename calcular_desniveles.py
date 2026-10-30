"""
Script para calcular el desnivel acumulado (+D y -D) y cotas extremas
a partir de endomondoHR.json.gz y actualizar actividades_20_columnas.csv.
"""
import gzip
import json
import ast
import csv
import os
import sys

def calculate_elevation(altitudes):
    if not altitudes or len(altitudes) < 2:
        return "", "", "", ""
    
    # Filtrar valores None o no válidos
    valid_alts = [float(a) for a in altitudes if a is not None]
    if len(valid_alts) < 2:
        return "", "", "", ""
    
    alt_min = round(min(valid_alts), 1)
    alt_max = round(max(valid_alts), 1)

    # Cálculo de desnivel acumulado con suavizado de ruido (< 0.5m)
    gain = 0.0
    loss = 0.0
    for j in range(len(valid_alts) - 1):
        diff = valid_alts[j+1] - valid_alts[j]
        # Umbral mínimo de 0.5 metros para evitar acumular ruido de sensor barométrico/GPS
        if diff >= 0.5:
            gain += diff
        elif diff <= -0.5:
            loss += abs(diff)

    return round(gain, 1), round(loss, 1), alt_min, alt_max

def main():
    json_path = r"c:\Users\migue\Downloads\endomondoHR.json.gz"
    csv_in = "actividades_20_columnas.csv"
    csv_out = "actividades_20_columnas_con_desnivel.csv"

    print("1. Cargando IDs de actividades que necesitan desnivel...")
    ids_to_update = set()
    with open(csv_in, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row.get("desnivel_positivo_m"):
                ids_to_update.add(str(row["actividad_id"]))

    print(f"Total actividades a actualizar: {len(ids_to_update)}")

    print(f"2. Leyendo {json_path} en streaming y calculando desniveles...")
    elev_map = {}
    count_scanned = 0
    count_found = 0

    with gzip.open(json_path, "rt", encoding="utf-8") as f_gz:
        for line in f_gz:
            count_scanned += 1
            if count_scanned % 50000 == 0:
                print(f"  Procesadas {count_scanned} líneas del JSON... (Encontradas {count_found} de {len(ids_to_update)})")
            
            # Comprobación rápida de ID antes de parsear todo el JSON para máxima velocidad
            # La línea suele empezar por {"userId": ..., "id": 123456...
            try:
                data = json.loads(line)
            except Exception:
                try:
                    data = ast.literal_eval(line)
                except Exception:
                    continue

            aid = str(data.get("id"))
            if aid in ids_to_update:
                alt = data.get("altitude", [])
                gain, loss, amin, amax = calculate_elevation(alt)
                elev_map[aid] = {
                    "gain": gain,
                    "loss": loss,
                    "min": amin,
                    "max": amax
                }
                count_found += 1
                if count_found == len(ids_to_update):
                    print("¡Todas las actividades requeridas han sido encontradas!")
                    break

    print(f"Extracción finalizada. Encontradas {len(elev_map)} actividades con altimetría.")

    print(f"3. Escribiendo archivo final actualizado: {csv_out}...")
    with open(csv_in, encoding="utf-8-sig") as f_in, \
         open(csv_out, "w", newline="", encoding="utf-8-sig") as f_out:
        
        reader = csv.DictReader(f_in)
        fieldnames = reader.fieldnames
        writer = csv.DictWriter(f_out, fieldnames=fieldnames)
        writer.writeheader()

        actualizadas = 0
        for row in reader:
            aid = str(row.get("actividad_id"))
            if aid in elev_map:
                info = elev_map[aid]
                row["desnivel_positivo_m"] = info["gain"]
                row["desnivel_negativo_m"] = info["loss"]
                row["altitud_min_m"] = info["min"]
                row["altitud_max_m"] = info["max"]
                actualizadas += 1
            writer.writerow(row)

    print(f"¡Éxito rotundo! {actualizadas} actividades actualizadas con su desnivel real.")
    print(f"Archivo guardado: {csv_out} ({round(os.path.getsize(csv_out)/(1024*1024), 2)} MB)")

    # Reemplazar el archivo anterior
    if os.path.exists(csv_out):
        os.replace(csv_out, csv_in)
        print(f"Archivo original '{csv_in}' actualizado y sobrescrito correctamente.")

if __name__ == "__main__":
    main()
