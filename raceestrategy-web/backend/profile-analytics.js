// Fase 3 — estadísticas descriptivas del perfil deportivo.
// Trabaja solo con actividades del usuario autenticado ya normalizadas por toActivity.
// No usa IA ni genera una evaluación clínica o una clasificación de rendimiento.
export const SPORT_OPTIONS = [
  { key: 'all', label: 'Todos los deportes' },
  { key: 'run', label: 'Carrera' },
  { key: 'cycle', label: 'Bicicleta' },
  { key: 'mtb', label: 'MTB' },
  { key: 'hike', label: 'Senderismo' },
  { key: 'other', label: 'Otros' }
];

export function profileSport(item) {
  const s = String(item.sportType || item.sport_type || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
  if (/mountainbike|emtb|mtb/.test(s)) return 'mtb';
  if (/run|carrera|jog|trot/.test(s)) return 'run';
  if (/ride|bike|cycling|ciclismo|bicicleta|gravel|velomobile|handcycle/.test(s)) return 'cycle';
  if (/walk|hike|sender|caminata|paseo/.test(s)) return 'hike';
  return 'other';
}

const round = (n, places=1) => Number(n.toFixed(places));
const safeDate = item => {
  const d = new Date(item.date || '');
  return Number.isFinite(d.getTime()) ? d : null;
};
const dateKey = d => d.toISOString().slice(0, 10);
const monthKey = d => d.toISOString().slice(0, 7);
const mondayUTC = d => {
  const midnight = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
  midnight.setUTCDate(midnight.getUTCDate() - ((midnight.getUTCDay()+6)%7));
  return midnight;
};
const median = nums => {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a,b)=>a-b);
  const center = Math.floor(sorted.length/2);
  return sorted.length%2 ? sorted[center] : (sorted[center-1]+sorted[center])/2;
};

function aggregates(items) {
  const withDistance = items.filter(a=>a.distanceKm !== null && Number.isFinite(a.distanceKm) && a.distanceKm>0);
  const withTime = items.filter(a=>a.movingSeconds !== null && Number.isFinite(a.movingSeconds) && a.movingSeconds>0);
  const withElevation = items.filter(a=>a.elevationM !== null && Number.isFinite(a.elevationM) && a.elevationM>0);
  const duration = withTime.reduce((total,a)=>total+a.movingSeconds,0);
  const distance = withDistance.reduce((total,a)=>total+a.distanceKm,0);
  const elev = withElevation.reduce((total,a)=>total+a.elevationM,0);
  return {
    activities:items.length, distanceKm:round(distance,1), movingHours:round(duration/3600,1), elevationM:round(elev,0),
    withDistance:withDistance.length, withTime:withTime.length,
    missingDistance:items.length-withDistance.length, missingTime:items.length-withTime.length
  };
}

function countDistinctWeeks(items) {
  return new Set(items.map(a=>safeDate(a)).filter(Boolean).map(d=>dateKey(mondayUTC(d)))).size;
}

// «Constancia» se determina por actividad reciente registrada, NO por capacidad atlética.
export function describeConsistency(items, now = new Date()) {
  const from = now.getTime()-90*86400000;
  const recent = items.filter(a=>{const t=safeDate(a)?.getTime();return t!==undefined && t>=from && t<=now.getTime()});
  const weeks=countDistinctWeeks(recent);
  let label = 'Sin registros recientes';
  if (recent.length>=18 && weeks>=9) label='Muy constante';
  else if (recent.length>=8 && weeks>=5) label='Regular';
  else if (recent.length>=4 && weeks>=3) label='En desarrollo';
  else if (recent.length>0) label='Pocos registros';
  return { label, activities90d:recent.length, weeks90d:weeks,
    description:'Indicador descriptivo de frecuencia registrada en 90 días. No mide nivel físico ni rendimiento.' };
}

