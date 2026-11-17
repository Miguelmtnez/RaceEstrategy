"""Cierre temporal de FitRec: comparación pareada, sin modificar el predictor web."""
import argparse
from datetime import date
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.pipeline import make_pipeline
import joblib

ROOT = Path(__file__).resolve().parents[2]
# Reutilizamos exactamente la preparación y las métricas del V3 versionado.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'modelo_fc_v3'))
from base_features import FEATURES, HR_FEATURES, read_and_filter
from advanced import ADVANCED, make_rows
from experimento_v3_loader import enrich, metrics, paired

SPECS = {'rf_sin_fc_reentrenado': FEATURES, 'v3': FEATURES + HR_FEATURES + ADVANCED}
NAMES = ['ritmo_historico', 'modelo_actual', *SPECS]
TRAIN_END = date(2015, 1, 1)
TEST_START = date(2015, 7, 1)
RF_PARAMS = dict(n_estimators=60, max_depth=16, min_samples_leaf=8, max_features=1., random_state=42)


def temporal_split(rows, train_end=TRAIN_END, test_start=TEST_START):
    if not train_end < test_start:
        raise ValueError('El inicio de validación debe ser anterior al inicio de test.')
    dates = rows.fecha
    parts = {'train': rows.loc[dates < train_end],
             'validation': rows.loc[(dates >= train_end) & (dates < test_start)],
             'test': rows.loc[dates >= test_start]}
    for name, part in parts.items():
        if part.empty: raise ValueError(f'Partición vacía: {name}. Revisar fechas y cobertura sin mirar errores de test.')
    assert parts['train'].fecha.max() < parts['validation'].fecha.min()
    assert parts['validation'].fecha.max() < parts['test'].fecha.min()
    return parts


def predict_current(frame, model_path, backend):
    """Usa la implementación Node real, incluida su precisión de una décima."""
    model_path = Path(model_path).resolve(); backend = Path(backend).resolve()
    m = json.loads(model_path.read_text(encoding='utf-8'))
    if m.get('features') != FEATURES or m.get('sport') != 'Carrera' or m.get('format') != 'raceestrategy-rf-logpace-v1' or not m.get('trees'):
        raise ValueError('Artefacto actual incompatible con las nueve variables esperadas.')
    x = frame[FEATURES].to_numpy(float)
    proc = subprocess.run(['node', str(Path(__file__).with_name('predict_current.mjs')), str(model_path), str(backend)], input=json.dumps(x.tolist(), allow_nan=False), text=True, encoding='utf-8', capture_output=True, check=True)
    pred = np.asarray(json.loads(proc.stdout), dtype=float)
    if pred.shape != (len(frame),) or not np.isfinite(pred).all(): raise ValueError('Predicciones del modelo actual inválidas.')
    return pred


def fit_models(train, jobs):
    models = {}
    for name, features in SPECS.items():
        print(f'  Entrenando {name}: {len(features)} variables', flush=True)
        model = make_pipeline(SimpleImputer(strategy='median', keep_empty_features=True), RandomForestRegressor(**RF_PARAMS, n_jobs=jobs))
        model.fit(train[features].to_numpy(float), train.target_log_pace.to_numpy(float))
        models[name] = model
    return models


def predict(frame, models, model_path, backend):
    pred = {'ritmo_historico': frame.baseline_minutes.to_numpy(float),
            'modelo_actual': predict_current(frame, model_path, backend)}
    for name, features in SPECS.items():
        pred[name] = np.exp(models[name].predict(frame[features].to_numpy(float))) * frame.distance_km.to_numpy(float)
    # Comparar la resolución que realmente presenta la aplicación (0,1 min).
    return {k: np.floor(v * 10 + .5) / 10 for k, v in pred.items()}


def describe(frame, train_users):
    return dict(activities=len(frame), users=int(frame.usuario.nunique()), first_date=str(frame.fecha.min()), last_date=str(frame.fecha.max()), users_seen_in_train=len(set(frame.usuario) & train_users))


def evaluate(frame, pred):
    return dict(models={k: metrics(frame, v) for k,v in pred.items()},
                v3_vs_rf_sin_fc=paired(frame,pred['v3'],pred['rf_sin_fc_reentrenado']),
                v3_vs_modelo_actual=paired(frame,pred['v3'],pred['modelo_actual']),
                v3_vs_ritmo_historico=paired(frame,pred['v3'],pred['ritmo_historico']))


