import test from 'node:test';
import assert from 'node:assert/strict';
import { listActivities, toActivity } from '../activity-list.js';
const sample = [
  { id:'111',name:'Carrera matutina',sport_type:'Run',start_date:'2026-10-30T09:00:00Z',distance:10000,moving_time:3000,total_elevation_gain:120 },
  { id:'222',name:'Salida en bici',sport_type:'Ride',start_date:'2026-09-20T09:00:00Z',distance:20000,moving_time:3600,total_elevation_gain:400 },
  { id:'333',name:'Paseo sin datos',sport_type:'Walk',start_date:'2026-01-15T09:00:00Z',distance:0,moving_time:0,total_elevation_gain:0 }
].map(a=>toActivity(a,'import'));
test('normaliza unidades y conserva métricas desconocidas',()=>{
  assert.equal(sample[0].distanceKm,10);
  assert.equal(sample[0].paceSecPerKm,300);
  assert.equal(sample[1].speedKmH,20);
  assert.equal(sample[2].distanceKm,null);
  assert.equal(sample[2].movingSeconds,null);
});
test('filtra por deporte, nombre y rango de fechas',()=>{
  assert.equal(listActivities(sample,{sport:'running'}).total,1);
  assert.equal(listActivities(sample,{q:'salida'}).items[0].id,'222');
  assert.equal(listActivities(sample,{from:'2026-10-01'}).total,1);
  assert.equal(listActivities(sample,{to:'2026-02-01'}).total,1);
});
test('ordena, pagina y calcula agregados del conjunto filtrado',()=>{
  const d=listActivities(sample,{sort:'distance',pageSize:10});
  assert.deepEqual(d.items.map(a=>a.id),['222','111','333']);
  assert.equal(d.totals.distanceKm,30);
  assert.equal(listActivities(sample,{page:99}).page,1);
  assert.equal(listActivities(sample,{q:'imposible'}).total,0);
});
