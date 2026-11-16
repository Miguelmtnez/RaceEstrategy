import tempfile, unittest, json, gzip
from pathlib import Path
from datetime import date, timedelta
import numpy as np
import pandas as pd
from experimento import summarize_hr, enrich, group_split, metrics
from feature_engineering import make_training_rows, HR_FEATURES, FEATURES

class TestHeartExperiment(unittest.TestCase):
    def test_samples(self):
        self.assertEqual(summarize_hr([120]*10+[150]*10),(135,150))
        self.assertTrue(np.isnan(summarize_hr([0]*20)[0]))
        self.assertTrue(np.isnan(summarize_hr([120]*2)[0]))
    def test_join_two_keys(self):
        df=pd.DataFrame({'usuario':['1','2','3'],'actividad_id':['9','9','10']})
        with tempfile.TemporaryDirectory() as folder:
            f=Path(folder)/'raw.gz'
            with gzip.open(f,'wt') as out:
                for u,bpm in [(1,130),(2,150)]:out.write(json.dumps({'userId':u,'id':9,'heart_rate':[bpm]*10})+'\n')
            enriched,stats=enrich(df,f)
        self.assertEqual(stats['valid_hr'],2); self.assertEqual(enriched.hr_mean.iloc[:2].tolist(),[130,150]); self.assertTrue(np.isnan(enriched.hr_mean.iloc[2]))
    def test_no_target_or_same_day_leakage(self):
        start=date(2014,1,1)
        records=[dict(usuario='1',actividad_id=str(i),fecha=start+timedelta(days=min(i,5)),distancia_km=5.,duracion_min=30.,desnivel_positivo_m=20.,desnivel_negativo_m=20.,hr_mean=120. if i<5 else 240.,hr_max=150. if i<5 else 250.) for i in range(7)]
        r=make_training_rows(pd.DataFrame(records)); self.assertEqual(len(r),2)
        self.assertTrue((r[HR_FEATURES[0]]==120).all());self.assertTrue((r[HR_FEATURES[1]]==150).all())
        self.assertTrue((r[HR_FEATURES[3]]==1).all());self.assertTrue(np.allclose(r[HR_FEATURES[2]],10/120))
        records[0]['hr_mean']=np.nan;records[1]['hr_mean']=np.nan;records[2]['hr_mean']=np.nan
        self.assertTrue(make_training_rows(pd.DataFrame(records))[HR_FEATURES].isna().all().all())
    def test_disjoint(self):
        rows=pd.DataFrame({'usuario':[str(i) for i in range(30) for j in range(2)]})
        split=group_split(rows); sets=[set(x.usuario) for x in split.values()]
        self.assertFalse(sets[0]&sets[1] or sets[0]&sets[2] or sets[1]&sets[2]);self.assertEqual(sum(map(len,sets)),30)

if __name__=='__main__':unittest.main()
