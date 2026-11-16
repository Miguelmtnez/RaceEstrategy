"""RaceEstrategy: comparación controlada de RF con/sin FC. Solo investigación académica.
No modifica el modelo activo, no usa datos privados de usuarios de la aplicación.
"""
import argparse
import ast
import gzip
import json
from pathlib import Path
from datetime import datetime, timezone
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import GroupShuffleSplit
from feature_engineering import FEATURES, HR_FEATURES, read_and_filter, make_training_rows


def summarize_hr(samples):
    if not isinstance(samples, list) or len(samples) < 10:
        return np.nan, np.nan
    valid = [float(x) for x in samples if isinstance(x, (int, float)) and not isinstance(x, bool) and 25 <= x <= 250]
    if len(valid) < 10 or len(valid) / len(samples) < .8:
        return np.nan, np.nan
    return float(np.mean(valid)), float(max(valid))


def enrich(df, raw):
    targets = set(zip(df.usuario.astype(str), df.actividad_id.astype(str)))
    matches = {}; invalid_lines = 0; conflicting = set()
    opener = gzip.open if str(raw).lower().endswith('.gz') else open
    with opener(raw, 'rt', encoding='utf-8') as f:
        for i, line in enumerate(f, 1):
            if i % 10000 == 0:
                print(f'  FitRec: {i:,} líneas; {len(matches):,} coincidencias', flush=True)
            try:
                try: obj = json.loads(line)
                except json.JSONDecodeError: obj = ast.literal_eval(line)
                key = (str(obj['userId']), str(obj['id']))
            except (ValueError, SyntaxError, KeyError, TypeError, RecursionError):
                invalid_lines += 1; continue
            if key not in targets or key in conflicting: continue
            pair = summarize_hr(obj.get('heart_rate'))
            if key in matches:
                if not np.allclose(pair, matches[key], equal_nan=True):
                    conflicting.add(key); matches.pop(key)
            else: matches[key] = pair
    out = df.copy()
    values = [matches.get((str(u), str(a)), (np.nan, np.nan)) for u, a in zip(df.usuario, df.actividad_id)]
    out[['hr_mean','hr_max']] = np.asarray(values, dtype=float)
    return out, {'matched':len(matches), 'conflicting_ids':len(conflicting), 'invalid_raw_lines':invalid_lines,
                 'valid_hr':int(out.hr_mean.notna().sum()),'users_with_hr':int(out.loc[out.hr_mean.notna(),'usuario'].nunique())}


def group_split(rows):
    # Deportistas totalmente separados. Para cada ejemplo solo se usa su propio pasado.
    if rows.usuario.nunique() < 20: raise ValueError('Menos de 20 usuarios con historial cardíaco; no hay evidencia suficiente.')
    a,b = next(GroupShuffleSplit(n_splits=1, test_size=.30, random_state=42).split(rows, groups=rows.usuario))
    train, rest = rows.iloc[a].copy(), rows.iloc[b].copy()
    c,d = next(GroupShuffleSplit(n_splits=1,test_size=.50,random_state=42).split(rest,groups=rest.usuario))
    return {'train':train,'validation':rest.iloc[c].copy(),'test':rest.iloc[d].copy()}


def metrics(frame, predicted):
    actual=frame.target_minutes.to_numpy(float); err=np.asarray(predicted)-actual
    return {'activities':len(frame),'users':int(frame.usuario.nunique()),'mae_minutes':float(np.abs(err).mean()),
            'rmse_minutes':float(np.sqrt(np.mean(err**2))),'mape_pct':float(np.mean(np.abs(err)/actual)*100),
            'median_ape_pct':float(np.median(np.abs(err)/actual)*100),'bias_minutes':float(err.mean())}


def predict(model, frame, features):
    return np.exp(model.predict(frame[features].to_numpy(float)))*frame.distance_km.to_numpy(float)


