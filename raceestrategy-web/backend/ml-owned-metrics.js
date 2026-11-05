// Pure metrics for FIT-owned ML histories; no web framework or external dependencies.
export function validRunningFit(fit) {
  if (fit?.sport_type !== 'Run') throw Object.assign(new Error('Por ahora, el modelo solo acepta actividades FIT de Carrera (running).'), {status:422});
  const distanceKm=fit.distance/1000, durationMinutes=fit.moving_time/60, ascentM=fit.total_elevation_gain;
  const speed=distanceKm/durationMinutes*60;
  if (![distanceKm,durationMinutes,ascentM].every(Number.isFinite) || distanceKm<.5 || distanceKm>400
    || durationMinutes<5 || durationMinutes>1440 || speed<3 || speed>25 || ascentM<0 || ascentM>15000
    || ascentM/distanceKm>350) {
    throw Object.assign(new Error('El FIT no tiene distancia, tiempo o desnivel válidos para el modelo de Carrera.'), {status:422});
  }
  const date=String(fit.date||'').slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) {
    throw Object.assign(new Error('El FIT no tiene una fecha válida.'),{status:422});
  }
  if (!/^fit_[a-f0-9]{24}$/.test(fit.contentId)) throw Object.assign(new Error('Identificador del FIT inválido.'),{status:422});
  return {contentId:fit.contentId,date,sport:'Carrera',distanceKm,durationMinutes,ascentM};
}

export function summarizeOwnedRows(rows) {
  // Una actividad desmarcada se conserva para el usuario pero NUNCA entra en las métricas ni en el modelo.
  // Compatibilidad con los registros anteriores a v1.4, que aún no incluían el campo de selección.
  const all=[...rows];
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
  const dates=new Set(chronological.map(x=>x.activity_date));
  return {
    count:all.length, selectedCount:count, excludedCount:all.length-count,
    totalKm:+totalKm.toFixed(1),medianPaceMinPerKm:median(paces),
    longestKm:count?Math.max(...distances):null,
    firstActivity:chronological[0]?.activity_date??null,
    lastActivity:chronological.at(-1)?.activity_date??null,
    distinctDays:dates.size, modelReady:count>=5 && dates.size>=2,
    provenance:'manual_uploaded_file_no_api',
    description:'Los indicadores utilizan SOLO las carreras seleccionadas. Las excluidas permanecen en el listado, pero no participan en predicciones.'
  };
}
