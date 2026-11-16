"""Historical HR features. No target-day HR, no clinical zones or true HRmax."""
from datetime import timedelta
import numpy as np
import pandas as pd
from base_features import FEATURES, HR_FEATURES, heart_features

ADVANCED = [
    'hr_relative_mean_last10', 'hr_std_last10', 'hr_p90_p10_last10',
    'hr_high_fraction_last10', 'hr_second_half_change_last10',
    'hr_efficiency_change_10_vs_previous20', 'hr_load_7d', 'hr_load_28d',
    'hr_timed_coverage_last10', 'hr_recent_count_28d',
]
SUMMARY = ['hr_mean','hr_max','hr_std','hr_spread','hr_half_change','hr_hist']


def summarize(obj):
    raw = obj.get('heart_rate')
    empty = (np.nan, np.nan, np.nan, np.nan, np.nan, None)
    if not isinstance(raw, list) or len(raw)<10: return empty
    # Same validity and unweighted mean as V2, for exact paired comparison.
    h = np.array([float(x) if isinstance(x,(int,float)) and not isinstance(x,bool) else np.nan for x in raw])
    valid = np.isfinite(h)&(h>=25)&(h<=250)
    if valid.sum()<10 or valid.mean()<.8: return empty
    hv=h[valid]; mean=float(hv.mean()); maximum=float(hv.max())
    ts=obj.get('timestamp')
    if not isinstance(ts,list) or len(ts)!=len(h): return (mean,maximum,*empty[2:])
    try: t=np.asarray(ts,dtype=float)
    except (TypeError,ValueError): return (mean,maximum,*empty[2:])
    if not np.isfinite(t).all() or (np.diff(t)<=0).any(): return (mean,maximum,*empty[2:])
    dt=np.diff(t); elapsed=t[-1]-t[0]
    # No interpolation across long gaps; both adjacent samples must be valid.
    ok=valid[:-1]&valid[1:]&(dt<=120)
    if ok.sum()<9 or elapsed<60 or dt[ok].sum()/elapsed<.7: return (mean,maximum,*empty[2:])
    x=h[:-1][ok]; w=dt[ok]; mid=(t[:-1]+dt/2)[ok]
    weighted=float(np.average(x,weights=w)); std=float(np.sqrt(np.average((x-weighted)**2,weights=w)))
    order=np.argsort(x); c=np.cumsum(w[order]); q=np.interp([.1*c[-1],.9*c[-1]],c,x[order]); spread=float(q[1]-q[0])
    first=mid<(t[0]+elapsed/2); second=~first
    change=np.nan
    if w[first].sum()>=.2*elapsed and w[second].sum()>=.2*elapsed:
        change=float(np.average(x[second],weights=w[second])-np.average(x[first],weights=w[first]))
    hist=np.bincount(np.rint(x).astype(int)-25,weights=w,minlength=226).astype(np.float32)
    hist/=hist.sum()
    return mean,maximum,std,spread,change,hist


def median3(values):
    v=[x for x in values if np.isfinite(x)]
    return float(np.median(v)) if len(v)>=3 else np.nan


def advanced_features(last10,last30,recent7,recent28):
    maxima=[x['hr_max'] for x in last30 if np.isfinite(x['hr_max'])]
    ref=float(np.percentile(maxima,90)) if len(maxima)>=3 else np.nan
    hr=[x for x in last10 if np.isfinite(x['hr_mean'])]
    timed=[x for x in last10 if x['hr_hist'] is not None]
    def efficiency(xs):
        return median3([60/x['pace']/x['hr_mean'] for x in xs if np.isfinite(x['hr_mean'])])
    e1,e0=efficiency(last10),efficiency(last30[:-10])
    def load(xs):
        # Duration-weighted proxy, not TRIMP or physiological fatigue measurement.
        if not np.isfinite(ref): return np.nan
        if not xs: return 0.
        valid=[x for x in xs if np.isfinite(x['hr_mean'])]
        if len(valid)/len(xs)<.7: return np.nan
        return float(sum(x['duration']*(x['hr_mean']/ref)**2 for x in valid))
    high=np.nan
    if len(timed)>=3 and np.isfinite(ref):
        # Relative to observed historical reference; not medical zones.
        high=float(np.median([x['hr_hist'][max(0,int(np.ceil(.85*ref))-25):].sum() for x in timed]))
    return dict(zip(ADVANCED,[
        median3([x['hr_mean']/ref for x in hr]) if np.isfinite(ref) else np.nan,
        median3([x['hr_std'] for x in timed]), median3([x['hr_spread'] for x in timed]), high,
        median3([x['hr_half_change'] for x in timed]),
        float(e1/e0-1) if np.isfinite(e0) and e0>0 and np.isfinite(e1) else np.nan,
        load(recent7),load(recent28),len(timed)/len(last10),
        sum(np.isfinite(x['hr_mean']) for x in recent28),
    ]))


def make_rows(df,min_history=5):
    out=[]
    for user,group in df.groupby('usuario',sort=False):
        previous=[]; i28=0; i7=0
        for day,daily in group.groupby('fecha',sort=True):
            if len(previous)>=min_history:
                last10=previous[-10:];last30=previous[-30:]
                while i28<len(previous) and previous[i28]['day']<day-timedelta(days=28): i28+=1
                while i7<len(previous) and previous[i7]['day']<day-timedelta(days=7): i7+=1
                recent28=previous[i28:];recent7=previous[i7:]
                pace=float(np.median([x['pace'] for x in last10]))
                hist=dict(history_count=len(previous),hist_pace_median_last10=pace,
                    hist_p75_distance_last30=float(np.percentile([x['dist'] for x in last30],75)),
                    hist_ascent_m_per_km_median_last30=float(np.median([x['climb_density'] for x in last30])),
                    hist_km_last28d=float(sum(x['dist'] for x in recent28)),days_since_last=(day-previous[-1]['day']).days,
                    **heart_features(last10,last30),**advanced_features(last10,last30,recent7,recent28))
                for r in daily.itertuples(index=False):
                    d=float(r.distancia_km);duration=float(r.duracion_min)
                    out.append(dict(usuario=str(user),fecha=day,actividad_id=str(r.actividad_id),distance_km=d,
                        ascent_m_per_km=float(r.desnivel_positivo_m)/d,descent_m_per_km=float(r.desnivel_negativo_m)/d,
                        target_minutes=duration,target_log_pace=float(np.log(duration/d)),baseline_minutes=pace*d,**hist))
            for r in daily.itertuples(index=False):
                d=float(r.distancia_km);duration=float(r.duracion_min)
                previous.append(dict(day=day,dist=d,duration=duration,pace=duration/d,climb_density=float(r.desnivel_positivo_m)/d,
                    **{k:getattr(r,k) for k in SUMMARY}))
    return pd.DataFrame(out)
