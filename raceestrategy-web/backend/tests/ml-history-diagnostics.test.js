import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOwnedSport} from '../ml-sports.js';
import {analyzeManualHistory} from '../ml-manual-history.js';
import {makeOwnedRating} from '../ml-rating.js';

const entry=(id,sport,km,mins,up=20,date='2026-10-12')=>({activity_id:id,
  name:`Prueba ${id}`,sport_type:sport,start_date:`${date}T12:00:00Z`,
  distance:km*1000,moving_time:mins*60,elevation_gain:up});

test('Reconoce Ciclismo y Senderismo que ya aparecen en Mis actividades',()=>{
  assert.equal(normalizeOwnedSport('Ciclismo'),'Bicicleta');
  assert.equal(normalizeOwnedSport('MountainBikeRide'),'MTB');
  assert.equal(normalizeOwnedSport('Senderismo'),'Senderismo');
});

test('Diagnóstico de fuentes: aceptadas, invalidas y no reconocidas por modalidad',()=>{
  const h=analyzeManualHistory([
    entry(1,'Ciclismo',30,80),entry(2,'Senderismo',8,125),entry(3,'Run',7,39),
    entry(4,'MountainBikeRide',12,70),entry(5,'Ciclismo',0.12,6),entry(6,'Yoga',5,30)
  ]);
  assert.equal(h.report.total,6);
  assert.equal(h.report.unrecognized,1);
  assert.equal(h.report.bySport.Bicicleta.found,2);
  assert.equal(h.report.bySport.Bicicleta.eligible,1);
  assert.equal(h.report.bySport.Bicicleta.invalid,1);
  assert.equal(h.report.bySport.Senderismo.eligible,1);
  assert.equal(h.items.length,4);
  assert.deepEqual(h.items.map(x=>x.sport).sort(),['Bicicleta','Carrera','MTB','Senderismo'].sort());
});

test('La salida manual conserva ID estable y no contiene seleccion de prediccion',()=>{
  const {items}=analyzeManualHistory([entry(123,'Ride',30,88)]);
  assert.equal(items[0].contentId,'archive_strava_123');
  assert.equal(Object.hasOwn(items[0],'selected'),false);
});

test('El rating no oculta un entrenamiento largo pese a un P75 muy pequeño',()=>{
  const rows=Array.from({length:30},(_,i)=>({sport:'Carrera',activity_date:`2026-09-${String(i+1).padStart(2,'0')}`,
    distance_km:i===29?21.28:3.4,duration_minutes:i===29?95.7:20,ascent_m:10}));
  const r=makeOwnedRating(rows,'Carrera');
  assert.equal(r.raw.longestKm,21.28);
  assert.equal(r.raw.sessionsAtLeast20Km,1);
  assert.equal(r.raw.resistanceP75Km,3.4);
  assert.equal(r.attributes.resistencia,0);
});
