// Pure metrics for FIT-owned ML histories; no web framework or external dependencies.
import {normalizeOwnedSport,validOwnedSummary} from './ml-sports.js';
export function validOwnedFit(fit) {
  const sport=normalizeOwnedSport(fit?.sport_type);
  if(!sport) throw Object.assign(new Error('El FIT no corresponde a Carrera, Bicicleta, MTB o Senderismo.'),{status:422});
  const distanceKm=fit.distance/1000, durationMinutes=fit.moving_time/60, ascentM=fit.total_elevation_gain;
  if(!validOwnedSummary(sport,distanceKm,durationMinutes,ascentM))
    throw Object.assign(new Error(`El FIT no tiene distancia, tiempo o desnivel válidos para ${sport}.`),{status:422});
  const date=String(fit.date||'').slice(0,10);
  const parsed=new Date(date+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10)!==date)
    throw Object.assign(new Error('El FIT no tiene una fecha válida.'),{status:422});
  if(!/^fit_[a-f0-9]{24}$/.test(fit.contentId))throw Object.assign(new Error('Identificador del FIT inválido.'),{status:422});
  return {contentId:fit.contentId,date,sport,distanceKm,durationMinutes,ascentM};
}
export function validRunningFit(fit){
  if(normalizeOwnedSport(fit?.sport_type)!=='Carrera')
    throw Object.assign(new Error('Este método solo admite Carrera (running).'),{status:422});
  return validOwnedFit(fit);
}

export function summarizeOwnedRows(rows, sport='Carrera') {
  // Una actividad desmarcada se conserva para el usuario pero NUNCA entra en las métricas ni en el modelo.
  // Compatibilidad con los registros anteriores a v1.4, que aún no incluían el campo de selección.
  const all=[...rows].filter(x=>x.sport===sport || (x.sport===undefined && sport==='Carrera'));
  const selected=all.filter(x=>x.use_for_prediction===undefined || Number(x.use_for_prediction)===1);
  const chronological=selected.sort((a,b)=>a.activity_date.localeCompare(b.activity_date));
  const median=(numbers)=>{
    if(!numbers.length)return null;
    const s=[...numbers].sort((a,b)=>a-b),n=s.length;
    return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;
  };
  const count=chronological.length;
  const distances=chronological.map(x=>x.distance_km);
  const totalKm=distances.reduce((sum,n)=>sum+n,0);
  const paces=chronological.map(x=>x.duration_minutes/x.distance_km);
  const speeds=chronological.map(x=>x.distance_km*60/x.duration_minutes);
  const totalAscentM=chronological.reduce((sum,x)=>sum+x.ascent_m,0);
  const dates=new Set(chronological.map(x=>x.activity_date));
  return {
    sport,count:all.length, selectedCount:count, excludedCount:all.length-count,
    totalKm:+totalKm.toFixed(1),totalAscentM:+totalAscentM.toFixed(0),medianPaceMinPerKm:median(paces),medianSpeedKmH:median(speeds),
    longestKm:count?Math.max(...distances):null,
    firstActivity:chronological[0]?.activity_date??null,
    lastActivity:chronological.at(-1)?.activity_date??null,
    distinctDays:dates.size, modelReady:count>=(sport==='Carrera'?5:3) && dates.size>=2,
    provenance:'manual_uploaded_file_no_api',
    description:'Los indicadores utilizan SOLO las actividades seleccionadas de esta modalidad. Las excluidas permanecen en el listado.'
  };
}
