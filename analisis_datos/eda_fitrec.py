"""EDA inicial del conjunto FitRec/Endomondo.

Uso:
  python eda_fitrec.py "ruta/endomondoHR.json.gz" --max 10000
  python eda_fitrec.py "ruta/endomondoHR.json.gz" --max 0

Procesa un registro por línea; admite JSON y representaciones literales de Python.
No utiliza eval() y nunca necesita cargar las series GPS completas en memoria.
"""
from __future__ import annotations

import argparse
import ast
from collections import Counter
from datetime import datetime, timezone
import gzip
import json
from pathlib import Path
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

SEQUENCES = ('latitude', 'longitude', 'timestamp', 'altitude', 'heart_rate',
             'speed', 'distance', 'derived_speed', 'tar_heart_rate',
             'tar_derived_speed', 'time_elapsed')


def read_record(line: str) -> dict:
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        obj = ast.literal_eval(line)  # Seguro frente a código arbitrario; no usar eval().
    if not isinstance(obj, dict):
        raise ValueError('Se esperaba un diccionario por línea.')
    return obj


def sport_group(value) -> str:
    s = str(value or '').lower()
    if 'bike' in s or 'cycl' in s:
        return 'Ciclismo'
    if 'run' in s or 'jog' in s:
        return 'Carrera'
    return 'Otros'


def haversine_km(lat, lon) -> tuple[float, float]:
    """Distancia GPS calculada y salto máximo entre puntos, SIN filtrar anomalías."""
    try:
        a = np.asarray(lat, dtype='float64')
        b = np.asarray(lon, dtype='float64')
        if len(a) != len(b) or len(a) < 2:
            return (float('nan'), float('nan'))
        ok = np.isfinite(a) & np.isfinite(b) & (np.abs(a) <= 90) & (np.abs(b) <= 180)
        x = np.radians(a)
        y = np.radians(b)
        da = np.diff(x)
        db = np.diff(y)
        h = np.sin(da / 2)**2 + np.cos(x[:-1]) * np.cos(x[1:]) * np.sin(db / 2)**2
        segments = 2 * 6371.0088 * np.arcsin(np.sqrt(np.clip(h, 0, 1)))
        segments[~(ok[:-1] & ok[1:])] = np.nan
        return (float(np.nansum(segments)), float(np.nanmax(segments)) if np.isfinite(segments).any() else float('nan'))
    except (TypeError, ValueError):
        return (float('nan'), float('nan'))


def duration_minutes(ts) -> float:
    if not isinstance(ts, list) or len(ts) < 2:
        return float('nan')
    try:
        t0, t1 = float(ts[0]), float(ts[-1])
        return (t1 - t0) / 60 if np.isfinite(t0) and np.isfinite(t1) else float('nan')
    except (TypeError, ValueError):
        return float('nan')


def first_date(ts) -> str:
    try:
        if isinstance(ts, list) and ts and 0 < float(ts[0]) < 4e9:
            return datetime.fromtimestamp(float(ts[0]), tz=timezone.utc).strftime('%Y-%m-%d')
    except (TypeError, ValueError, OverflowError, OSError):
        pass
    return ''


