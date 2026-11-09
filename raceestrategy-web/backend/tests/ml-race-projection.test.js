import test from 'node:test';
import assert from 'node:assert/strict';
import { historicalCompetitionProjection } from '../ml-race-projection.js';
const reference={content_id:'archive_strava_1',activity_name:'Media Maratón Murcia',activity_date:'2026-02-01',
  distance_km:21.28,duration_minutes:95.7,ascent_m:27,activity_type:'competicion',type_source:'manual',use_for_prediction:1};
const route={date:'2026-11-07',distanceKm:20,ascentM:0,descentM:0};
test('20km projection respects a confirmed 21.28km race',()=>{
  const p=historicalCompetitionProjection([reference],route);
  assert.equal(p.mode,'competicion');
  assert.equal(p.projectionKind,'historical_riegel_unvalidated');
  assert.ok(p.estimatedMinutes>88&&p.estimatedMinutes<92);
  assert.equal(p.reference.date,'2026-02-01');
  assert.equal(p.modelTestMAEMinutes,null);
});
test('manual confirmation and selected status are required',()=>{
  assert.throws(()=>historicalCompetitionProjection([{...reference,type_source:'rule'}],route),/marca al menos una competición/i);
  assert.throws(()=>historicalCompetitionProjection([{...reference,use_for_prediction:0}],route),/marca al menos una competición/i);
});
test('future marks and incomparable races are not used',()=>{
  assert.throws(()=>historicalCompetitionProjection([{...reference,activity_date:'2027-02-01'}],route),/marca al menos una competición/i);
  assert.throws(()=>historicalCompetitionProjection([reference],{...route,distanceKm:2}),/marca al menos una competición/i);
});
test('does not infer current fitness from the old competition',()=>{
  const p=historicalCompetitionProjection([reference],route);
  assert.match(p.caveat,/NO una predicción de tu forma actual/i);
  assert.match(p.caveat,/antigüedad/i);
});
