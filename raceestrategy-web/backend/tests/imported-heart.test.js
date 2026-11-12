import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHeartXML, compressHeartPoints, compatibleWithActivity } from '../imported-heart-parser.js';
import { parseStravaExport } from '../strava-import.js';

test('extrae FC de TCX con timestamp',()=>{
 const xml=`<TrainingCenterDatabase><Activities><Activity><Lap><Track><Trackpoint><Time>2026-11-10T09:00:00Z</Time><HeartRateBpm><Value>120</Value></HeartRateBpm></Trackpoint><Trackpoint><Time>2026-11-10T09:01:00Z</Time><HeartRateBpm><Value>150</Value></HeartRateBpm></Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
 const r=parseHeartXML(xml,'tcx');assert.equal(r.averageHeartRate,135);assert.equal(r.maxHeartRate,150);assert.equal(r.points.length,2);assert.equal(r.points[1].minute,1);
});
test('extrae FC de GPX con espacio de nombres',()=>{
 const xml=`<gpx><trk><trkseg><trkpt lat="0" lon="0"><time>2026-11-10T09:00:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>142</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt></trkseg></trk></gpx>`;
 const r=parseHeartXML(xml,'gpx');assert.equal(r.averageHeartRate,142);assert.equal(r.points.length,1);
});
test('descarta FC fisiológicamente imposible',()=>{
 const xml='<gpx><trkpt><time>2026-11-10T09:00:00Z</time><hr>500</hr></trkpt></gpx>';
 assert.equal(parseHeartXML(xml,'gpx').averageHeartRate,null);
});
test('no acepta declaraciones de entidades XML',()=>{
 assert.throws(()=>parseHeartXML('<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///tmp/a">]><gpx/>','gpx'),/entidades/);
});
test('resumen 240 puntos máximo',()=>{
 const points=Array.from({length:800},(_,i)=>({minute:i/2,bpm:120+i%20}));
 const out=compressHeartPoints(points);assert.equal(out.length,240);assert.equal(out[0].minute,0);assert.equal(out.at(-1).minute,399.5);
});
test('verifica fecha para no mezclar actividades',()=>{
 const activity={start_date:'2026-11-10T09:00:00.000Z'};
 assert.equal(compatibleWithActivity(activity,{date:'2026-11-10T08:30:00Z'}),true);
 assert.equal(compatibleWithActivity(activity,{date:'2026-11-01T08:30:00Z'}),false);
});
test('CSV conserva pulsaciones medias si existen',()=>{
 const csv='Activity ID,Activity Date,Activity Name,Activity Type,Distance,Moving Time,Average Heart Rate,Max Heart Rate\n12345678,"Nov 10, 2026, 9:00 AM",Bici,Ride,40000,4000,147.5,181';
 const result=parseStravaExport(csv);assert.equal(result.activities[0].average_heartrate,148);assert.equal(result.activities[0].max_heartrate,181);
});
