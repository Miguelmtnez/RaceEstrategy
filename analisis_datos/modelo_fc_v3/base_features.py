"""Funciones deterministas para el primer modelo RaceEstrategy.

La predicción se aprende del TIEMPO real de una actividad, usando exclusivamente
el historial del mismo deporte con fecha estrictamente anterior.
"""
from __future__ import annotations

from datetime import date, timedelta
import numpy as np
import pandas as pd

FEATURES = [
    'distance_km', 'ascent_m_per_km', 'descent_m_per_km',
    'history_count', 'hist_pace_median_last10',
    'hist_p75_distance_last30', 'hist_ascent_m_per_km_median_last30',
    'hist_km_last28d', 'days_since_last',
]
HR_FEATURES = [
    "hist_hr_mean_median_last10", "hist_hr_max_p90_last30",
    "hist_speed_per_bpm_median_last10", "hist_hr_coverage_last10",
]

def heart_features(last10, last30):
    means = [x for x in last10 if np.isfinite(x["hr_mean"])]
    maxima = [x["hr_max"] for x in last30 if np.isfinite(x["hr_max"])]
    if len(means) < 3 or len(maxima) < 3:
        return dict.fromkeys(HR_FEATURES, np.nan)
    return dict(zip(HR_FEATURES, [
        float(np.median([x["hr_mean"] for x in means])),
        float(np.percentile(maxima, 90)),
        float(np.median([60 / x["pace"] / x["hr_mean"] for x in means])),
        len(means) / len(last10),
    ]))

SPORTS = {
    'carrera': 'Carrera', 'run':'Carrera', 'running':'Carrera',
    'bicicleta':'Bicicleta', 'bike':'Bicicleta', 'cycling':'Bicicleta',
    'mtb':'MTB', 'mountain bike':'MTB', 'mountain_bike':'MTB',
}
SPEED_LIMITS = {'Carrera': (3.0, 25.0), 'Bicicleta':(5.0,80.0),'MTB':(3.0,65.0)}


def to_float(s:pd.Series)->pd.Series:
    return pd.to_numeric(s.astype('string').str.replace(',', '.', regex=False).str.strip(), errors='coerce').astype('float64')


def read_and_filter(path:str, sport:str, date_start:str='2010-01-01', date_end:str='2016-12-31'):
    df = pd.read_csv(path, dtype={'usuario':'string','actividad_id':'string'}, encoding='utf-8-sig', low_memory=False)
    required=['usuario','actividad_id','modalidad','fecha','distancia_km','duracion_min','desnivel_positivo_m','desnivel_negativo_m']
    missing=[c for c in required if c not in df]
    if missing:
        raise ValueError(f'Faltan columnas del CSV: {missing}')
    original=len(df)
    df['modalidad']=df['modalidad'].astype('string').str.strip().str.lower().map(SPORTS)
    df=df.loc[df['modalidad']==sport].copy()
    count_sport=len(df)
    for col in ['distancia_km','duracion_min','desnivel_positivo_m','desnivel_negativo_m']:
        df[col]=to_float(df[col])
    df['fecha']=pd.to_datetime(df['fecha'], errors='coerce', utc=True).dt.date
    df=df.dropna(subset=['usuario','actividad_id','fecha'])
    df=df.loc[df['usuario'].astype('string').str.len().gt(0) & df['actividad_id'].astype('string').str.len().gt(0)]
    before_dupes=len(df)
    df=df.drop_duplicates(subset=['actividad_id'])
    duplicates=before_dupes-len(df)
    dates=(df['fecha']>=date.fromisoformat(date_start)) & (df['fecha']<=date.fromisoformat(date_end))
    df=df.loc[dates].copy()
    lo,hi=SPEED_LIMITS[sport]
    # Estos umbrales son filtros de calidad PROVISIONALES, no criterios clínicos.
    speed=df['distancia_km']/(df['duracion_min']/60)
    ok=(df['distancia_km'].between(0.5,400) & df['duracion_min'].between(5,1440)
        & speed.between(lo,hi) & df['desnivel_positivo_m'].between(0,15000)
        & df['desnivel_negativo_m'].between(0,15000)
        & (df['desnivel_positivo_m']/df['distancia_km']).le(350)
        & (df['desnivel_negativo_m']/df['distancia_km']).le(350))
    # Evita algunas duraciones/distancias GPS absurdas; validar sensibilidad más adelante.
    df=df.loc[ok].sort_values(['usuario','fecha','actividad_id']).reset_index(drop=True)
    info={'filas_csv_total':original, 'filas_modalidad':count_sport,
          'duplicados_id_en_modalidad':duplicates,
          'actividades_aptas_tras_filtros':len(df),
          'filas_modalidad_no_aptas':count_sport-len(df),
          'fecha_minima':date_start,'fecha_maxima':date_end,
          'velocidad_min_max_kmh_provisionales':[lo,hi]}
    return df,info


