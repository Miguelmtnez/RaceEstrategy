import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUserStravaArchiveCsv} from '../ml-archive-import.js';
import {normalizeOwnedSport,validOwnedSummary} from '../ml-sports.js';
import {projectComparableSessions} from '../ml-sport-projection.js';
import {makeOwnedRating} from '../ml-rating.js';
import {mergeManualRatingHistory} from '../ml-rating-history.js';
import {summarizeOwnedRows, validOwnedFit} from '../ml-owned-metrics.js';
const csv=`Activity ID,Activity Date,Activity Name,Activity Type,Distance,Moving Time,Elevation Gain
101,"Oct 10, 2026, 7:00:00 AM",Carrera de prueba,Run,5000,1800,30
102,"Oct 11, 2026, 7:00:00 AM",Salida en bicicleta,Ride,26000,4200,340
103,"Oct 12, 2026, 7:00:00 AM",Montana MTB,MountainBikeRide,18000,5100,500
104,"Oct 13, 2026, 7:00:00 AM",Sendero junto al rio,Hike,10500,11200,410
105,"Oct 14, 2026, 7:00:00 AM",Bicicleta electrica,EBikeRide,20500,3600,100
106,"Oct 15, 2026, 7:00:00 AM",Caminata,Walk,4800,4500,140`;
test('ZIP con varios deportes: clasifica, excluye e-bike y no confunde MTB con carretera',()=>{
 const out=parseUserStravaArchiveCsv(csv);
 assert.deepEqual(out.rows.map(x=>x.sport),['Carrera','Bicicleta','MTB','Senderismo','Senderismo']);
 assert.deepEqual(out.stats.bySport.Bicicleta,{found:1,eligible:1,invalid:0});
 assert.equal(out.stats.ignoredOtherSports,1);
 assert.equal(out.stats.selectedRunning,1);
});
test('reconocimiento de alias de deportes sin inferencia por velocidad',()=>{
 assert.equal(normalizeOwnedSport('Mountain Bike'),'MTB');
 assert.equal(normalizeOwnedSport('Senderismo'),'Senderismo');
 assert.equal(normalizeOwnedSport('Ride'),'Bicicleta');
 assert.equal(normalizeOwnedSport('VirtualRide'),null);
 assert.equal(validOwnedSummary('Senderismo',7,120,300),true);
 assert.equal(validOwnedSummary('Senderismo',7,7,300),false);
});
const rideRows=Array.from({length:12},(_,i)=>({sport:'Bicicleta',activity_date:`2026-10-${String(i+1).padStart(2,'0')}`,
 distance_km:20+i*.8,duration_minutes:60+i*3,ascent_m:150+i*10,use_for_prediction:1}));
const mtbRows=Array.from({length:12},(_,i)=>({...rideRows[i],sport:'MTB',distance_km:13,duration_minutes:74,ascent_m:390}));
test('estima bici solo con bici y no con MTB',()=>{
 const route={date:'2026-11-07',distanceKm:25,ascentM:300,descentM:300};
 const a=projectComparableSessions([...mtbRows,...rideRows],route,'Bicicleta');
 const b=projectComparableSessions(rideRows,route,'Bicicleta');
 assert.deepEqual(a,b);
 assert.equal(a.sport,'Bicicleta');assert.equal(a.projectionKind,'similar_activities_statistical');
});
test('si no hay actividades suficientes del deporte objetivo informa y no inventa',()=>{
 assert.throws(()=>projectComparableSessions(rideRows,{date:'2026-11-07',distanceKm:10,ascentM:150,descentM:90},'Senderismo'),/Necesitas al menos 3/);
});
test('hiking FIT es válido; la función específica de running conserva su contrato',()=>{
 const sample={sport_type:'Hike',distance:5000,moving_time:5000,total_elevation_gain:200,date:'2026-11-05',contentId:'fit_'+'a'.repeat(24)};
 assert.equal(validOwnedFit(sample).sport,'Senderismo');
});
test('el perfil de Bicicleta no cuenta las sesiones de Carrera',()=>{
 const runs=rideRows.map(x=>({...x,sport:'Carrera',distance_km:6,duration_minutes:45}));
 const all=summarizeOwnedRows([...rideRows,...runs],'Bicicleta');
 assert.equal(all.count,12);assert.equal(all.totalKm,rideRows.reduce((a,x)=>a+x.distance_km,0).toFixed(1)*1);
});
test('rating por modalidad usa cohortes y no promedia las cuatro actividades de deportes distintos',()=>{
 const valid=Array.from({length:15},(_,i)=>({sport:'Bicicleta',use_for_prediction:1,activity_date:`2026-09-${String(i+1).padStart(2,'0')}`,
 distance_km:50+i*.2,duration_minutes:155+i*.5,ascent_m:240+i*5}));
 valid.push({...valid[0],activity_date:'2026-11-01'});
 const rating=makeOwnedRating(valid,'Bicicleta');
 assert.equal(rating.activities,16);
 assert.equal(rating.referenceUsers.resistencia,622);
 assert.ok(rating.score!==null&&rating.score>=0&&rating.score<=100);
 assert.equal(makeOwnedRating(valid,'Carrera').score,null);
});
test('sin fuente de referencia para Senderismo no fabrica una nota 0-100',()=>{
 const rows=Array.from({length:30},(_,i)=>({sport:'Senderismo',use_for_prediction:1,activity_date:`2026-06-${String(i+1).padStart(2,'0')}`,
 distance_km:8,duration_minutes:135,ascent_m:200}));
 const rating=makeOwnedRating(rows,'Senderismo');
 assert.equal(rating.status,'sin_referencia');assert.equal(rating.score,null);
 assert.ok(rating.raw.medianSpeedKmh>0);
});

test('ficha FIFA ignora el filtro de IA: excluir ejercicios no cambia las notas',()=>{
 const all=Array.from({length:16},(_,i)=>({sport:'Carrera',use_for_prediction:i%3===0?0:1,
 activity_date:`2026-10-${String(i+1).padStart(2,'0')}`,distance_km:9+i*.2,duration_minutes:46+i*.4,ascent_m:70+i}));
 const a=makeOwnedRating(all,'Carrera');
 const b=makeOwnedRating(all.map(r=>({...r,use_for_prediction:1})),'Carrera');
 assert.equal(a.activities,16);assert.equal(a.score,b.score);assert.deepEqual(a.attributes,b.attributes);
});
test('ficha combina el historial manual de Mis actividades y el Laboratorio IA sin duplicados',()=>{
 const general=Array.from({length:12},(_,i)=>({activity_id:String(1000+i),sport_type:'Run',start_date:`2026-10-${String(i+1).padStart(2,'0')}T07:00:00Z`,
 distance:8000+i*100,moving_time:2600+i*40,elevation_gain:25}));
 const owned=[{content_id:'archive_strava_1000',sport:'Carrera',activity_date:'2026-10-01',distance_km:8,duration_minutes:2600/60,ascent_m:25,use_for_prediction:0},
 {content_id:'fit_'+'a'.repeat(24),sport:'Carrera',activity_date:'2026-10-20',distance_km:15,duration_minutes:75,ascent_m:60,use_for_prediction:0}];
 const merged=mergeManualRatingHistory(owned,general);
 assert.equal(merged.length,13);
 const result=makeOwnedRating(merged,'Carrera');
 assert.equal(result.activities,13);
 assert.equal(result.provenance,'historial_manual_completo_sin_filtrar_seleccion');
});
