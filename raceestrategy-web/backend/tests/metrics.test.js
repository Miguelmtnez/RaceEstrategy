import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOverview, groupSport } from '../metrics.js';

test('clasifica modalidades sin mezclar carrera y bici', () => {
  assert.equal(groupSport({ sport_type: 'TrailRun' }), 'Carrera');
  assert.equal(groupSport({ sport_type: 'MountainBikeRide' }), 'Ciclismo');
  assert.equal(groupSport({ type: 'Hike' }), 'Senderismo');
});

test('suma correctamente distancias, tiempo y desnivel', () => {
  const activities = [
    { id: 1, name: 'Entreno', sport_type: 'Run', distance: 5000, moving_time: 1500, total_elevation_gain: 45, start_date: '2026-10-10T09:00:00Z' },
    { id: 2, name: 'Ruta', sport_type: 'Ride', distance: 20000, moving_time: 3600, total_elevation_gain: 120, start_date: '2026-10-11T09:00:00Z' }
  ];
  const result = buildOverview(activities, { firstname: 'Persona' }, new Date('2026-10-30T12:00:00Z'));
  assert.equal(result.stats.activities, 2);
  assert.equal(result.stats.distanceKm, 25);
  assert.equal(result.stats.elevationM, 165);
  assert.equal(result.bySport.find(s => s.name === 'Carrera').count, 1);
  assert.equal(result.monthly.at(-1).distanceKm, 25);
  assert.equal(result.recent[0].url, 'https://www.strava.com/activities/2');
});
