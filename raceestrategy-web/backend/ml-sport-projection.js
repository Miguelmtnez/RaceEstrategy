// Estimación estadística basada en actividades ANTERIORES del mismo deporte y similar recorrido.
// No es un modelo ML entrenado ni una predicción de marca competitiva.
import { SPORT_LIMITS, validOwnedSummary } from './ml-sports.js';
const number=x=>typeof x==='number'?x:(typeof x==='string'&&x.trim()?Number(x):NaN);
function bad(message){const e=new Error(message);e.status=422;throw e;}
function utcDate(text){
  if(typeof text!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;
  const d=new Date(text+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===text?d.getTime():null;
}
function median(values){const a=[...values].sort((x,y)=>x-y),n=a.length;return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2;}
export function projectComparableSessions(rows,route,sport){
  if(!['Bicicleta','MTB','Senderismo'].includes(sport))bad('Esta referencia histórica solo admite Bicicleta, MTB o Senderismo.');
  const km=number(route?.distanceKm),up=number(route?.ascentM),down=number(route?.descentM),day=utcDate(route?.date);
  const lim=SPORT_LIMITS[sport];
  if(day===null||!Number.isFinite(km)||km<lim.minKm||km>lim.maxKm||![up,down].every(x=>Number.isFinite(x)&&x>=0&&x<=15000)||up/km>lim.maxAscPerKm||down/km>lim.maxAscPerKm)
    bad(`Indica fecha, distancia (${lim.minKm}–${lim.maxKm} km) y desniveles válidos para ${sport}.`);
  const available=(Array.isArray(rows)?rows:[]).filter(r=>Number(r.use_for_prediction)===1 && r.sport===sport)
    .map(r=>({day:utcDate(r.activity_date),km:number(r.distance_km),minutes:number(r.duration_minutes),up:number(r.ascent_m)}))
    .filter(r=>r.day!==null&&r.day<day&&validOwnedSummary(sport,r.km,r.minutes,r.up));
  // Evitar extrapolaciones absurdas (p. ej. MTB de 10 km a una ruta de 100 km).
  const comparable=available.filter(r=>km/r.km>=0.5&&km/r.km<=2)
    .map(r=>({...r,score:Math.abs(Math.log(km/r.km))*2+Math.abs(up/km-r.up/r.km)/30}))
    .sort((a,b)=>a.score-b.score);
  if(comparable.length<3 || new Set(comparable.map(x=>x.day)).size<2)
    bad(`Necesitas al menos 3 ${sport==='Senderismo'?'caminatas':'salidas'} anteriores comparables, de al menos 2 días distintos, para calcular esta referencia histórica. No tenemos un modelo ML entrenado de ${sport}.`);
  const picked=comparable.slice(0,Math.min(10,comparable.length));
  // Duración escalada por distancia, sin suponer capacidad competitiva ni corrección científica por desnivel.
  const estimatedMinutes=median(picked.map(r=>r.minutes*km/r.km));
  const ascentRange=[Math.min(...picked.map(r=>r.up/r.km)),Math.max(...picked.map(r=>r.up/r.km))];
  const warnings=['Referencia descriptiva basada en sesiones anteriores del mismo deporte; NO es un modelo ML entrenado ni predice una marca de competición.','El terreno, las paradas, la meteorología y el esfuerzo pueden cambiar mucho el tiempo.'];
  if(up/km<ascentRange[0]||up/km>ascentRange[1])warnings.push('La densidad de ascenso objetivo está fuera de la observada en las sesiones utilizadas: la estimación podría ser poco fiable.');
  if(picked.length<5)warnings.push('Pocas actividades comparables: estimación especialmente incierta.');
  return {sport,mode:'rodaje',projectionKind:'similar_activities_statistical',label:'Referencia histórica por actividades comparables',
    estimatedMinutes:Math.round(estimatedMinutes*10)/10,baselineMinutes:null,modelTestMAEMinutes:null,
    historyActivities:picked.length,comparedActivities:comparable.length,caveat:warnings.join(' ')};
}
