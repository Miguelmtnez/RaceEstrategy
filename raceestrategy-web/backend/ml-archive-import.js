// Importación manual: archivo activities.csv incluido en el ZIP de descarga de cuenta.
// NO se obtiene ningún dato de la API de Strava ni se reutilizan sus tablas de sincronización.
import { parseStravaExport } from './strava-import.js';

const RUNNING_NAMES = new Set([
  'run', 'running', 'trailrun', 'trailrunning', 'virtualrun', 'virtualrunning',
  'treadmill', 'treadmillrun', 'treadmillrunning', 'carrera', 'correr',
  'carrerademontana', 'carrerapormontana', 'carreraencinta', 'carreraeninterior',
  'carreravirtual', 'runningvirtual', 'runningindoors', 'indoorrun',
]);

export function isRunningSport(sport) {
  const key=String(sport??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]/g,'');
  return RUNNING_NAMES.has(key);
}

export function validRunningActivity(activity) {
  const distanceKm=activity.distance/1000;
  const durationMinutes=activity.moving_time/60;
  const ascentM=activity.total_elevation_gain;
  const speed=distanceKm/durationMinutes*60;
  if (![distanceKm,durationMinutes,ascentM].every(Number.isFinite)
      || distanceKm<0.5 || distanceKm>400 || durationMinutes<5 || durationMinutes>1440
      || speed<3 || speed>25 || ascentM<0 || ascentM>15000 || ascentM/distanceKm>350) return null;
  const date=String(activity.start_date??'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date+'T00:00:00Z'))) return null;
  return {
    contentId:`archive_strava_${activity.id}`,
    date, name:String(activity.name||'Carrera').slice(0,180), sport:'Carrera',distanceKm,durationMinutes,ascentM,
  };
}

export function parseUserStravaArchiveCsv(text) {
  const parsed=parseStravaExport(text);
  let selectedRunning=0;
  let invalidRunning=0;
  let ignoredOtherSports=0;
  const rows=[];
  for(const activity of parsed.activities) {
    if (!isRunningSport(activity.sport_type)) {ignoredOtherSports++;continue;}
    selectedRunning++;
    const valid=validRunningActivity(activity);
    if(valid)rows.push(valid);
    else invalidRunning++;
  }
  return {
    rows,
    stats: {
      sourceRows:parsed.sourceRows, selectedRunning, eligibleRunning:rows.length,
      invalidRunning, ignoredOtherSports, invalidIdOrDateOrDuplicate:parsed.skipped,
    },
  };
}
