// Diagnostico e importacion controlada de actividades procedentes de un CSV aportado por el usuario.
// Nunca consulta la API de Strava. No modifica datos ni casillas: es una funcion pura.
import {OWNED_SPORTS, normalizeOwnedSport, validOwnedSummary} from './ml-sports.js';
const validDay = text => {
  const d=String(text??'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const parsed=new Date(`${d}T00:00:00Z`);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===d?d:null;
};
export function analyzeManualHistory(rows) {
  const bySport=Object.fromEntries(OWNED_SPORTS.map(s=>[s,{found:0,eligible:0,invalid:0}]));
  const report={total:0,unrecognized:0,bySport};
  const items=[];
  for(const r of Array.isArray(rows)?rows:[]){
    report.total++;
    const sport=normalizeOwnedSport(r?.sport_type);
    if(!sport){report.unrecognized++;continue;}
    const bucket=bySport[sport];bucket.found++;
    const id=String(r?.activity_id??'');
    const date=validDay(r?.start_date);
    const distanceKm=Number(r?.distance)/1000;
    const durationMinutes=Number(r?.moving_time)/60;
    const ascentM=Number(r?.elevation_gain);
    if(!/^\d{1,20}$/.test(id)||!date||!validOwnedSummary(sport,distanceKm,durationMinutes,ascentM)){
      bucket.invalid++;continue;
    }
    bucket.eligible++;
    items.push({contentId:`archive_strava_${id}`,name:String(r.name??'Actividad').slice(0,180),
      sport,date,distanceKm,durationMinutes,ascentM});
  }
  return {items,report};
}
