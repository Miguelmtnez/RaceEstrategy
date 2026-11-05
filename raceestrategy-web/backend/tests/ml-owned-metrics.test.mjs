import test from 'node:test';
import assert from 'node:assert/strict';
import { validRunningFit, summarizeOwnedRows } from '../ml-owned-metrics.js';

function fit(overrides={}) {return {
  sport_type:'Run', distance:12000,moving_time:3600,total_elevation_gain:120,
  date:'2026-10-01T08:20:00.000Z',contentId:'fit_0123456789abcdef01234567',...overrides
};}
test('valid running FIT keeps units, date and provenance identifier',()=>{
  const x=validRunningFit(fit());assert.equal(x.distanceKm,12);assert.equal(x.durationMinutes,60);
  assert.equal(x.ascentM,120);assert.equal(x.date,'2026-10-01');
});
test('non-running FIT is not silently treated as running',()=>{
  assert.throws(()=>validRunningFit(fit({sport_type:'Ride'})),/solo acepta/);
});
test('implausible distance and speed are rejected',()=>{
  assert.throws(()=>validRunningFit(fit({distance:500,moving_time:3600})),/no tiene distancia/);
});
test('empty profile is non-ready and does not invent ratings',()=>{
  const x=summarizeOwnedRows([]);assert.equal(x.count,0);assert.equal(x.medianPaceMinPerKm,null);
  assert.equal(x.modelReady,false);assert.equal(x.lastActivity,null);
});
test('summary is correctly ordered by date',()=>{
  const days=['2026-10-03','2026-10-01','2026-10-02','2026-10-04','2026-10-05'];
  const rows=days.map(activity_date=>({activity_date,distance_km:10,duration_minutes:50,ascent_m:40}));
  const x=summarizeOwnedRows(rows);
  assert.equal(x.count,5);assert.equal(x.totalKm,50);assert.equal(x.firstActivity,'2026-10-01');
  assert.equal(x.lastActivity,'2026-10-05');assert.equal(x.medianPaceMinPerKm,5);
  assert.equal(x.modelReady,true);
});
test('five records on one date cannot establish longitudinal profile',()=>{
  const rows=Array.from({length:5},(_,i)=>({activity_date:'2026-10-01',distance_km:5+i,duration_minutes:35,ascent_m:20}));
  assert.equal(summarizeOwnedRows(rows).modelReady,false);
});