def segmented(frame, pred, train_users):
    groups = {'distancia_km': pd.cut(frame.distance_km,[0,5,10,21.1,np.inf],labels=['<=5','5-10','10-21.1','>21.1']),
              'ascenso_m_km': pd.cut(frame.ascent_m_per_km,[-1,5,20,np.inf],labels=['<=5','5-20','>20']),
              'descenso_m_km': pd.cut(frame.descent_m_per_km,[-1,5,20,np.inf],labels=['<=5','5-20','>20']),
              'historial': pd.cut(frame.history_count,[0,10,30,np.inf],labels=['5-10','11-30','>30']),
              'cobertura_series_fc': pd.cut(frame.hr_timed_coverage_last10,[-1,.3,.7,1],labels=['<=30%','30-70%','>70%']),
              'usuario_en_train': frame.usuario.isin(train_users).map({True:'si',False:'no'})}
    result = {}
    for kind, labels in groups.items():
        result[kind] = {}
        for label in labels.dropna().unique():
            mask = (labels == label).to_numpy(); part = frame.iloc[np.flatnonzero(mask)]
            # No publicar resultados de grupos pequeños; informar de su tamaño.
            if len(part)<100 or part.usuario.nunique()<10:
                result[kind][str(label)] = dict(activities=len(part),users=int(part.usuario.nunique()),insufficient=True)
                continue
            result[kind][str(label)] = evaluate(part,{k:v[mask] for k,v in pred.items()})
    return result


