import { timingSafeEqual } from 'node:crypto';

export function secureTextEquals(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(actual, 'utf8'), b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
export function parseWebhookEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!['activity','athlete'].includes(value.object_type) ||
      !['create','update','delete'].includes(value.aspect_type)) return null;
  const ownerId = String(value.owner_id ?? '');
  if (!/^\d{1,20}$/.test(ownerId)) return null;
  const objectId = String(value.object_id ?? '');
  if (!/^\d{1,20}$/.test(objectId)) return null;
  return { ownerId, objectId, objectType: value.object_type, aspectType: value.aspect_type,
    subscriptionId: String(value.subscription_id ?? ''), authorized: value.updates?.authorized === 'false' || value.updates?.authorized === false };
}
export function sanitizeHeartSummary(raw) {
  const numberOrNull = value => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 25 && n <= 250 ? Math.round(n) : null;
  };
  const average = numberOrNull(raw?.average_heartrate);
  const max = numberOrNull(raw?.max_heartrate);
  return { hasHeartRate: raw?.has_heartrate === true || average !== null || max !== null,
    averageHeartRate: average, maxHeartRate: max };
}
export function sanitizeHeartSeries(streams, maxPoints=240) {
  const times = streams?.time?.data;
  const heart = streams?.heartrate?.data;
  if (!Array.isArray(times) || !Array.isArray(heart) || !times.length || !heart.length)
    return { available: false, points: [] };
  const points=[];
  for (let i=0;i<Math.min(times.length,heart.length);i++) {
    const sec=Number(times[i]), bpm=Number(heart[i]);
    if(Number.isFinite(sec) && sec>=0 && Number.isFinite(bpm) && bpm>=25 && bpm<=250)
      points.push({ minute: Math.round(sec/6)/10, bpm: Math.round(bpm) });
  }
  if (!points.length) return { available: false, points: [] };
  const step = Math.max(1, Math.ceil(points.length/maxPoints));
  const sampled = points.filter((_, i)=>i%step===0);
  if(sampled[sampled.length-1] !== points[points.length-1] && sampled.length<maxPoints+1)
    sampled.push(points[points.length-1]);
  return { available: true, points: sampled };
}
