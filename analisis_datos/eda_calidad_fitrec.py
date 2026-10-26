"""Auditoría de calidad sobre resumen_actividades.csv de eda_fitrec_filtrado.py.

No elimina datos ni entrena modelos. Distingue fallos básicos de alertas
que deben revisarse (p. ej., un salto GPS aislado no implica error).

Uso:
  python eda_calidad_fitrec.py resultados_filtrados/resumen_actividades.csv --salida resultados_calidad
"""
from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np
import pandas as pd

SPORTS = ('Carrera', 'Bicicleta', 'MTB')
NUMERIC = ('duracion_min_marca_tiempo', 'distancia_km_gps_sin_filtrar',
           'salto_max_km_gps', 'puntos_temporales', 'puntos_latitud', 'puntos_longitud')


def main():
    parser = argparse.ArgumentParser(description='Segunda fase del EDA FitRec: auditoría de calidad.')
    parser.add_argument('archivo', type=Path, help='CSV generado por eda_fitrec_filtrado.py')
    parser.add_argument('--salida', type=Path, default=Path('resultados_calidad'))
    args = parser.parse_args()
    args.salida.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(args.archivo, low_memory=False)
    required = {'modalidad', 'usuario', *NUMERIC}
    missing = required - set(df.columns)
    if missing:
        parser.error('Faltan columnas del CSV esperado: ' + ', '.join(sorted(missing)))
    for c in NUMERIC:
        df[c] = pd.to_numeric(df[c], errors='coerce')

    duration = df['duracion_min_marca_tiempo']
    distance = df['distancia_km_gps_sin_filtrar']
    df['error_tiempo'] = duration.isna() | (duration <= 0)
    df['error_distancia'] = distance.isna() | (distance <= 0)
    df['error_menos_2_tiempos'] = df['puntos_temporales'].fillna(0) < 2
    df['error_longitud_gps'] = df['puntos_latitud'] != df['puntos_longitud']
    df['error_basico'] = df[[
        'error_tiempo', 'error_distancia', 'error_menos_2_tiempos',
        'error_longitud_gps']].any(axis=1)

    # Un salto espacial >2 km puede ser legítimo si hay un hueco temporal largo.
    df['revisar_salto_gps'] = df['salto_max_km_gps'] > 2
    # Filtros de detección, NO criterios de eliminación. Estos límites son orientativos.
    df['velocidad_media_kmh'] = np.where(
        (duration > 0) & (distance > 0), distance / (duration / 60), np.nan
    )
    max_speeds = {'Carrera': 30., 'Bicicleta': 100., 'MTB': 70.}
    df['revisar_velocidad_alta'] = df.apply(
        lambda r: bool(pd.notna(r['velocidad_media_kmh']) and
                       r['velocidad_media_kmh'] > max_speeds.get(r['modalidad'], 100.)),
        axis=1,
    )
    # Revisión de fechas fuera del periodo dominante, no su eliminación automática.
    if 'fecha_utc' in df.columns:
        dates = pd.to_datetime(df['fecha_utc'], errors='coerce', utc=True)
        df['revisar_fecha'] = dates.isna() | (dates.dt.year < 2010) | (dates.dt.year > 2016)
    else:
        df['revisar_fecha'] = False
    df['revisar_duracion_larga'] = duration > 24 * 60  # Umbral orientativo de auditoría, no eliminación
    warnings = ['revisar_salto_gps', 'revisar_velocidad_alta',
                'revisar_fecha', 'revisar_duracion_larga']
    df['alguna_advertencia'] = df[warnings].any(axis=1)
    df['candidata_basica'] = ~df['error_basico']

    def row_for(name: str, data: pd.DataFrame) -> dict:
        good = data.loc[data['candidata_basica']]
        def med(name: str):
            v = good[name].replace([np.inf, -np.inf], np.nan)
            return float(v.median()) if not v.dropna().empty else float('nan')
        result = {'modalidad': name, 'actividades': len(data),
                  'fallo_tiempo': int(data['error_tiempo'].sum()),
                  'fallo_distancia': int(data['error_distancia'].sum()),
                  'fallo_puntos_temporales': int(data['error_menos_2_tiempos'].sum()),
                  'fallo_longitud_gps': int(data['error_longitud_gps'].sum()),
                  'fallo_basico_union': int(data['error_basico'].sum()),
                  'candidatas_basicas': int(data['candidata_basica'].sum()),
                  'salto_gps_mayor_2km': int(data['revisar_salto_gps'].sum()),
                  'velocidad_media_sospechosa': int(data['revisar_velocidad_alta'].sum()),
                  'fecha_a_revisar': int(data['revisar_fecha'].sum()),
                  'duracion_mayor_24h': int(data['revisar_duracion_larga'].sum()),
                  'alguna_advertencia_union': int(data['alguna_advertencia'].sum()),
                  'mediana_distancia_km_candidatas': med('distancia_km_gps_sin_filtrar'),
                  'mediana_duracion_min_candidatas': med('duracion_min_marca_tiempo'),
                  'mediana_velocidad_kmh_candidatas': med('velocidad_media_kmh')}
        return result

    groups = [row_for('TOTAL', df)]
    groups.extend(row_for(m, df[df['modalidad'] == m]) for m in SPORTS)
    summary = pd.DataFrame(groups)
    summary.to_csv(args.salida / 'conteos_por_modalidad.csv', index=False, encoding='utf-8-sig')

    # Conserva rastreabilidad local de los registros que requieren revisión.
    flags = ['error_basico', *warnings]
    anomalous = df.loc[df[flags].any(axis=1)]
    columns = [x for x in ['usuario', 'actividad_id', 'modalidad', 'fecha_utc',
                            'duracion_min_marca_tiempo', 'distancia_km_gps_sin_filtrar',
                            'salto_max_km_gps', 'velocidad_media_kmh', *flags] if x in df.columns]
    anomalous[columns].to_csv(args.salida / 'actividades_a_revisar.csv',
                              index=False, encoding='utf-8-sig')

    output = [
        'AUDITORÍA DE CALIDAD PRELIMINAR — FITREC',
        'NO se han eliminado entrenamientos; los límites son indicadores de revisión.',
        'Un salto >2 km NO prueba un error sin examinar el tiempo entre puntos.',
        'Duración calculada = último timestamp - primer timestamp (no tiempo en movimiento).',
        'Velocidad = distancia GPS sin filtrar / duración; también puede estar contaminada por errores.',
        '100% de listas de FC/altitud presentes NO equivale a 100% de mediciones válidas.',
        '', 'RECUENTOS POR MODALIDAD', summary.to_string(index=False, float_format=lambda v: f'{v:.2f}'),
        '', 'SIGUIENTE PASO',
        'Revisar una muestra de actividades señaladas; comprobar monotonía temporal,',
        'consistencia de tamaños (GPS/tiempo/FC/altitud), velocidades entre puntos y saltos de altitud.',
        'Después definir reglas de limpieza justificadas y auditar cuántas actividades',
        'conserva cada modalidad y cada usuario, antes de entrenar.'
    ]
    report = '\n'.join(output) + '\n'
    (args.salida / 'informe_calidad.txt').write_text(report, encoding='utf-8')
    print(report)
    print(f'Archivos guardados en: {args.salida.resolve()}')

if __name__ == '__main__':
    main()
