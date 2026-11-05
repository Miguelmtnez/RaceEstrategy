import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUserStravaArchiveCsv} from '../ml-archive-import.js';
import {summarizeOwnedRows} from '../ml-owned-metrics.js';
import {makeFeatures} from '../ml-predict.js';

const csv=`Activity ID,Activity Date,Activity Name,Activity Type,Distance,Moving Time,Elevation Gain
101,"Oct 10, 2026, 7:00:00 AM",Calentamiento,Run,1500,720,12
102,"Oct 11, 2026, 7:00:00 AM",Rodaje largo,Run,12500,4050,170
103,"Oct 12, 2026, 7:00:00 AM",Montana MTB,MountainBikeRide,22000,4000,500`;
test('El archivo ZIP / CSV conserva nombres para escoger entrenamientos',()=>{
  const r=parseUserStravaArchiveCsv(csv);
  assert.equal(r.stats.selectedRunning,2);
  assert.equal(r.rows[0].name,'Calentamiento');
  assert.equal(r.rows[1].name,'Rodaje largo');
  assert.equal(r.rows[0].distanceKm,1.5);
});
const history=Array.from({length:8},(_,i)=>({
  activity_date:`2026-10-${String(i+1).padStart(2,'0')}`,
  distance_km: i===0?1:8+i*0.4,
  duration_minutes: i===0?18:45+i*3,
  ascent_m: i===0?10:70+i*3,
  use_for_prediction: i===0?0:1,
}));
test('Una carrera excluida no altera los indicadores deportivos',()=>{
  const a=summarizeOwnedRows(history);
  assert.equal(a.count,8);
  assert.equal(a.selectedCount,7);
  assert.equal(a.excludedCount,1);
  assert.equal(a.longestKm,10.8);
  assert.ok(a.modelReady);
  const all=summarizeOwnedRows(history.map(x=>({...x,use_for_prediction:1})));
  assert.notEqual(a.medianPaceMinPerKm,all.medianPaceMinPerKm);
});
test('Los historiales antiguos sin bandera de selección se mantienen activos',()=>{
  const r=summarizeOwnedRows(history.map(({use_for_prediction,...other})=>other));
  assert.equal(r.selectedCount,8);
  assert.equal(r.excludedCount,0);
});
test('El modelo no se entrena de nuevo: sus features cambian al excluir calentamientos',()=>{
  const mapped=history.map(x=>({date:x.activity_date,distanceKm:x.distance_km,durationMinutes:x.duration_minutes,ascentM:x.ascent_m}));
  const route={date:'2026-11-04',distanceKm:10,ascentM:100,descentM:100};
  const all=makeFeatures(mapped,route);
  const chosen=makeFeatures(mapped.filter((_,i)=>i!==0),route);
  assert.equal(all.historyCount,8);assert.equal(chosen.historyCount,7);
  assert.notDeepEqual(all.features,chosen.features);
});
test('Sin cinco carreras elegidas no se puede predecir',()=>{
  const mapped=history.slice(2,6).map(x=>({date:x.activity_date,distanceKm:x.distance_km,durationMinutes:x.duration_minutes,ascentM:x.ascent_m}));
  assert.throws(()=>makeFeatures(mapped,{date:'2026-11-04',distanceKm:10,ascentM:100,descentM:100}),/cinco actividades/);
});