def export_model(model, features, path, test_mae, baseline_mae, name):
    trees=[]
    for estimator in model.estimators_:
        t=estimator.tree_
        trees.append({'left':t.children_left.tolist(),'right':t.children_right.tolist(),'feature':t.feature.tolist(),
                      'threshold':t.threshold.tolist(),'value':t.value[:,0,0].tolist()})
    obj={'format':name,'sport':'Carrera','features':features,'min_history_activities':5,
         'trained_at_utc':datetime.now(timezone.utc).isoformat(),'approved_for_beta':False,
         'test_mae_minutes':test_mae,'baseline_test_mae_minutes':baseline_mae,'trees':trees,
         'academic_only':True,'split':'user_disjoint_seed42','min_hr_last10':3,'min_max_hr_last30':3}
    path.write_text(json.dumps(obj,separators=(',',':'),allow_nan=False),encoding='utf-8')


def main():
    p=argparse.ArgumentParser();p.add_argument('--csv',required=True);p.add_argument('--fitrec',required=True)
    p.add_argument('--salida',default='resultados_fc_v2'); args=p.parse_args()
    out=Path(args.salida);out.mkdir(parents=True,exist_ok=True)
    print('1/4 Filtrando Carrera con las reglas originales...',flush=True)
    df,info=read_and_filter(args.csv,'Carrera')
    print('2/4 Recuperando FC original de FitRec...',flush=True)
    df,coverage=enrich(df,args.fitrec)
    print(coverage,flush=True)
    print('3/4 Generando variables estrictamente históricas...',flush=True)
    all_rows=make_training_rows(df)
    eligible=all_rows.dropna(subset=FEATURES+HR_FEATURES).reset_index(drop=True)
    report={'data':info,'heart_rate':coverage,'prediction_rows_total':len(all_rows),'prediction_rows_eligible_hr':len(eligible),
            'eligible_users':int(eligible.usuario.nunique()),'coverage_fraction':len(eligible)/max(1,len(all_rows)),
            'protocol':'70/15/15 aproximado por usuarios disjuntos, solo días anteriores, comparación pareada; parámetros fijos',
            'limitations':['FC media aproximada mediante media de muestras válidas; no ponderada por tiempo.',
                           'Se predice duración de actividad, no marca de competición.',
                           'No se evalúa transferencia a dispositivos modernos ni se autoriza despliegue automático.',
                           'FitRec: uso académico exclusivamente; no redistribuir los datos.']}
    (out/'cobertura.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
    split=group_split(eligible)
    print('4/4 Entrenando dos Random Forest con idénticas filas y parámetros...',flush=True)
    train=split['train']; results={}; models={}
    for name,features in [('sin_fc',FEATURES),('con_fc',FEATURES+HR_FEATURES)]:
        m=RandomForestRegressor(n_estimators=60,max_depth=16,min_samples_leaf=8,max_features=1.0,random_state=42,n_jobs=-1)
        m.fit(train[features].to_numpy(float),train.target_log_pace.to_numpy(float));models[name]=(m,features)
    for label,frame in split.items():
        if label=='train':continue
        results[label]={'ritmo_historico':metrics(frame,frame.baseline_minutes.to_numpy(float))}
        for name,(m,features) in models.items():results[label][name]=metrics(frame,predict(m,frame,features))
        results[label]['delta_mae_fc_minus_no_fc']=results[label]['con_fc']['mae_minutes']-results[label]['sin_fc']['mae_minutes']
    report['results']=results
    report['partitions']={k:{'activities':len(v),'users':int(v.usuario.nunique())} for k,v in split.items()}
    # Validation decides candidate; held-out test is a report, not a tuning signal.
    v=results['validation'];report['candidate_from_validation']='con_fc' if v['con_fc']['mae_minutes']<min(v['sin_fc']['mae_minutes'],v['ritmo_historico']['mae_minutes']) else 'sin_fc'
    report['feature_importance_fc']=dict(zip(FEATURES+HR_FEATURES,map(float,models['con_fc'][0].feature_importances_)))
    for name,(m,features) in models.items():
        export_model(m,features,out/f'modelo_carrera_{name}_experimental.json',results['test'][name]['mae_minutes'],results['test']['ritmo_historico']['mae_minutes'],
                     'raceestrategy-rf-logpace-hr-v2' if name=='con_fc' else 'raceestrategy-rf-logpace-v1')
    (out/'informe_comparacion.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
    print(json.dumps(results,indent=2,ensure_ascii=False));print('Candidato según validación:',report['candidate_from_validation']);print('Informes en',out.resolve())

if __name__=='__main__':main()
