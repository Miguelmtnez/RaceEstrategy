// Proyección de referencia basada SOLO en marcas de competición confirmadas por el usuario.
// No predice la condición física actual; NO utiliza el modelo de FitRec ni la API de Strava.
const asNumber = x => typeof x === 'number' ? x : (typeof x === 'string' && x.trim() ? Number(x) : NaN);
function invalid(message) { const e=new Error(message);e.status=422;throw e; }
function validDay(s) {
  if(typeof s!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
  const d=new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==s ? null : d.getTime();
}
export function historicalCompetitionProjection(rows, route) {
  const km=asNumber(route?.distanceKm),up=asNumber(route?.ascentM),down=asNumber(route?.descentM);
  const routeDay=validDay(route?.date);
  if(!Number.isFinite(km)||km<0.5||km>42.3||!Number.isFinite(up)||up<0||!Number.isFinite(down)||down<0||routeDay===null)
    invalid('Indica fecha, distancia (0,5–42,3 km) y desniveles válidos.');
  if(!Array.isArray(rows))invalid('Historial de carreras no válido.');
  const refs=rows.filter(r=>r.activity_type==='competicion' && r.type_source==='manual' && Number(r.use_for_prediction)===1)
    .map(r=>({id:r.content_id,name:r.activity_name,date:r.activity_date,day:validDay(r.activity_date),
      distanceKm:asNumber(r.distance_km),durationMinutes:asNumber(r.duration_minutes),ascentM:asNumber(r.ascent_m)}))
    .filter(r=>r.day!==null&&r.day<routeDay&&r.distanceKm>=1&&r.distanceKm<=42.3&&
      r.durationMinutes>0&&r.durationMinutes/r.distanceKm>=2.4&&r.durationMinutes/r.distanceKm<=20&&
      km/r.distanceKm>=0.5 && km/r.distanceKm<=2);
  if(!refs.length)invalid('Para una proyección de competición, marca al menos una competición anterior a la fecha elegida y de distancia comparable (entre la mitad y el doble). Confirma su tipo manualmente e inclúyela para IA.');
  // Se prioriza distancia parecida; la antigüedad rompe empates, sin inventar mejoras recientes.
  refs.sort((a,b)=>Math.abs(Math.log(km/a.distanceKm))-Math.abs(Math.log(km/b.distanceKm)) || b.day-a.day);
  const ref=refs[0];
  const minutes=ref.durationMinutes*Math.pow(km/ref.distanceKm,1.06);
  const ageDays=Math.round((routeDay-ref.day)/86400000);
  const sourceAscent=Number.isFinite(ref.ascentM)?ref.ascentM:null;
  const warnings=['Esto es una PROYECCIÓN de una marca pasada (ecuación de Riegel), NO una predicción de tu forma actual ni una garantía de competición.',
    'No se ajusta por desnivel, terreno, condiciones, entrenamiento reciente ni fatiga.'];
  if(ageDays>90)warnings.push(`La marca de referencia tiene ${ageDays} días de antigüedad; tu rendimiento actual puede ser diferente.`);
  if(sourceAscent!==null&&Math.abs(up-sourceAscent)>100)warnings.push('La ruta objetivo y la competición de referencia pueden tener desniveles distintos.');
  return {mode:'competicion',projectionKind:'historical_riegel_unvalidated',sport:'Carrera',
    estimatedMinutes:Math.round(minutes*10)/10,baselineMinutes:null,modelTestMAEMinutes:null,
    historyActivities:refs.length,reference:{name:ref.name||'Competición',date:ref.date,
      distanceKm:ref.distanceKm,durationMinutes:ref.durationMinutes,ascentM:sourceAscent},
    label:'Proyección histórica basada en una competición confirmada',caveat:warnings.join(' ')};
}
