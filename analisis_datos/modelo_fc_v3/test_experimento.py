import unittest, tempfile, json
from pathlib import Path
from datetime import date,timedelta
import numpy as np
import pandas as pd
from advanced import summarize,make_rows,ADVANCED
from base_features import make_training_rows,FEATURES,HR_FEATURES
from experimento import enrich,split_users,paired

class Tests(unittest.TestCase):
    def test_series(self):
        s=summarize({'heart_rate':[120]*10+[150]*10,'timestamp':list(range(0,200,10))})
        self.assertEqual(s[:2],(135,150));self.assertGreater(s[2],0);self.assertGreater(s[4],20);self.assertAlmostEqual(float(s[5].sum()),1.)
        self.assertIsNone(summarize({'heart_rate':[140]*20,'timestamp':[1]*20})[5]);self.assertEqual(summarize({'heart_rate':[140]*20})[0],140)
    def test_gaps(self):
        s=summarize({'heart_rate':[120]*20,'timestamp':list(range(0,100,10))+list(range(1000,1100,10))});self.assertIsNone(s[5])
    def test_history(self):
        start=date(2014,1,1);records=[]
        for i in range(18):
            d=start+timedelta(days=min(i,16)); h=120 if i<16 else 240
            s=summarize({'heart_rate':[h]*20,'timestamp':list(range(0,200,10))})
            from advanced import SUMMARY
            records.append(dict(usuario='1',actividad_id=str(i),fecha=d,distancia_km=5.,duracion_min=30.,desnivel_positivo_m=20.,desnivel_negativo_m=20.,**dict(zip(SUMMARY,s))))
        df=pd.DataFrame(records);r=make_rows(df);v2=make_training_rows(df)
        np.testing.assert_allclose(r[FEATURES+HR_FEATURES],v2[FEATURES+HR_FEATURES],equal_nan=True)
        last=r[r.fecha==start+timedelta(days=16)];self.assertEqual(len(last),2);self.assertTrue((last.hist_hr_mean_median_last10==120).all());self.assertTrue((last.hr_relative_mean_last10==1).all())
        self.assertTrue((last.hr_load_7d==210).all());self.assertTrue((last.hr_high_fraction_last10==1).all())
        self.assertTrue((last.hr_efficiency_change_10_vs_previous20==0).all())
    def test_join(self):
        df=pd.DataFrame({'usuario':['1','2'],'actividad_id':['9','9']})
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'data.json';p.write_text(json.dumps({'userId':1,'id':9,'heart_rate':[130]*20,'timestamp':list(range(0,200,10))})+'\n');r,s=enrich(df,p)
        self.assertEqual(s['valid_timed_hr'],1);self.assertTrue(np.isnan(r.hr_mean.iloc[1]))
    def test_split_and_bootstrap(self):
        f=pd.DataFrame({'usuario':[str(i) for i in range(30) for j in range(2)],'target_minutes':[10.]*60});s=split_users(f);u=[set(x.usuario) for x in s.values()];self.assertFalse(u[0]&u[1] or u[0]&u[2] or u[1]&u[2]);b=paired(f,np.full(60,11.),np.full(60,12.));self.assertEqual(b['ci95_minutes'],[-1.,-1.])

if __name__=='__main__':unittest.main()
