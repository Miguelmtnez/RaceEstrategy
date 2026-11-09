// Importación manual de activities.csv incluido en el ZIP descargado por el usuario.
// No se leen datos de la API de Strava.
import { parseStravaExport } from './strava-import.js';
import {normalizeOwnedSport,validOwnedSummary,OWNED_SPORTS} from './ml-sports.js';
export const isRunningSport = sport => normalizeOwnedSport(sport)==='Carrera';
export function validOwnedActivity(activity) {
  const sport=normalizeOwnedSport(activity.sport_type);
  if(!sport)return null;
  const distanceKm=activity.distance/1000, durationMinutes=activity.moving_time/60, ascentM=activity.total_elevation_gain;
  if(!validOwnedSummary(sport,distanceKm,durationMinutes,ascentM))return null;
  const date=String(activity.start_date??'').slice(0,10),parsed=new Date(date+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)return null;
  return {contentId:`archive_strava_${activity.id}`,date,name:String(activity.name||'Actividad').slice(0,180),
    sport,distanceKm,durationMinutes,ascentM};
}
export function validRunningActivity(activity){return isRunningSport(activity?.sport_type)?validOwnedActivity(activity):null;}
export function parseUserStravaArchiveCsv(text){
  const parsed=parseStravaExport(text),rows=[];
  const bySport=Object.fromEntries(OWNED_SPORTS.map(s=>[s,{found:0,eligible:0,invalid:0}]));
  let ignoredOtherSports=0;
  for(const activity of parsed.activities){
    const sport=normalizeOwnedSport(activity.sport_type);
    if(!sport){ignoredOtherSports++;continue;}
    bySport[sport].found++;
    const valid=validOwnedActivity(activity);
    if(valid){rows.push(valid);bySport[sport].eligible++;}else bySport[sport].invalid++;
  }
  return {rows,stats:{sourceRows:parsed.sourceRows,
    selectedRunning:bySport.Carrera.found,eligibleRunning:bySport.Carrera.eligible,invalidRunning:bySport.Carrera.invalid,
    bySport,eligibleTotal:rows.length,ignoredOtherSports,invalidIdOrDateOrDuplicate:parsed.skipped}};
}