def markdown(report):
    text=['# Comparación temporal de predictores de carrera','',
          'Corte global: entrenamiento hasta 2014, validación de enero a junio de 2015 y prueba desde julio de 2015 hasta el final de FitRec. Historial estrictamente anterior al día objetivo. Modelos congelados antes de 2015; evaluación secuencial con historial real ya observado.','',
          '**Advertencia:** el artefacto actual tiene procedencia temporal desconocida; su evaluación es descriptiva y podría incluir carreras vistas durante su entrenamiento. La comparación controlada es RF sin FC reentrenado frente a V3. FitRec ya se exploró anteriormente: este cierre es una evaluación retrospectiva, no una confirmación externa independiente.','']
    for name, r in report['results'].items():
        text += [f"## {'Validación' if name=='validation' else 'Prueba temporal'}",'',f"{report['partitions'][name]['activities']:,} actividades; {report['partitions'][name]['users']} deportistas.".replace(',', '.'),'', '| Método | MAE (min) | RMSE (min) | MAPE (%) | Mediana APE (%) | MAE por usuario (min) | Sesgo (min) |','|---|---:|---:|---:|---:|---:|---:|']
        for k,v in r['models'].items():
            label={'ritmo_historico':'Mediana del ritmo reciente','modelo_actual':'Modelo actual (artefacto web)*','rf_sin_fc_reentrenado':'RF sin FC reentrenado','v3':'RF V3 con FC'}[k]
            text.append(f"| {label} | {v['mae_minutes']:.3f} | {v['rmse_minutes']:.3f} | {v['mape_pct']:.3f} | {v['median_ape_pct']:.3f} | {v['macro_user_mae']:.3f} | {v['bias_minutes']:.3f} |")
        d=r['v3_vs_rf_sin_fc']; ci=d.get('ci95_minutes')
        text += ['',f"Diferencia MAE V3 − RF sin FC: {d['delta_mae_minutes']:.4f} min. IC 95 % por bootstrap de deportistas: {('['+', '.join(f'{v:.4f}' for v in ci)+'] min') if ci else 'no calculable'}. Valores negativos favorecen V3.",'']
        if name=='test':
            for kind, groups in report['segments'][name].items():
                text += [f'### Test por {kind} (MAE en minutos)','','| Tramo | n | Usuarios | Ritmo | Actual* | RF sin FC | V3 | Δ V3 − RF sin FC |','|---|---:|---:|---:|---:|---:|---:|---:|']
                for label,g in groups.items():
                    if g.get('insufficient'):
                        text.append(f"| {label} | {g['activities']} | {g['users']} | — | — | — | — | — |")
                    else:
                        m=g['models'];text.append(f"| {label} | {m['v3']['activities']} | {m['v3']['users']} | "+' | '.join(f"{m[k]['mae_minutes']:.3f}" for k in NAMES)+f" | {g['v3_vs_rf_sin_fc']['delta_mae_minutes']:.3f} |")
                text += ['','*Actual: posible solapamiento con entrenamiento original. Subgrupos exploratorios; — indica muestra insuficiente.','']
    text += ['## Limitaciones','']+['- '+s for s in report['limitations']]+['']
    return '\n'.join(text)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--csv',required=True);p.add_argument('--fitrec',required=True);p.add_argument('--salida',required=True)
    p.add_argument('--modelo-actual',default=str(ROOT/'raceestrategy-web/backend/ml-model/modelo_carrera.json'))
    p.add_argument('--backend',default=str(ROOT/'raceestrategy-web/backend/ml-predict.js'))
    p.add_argument('--jobs',type=int,default=-1);p.add_argument('--guardar-modelos-locales',action='store_true')
    args=p.parse_args();out=Path(args.salida);out.mkdir(parents=True,exist_ok=True)
    for file in [args.csv,args.fitrec,args.modelo_actual,args.backend]:
        if not Path(file).is_file():p.error(f'Archivo no encontrado: {file}')
    print('1/5 Filtrando carreras...',flush=True);df,info=read_and_filter(args.csv,'Carrera')
    print('2/5 Recuperando series FC...',flush=True);df,coverage=enrich(df,args.fitrec)
    print('3/5 Generando historial y particiones cronológicas...',flush=True);rows=make_rows(df);del df
    all_parts=temporal_split(rows)
    eligible=rows.dropna(subset=FEATURES+HR_FEATURES).reset_index(drop=True);parts=temporal_split(eligible)
    train=parts['train'];train_users=set(train.usuario)
    print('Particiones:',{k:describe(v,train_users) for k,v in parts.items()},flush=True)
    print('4/5 Entrenando solo con fechas anteriores a 2015...',flush=True);models=fit_models(train,args.jobs)
    report=dict(data=info,heart_rate=coverage,protocol={'train_before':str(TRAIN_END),'test_from':str(TEST_START),'cutoff_rationale':'Cortes por distribución de fechas, sin consultar errores: 2016 solo tiene 17 carreras aptas; se reserva desde julio de 2015.','rolling_history':'solo días estrictamente anteriores al objetivo; modelos congelados','paired_cohort':'mismas filas con al menos 5 actividades previas y FC básica suficiente','rounding_minutes':0.1,'rf_params':RF_PARAMS,'model_current_sha256':hashlib.sha256(Path(args.modelo_actual).read_bytes()).hexdigest(),'backend_sha256':hashlib.sha256(Path(args.backend).read_bytes()).hexdigest(),'versions':{'python':platform.python_version(),'numpy':np.__version__,'pandas':pd.__version__,'sklearn':sklearn.__version__}},partitions={k:{**describe(v,train_users),'all_prediction_rows':len(all_parts[k]),'eligible_fraction':len(v)/len(all_parts[k])} for k,v in parts.items()},results={},segments={},limitations=['El artefacto actual no tiene fechas/IDs de entrenamiento verificables; no se puede excluir solapamiento con el test.','El corte global permite usuarios repetidos en fechas posteriores; mide predicción longitudinal, no exclusivamente generalización a usuarios nuevos.','FitRec fue explorado en V2 y V3; la prueba temporal retrospectiva no es una confirmación externa independiente.','Se evalúan actividades filtradas con historial y FC suficiente; no se garantiza mejora en usuarios sin pulsómetro.','Los filtros de calidad usan la duración real para definir la cohorte retrospectiva; no son un filtro disponible antes de predecir.','Distancia y desniveles de la actividad realizada aproximan la ruta prevista; no se evalúan cambios de recorrido.','Se estima duración de entrenamientos, no marcas de competición; características cardíacas son aproximaciones no clínicas.','Subgrupos exploratorios, sin corrección por comparaciones múltiples. FitRec: uso académico.'])
    print('5/5 Evaluando validación y prueba posterior sin ajustar hiperparámetros...',flush=True)
    for name in ['validation','test']:
        frame=parts[name];pred=predict(frame,models,args.modelo_actual,args.backend)
        report['results'][name]=evaluate(frame,pred);report['segments'][name]=segmented(frame,pred,train_users)
    report['feature_importance_v3']=dict(zip(SPECS['v3'],map(float,models['v3'][-1].feature_importances_)))
    (out/'informe_temporal.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    (out/'comparacion_temporal.md').write_text(markdown(report),encoding='utf-8')
    if args.guardar_modelos_locales:
        for name,model in models.items():joblib.dump({'pipeline':model,'features':SPECS[name]},out/f'{name}.joblib')
    print(json.dumps(report['results'],ensure_ascii=False,indent=2));print('Resultados:',out.resolve())

if __name__=='__main__':main()
