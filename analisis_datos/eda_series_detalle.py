#!/usr/bin/env python3
"""Detalle de anomalías entre puntos GPS/temporales de FitRec.

Lee el JSONL original y una muestra seleccionada previamente por
eda_series_fitrec.py. NO modifica ni elimina datos.

Uso:
 python eda_series_detalle.py datos/endomondoHR.json \
   --muestra resultados_series/auditoria_series_muestra.csv \
   --salida resultados_detalle
"""
from __future__ import annotations

import argparse
import ast
import csv
import gzip
import json
from pathlib import Path

import numpy as np
import pandas as pd

SPORTS = {
    "run": "Carrera",
    "bike": "Bicicleta",
    "mountain bike": "MTB",
}
MAX_KMH = {"Carrera": 30.0, "Bicicleta": 100.0, "MTB": 70.0}


def read_record(line: str) -> dict:
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        obj = ast.literal_eval(line)
    if not isinstance(obj, dict):
        raise ValueError("El registro no es un diccionario")
    return obj


def numeric_list(record: dict, key: str) -> np.ndarray:
    value = record.get(key)
    if not isinstance(value, list):
        return np.array([], dtype=float)
    try:
        return np.asarray(value, dtype=float)
    except (ValueError, TypeError):
        result = []
        for x in value:
            try:
                result.append(float(x))
            except (ValueError, TypeError):
                result.append(np.nan)
        return np.asarray(result, dtype=float)


