import unittest
from datetime import date,timedelta
from pathlib import Path
import json, subprocess
import numpy as np
import pandas as pd
from experimento import temporal_split, fit_models, predict, SPECS, ROOT
from advanced import SUMMARY, summarize, make_rows
from base_features import FEATURES


def example():
    records=[]
    for u in range(12):
        for y, month in [(2014,1),(2015,1),(2015,7),(2016,1)]:
            for i in range(18):
                d=date(y,month,1)+timedelta(days=i//2)
                distance=5.+i%4; duration=distance*(5.+u/10+i/50)
                h=125+u+i
                s=summarize({'heart_rate':[h]*10+[h+10]*10,'timestamp':list(range(0,200,10))})
                records.append(dict(usuario=str(u),actividad_id=f'{u}-{y}-{month}-{i:02}',fecha=d,distancia_km=distance,duracion_min=duration,desnivel_positivo_m=20.+i,desnivel_negativo_m=20.+i,**dict(zip(SUMMARY,s))))
    return pd.DataFrame(records)

class TemporalTests(unittest.TestCase):
    def test_global_dates(self):
        rows=make_rows(example());parts=temporal_split(rows)
        self.assertEqual(set(parts['train'].fecha.map(lambda d:d.year)),{2014})
        self.assertEqual(set(parts['validation'].fecha.map(lambda d:d.year)),{2015})
        self.assertEqual(set(parts['test'].fecha.map(lambda d:(d.year,d.month))),{(2015,7),(2016,1)})
        self.assertEqual(len(set(parts['test'].usuario)),12)
    def test_no_future_or_same_day(self):
        df=example(); rows=make_rows(df);day=date(2015,1,4)
        changed=df.copy();mask=changed.fecha>=day
        changed.loc[mask,'duracion_min']*=2;changed.loc[mask,'hr_mean']=240;changed.loc[mask,'hr_max']=245
        after=make_rows(changed);a=rows[rows.fecha==day];b=after[after.fecha==day]
        np.testing.assert_allclose(a[SPECS['v3']],b[SPECS['v3']],equal_nan=True)
        self.assertTrue((a.history_count==24).all())
    def test_train_only_imputation(self):
        rows=make_rows(example()).dropna(subset=SPECS['rf_sin_fc_reentrenado']);p=temporal_split(rows)
        models=fit_models(p['train'],1)
        expected=np.nanmedian(p['train'][SPECS['v3']].to_numpy(float),axis=0)
        expected=np.nan_to_num(expected,nan=0.)
        np.testing.assert_allclose(models['v3'][0].statistics_,expected)
    def test_actual_feature_parity(self):
        df=example();one=df[df.usuario=='0'];r=one[one.fecha==date(2015,1,4)].iloc[0]
        h=[dict(date=str(x.fecha),distanceKm=x.distancia_km,durationMinutes=x.duracion_min,ascentM=x.desnivel_positivo_m) for x in one.itertuples()]
        route=dict(date=str(r.fecha),distanceKm=r.distancia_km,ascentM=r.desnivel_positivo_m,descentM=r.desnivel_negativo_m)
        backend=ROOT/'raceestrategy-web/backend/ml-predict.js'
        js="import {makeFeatures} from "+json.dumps(backend.resolve().as_uri())+"; const p=JSON.parse(process.argv[1]); console.log(JSON.stringify(makeFeatures(p.h,p.route).features));"
        result=subprocess.check_output(['node','--input-type=module','-e',js,json.dumps(dict(h=h,route=route))],text=True)
        rows=make_rows(one);expected=rows[rows.actividad_id==r.actividad_id][FEATURES].iloc[0]
        np.testing.assert_allclose(json.loads(result),expected)
    def test_paired_predictions(self):
        rows=make_rows(example());parts=temporal_split(rows);models=fit_models(parts['train'],1);frame=parts['test']
        pred=predict(frame,models,ROOT/'raceestrategy-web/backend/ml-model/modelo_carrera.json',ROOT/'raceestrategy-web/backend/ml-predict.js')
        self.assertEqual(len(pred),4);self.assertTrue(all(len(v)==len(frame) and np.isfinite(v).all() for v in pred.values()))

if __name__=='__main__':unittest.main()