export function buildSportProfile(activities, sport = 'all', now = new Date()) {
  const validSport = SPORT_OPTIONS.some(s=>s.key===sport) ? sport : 'all';
  const nowDate = new Date(now);
  if (!Number.isFinite(nowDate.getTime())) throw new Error('Fecha de referencia no válida');
  const dated = activities.filter(a=>safeDate(a) && safeDate(a).getTime()<=nowDate.getTime());
  const selected = dated.filter(a=>validSport==='all' || profileSport(a)===validSport);
  const summary=aggregates(selected);
  const sportBreakdown=SPORT_OPTIONS.filter(s=>s.key!=='all').map(s=>({key:s.key,name:s.label,...aggregates(dated.filter(a=>profileSport(a)===s.key))}));
  const startMonth = new Date(Date.UTC(nowDate.getUTCFullYear(),nowDate.getUTCMonth()-11,1));
  const monthly = Array.from({length:12},(_,i)=>{
    const d=new Date(Date.UTC(startMonth.getUTCFullYear(),startMonth.getUTCMonth()+i,1));
    const x=aggregates(selected.filter(a=>monthKey(safeDate(a))===monthKey(d)));
    return {key:monthKey(d), label:new Intl.DateTimeFormat('es-ES',{month:'short',timeZone:'UTC'}).format(d).replace('.',''),...x};
  });
  const firstWeek=mondayUTC(nowDate);
  firstWeek.setUTCDate(firstWeek.getUTCDate()-11*7);
  const weekly=Array.from({length:12},(_,i)=>{
    const start=new Date(firstWeek);start.setUTCDate(start.getUTCDate()+i*7);
    const end=new Date(start);end.setUTCDate(start.getUTCDate()+7);
    const x=aggregates(selected.filter(a=>{const t=safeDate(a).getTime();return t>=start.getTime()&&t<end.getTime()}));
    return {key:dateKey(start),label:new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short',timeZone:'UTC'}).format(start),...x};
  });
  const t=nowDate.getTime();
  const previous=selected.filter(a=>{const d=safeDate(a).getTime();return d>=t-60*86400000&&d<t-30*86400000});
  const current=selected.filter(a=>{const d=safeDate(a).getTime();return d>=t-30*86400000&&d<=t});
  const longest=selected.filter(a=>a.distanceKm !== null && a.distanceKm>0).sort((a,b)=>b.distanceKm-a.distanceKm)[0] || null;
  const paced=selected.map(a=>{
    const sportType=profileSport(a);
    const km=a.distanceKm,secs=a.movingSeconds;
    if (km===null || secs===null || km<=0 || secs<=0) return null;
    if (sportType==='run' && km>=2) {const pace=secs/km;return pace>=150&&pace<=1200?{kind:'pace',value:pace}:null;}
    if ((sportType==='cycle'||sportType==='mtb') && km>=3) {const speed=km*3600/secs;return speed>=3&&speed<=100?{kind:'speed',value:speed}:null;}
    return null;
  }).filter(Boolean);
  const paces=paced.filter(p=>p.kind==='pace').map(p=>p.value);
  const speeds=paced.filter(p=>p.kind==='speed').map(p=>p.value);
  const dates=dated.map(a=>safeDate(a)).filter(Boolean).sort((a,b)=>a-b);
  return {
    sport:validSport, summary, sportBreakdown, monthly, weekly,
    comparison:{last30:aggregates(current),previous30:aggregates(previous)},
    consistency:describeConsistency(selected, nowDate),
    insights:{longest:longest?{id:longest.id,name:longest.name,date:longest.date,distanceKm:longest.distanceKm}:null,
      medianPaceSecPerKm:paces.length?Math.round(median(paces)):null,
      medianSpeedKmH:speeds.length?round(median(speeds),1):null,
      paceSamples:paces.length,speedSamples:speeds.length},
    coverage:{first:dates.length?dates[0].toISOString():null,last:dates.length?dates[dates.length-1].toISOString():null}
  };
}