def chart_hist(data: pd.Series, title: str, xlabel: str, file: Path):
    values = pd.to_numeric(data, errors='coerce').replace([np.inf, -np.inf], np.nan).dropna()
    values = values[values >= 0]
    if values.empty:
        return
    # Para visualizar el grueso de la distribución, sin eliminar outliers del CSV.
    limit = values.quantile(0.99) if len(values) > 100 else values.max()
    shown = values[values <= limit]
    fig, ax = plt.subplots(figsize=(9, 5))
    ax.hist(shown, bins=40)
    ax.set(title=title + (' (hasta P99)' if len(values) > 100 else ''), xlabel=xlabel, ylabel='Frecuencia')
    fig.tight_layout()
    fig.savefig(file, dpi=150)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description='EDA exploratorio de FitRec/Endomondo (JSONL o JSONL.GZ).')
    parser.add_argument('fichero', type=Path, help='Archivo endomondoHR.json.gz o endomondoHR_proper.json')
    parser.add_argument('--max', type=int, default=10000, help='Número máximo de entrenamientos (0 = todos). Predeterminado: 10000')
    parser.add_argument('--salida', type=Path, default=Path('eda_resultados'), help='Carpeta para el resumen y gráficas')
    args = parser.parse_args()
    if not args.fichero.is_file():
        parser.error(f'No existe el archivo: {args.fichero}')
    args.salida.mkdir(parents=True, exist_ok=True)

    rows = []
    field_presence = Counter()
    bad_rows = 0
    first = None
    op = gzip.open if args.fichero.name.lower().endswith('.gz') else open
    try:
        with op(args.fichero, 'rt', encoding='utf-8') as f:
            for line_number, line in enumerate(f, 1):
                if not line.strip():
                    continue
                try:
                    rec = read_record(line)
                except (ValueError, SyntaxError, TypeError, MemoryError) as e:
                    bad_rows += 1
                    if bad_rows <= 3:
                        print(f'AVISO línea {line_number}: registro inválido ({type(e).__name__}).', file=sys.stderr)
                    continue
                if first is None:
                    first = rec
                field_presence.update(k for k, v in rec.items() if v is not None and (not isinstance(v, (list, dict, str)) or len(v) > 0))
                uid = rec.get('userId', rec.get('user_id'))
                sport = rec.get('sport', rec.get('workout_type', 'Desconocido'))
                lat = rec.get('latitude')
                lon = rec.get('longitude')
                ts = rec.get('timestamp')
                dk, max_jump = haversine_km(lat, lon) if isinstance(lat, list) and isinstance(lon, list) else (float('nan'), float('nan'))
                duration = duration_minutes(ts)
                pts = len(ts) if isinstance(ts, list) else (len(lat) if isinstance(lat, list) else 0)
                rows.append({
                    'usuario': str(uid) if uid is not None else '',
                    'actividad_id': str(rec.get('id', rec.get('workout_id', ''))),
                    'deporte_original': sport,
                    'modalidad': sport_group(sport),
                    'fecha_utc': first_date(ts),
                    'puntos_temporales': pts,
                    'puntos_latitud': len(lat) if isinstance(lat, list) else 0,
                    'puntos_longitud': len(lon) if isinstance(lon, list) else 0,
                    'duracion_min_marca_tiempo': duration,
                    'distancia_km_gps_sin_filtrar': dk,
                    'salto_max_km_gps': max_jump,
                    'tiene_fc': bool(isinstance(rec.get('heart_rate'), list) and len(rec['heart_rate']) > 0),
                    'tiene_altitud': bool(isinstance(rec.get('altitude'), list) and len(rec['altitude']) > 0),
                    'tiene_velocidad_original': bool(isinstance(rec.get('speed'), list) and len(rec['speed']) > 0),
                    'tiene_gps': bool(isinstance(lat, list) and isinstance(lon, list) and len(lat) >= 2 and len(lat) == len(lon)),
                })
                if len(rows) % 5000 == 0:
                    print(f'Procesados: {len(rows):,} entrenamientos', flush=True)
                if args.max > 0 and len(rows) >= args.max:
                    break
    except OSError as e:
        parser.error(f'No se pudo leer el archivo: {e}')

    if not rows:
        parser.error('No se encontraron entrenamientos. Verifica que sea un archivo FitRec JSONL/JSONL.GZ.')
    df = pd.DataFrame(rows)
    df.to_csv(args.salida / 'resumen_actividades.csv', index=False, encoding='utf-8-sig')

    users = df.loc[df['usuario'].ne('')].groupby('usuario').agg(
        entrenamientos=('usuario', 'size'),
        carrera=('modalidad', lambda x: int((x == 'Carrera').sum())),
        ciclismo=('modalidad', lambda x: int((x == 'Ciclismo').sum())),
        primera_fecha=('fecha_utc', 'min'),
        ultima_fecha=('fecha_utc', 'max'),
    ).reset_index()
    users.to_csv(args.salida / 'resumen_usuarios.csv', index=False, encoding='utf-8-sig')

    schema = []
    for key, value in first.items():
        if isinstance(value, list):
            desc = f'lista, longitud = {len(value)}; tipo del primer elemento = {type(value[0]).__name__ if value else "vacía"}'
        else:
            desc = type(value).__name__
        schema.append((key, desc))
    schema_text = '\n'.join(f'{k}: {t}' for k, t in schema)
    (args.salida / 'estructura.txt').write_text(
        'Estructura del PRIMER registro (sin mostrar datos personales ni coordenadas):\n' + schema_text + '\n',
        encoding='utf-8')

    summary = [
        f'Archivo: {args.fichero.name}',
        f'Actividades analizadas: {len(df):,}' + (' (MUESTRA INICIAL; NO ES EL DATASET COMPLETO)' if args.max and len(df) >= args.max else ''),
        f'Usuarios distintos identificados: {len(users):,}',
        f'Filas ilegibles omitidas: {bad_rows:,}',
        '', 'Deportes exactos (top 20):', df['deporte_original'].value_counts().head(20).to_string(),
        '', 'Modalidades agrupadas:', df['modalidad'].value_counts().to_string(),
        '', 'Usuarios con al menos 10 entrenamientos: ' + str(int((users['entrenamientos'] >= 10).sum())),
        'Actividades con duracion nula/negativa: ' + str(int((df['duracion_min_marca_tiempo'] <= 0).sum())),
        'Actividades con secuencias latitud/longitud de diferente longitud: ' + str(int((df['puntos_latitud'] != df['puntos_longitud']).sum())),
        'IDs de actividad repetidos (no vacios): ' + str(int(df.loc[df['actividad_id'].ne(''), 'actividad_id'].duplicated().sum())),
        '', 'Entrenamientos por usuario, percentiles:', users['entrenamientos'].describe(percentiles=[.25, .5, .75, .9, .95, .99]).to_string() if len(users) else 'No hay ID de usuario',
        '', 'Disponibilidad de campos:',
    ]
    for name in ('tiene_gps','tiene_fc','tiene_altitud','tiene_velocidad_original'):
        summary.append(f'  {name}: {df[name].mean():.1%}')
    summary += ['', 'Distribución de duraciones en min (intervalo entre primera y última marca temporal):',
                df.groupby('modalidad')['duracion_min_marca_tiempo'].describe().to_string(),
                '', 'Distribución de distancias GPS en km SIN FILTRAR saltos:',
                df.groupby('modalidad')['distancia_km_gps_sin_filtrar'].describe().to_string(),
                '', 'Nº de actividades con saltos GPS > 2 km entre puntos (solo indicador de revisión):',
                str(int((df['salto_max_km_gps'] > 2).sum())),
                '', 'Campos presentes en al menos un registro (top 60):']
    summary += [f'  {k}: {v:,} registros ({v / len(df):.1%})' for k, v in field_presence.most_common(60)]
    (args.salida / 'informe.txt').write_text('\n'.join(summary) + '\n', encoding='utf-8')

    counts = df['deporte_original'].value_counts().head(12).sort_values()
    fig, ax = plt.subplots(figsize=(10, 6))
    counts.plot.barh(ax=ax)
    ax.set(title='Deportes más frecuentes', xlabel='Nº de entrenamientos', ylabel='Deporte')
    fig.tight_layout()
    fig.savefig(args.salida / '01_deportes.png', dpi=150)
    plt.close(fig)

    if len(users):
        chart_hist(users['entrenamientos'], 'Entrenamientos por usuario', 'Número de entrenamientos', args.salida / '02_entrenamientos_por_usuario.png')
    for group, suffix in [('Carrera', 'carrera'), ('Ciclismo', 'ciclismo')]:
        subset = df[df['modalidad'] == group]
        if len(subset):
            chart_hist(subset['duracion_min_marca_tiempo'], f'Duración de las actividades - {group}', 'Minutos', args.salida / f'03_duracion_{suffix}.png')
            chart_hist(subset['distancia_km_gps_sin_filtrar'], f'Distancia GPS sin filtrar - {group}', 'Kilómetros', args.salida / f'04_distancia_{suffix}.png')

    print('\n'.join(summary[:17]))
    print(f'\nResultados guardados en: {args.salida.resolve()}')
    print('IMPORTANTE: Las distancias son orientativas y pueden contener errores GPS.')
    if 'proper' in args.fichero.name.lower() or args.fichero.suffix == '.npy':
        print('ATENCION: versión procesada de FitRec; algunas variables del origen fueron normalizadas.')


if __name__ == '__main__':
    main()
