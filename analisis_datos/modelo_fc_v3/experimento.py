"""V3 academic experiment; no production changes or redistribution of data."""
import argparse, ast, gzip, json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import GroupShuffleSplit
from sklearn.impute import SimpleImputer
from sklearn.pipeline import make_pipeline
from base_features import FEATURES, HR_FEATURES, read_and_filter
from advanced import ADVANCED, SUMMARY, summarize, make_rows


def enrich(df,raw):
    targets=set(zip(df.usuario.astype(str),df.actividad_id.astype(str))); matches={}; conflicts=set(); invalid=0
    opener=gzip.open if str(raw).lower().endswith('.gz') else open
    with opener(raw,'rt',encoding='utf-8') as f:
        for i,line in enumerate(f,1):
            if i%10000==0: print(f'  FitRec: {i:,} líneas, {len(matches):,} coincidencias',flush=True)
            try:
                try: obj=json.loads(line)
                except json.JSONDecodeError: obj=ast.literal_eval(line)
                key=(str(obj['userId']),str(obj['id']))
            except (ValueError,SyntaxError,KeyError,TypeError,RecursionError): invalid+=1;continue
            if key not in targets or key in conflicts:continue
            summary=summarize(obj)
            if key in matches:
                # Match V2 duplicate handling for mean/max; discard conflicting temporal details.
                old=matches[key]
                if not np.allclose(summary[:2],old[:2],equal_nan=True):
                    conflicts.add(key);matches.pop(key)
                elif not np.allclose(summary[2:5],old[2:5],equal_nan=True) or not (summary[5] is None and old[5] is None or summary[5] is not None and old[5] is not None and np.allclose(summary[5],old[5])):
                    matches[key]=(*old[:2],np.nan,np.nan,np.nan,None)
            else:matches[key]=summary
    out=df.copy(); empty=(np.nan,np.nan,np.nan,np.nan,np.nan,None)
    values=[matches.get((str(u),str(a)),empty) for u,a in zip(df.usuario,df.actividad_id)]
    for j,col in enumerate(SUMMARY):out[col]=[v[j] for v in values]
    return out,dict(matched=len(matches),conflicting_ids=len(conflicts),invalid_raw_lines=invalid,valid_hr=int(out.hr_mean.notna().sum()),valid_timed_hr=int(out.hr_hist.notna().sum()),users_with_hr=int(out.loc[out.hr_mean.notna(),'usuario'].nunique()))


def split_users(rows):
    if rows.usuario.nunique()<20:raise ValueError('Menos de 20 usuarios elegibles.')
    a,b=next(GroupShuffleSplit(n_splits=1,test_size=.30,random_state=42).split(rows,groups=rows.usuario))
    train,rest=rows.iloc[a],rows.iloc[b]
    c,d=next(GroupShuffleSplit(n_splits=1,test_size=.50,random_state=42).split(rest,groups=rest.usuario))
    return {'train':train,'validation':rest.iloc[c],'test':rest.iloc[d]}


def metrics(frame,pred):
    actual=frame.target_minutes.to_numpy(float);err=np.asarray(pred)-actual;abs_err=np.abs(err)
    return dict(activities=len(frame),users=int(frame.usuario.nunique()),mae_minutes=float(abs_err.mean()),rmse_minutes=float(np.sqrt(np.mean(err**2))),mape_pct=float(np.mean(abs_err/actual)*100),median_ape_pct=float(np.median(abs_err/actual)*100),bias_minutes=float(err.mean()),macro_user_mae=float(pd.Series(abs_err).groupby(frame.usuario.to_numpy()).mean().mean()))


def paired(frame,new,old,seed=42,n_boot=2000):
    actual=frame.target_minutes.to_numpy(float)
    delta=np.abs(new-actual)-np.abs(old-actual)
    grouped=pd.DataFrame({'user':frame.usuario.to_numpy(),'delta':delta}).groupby('user').delta.agg(['sum','count'])
    sums=grouped['sum'].to_numpy(); counts=grouped['count'].to_numpy(); rng=np.random.default_rng(seed)
    if len(sums)<2:return {'delta_mae_minutes':float(delta.mean()),'ci95_minutes':None}
    idx=rng.integers(0,len(sums),size=(n_boot,len(sums))); vals=sums[idx].sum(axis=1)/counts[idx].sum(axis=1)
    return dict(delta_mae_minutes=float(delta.mean()),ci95_minutes=np.quantile(vals,[.025,.975]).tolist(),delta_macro_user_mae=float(np.mean(sums/counts)),bootstrap_users=len(sums))


