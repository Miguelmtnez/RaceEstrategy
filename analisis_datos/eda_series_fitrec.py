"""Fase 3 del EDA de RaceEstrategy: comprobación de series GPS/temporales.

Muestrea actividades advertidas y controles limpios del EDA anterior.
NO elimina ni modifica datos. NO estima porcentajes globales a partir de una
muestra que selecciona deliberadamente más actividades sospechosas.

Ejemplo desde analisis_datos/:
 python eda_series_fitrec.py datos/endomondoHR.json \
   --resumen resultados_filtrados/resumen_actividades.csv \
   --alertas resultados_calidad/actividades_a_revisar.csv \
   --salida resultados_series

Si el archivo original está comprimido, también admite .json.gz.
"""
from __future__ import annotations

import argparse
import ast
import csv
import gzip
import json
import random
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

MODALIDADES = {"run": "Carrera", "bike": "Bicicleta", "mountain bike": "MTB"}
FLAGS = ["error_basico", "revisar_salto_gps", "revisar_velocidad_alta",
         "revisar_fecha", "revisar_duracion_larga"]
# ÚNICAMENTE indicadores de auditoría. NO son reglas de eliminación.
MAX_KMH = {"Carrera": 30.0, "Bicicleta": 100.0, "MTB": 70.0}


def leer_registro(line):
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        obj = ast.literal_eval(line)
    if not isinstance(obj, dict):
        raise ValueError("Se esperaba un diccionario por línea")
    return obj


def arreglo(rec, nombre):
    v = rec.get(nombre)
    if not isinstance(v, list):
        return np.array([], dtype=float)
    try:
        return np.asarray(v, dtype=float)
    except (ValueError, TypeError):
        return np.array([], dtype=float)


def distancias_km(lat, lon):
    valid = (np.isfinite(lat) & np.isfinite(lon)
             & (np.abs(lat) <= 90) & (np.abs(lon) <= 180))
    a, b = np.radians(lat), np.radians(lon)
    ha = (np.sin(np.diff(a) / 2) ** 2
          + np.cos(a[:-1]) * np.cos(a[1:]) * np.sin(np.diff(b) / 2) ** 2)
    d = 2 * 6371.0088 * np.arcsin(np.sqrt(np.clip(ha, 0, 1)))
    d[~(valid[:-1] & valid[1:])] = np.nan
    return d, valid


def valor_percentil(v, percentil):
    a = np.asarray(v, dtype=float)
    a = a[np.isfinite(a)]
    return round(float(np.percentile(a, percentil)), 3) if len(a) else np.nan


def analizar(rec, modalidad, procedencia):
    la = arreglo(rec, "latitude")
    lo = arreglo(rec, "longitude")
    ts = arreglo(rec, "timestamp")
    alt = arreglo(rec, "altitude")
    pulso = arreglo(rec, "heart_rate")
    n = min(len(la), len(lo), len(ts))
    salida = {
        "actividad_id": str(rec.get("id", "")),
        "usuario": str(rec.get("userId", "")),
        "modalidad": modalidad,
        "seleccion": procedencia,
        "puntos_gps": len(la),
        "puntos_tiempo": len(ts),
        "puntos_altitud": len(alt),
        "puntos_fc": len(pulso),
        "longitudes_coinciden": len({len(la), len(lo), len(ts)}) == 1,
        "altitud_alineada": len(alt) == len(ts),
        "fc_alineada": len(pulso) == len(ts),
        "gps_fuera_rango": 0,
        "intervalos_tiempo_no_positivos": 0,
        "huecos_mayores_10min": 0,
        "saltos_espaciales_mayores_2km": 0,
        "saltos_2km_con_velocidad_sospechosa": 0,
        "tramos_velocidad_sospechosa": 0,
        "velocidad_tramo_p95_kmh": np.nan,
        "velocidad_tramo_max_kmh": np.nan,
        "intervalo_tiempo_p50_s": np.nan,
        "intervalo_tiempo_p95_s": np.nan,
        "saltos_altitud_mayores_100m": 0,
        "pulso_no_plausible": 0,
        "insuficientes_puntos": n < 2,
    }
    if len(pulso):
        salida["pulso_no_plausible"] = int(np.sum(~np.isfinite(pulso) | (pulso < 30) | (pulso > 240)))
    if len(alt) > 1:
        dd = np.abs(np.diff(alt))
        salida["saltos_altitud_mayores_100m"] = int(np.sum(np.isfinite(dd) & (dd > 100)))
    if n < 2:
        return salida
    la, lo, ts = la[:n], lo[:n], ts[:n]
    d, valid = distancias_km(la, lo)
    dt = np.diff(ts)
    salida["gps_fuera_rango"] = int(np.sum(~valid))
    salida["intervalos_tiempo_no_positivos"] = int(np.sum(~np.isfinite(dt) | (dt <= 0)))
    salida["huecos_mayores_10min"] = int(np.sum(np.isfinite(dt) & (dt > 600)))
    salida["intervalo_tiempo_p50_s"] = valor_percentil(dt[dt > 0], 50)
    salida["intervalo_tiempo_p95_s"] = valor_percentil(dt[dt > 0], 95)
    jumps = np.isfinite(d) & (d > 2)
    salida["saltos_espaciales_mayores_2km"] = int(np.sum(jumps))
    with np.errstate(divide="ignore", invalid="ignore"):
        speed = np.divide(d * 3600, dt, out=np.full(len(dt), np.nan), where=(dt > 0))
    high = np.isfinite(speed) & (speed > MAX_KMH[modalidad])
    salida["tramos_velocidad_sospechosa"] = int(np.sum(high))
    salida["saltos_2km_con_velocidad_sospechosa"] = int(np.sum(jumps & high))
    salida["velocidad_tramo_p95_kmh"] = valor_percentil(speed, 95)
    salida["velocidad_tramo_max_kmh"] = valor_percentil(speed, 100)
    return salida


