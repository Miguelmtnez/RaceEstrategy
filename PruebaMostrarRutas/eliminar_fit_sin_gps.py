#!/usr/bin/env python3
"""Script para escanear y eliminar/mover archivos FIT (y FIT.GZ) que no tienen puntos GPS.

Uso:
    # 1. Simular (modo seguro, no borra nada, solo lista):
    python PruebaMostrarRutas/eliminar_fit_sin_gps.py GPX/activities --dry-run

    # 2. Mover a una carpeta de respaldo (recomendado en lugar de borrar permanentemente):
    python PruebaMostrarRutas/eliminar_fit_sin_gps.py GPX/activities --mover GPX/sin_gps

    # 3. Eliminar definitivamente:
    python PruebaMostrarRutas/eliminar_fit_sin_gps.py GPX/activities --eliminar
"""
from __future__ import annotations

import argparse
import gzip
import shutil
import sys
from pathlib import Path


def tiene_gps(ruta: Path) -> bool:
    """Verifica si un archivo FIT o FIT.GZ contiene al menos un punto GPS válido."""
    try:
        from fitparse import FitFile
    except ImportError:
        sys.exit(
            "Error: Se requiere 'fitparse'. Instálalo con: pip install fitparse"
        )

    es_gzip = ruta.name.lower().endswith(".fit.gz")
    abrir = gzip.open if es_gzip else open

    try:
        with abrir(ruta, "rb") as archivo:
            fit = FitFile(archivo)
            for mensaje in fit.get_messages("record"):
                lat = mensaje.get_value("position_lat")
                lon = mensaje.get_value("position_long")
                if lat is not None and lon is not None:
                    # Si tiene al menos una coordenada GPS, es válido
                    return True
        return False
    except Exception as e:
        print(f"[ERROR] No se pudo leer {ruta.name}: {e}", file=sys.stderr)
        return False


def main():
    p = argparse.ArgumentParser(
        description="Detecta y elimina o mueve archivos FIT sin coordenadas GPS (actividades indoor)."
    )
    p.add_argument(
        "directorio",
        type=Path,
        help="Carpeta donde buscar los archivos FIT (por ej. GPX/activities)",
    )
    p.add_argument(
        "--no-recursivo",
        action="store_true",
        help="No buscar en subcarpetas",
    )
    grupo = p.add_mutually_exclusive_group(required=True)
    grupo.add_argument(
        "--dry-run",
        action="store_true",
        help="Solo muestra los archivos sin GPS encontrados, sin borrar ni mover nada.",
    )
    grupo.add_argument(
        "--mover",
        type=Path,
        metavar="CARPETA_DESTINO",
        help="Mueve los archivos sin GPS a esta carpeta de respaldo en lugar de borrarlos.",
    )
    grupo.add_argument(
        "--eliminar",
        action="store_true",
        help="Elimina definitivamente los archivos sin GPS.",
    )

    args = p.parse_args()

    directorio: Path = args.directorio.resolve()
    if not directorio.is_dir():
        sys.exit(f"Error: '{directorio}' no es una carpeta válida.")

    patron = "*.fit*"
    if args.no_recursivo:
        candidatos = [f for f in directorio.glob(patron) if f.is_file() and f.name.lower().endswith((".fit", ".fit.gz"))]
    else:
        candidatos = [f for f in directorio.rglob(patron) if f.is_file() and f.name.lower().endswith((".fit", ".fit.gz"))]

    print(f"Analizando {len(candidatos)} archivos FIT en {directorio}...")

    sin_gps: list[Path] = []
    for i, archivo in enumerate(candidatos, 1):
        if not tiene_gps(archivo):
            sin_gps.append(archivo)
        if i % 50 == 0 or i == len(candidatos):
            print(f"Progreso: {i}/{len(candidatos)} archivos analizados...", end="\r")

    print()
    print(f"\nResumen: Se encontraron {len(sin_gps)} archivos sin datos GPS de un total de {len(candidatos)}.")

    if not sin_gps:
        print("No hay archivos para procesar.")
        return

    if args.dry_run:
        print("\n[MODO SIMULACIÓN - DRY RUN] Los siguientes archivos no tienen GPS:")
        for f in sin_gps:
            print(f" - {f.name}")
        print("\nPara eliminarlos ejecuta con el flag --eliminar o muévelos con --mover <carpeta>.")

    elif args.mover:
        destino: Path = args.mover.resolve()
        destino.mkdir(parents=True, exist_ok=True)
        print(f"\nMoviendo {len(sin_gps)} archivos a {destino}...")
        for f in sin_gps:
            shutil.move(str(f), str(destino / f.name))
        print("Operación completada.")

    elif args.eliminar:
        print(f"\nEliminando {len(sin_gps)} archivos...")
        for f in sin_gps:
            try:
                f.unlink()
                print(f"Eliminado: {f.name}")
            except OSError as e:
                print(f"Error al eliminar {f.name}: {e}", file=sys.stderr)
        print("Eliminación completada.")


if __name__ == "__main__":
    main()