def haversine_km(lat1, lon1, lat2, lon2):
    vals = [lat1, lon1, lat2, lon2]
    if not all(np.isfinite(v) for v in vals):
        return np.nan
    if abs(lat1) > 90 or abs(lat2) > 90 or abs(lon1) > 180 or abs(lon2) > 180:
        return np.nan
    lat1, lon1, lat2, lon2 = np.radians([lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return float(2 * 6371.0088 * np.arcsin(np.sqrt(np.clip(a, 0, 1))))


def analyse(record: dict, selected_as: str) -> tuple[dict, list[dict]]:
    raw_sport = str(record.get("sport", "")).strip().casefold()
    modality = SPORTS.get(raw_sport, "Desconocido")
    lat = numeric_list(record, "latitude")
    lon = numeric_list(record, "longitude")
    ts = numeric_list(record, "timestamp")
    alt = numeric_list(record, "altitude")
    hr = numeric_list(record, "heart_rate")

    n = min(len(lat), len(lon), len(ts))
    align_gps_time = len(lat) == len(lon) == len(ts)
    align_alt = len(alt) == len(ts)
    align_hr = len(hr) == len(ts)

    summary = {
        "actividad_id": str(record.get("id", "")),
        "usuario": str(record.get("userId", "")),
        "modalidad": modality,
        "seleccion_previa": selected_as,
        "n_latitud": len(lat),
        "n_longitud": len(lon),
        "n_timestamp": len(ts),
        "n_altitud": len(alt),
        "n_fc": len(hr),
        "gps_tiempo_alineados": align_gps_time,
        "altitud_alineada": align_alt,
        "fc_alineada": align_hr,
        "intervalos_tiempo_cero": 0,
        "intervalos_tiempo_negativos": 0,
        "intervalos_tiempo_no_finitos": 0,
        "huecos_mayores_10min": 0,
        "saltos_gps_mayores_2km": 0,
        "tramos_velocidad_sospechosa": 0,
        "saltos_altitud_mayores_100m": 0,
        "puntos_fc_no_plausible": 0,
        "puntos_gps_invalidos": 0,
        "intervalos_marcados": 0,
        "n_intervalos_analizados": max(0, n - 1),
    }

    if len(hr):
        summary["puntos_fc_no_plausible"] = int(
            np.sum(~np.isfinite(hr) | (hr < 30) | (hr > 240))
        )

    for i in range(n):
        if not (
            np.isfinite(lat[i]) and np.isfinite(lon[i])
            and abs(lat[i]) <= 90 and abs(lon[i]) <= 180
        ):
            summary["puntos_gps_invalidos"] += 1

    details = []
    for i in range(max(0, n - 1)):
        t0, t1 = ts[i], ts[i + 1]
        dt = t1 - t0 if np.isfinite(t0) and np.isfinite(t1) else np.nan
        distance = haversine_km(lat[i], lon[i], lat[i + 1], lon[i + 1])
        speed = distance * 3600 / dt if np.isfinite(distance) and np.isfinite(dt) and dt > 0 else np.nan

        zero_dt = bool(np.isfinite(dt) and dt == 0)
        negative_dt = bool(np.isfinite(dt) and dt < 0)
        nonfinite_dt = bool(not np.isfinite(dt))
        long_gap = bool(np.isfinite(dt) and dt > 600)
        gps_jump = bool(np.isfinite(distance) and distance > 2)
        speed_limit = MAX_KMH.get(modality, np.inf)
        high_speed = bool(np.isfinite(speed) and speed > speed_limit)
        alt_delta = np.nan
        alt_jump = False
        if len(alt) == len(ts) and i + 1 < len(alt) and np.isfinite(alt[i]) and np.isfinite(alt[i + 1]):
            alt_delta = float(alt[i + 1] - alt[i])
            alt_jump = abs(alt_delta) > 100

        hr0 = hr[i] if len(hr) == len(ts) else np.nan
        hr1 = hr[i + 1] if len(hr) == len(ts) else np.nan
        bad_hr_adjacent = bool(
            len(hr) == len(ts)
            and any((not np.isfinite(v)) or (v < 30) or (v > 240) for v in (hr0, hr1))
        )

        flags = {
            "tiempo_cero": zero_dt,
            "tiempo_negativo": negative_dt,
            "tiempo_no_finito": nonfinite_dt,
            "hueco_mayor_10min": long_gap,
            "salto_gps_mayor_2km": gps_jump,
            "velocidad_sospechosa": high_speed,
            "salto_altitud_mayor_100m": alt_jump,
            "fc_no_plausible_en_extremos": bad_hr_adjacent,
        }

        summary["intervalos_tiempo_cero"] += int(zero_dt)
        summary["intervalos_tiempo_negativos"] += int(negative_dt)
        summary["intervalos_tiempo_no_finitos"] += int(nonfinite_dt)
        summary["huecos_mayores_10min"] += int(long_gap)
        summary["saltos_gps_mayores_2km"] += int(gps_jump)
        summary["tramos_velocidad_sospechosa"] += int(high_speed)
        summary["saltos_altitud_mayores_100m"] += int(alt_jump)

        if any(flags.values()):
            summary["intervalos_marcados"] += 1
            details.append({
                "actividad_id": str(record.get("id", "")),
                "usuario": str(record.get("userId", "")),
                "modalidad": modality,
                "seleccion_previa": selected_as,
                "indice_punto_inicial": i,
                "indice_punto_final": i + 1,
                "timestamp_inicial": t0,
                "timestamp_final": t1,
                "delta_t_s": dt,
                "lat_inicial": lat[i],
                "lon_inicial": lon[i],
                "lat_final": lat[i + 1],
                "lon_final": lon[i + 1],
                "distancia_entre_puntos_km": distance,
                "velocidad_entre_puntos_kmh": speed,
                "umbral_velocidad_modalidad_kmh": speed_limit,
                "altitud_inicial": alt[i] if len(alt) == len(ts) else np.nan,
                "altitud_final": alt[i + 1] if len(alt) == len(ts) else np.nan,
                "delta_altitud_m": alt_delta,
                "fc_inicial": hr0,
                "fc_final": hr1,
                **flags,
            })

    return summary, details


def main():
    parser = argparse.ArgumentParser(description="Detalla anomalías punto a punto en una muestra de FitRec.")
    parser.add_argument("archivo", type=Path, help="endomondoHR.json o .json.gz")
    parser.add_argument("--muestra", type=Path, required=True, help="auditoria_series_muestra.csv")
    parser.add_argument("--salida", type=Path, default=Path("resultados_detalle"))
    args = parser.parse_args()

    for path in (args.archivo, args.muestra):
        if not path.is_file():
            parser.error(f"No existe el archivo: {path}")

    sample = pd.read_csv(args.muestra, dtype={"actividad_id": "string"}, low_memory=False)
    if "actividad_id" not in sample.columns:
        parser.error("El CSV de muestra debe contener la columna actividad_id")
    if "seleccion" in sample.columns:
        selected_col = "seleccion"
    elif "seleccion_previa" in sample.columns:
        selected_col = "seleccion_previa"
    else:
        selected_col = None

    wanted = {}
    for _, row in sample.dropna(subset=["actividad_id"]).drop_duplicates("actividad_id").iterrows():
        ident = str(row["actividad_id"])
        wanted[ident] = str(row[selected_col]) if selected_col else ""

    args.salida.mkdir(parents=True, exist_ok=True)
    opener = gzip.open if args.archivo.name.casefold().endswith(".gz") else open
    summaries, details = [], []
    malformed = 0
    found = set()

    with opener(args.archivo, "rt", encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            try:
                rec = read_record(line)
            except (json.JSONDecodeError, SyntaxError, ValueError, TypeError):
                malformed += 1
                continue
            ident = str(rec.get("id", ""))
            if ident not in wanted or ident in found:
                continue
            found.add(ident)
            summary, rows = analyse(rec, wanted[ident])
            summaries.append(summary)
            details.extend(rows)
            if len(found) == len(wanted):
                break

    summary_df = pd.DataFrame(summaries)
    detail_df = pd.DataFrame(details)
    summary_path = args.salida / "resumen_actividades_detalle.csv"
    detail_path = args.salida / "detalle_intervalos_sospechosos.csv"
    summary_df.to_csv(summary_path, index=False, encoding="utf-8-sig")
    detail_df.to_csv(detail_path, index=False, encoding="utf-8-sig")

    lines = [
        "DETALLE DE ANOMALÍAS POR INTERVALO — FITREC",
        "Herramienta de diagnóstico; no elimina, corrige ni reordena puntos.",
        f"IDs solicitados: {len(wanted)}",
        f"Actividades encontradas: {len(found)}",
        f"IDs no encontrados: {len(set(wanted) - found)}",
        f"Líneas ilegibles omitidas al leer el JSON: {malformed}",
        f"Actividades con al menos un intervalo marcado: {int((summary_df['intervalos_marcados'] > 0).sum()) if len(summary_df) else 0}",
        f"Intervalos sospechosos exportados: {len(detail_df)}",
        "",
        "Recuentos de intervalos por tipo (la misma actividad puede tener varios):",
    ]
    if len(summary_df):
        for col, label in [
            ("intervalos_tiempo_cero", "Intervalos con timestamps iguales"),
            ("intervalos_tiempo_negativos", "Intervalos con tiempo decreciente"),
            ("intervalos_tiempo_no_finitos", "Intervalos con timestamp no finito"),
            ("huecos_mayores_10min", "Huecos > 10 minutos"),
            ("saltos_gps_mayores_2km", "Saltos GPS > 2 km"),
            ("tramos_velocidad_sospechosa", "Tramos por encima del umbral preliminar de velocidad"),
            ("saltos_altitud_mayores_100m", "Saltos de altitud > 100 m"),
        ]:
            lines.append(f"  {label}: {int(summary_df[col].sum())}")
        lines += [
            "",
            "Umbrales de velocidad solo orientativos: carrera >30 km/h, bicicleta >100 km/h, MTB >70 km/h.",
            "No equivalen a reglas definitivas de exclusión. Revisar los intervalos junto con el delta temporal.",
            "No ordenar únicamente la lista timestamp: si hay que reordenar, mover conjuntamente todos los campos del mismo punto.",
            "Los CSV incluyen IDs de usuario y actividad; mantenerlos fuera de repositorios públicos.",
        ]
    (args.salida / "informe_detalle.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("\n".join(lines))
    print(f"\nArchivos generados en: {args.salida.resolve()}")


if __name__ == "__main__":
    main()
