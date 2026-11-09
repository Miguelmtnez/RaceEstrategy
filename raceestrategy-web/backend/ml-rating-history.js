// Construye una fuente única para la ficha FIFA con TODO el historial aportado manualmente.
// NO lee la API de Strava ni utiliza use_for_prediction; esa bandera es exclusiva del Laboratorio IA.
import {normalizeOwnedSport} from './ml-sports.js';

const finite = n => Number.isFinite(Number(n)) ? Number(n) : NaN;
const sameWorkout = (a,b) => a.sport===b.sport && a.activity_date===b.activity_date &&
  Number.isFinite(a.distance_km) && Number.isFinite(b.distance_km) &&
  Number.isFinite(a.duration_minutes) && Number.isFinite(b.duration_minutes) &&
  Math.abs(a.distance_km-b.distance_km) <= 0.01 &&
  Math.abs(a.duration_minutes-b.duration_minutes) <= 0.05;

export function mergeManualRatingHistory(ownedRows, importedRows) {
  const imported=(Array.isArray(importedRows)?importedRows:[]).map(r=>({
    content_id:`archive_strava_${String(r.activity_id??'')}`,
    sport:normalizeOwnedSport(r.sport_type),
    activity_date:String(r.start_date??'').slice(0,10),
    distance_km:finite(r.distance)/1000,
    duration_minutes:finite(r.moving_time)/60,
    ascent_m:finite(r.elevation_gain),
    origin:'mis_actividades_importadas'
  })).filter(r=>r.sport && /^\d{4}-\d{2}-\d{2}$/.test(r.activity_date));
  // Los archivos del Laboratorio IA tienen identificadores archive_strava_<id>, por lo que
  // se fusionan con su equivalente de Mis actividades sin duplicarse.
  const byId=new Map(imported.map(r=>[r.content_id,r]));
  for(const r of Array.isArray(ownedRows)?ownedRows:[]){
    if(!r?.content_id) continue;
    byId.set(String(r.content_id),{...r,origin:'laboratorio_ia_manual'});
  }
  const output=[];
  const buckets=new Map();
  for(const row of byId.values()){
    // Un FIT y una exportacion pueden describir la misma carrera con ids distintos.
    // Solo deduplicamos coincidencias muy cercanas en fecha, modalidad, distancia y duracion.
    const key=`${row.sport}|${row.activity_date}`;
    const known=buckets.get(key)||[];
    if(known.some(prev=>String(prev.content_id||'').startsWith('fit_')!==String(row.content_id||'').startsWith('fit_')&&sameWorkout(prev,row)))continue;
    known.push(row);buckets.set(key,known);output.push(row);
  }
  return output;
}
