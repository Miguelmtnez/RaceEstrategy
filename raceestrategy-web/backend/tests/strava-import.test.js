import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStravaExport } from '../strava-import.js';
import { buildOverview, groupSport } from '../metrics.js';

test('lee exportación oficial con Distance repetida y campos entrecomillados', () => {
  const csv = '\uFEFFActivity ID,Activity Date,Activity Name,Activity Type,Distance,Elapsed Time,Moving Time,Distance,Elevation Gain\r\n'
    + '123,"Apr 3, 2026, 7:15:00 AM","Ruta, parque",Run,15000,4000,3500,,150\r\n'
    + '124,"Apr 1, 2026, 7:15:00 AM","Vuelta en bici",Ride,30000,5000,4600,32000,220\r\n';
  const p = parseStravaExport(csv);
  assert.equal(p.activities.length, 2);
  assert.equal(p.activities[0].name, 'Ruta, parque');
  assert.equal(p.activities[0].distance, 15000);
  assert.equal(p.activities[1].distance, 32000);
  assert.equal(p.activities[0].moving_time, 3500);
  const overview = buildOverview(p.activities, {firstname:'Ana'}, new Date('2026-04-20T12:00:00Z'));
  assert.equal(overview.stats.activities, 2);
  assert.equal(overview.stats.distanceKm, 47);
  assert.equal(overview.stats.elevationM, 370);
});

test('admite días españoles, horas hh:mm:ss y evita duplicados', () => {
  const csv = 'Activity ID,Activity Date,Activity Name,Activity Type,Distance,Moving Time\n'
    + '222,30/10/2026 09:10,Carrera,Carrera,10000,01:00:15\n'
    + '222,30/10/2026 09:10,Duplicada,Carrera,10000,01:00:15\n'
    + 'bad,30/10/2026 09:10,Error,Carrera,10000,20\n';
  const p = parseStravaExport(csv);
  assert.equal(p.activities.length, 1);
  assert.equal(p.skipped, 2);
  assert.equal(p.activities[0].moving_time, 3615);
  assert.equal(groupSport(p.activities[0]), 'Carrera');
});

test('no permite CSV sin columnas identificativas o vacío', () => {
  assert.throws(()=>parseStravaExport('name,date\nA,2026-10-30'), /faltan las columnas/);
  assert.throws(()=>parseStravaExport(''), /vacío/);
  assert.throws(()=>parseStravaExport('Activity ID,Activity Date\n999,"fecha mala"'), /No se encontraron actividades/);
});

test('ordena las actividades recientes por fecha, no por orden de entrada', () => {
  const activities=[
    {id:'1',name:'Antigua',sport_type:'Run',distance:5000,moving_time:1800,total_elevation_gain:10,start_date:'2025-02-01T10:00:00Z'},
    {id:'2',name:'Nueva',sport_type:'Ride',distance:10000,moving_time:3600,total_elevation_gain:20,start_date:'2026-02-01T10:00:00Z'}
  ];
  const o=buildOverview(activities,{});
  assert.equal(o.recent[0].name,'Nueva');
});


test('conserva actividades sin métricas y explica exactamente qué filas omite', () => {
  const csv = 'Activity ID,Activity Date,Activity Name,Activity Type,Distance,Moving Time\n'
    + '101,29/10/2026 11:32,Carrera sin métrica,Run,,\n'
    + '102,30 octubre 2026 08:20,Caminata española,Walk,3000,1000\n'
    + '103,fecha inventada,Fecha mala,Run,5000,1200\n'
    + '101,29/10/2026 11:32,Duplicada,Run,1000,800\n'
    + 'xx,30/10/2026 12:00,ID malo,Run,2000,1000\n';
  const res = parseStravaExport(csv);
  assert.equal(res.sourceRows, 5);
  assert.equal(res.activities.length, 2);
  assert.equal(res.noMetrics, 1);
  assert.equal(res.skipped, 3);
  assert.deepEqual(res.skippedByReason,{invalidId:1,invalidDate:1,duplicateId:1});
  assert.equal(res.activities[0].distance,0);
  assert.ok(res.activities[1].start_date.startsWith('2026-10-30'));
  assert.equal(res.skippedExamples.length,3);
});

test('admite fechas en inglés y formatos ISO, y rechaza fechas imposibles', () => {
  const csv = 'Activity ID,Activity Date,Activity Name,Distance\n'
    + '1001,"Oct 30, 2026, 7:15:00 AM",Ingles,5000\n'
    + '1002,2026-10-30 09:40,ISO,5000\n'
    + '1003,31/02/2026 10:00,Imposible,5000\n';
  const r=parseStravaExport(csv);
  assert.equal(r.activities.length,2);
  assert.equal(r.skippedByReason.invalidDate,1);
});