def samplear(archivo_resumen, archivo_alertas, k, k_limpias, seed):
    df = pd.read_csv(archivo_resumen, dtype={"actividad_id": "string"}, low_memory=False)
    alarmas = pd.read_csv(archivo_alertas, dtype={"actividad_id": "string"}, low_memory=False)
    req = {"actividad_id", "modalidad"}
    if not req.issubset(df.columns) or not req.issubset(alarmas.columns):
        raise ValueError("Faltan columnas actividad_id/modalidad en alguno de los CSV")
    df = df.dropna(subset=["actividad_id"]).drop_duplicates("actividad_id")
    alarmas = alarmas.dropna(subset=["actividad_id"]).drop_duplicates("actividad_id")
    random_gen = random.Random(seed)
    objetivos = {}
    for modalidad in MODALIDADES.values():
        sub = alarmas[alarmas["modalidad"] == modalidad]
        for flag in FLAGS:
            if flag not in sub.columns:
                continue
            candidatos = sub[sub[flag].astype(str).str.casefold().eq("true")]["actividad_id"].tolist()
            seleccion = random_gen.sample(candidatos, min(k, len(candidatos)))
            for ident in seleccion:
                objetivos.setdefault(str(ident), set()).add(flag)
        limpios = df[(df["modalidad"] == modalidad) & (~df["actividad_id"].isin(alarmas["actividad_id"]))]
        ids = limpios["actividad_id"].tolist()
        for ident in random_gen.sample(ids, min(k_limpias, len(ids))):
            objetivos.setdefault(str(ident), set()).add("control_sin_advertencia")
    return {ident: ",".join(sorted(flags)) for ident, flags in objetivos.items()}


def main():
    ap = argparse.ArgumentParser(description="Audita puntos GPS, tiempos, altitudes y FC en una muestra estratificada")
    ap.add_argument("archivo", type=Path, help="endomondoHR.json o .json.gz")
    ap.add_argument("--resumen", type=Path, required=True, help="resumen_actividades.csv del primer EDA")
    ap.add_argument("--alertas", type=Path, required=True, help="actividades_a_revisar.csv del segundo EDA")
    ap.add_argument("--salida", type=Path, default=Path("resultados_series"))
    ap.add_argument("--por-tipo", type=int, default=35, help="Máximo por deporte y tipo de advertencia")
    ap.add_argument("--controles", type=int, default=35, help="Controles sin advertencias por deporte")
    ap.add_argument("--semilla", type=int, default=2026)
    args = ap.parse_args()
    for p in (args.archivo, args.resumen, args.alertas):
        if not p.is_file():
            ap.error(f"No existe {p}")
    args.salida.mkdir(parents=True, exist_ok=True)
    objetivos = samplear(args.resumen, args.alertas, args.por_tipo, args.controles, args.semilla)
    print(f"IDs elegidos para inspección: {len(objetivos)}")
    resultados = []
    lector = gzip.open if args.archivo.name.lower().endswith(".gz") else open
    n_malas = 0
    with lector(args.archivo, "rt", encoding="utf-8") as fh:
        for linea in fh:
            if not linea.strip():
                continue
            try:
                rec = leer_registro(linea)
            except (ValueError, SyntaxError, TypeError, MemoryError):
                n_malas += 1
                continue
            ident = str(rec.get("id", ""))
            if ident not in objetivos:
                continue
            modalidad = MODALIDADES.get(str(rec.get("sport", "")).strip().casefold())
            if modalidad is None:
                continue
            resultados.append(analizar(rec, modalidad, objetivos[ident]))
    out = pd.DataFrame(resultados)
    if out.empty:
        ap.error("Ningún ID seleccionado coincide con el JSON original. Revisa los archivos elegidos.")
    ruta_csv = args.salida / "auditoria_series_muestra.csv"
    out.to_csv(ruta_csv, index=False, encoding="utf-8-sig")
    nombres = ["intervalos_tiempo_no_positivos", "huecos_mayores_10min",
               "tramos_velocidad_sospechosa", "saltos_2km_con_velocidad_sospechosa",
               "saltos_altitud_mayores_100m", "pulso_no_plausible"]
    informe = ["AUDITORÍA DE SERIES — MUESTRA DIRIGIDA (NO REPRESENTATIVA)",
               "NO se han borrado registros ni se han aplicado filtros definitivos.",
               f"Actividades solicitadas: {len(objetivos)}",
               f"Encontradas y analizadas: {len(out)}",
               f"Registros ilegibles: {n_malas}",
               "", "Actividades analizadas por modalidad:", out["modalidad"].value_counts().to_string(),
               "", "Actividades con al menos un problema de cada tipo:"]
    for col in nombres:
        informe.append(f"  {col}: {int(out[col].gt(0).sum())}")
    informe += ["", "IMPORTANTE: los resultados no estiman tasas del dataset completo.",
                "Las velocidades por tramo son distancia GPS entre puntos / tiempo entre puntos.",
                "Una FC fuera de 30–240 bpm y saltos de altitud >100m son alertas orientativas.",
                "No subas estos CSV a un repositorio público: contienen IDs y datos del historial."]
    (args.salida / "informe_series.txt").write_text("\n".join(informe) + "\n", encoding="utf-8")
    print("\n".join(informe))
    print(f"\nArchivos en: {args.salida.resolve()}")


if __name__ == "__main__":
    main()
