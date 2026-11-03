import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWebhookEvent, sanitizeHeartSummary, sanitizeHeartSeries, secureTextEquals } from '../strava-events.js';
test('heart summary distinguishes missing and present',()=>{
  assert.deepEqual(sanitizeHeartSummary({}),{hasHeartRate:false,averageHeartRate:null,maxHeartRate:null});
  assert.deepEqual(sanitizeHeartSummary({has_heartrate:true,average_heartrate:145.7,max_heartrate:180}),{hasHeartRate:true,averageHeartRate:146,maxHeartRate:180});
});
test('heart series sampled safely',()=>{
  const result=sanitizeHeartSeries({time:{data:[0,60,120,180]},heartrate:{data:[110,130,150,170]}},2);
  assert.equal(result.available,true); assert.ok(result.points.length<=3);
  assert.deepEqual(sanitizeHeartSeries({}),{available:false,points:[]});
});
test('webhook parses and validates',()=>{
  assert.equal(parseWebhookEvent({}),null);
  assert.equal(parseWebhookEvent({object_type:'activity',aspect_type:'create',owner_id:123,object_id:456,subscription_id:7}).ownerId,'123');
  assert.equal(parseWebhookEvent({object_type:'athlete',aspect_type:'update',owner_id:123,object_id:123,updates:{authorized:'false'}}).authorized,true);
  assert.equal(secureTextEquals('hello','hello'),true);
  assert.equal(secureTextEquals('hello','other'),false);
});
