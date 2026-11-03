import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSportProfile, profileSport, describeConsistency } from '../profile-analytics.js';
import { toActivity } from '../activity-list.js';
const now=new Date('2026-11-02T12:00:00Z');
const rows=[
  ['1','Run','2026-10-30T08:00:00Z',10000,3000,100],
  ['2','Ride','2026-10-15T08:00:00Z',45000,5400,230],
  ['3','MountainBikeRide','2026-10-21T08:00:00Z',22000,5000,380],
  ['4','Run','2026-09-20T08:00:00Z',6000,2040,20],
  ['5','Run','2026-07-15T08:00:00Z',0,0,0],
  ['6','Walk','2026-01-01T08:00:00Z',5000,3600,0],
  ['7','Run','2027-01-01T08:00:00Z',20000,3600,100]
].map(([id,sport_type,start_date,distance,moving_time,total_elevation_gain])=>toActivity({id,name:'Actividad '+id,sport_type,start_date,distance,moving_time,total_elevation_gain},'import'));
test('distingue MTB de bici de carretera y carrera',()=>{
  assert.equal(profileSport(rows[2]),'mtb');
  assert.equal(profileSport(rows[1]),'cycle');
  assert.equal(profileSport({...rows[2],sportType:'E-Mountain Bike Ride'}),'mtb');
  assert.equal(profileSport(rows[0]),'run');
});
test('perfil anual no cuenta datos futuros y conserva métricas desconocidas',()=>{
  const p=buildSportProfile(rows,'all',now);
  assert.equal(p.summary.activities,6);
  assert.equal(p.summary.missingDistance,1);
  assert.equal(p.summary.distanceKm,88);
  assert.equal(p.monthly.length,12);
  assert.equal(p.weekly.length,12);
  assert.equal(p.comparison.last30.activities,3);
  assert.equal(p.comparison.previous30.activities,1);
  assert.equal(p.sportBreakdown.find(s=>s.key==='mtb').activities,1);
});
test('cálculo de ritmo mediano solo sobre actividades válidas',()=>{
  const p=buildSportProfile(rows,'run',now);
  assert.equal(p.summary.activities,3);
  assert.equal(p.insights.medianPaceSecPerKm,320);
  assert.equal(p.insights.paceSamples,2);
  assert.equal(p.insights.longest.distanceKm,10);
});
test('no inventa nivel de rendimiento sin registros y mantiene perfil vacío',()=>{
  assert.equal(describeConsistency([],now).label,'Sin registros recientes');
  const p=buildSportProfile([], 'mtb',now);
  assert.equal(p.summary.activities,0);
  assert.equal(p.insights.medianPaceSecPerKm,null);
  assert.equal(p.comparison.last30.activities,0);
});