def segments(frame,pred):
    groups={'distance':pd.cut(frame.distance_km,[0,5,10,21.1,np.inf],labels=['<=5','5-10','10-21.1','>21.1']),
            'history':pd.cut(frame.history_count,[0,10,30,np.inf],labels=['5-10','11-30','>30']),
            'ascent_m_per_km':pd.cut(frame.ascent_m_per_km,[-1,5,20,np.inf],labels=['<=5','5-20','>20']),
            'timed_hr':pd.cut(frame.hr_timed_coverage_last10,[-1,.3,.7,1],labels=['<=30%','30-70%','>70%'])}
    result={}
    for kind,g in groups.items():
        result[kind]={}
        for label in g.cat.categories:
            mask=(g==label).to_numpy(); part=frame.iloc[np.flatnonzero(mask)]
            if len(part)<100 or part.usuario.nunique()<10:continue
            result[kind][str(label)]={**{k:metrics(part,v[mask]) for k,v in pred.items()},'v3_vs_v2':paired(part,pred['v3'][mask],pred['v2'][mask])}
    return result


def main():
    p=argparse.ArgumentParser();p.add_argument('--csv',required=True);p.add_argument('--fitrec',required=True);p.add_argument('--salida',default='resultados_fc_v3');p.add_argument('--evaluar-test',action='store_true',help='Test V2 ya consultado: evaluación exploratoria, no confirmatoria');p.add_argument('--jobs',type=int,default=-1);args=p.parse_args()
    out=Path(args.salida);out.mkdir(parents=True,exist_ok=True)
    if not Path(args.fitrec).is_file():p.error(f'FitRec no encontrado: {args.fitrec}')
    print('1/4 Filtrando Carrera...',flush=True);df,info=read_and_filter(args.csv,'Carrera')
    print('2/4 Extrayendo características de series FC...',flush=True);df,coverage=enrich(df,args.fitrec);print(coverage,flush=True)
    print('3/4 Generando historial sin fuga temporal...',flush=True); rows=make_rows(df);del df
    eligible=rows.dropna(subset=FEATURES+HR_FEATURES).reset_index(drop=True)
    split=split_users(eligible);train=split['train']; models={}
    specs={'sin_fc':FEATURES,'v2':FEATURES+HR_FEATURES,'v3':FEATURES+HR_FEATURES+ADVANCED}
    print('4/4 Entrenando tres modelos con parámetros idénticos...',flush=True)
    for name,features in specs.items():
        print(f'  Entrenando {name}: {len(features)} variables',flush=True)
        rf=RandomForestRegressor(n_estimators=60,max_depth=16,min_samples_leaf=8,max_features=1.,random_state=42,n_jobs=args.jobs)
        # Keep identical RF parameters; fill advanced missing values using TRAIN only; no missing V2 fields in eligible.
        model=make_pipeline(SimpleImputer(strategy='median',keep_empty_features=True),rf)
        model.fit(train[features].to_numpy(float),train.target_log_pace.to_numpy(float));models[name]=model
    report=dict(data=info,heart_rate=coverage,prediction_rows_total=len(rows),prediction_rows_eligible_hr=len(eligible),eligible_users=int(eligible.usuario.nunique()),coverage_fraction=len(eligible)/max(1,len(rows)),partitions={k:dict(activities=len(v),users=int(v.usuario.nunique())) for k,v in split.items()},advanced_missing_fraction={k:float(eligible[k].isna().mean()) for k in ADVANCED},results={},segments={},feature_importance_v3=dict(zip(specs['v3'],map(float,models['v3'][-1].feature_importances_))),protocol='Mismas filas elegibles y partición por usuarios seed42 que V2; historial solo de días anteriores; imputación mediana de train; bootstrap pareado por usuario; selección en validation.',limitations=['El test de V2 ya se consultó; una evaluación allí es exploratoria, no confirmación independiente.','FC relativa usa percentil 90 de máximos observados, no FC máxima fisiológica.','Cambio de FC entre mitades no demuestra deriva a esfuerzo constante. Carga es proxy, no TRIMP.','Sin velocidad instantánea ni corrección por pendiente en eficiencia; el objetivo es duración de entrenamientos, no competición.','No validado con Strava ni para usuarios sin FC; mantener predictor existente. FitRec solo académico.'])
    for label in ['validation']+(['test'] if args.evaluar_test else []):
        frame=split[label];pred={'ritmo_historico':frame.baseline_minutes.to_numpy(float)}
        for name,features in specs.items():pred[name]=np.exp(models[name].predict(frame[features].to_numpy(float)))*frame.distance_km.to_numpy(float)
        report['results'][label]={**{k:metrics(frame,v) for k,v in pred.items()},'v3_vs_v2':paired(frame,pred['v3'],pred['v2']),'v3_vs_sin_fc':paired(frame,pred['v3'],pred['sin_fc'])}
        report['segments'][label]=segments(frame,pred)
    val=report['results']['validation']; report['candidate_from_validation']=min(['ritmo_historico','sin_fc','v2','v3'],key=lambda k:val[k]['mae_minutes'])
    report['test_status']='exploratorio_reutilizado' if args.evaluar_test else 'no_evaluado'
    (out/'informe_comparacion.json').write_text(json.dumps(report,indent=2,ensure_ascii=False,allow_nan=False),encoding='utf-8')
    print(json.dumps(report['results'],indent=2,ensure_ascii=False));print('Candidato según validación:',report['candidate_from_validation']);print('Informe:',out.resolve()/'informe_comparacion.json')

if __name__=='__main__':main()