def make_training_rows(df:pd.DataFrame, min_history:int=5):
    """Genera una predicción por actividad usando SOLO días anteriores.

    Las actividades del mismo día se añaden juntas al historial al terminar ese día,
    para que una hora desconocida dentro de la fecha no filtre resultados.
    """
    out=[]
    for user, user_rows in df.groupby('usuario', sort=False):
        previous=[]
        for day, daily in user_rows.groupby('fecha',sort=True):
            if len(previous)>=min_history:
                last10=previous[-10:]
                last30=previous[-30:]
                hist_pace=float(np.median([x['pace'] for x in last10]))
                hist_p75=float(np.percentile([x['dist'] for x in last30],75))
                hist_climb=float(np.median([x['climb_density'] for x in last30]))
                last_28=day-timedelta(days=28)
                km_28=float(sum(x['dist'] for x in previous if last_28<=x['day']<day))
                since_last=int((day-previous[-1]['day']).days)
                for r in daily.itertuples(index=False):
                    distance=float(r.distancia_km)
                    out.append({
                        'usuario':str(user),'fecha':day,'actividad_id':str(r.actividad_id),
                        'distance_km':distance,
                        'ascent_m_per_km':float(r.desnivel_positivo_m)/distance,
                        'descent_m_per_km':float(r.desnivel_negativo_m)/distance,
                        'history_count':len(previous),
                        'hist_pace_median_last10':hist_pace,
                        'hist_p75_distance_last30':hist_p75,
                        'hist_ascent_m_per_km_median_last30':hist_climb,
                        'hist_km_last28d':km_28,
                        'days_since_last':since_last,
                        'target_minutes':float(r.duracion_min),
                        'target_log_pace':float(np.log(float(r.duracion_min)/distance)),
                        'baseline_minutes':hist_pace*distance,
                        **heart_features(last10, last30),
                    })
            # Añadir simultáneamente las actividades del día ACTUAL para el siguiente día.
            for r in daily.itertuples(index=False):
                d=float(r.distancia_km)
                previous.append({'day':day,'dist':d,
                                 'pace':float(r.duracion_min)/d,
                                 'climb_density':float(r.desnivel_positivo_m)/d,
                                 'hr_mean':float(getattr(r, 'hr_mean', np.nan)),
                                 'hr_max':float(getattr(r, 'hr_max', np.nan))})
    return pd.DataFrame(out)


def temporal_split(rows:pd.DataFrame, min_days_per_user:int=25):
    """70/15/15 cronológico por usuario sin dividir actividades del mismo día."""
    splits=[]
    for _, part in rows.groupby('usuario', sort=False):
        part=part.sort_values(['fecha','actividad_id']).copy()
        days=sorted(part['fecha'].unique())
        n=len(days)
        if n<min_days_per_user:continue
        a=int(np.floor(n*.70));b=int(np.floor(n*.85))
        mapping={d:('train' if i<a else 'validation' if i<b else 'test') for i,d in enumerate(days)}
        part['split']=part['fecha'].map(mapping)
        splits.append(part)
    if not splits:
        raise ValueError('No hay suficientes fechas distintas por usuario para train/val/test. Se necesitan al menos 25 fechas predictivas (además de las cinco primeras actividades).')
    return pd.concat(splits,ignore_index=True)
