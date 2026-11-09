import test from 'node:test';
import assert from 'node:assert/strict';
import { isRunningSport,parseUserStravaArchiveCsv } from '../ml-archive-import.js';

const csv=`Activity ID,Activity Date,Activity Name,Activity Type,Distance,Moving Time,Elevation Gain
1001,"Oct 20, 2026, 7:30:00 AM",Rodaje,Run,8200,2620,85
1002,"Oct 22, 2026, 8:00:00 AM",Bicicleta,Ride,35400,6100,330
1003,"Oct 24, 2026, 9:00:00 AM",Montaña,MountainBikeRide,25400,7500,660
1004,"Oct 28, 2026, 6:30:00 PM",Trail,TrailRun,6100,1980,41
1005,"Oct 29, 2026, 5:30:00 PM",Carrera sin tiempo,Run,8000,,10
1006,"Oct 30, 2026, 3:00:00 PM",Paseo,Walk,4300,2500,40`;

test('only running variants are accepted',()=>{
  for(const sport of ['Run','TrailRun','VirtualRun','Treadmill','Carrera','Carrera por montaña','Trail Running'])
    assert.equal(isRunningSport(sport),true,sport);
  for(const sport of ['Ride','MountainBikeRide','Walk','Hike','Workout','Swimming',''])
    assert.equal(isRunningSport(sport),false,sport);
});
test('archive parser includes MTB, cycling and hiking, and flags missing running duration',()=>{
  const x=parseUserStravaArchiveCsv(csv);
  assert.equal(x.stats.sourceRows,6);
  assert.equal(x.stats.selectedRunning,3);
  assert.equal(x.stats.eligibleRunning,2);
  assert.equal(x.stats.invalidRunning,1);
  assert.equal(x.stats.ignoredOtherSports,0);
  assert.equal(x.stats.bySport.Bicicleta.eligible,1);
  assert.equal(x.stats.bySport.MTB.eligible,1);
  assert.equal(x.stats.bySport.Senderismo.eligible,1);
  assert.equal(x.rows[0].contentId,'archive_strava_1001');
  assert.equal(x.rows[0].date,'2026-10-20');
  assert.equal(x.rows[0].distanceKm,8.2);
  assert.equal(x.rows[0].durationMinutes,2620/60);
  assert.equal(x.rows.find(x=>x.sport==='Carrera' && x.contentId==='archive_strava_1004').date,'2026-10-28');
});
test('invalid csv is reported instead of inventing running activities',()=>{
  assert.throws(()=>parseUserStravaArchiveCsv('a,b\n1,2'),/activities.csv|Activity ID|Activity Date/);
});
test('CSV counts repeated identifiers as skipped',()=>{
  const x=parseUserStravaArchiveCsv(csv+'\n1001,"Oct 20, 2026, 7:30:00 AM",Rodaje,Run,8200,2620,85');
  assert.equal(x.stats.invalidIdOrDateOrDuplicate,1);
  assert.equal(x.rows.length,5);
});
