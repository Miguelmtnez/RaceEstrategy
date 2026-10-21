#!/usr/bin/env python3
"""Extrae GPX y FIT/FIT.GZ recursivamente y produce CSV para BBDD.

No sube datos a Internet; el nombre de lugar NO se infiere de coordenadas.
La geometría se exporta a GeoJSON opcionalmente con --geojson.

Ejemplos (desde la raíz del repositorio):
 python herramientas/visor_rutas/extraer_actividades.py "../MisActividades" \
     --salida "herramientas/visor_rutas/resultados_csv"
 python herramientas/visor_rutas/extraer_actividades.py "../MisActividades" --geojson
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import sys
import sqlite3
from pathlib import Path
from contextlib import nullcontext

from visualizar_rutas import calcular_metricas, leer_fit, leer_gpx

# Orden de columnas ESTABLE para importar a PostgreSQL / SQLite.
CAMPOS = [
    "id_actividad", "archivo", "formato", "nombre", "deporte", "tiene_gps",
    "fecha_inicio_utc", "fecha_fin_utc", "tiempo_total_min", "tiempo_gps_min", "tiempo_movimiento_min",
    "distancia_km", "distancia_gps_km", "distancia_dispositivo_km", "velocidad_media_kmh", "velocidad_movimiento_kmh",
    "desnivel_positivo_m", "desnivel_negativo_m", "desnivel_gps_estimado_m",
    "lat_inicio", "lon_inicio", "lat_final", "lon_final",
    "altitud_inicio_m", "altitud_final_m", "altitud_min_m", "altitud_max_m",
    "frecuencia_cardiaca_media_ppm", "frecuencia_cardiaca_max_ppm",
    "potencia_media_w", "cadencia_media", "calorias_kcal",
    "puntos_gps", "altitud_disponible_pct", "sesiones_en_fit",
]


def tipo(ruta: Path):
    name = ruta.name.lower()
    if name.endswith(".fit.gz"):
        return "fit.gz"
    if name.endswith(".fit"):
        return "fit"
    if name.endswith(".gpx.gz"):
        return "gpx.gz"
    if name.endswith(".gpx"):
        return "gpx"
    return None


def sha256_archivo(ruta: Path):
    """ID reproducible a partir del archivo, para deduplicar importaciones."""
    h = hashlib.sha256()
    with ruta.open("rb") as f:
        while trozo := f.read(1024 * 1024):
            h.update(trozo)
    return h.hexdigest()


def leer_archivo(ruta: Path):
    formato = tipo(ruta)
    if formato in ("fit", "fit.gz"):
        return leer_fit(ruta, permitir_sin_gps=True)
    if formato == "gpx.gz":
        with gzip.open(ruta, "rb") as f:
            return leer_gpx(f.read(), ruta.name[:-7], str(ruta))
    if formato == "gpx":
        return leer_gpx(ruta.read_bytes(), ruta.stem, str(ruta))
    raise ValueError(f"Formato no admitido: {ruta.name}")


def iter_archivos(carpeta: Path, recursivo: bool):
    it = carpeta.rglob("*") if recursivo else carpeta.iterdir()
    for ruta in sorted(it):
        if ruta.is_file() and tipo(ruta):
            yield ruta


def geometria_gps(act):
    segmentos = []
    for seg in act.segmentos:
        if len(seg) >= 2:
            segmentos.append([[round(p.lon, 7), round(p.lat, 7)] for p in seg])
    if not segmentos:
        return None
    if len(segmentos) == 1:
        return {"type": "LineString", "coordinates": segmentos[0]}
    return {"type": "MultiLineString", "coordinates": segmentos}


def abrir_sqlite(ruta: Path):
    """Tabla sencilla preparada para importar resultados y evitar IDs duplicados."""
    conn = sqlite3.connect(ruta)
    texto = {"id_actividad", "archivo", "formato", "nombre", "deporte", "tiene_gps",
             "fecha_inicio_utc", "fecha_fin_utc"}
    enteros = {"puntos_gps", "sesiones_en_fit"}
    definiciones = []
    for nombre in CAMPOS:
        tipo_sql = "TEXT" if nombre in texto else "INTEGER" if nombre in enteros else "REAL"
        definiciones.append(f'"{nombre}" {tipo_sql}' + (" PRIMARY KEY" if nombre == "id_actividad" else ""))
    conn.execute("CREATE TABLE IF NOT EXISTS actividades (" + ",".join(definiciones) + ")")
    return conn


def exportar(carpeta: Path, salida: Path, recursivo=True, geojson=False, sqlite=False):
    if not carpeta.is_dir():
        raise NotADirectoryError(f"No existe la carpeta de entrada: {carpeta}")
    # No crear resultados dentro de la carpeta de origen si fuera posible:
    # impide que los usuarios confundan archivos originales y exportaciones.
    salida.mkdir(parents=True, exist_ok=True)
    out_csv = salida / "actividades.csv"
    out_errors = salida / "errores.csv"
    out_geo = salida / "recorridos.geojson"
    out_sqlite = salida / "actividades.sqlite"
    db = abrir_sqlite(out_sqlite) if sqlite else None
    if db is not None:
        columnas = ", ".join(f'"{col}"' for col in CAMPOS)
        placeholders = ", ".join("?" for _ in CAMPOS)
        insert_sql = f"INSERT OR REPLACE INTO actividades ({columnas}) VALUES ({placeholders})"
    archivos = list(iter_archivos(carpeta, recursivo))
    print(f"Archivos encontrados: {len(archivos)}")
    ok = fallos = sin_gps = 0
    # Ficheros se escriben por streaming: no guardamos todo el dataset en RAM.
    with out_csv.open("w", encoding="utf-8", newline="") as f_csv, \
         out_errors.open("w", encoding="utf-8", newline="") as f_err, \
         (out_geo.open("w", encoding="utf-8") if geojson else nullcontext()) as f_geo:
        writer = csv.DictWriter(f_csv, fieldnames=CAMPOS, delimiter=";", extrasaction="ignore")
        writer.writeheader()
        err_writer = csv.DictWriter(f_err, fieldnames=["archivo", "error"], delimiter=";")
        err_writer.writeheader()
        primer_geo = True
        if geojson:
            f_geo.write('{"type":"FeatureCollection","features":[\n')
        for n, ruta in enumerate(archivos, start=1):
            relativa = ruta.relative_to(carpeta).as_posix()
            try:
                actividades = leer_archivo(ruta)
                sha = sha256_archivo(ruta)
                for idx, act in enumerate(actividades, start=1):
                    met, _ = calcular_metricas(act)
                    ident = f"{sha[:24]}-{idx}"
                    fila = {
                        **met,
                        "id_actividad": ident,
                        "archivo": relativa,
                        "formato": tipo(ruta),
                        "tiene_gps": "si" if met["puntos_gps"] >= 2 else "no",
                    }
                    writer.writerow(fila)
                    if db is not None:
                        db.execute(insert_sql, [fila.get(col) for col in CAMPOS])
                    ok += 1
                    if met["puntos_gps"] < 2:
                        sin_gps += 1
                    if geojson and met["puntos_gps"] >= 2:
                        geom = geometria_gps(act)
                        if geom:
                            feat = {
                                "type": "Feature",
                                "properties": {"id_actividad": ident, "archivo": relativa, "deporte": act.deporte},
                                "geometry": geom,
                            }
                            if not primer_geo:
                                f_geo.write(',\n')
                            json.dump(feat, f_geo, ensure_ascii=False, separators=(",", ":"))
                            primer_geo = False
                print(f"[{n}/{len(archivos)}] OK: {relativa} ({len(actividades)} actividades)")
            except Exception as exc:
                fallos += 1
                err_writer.writerow({"archivo": relativa, "error": f"{type(exc).__name__}: {exc}"})
                print(f"[{n}/{len(archivos)}] ERROR: {relativa}: {exc}", file=sys.stderr)
        if geojson:
            f_geo.write('\n]}\n')
    if db is not None:
        db.commit()
        db.close()
    print(f"\nActividades exportadas: {ok}; sin GPS: {sin_gps}; archivos con errores: {fallos}")
    print(f"CSV: {out_csv.resolve()}")
    print(f"Errores: {out_errors.resolve()}")
    if db is not None:
        print(f"Base SQLite: {out_sqlite.resolve()}")
    if geojson:
        print(f"Geometrías: {out_geo.resolve()}")
    elif out_geo.exists():
        print("Nota: existe un GeoJSON de una ejecución anterior; esta ejecución no lo ha actualizado.")
    return ok, fallos


def main():
    parser = argparse.ArgumentParser(
        description="Extraer métricas de todos los GPX, FIT y FIT.GZ de una carpeta a CSV."
    )
    parser.add_argument("carpeta", type=Path, help="Directorio con archivos de actividades")
    parser.add_argument("--salida", type=Path,
                        default=Path(__file__).resolve().parent / "resultados_csv",
                        help="Directorio de CSV (por defecto junto al script, en resultados_csv/)")
    parser.add_argument("--sin-recursivo", action="store_true", help="Solo archivos de la carpeta raíz")
    parser.add_argument("--geojson", action="store_true", help="También guardar rutas completas en recorridos.geojson")
    parser.add_argument("--sqlite", action="store_true", help="También guardar en una base SQLite, con IDs únicos")
    args = parser.parse_args()
    try:
        _, fallos = exportar(args.carpeta.resolve(), args.salida.resolve(),
                            not args.sin_recursivo, args.geojson, args.sqlite)
    except (OSError, ValueError) as exc:
        parser.exit(1, f"ERROR: {exc}\n")
    if fallos:
        print("Revisa errores.csv. Los archivos restantes se han procesado.")


if __name__ == "__main__":
    main()
