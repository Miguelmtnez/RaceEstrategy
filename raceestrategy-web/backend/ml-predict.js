// Predicción local en Node.js del bosque exportado por Python.
// NO accede a la API de Strava ni lee SQLite; solo recibe un historial autorizado independiente.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const FEATURES = [
  'distance_km', 'ascent_m_per_km', 'descent_m_per_km',
  'history_count', 'hist_pace_median_last10',
  'hist_p75_distance_last30', 'hist_ascent_m_per_km_median_last30',
  'hist_km_last28d', 'days_since_last',
];
const MODEL_PATH = process.env.ML_MODEL_PATH || resolve('ml-model', 'modelo_carrera.json');
let cachedModel = null;
function loadModel() {
  if (cachedModel) return cachedModel;
  if (!existsSync(MODEL_PATH)) {
    const e = new Error('Aún no hay modelo entrenado: ejecuta el script con FitRec y coloca modelo_carrera.json en backend/ml-model.');
    e.status = 503; throw e;
  }
  let m;
  try { m=JSON.parse(readFileSync(MODEL_PATH,'utf-8')); }
  catch { const e=new Error('El archivo del modelo no es JSON válido.');e.status=503;throw e; }
  if (m.format !== 'raceestrategy-rf-logpace-v1' || m.sport!=='Carrera'
      || JSON.stringify(m.features)!==JSON.stringify(FEATURES) || !Array.isArray(m.trees) || !m.trees.length) {
    const e=new Error('Modelo incompatible con la API de RaceEstrategy.');e.status=503;throw e;
  }
  if (!m.approved_for_beta && process.env.ML_ALLOW_EXPERIMENTAL!=='true') {
    const e=new Error('El modelo no ha superado la comparación con el baseline. No se publican predicciones experimentales sin habilitarlo expresamente en pruebas locales.');
    e.status=503;throw e;
  }
  cachedModel=m;
  return m;
}
function num(v) {
  if (v===null || v===undefined || typeof v==='boolean') return NaN;
  if (typeof v==='number') return Number.isFinite(v)?v:NaN;
  if (typeof v==='string' && v.trim()!=='') return Number(v);
  return NaN;
}
function pct(arr,p) {
  const a=[...arr].sort((x,y)=>x-y);
  const pos=(a.length-1)*(p/100);const lo=Math.floor(pos),hi=Math.ceil(pos);
  if(lo===hi)return a[lo];
  return a[lo]*(hi-pos)+a[hi]*(pos-lo); // Interpolación lineal (como numpy.percentile).
}
function median(arr) { return pct(arr,50); }
function dayIndex(s) {
  if(typeof s!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
  const d=new Date(s+'T00:00:00Z');
  if(!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==s)return null;
  return Math.floor(d.getTime()/86400000);
}
function clientError(message) {const e=new Error(message);e.status=400;throw e;}

export function makeFeatures(history,route) {
  if(!Array.isArray(history) || history.length>10000)clientError('Se necesita un historial válido (máximo 10.000 actividades).');
  if (!route || typeof route!=='object')clientError('Falta la ruta objetivo.');
  const d=num(route.distanceKm),up=num(route.ascentM),down=num(route.descentM);
  const date=route.date ?? new Date().toISOString().slice(0,10);
  const t=dayIndex(date);
  if(t===null || !(d>=0.5 && d<=400) || !(up>=0 && up<=15000) || !(down>=0 && down<=15000)
     || up/d>350 || down/d>350) clientError('Ruta inválida: indica fecha YYYY-MM-DD, distancia y desniveles plausibles.');
  let valid=[];
  for (const r of history) {
    if (!r || typeof r!=='object')continue;
    const rd=dayIndex(r.date);
    const dist=num(r.distanceKm),duration=num(r.durationMinutes),ascent=num(r.ascentM);
    if(rd===null || rd>=t || !Number.isFinite(dist) || !Number.isFinite(duration) || !Number.isFinite(ascent))continue;
    const speed=dist/duration*60;
    if (!(dist>=.5 && dist<=400 && duration>=5 && duration<=1440 && speed>=3 && speed<=25
      && ascent>=0 && ascent<=15000 && ascent/dist<=350)) continue;
    valid.push({day:rd,dist,pace:duration/dist,ascentDensity:ascent/dist});
  }
  valid.sort((a,b)=>a.day-b.day);
  if(valid.length<5)clientError('Necesitamos al menos cinco actividades anteriores de Carrera válidas para estimar el tiempo.');
  const last10=valid.slice(-10), last30=valid.slice(-30);
  const km28=valid.reduce((sum,r)=>sum+(r.day>=t-28 && r.day<t ?r.dist:0),0);
  const feat={
    distance_km:d,
    ascent_m_per_km:up/d,
    descent_m_per_km:down/d,
    history_count:valid.length,
    hist_pace_median_last10:median(last10.map(x=>x.pace)),
    hist_p75_distance_last30:pct(last30.map(x=>x.dist),75),
    hist_ascent_m_per_km_median_last30:median(last30.map(x=>x.ascentDensity)),
    hist_km_last28d:km28,
    days_since_last:t-valid.at(-1).day,
  };
  return {features:FEATURES.map(k=>feat[k]),names:FEATURES,
          baselineMinutes:feat.hist_pace_median_last10*d,historyCount:valid.length};
}
function evalTree(tree,features) {
  let i=0;
  for(let depth=0;depth<1000;depth++) {
    const feature=tree.feature[i];
    if(feature===-2)return tree.value[i];
    if(feature<0 || feature>=features.length)throw new Error('Árbol incompatible');
    i=features[feature]<=tree.threshold[i]?tree.left[i]:tree.right[i];
    if(i<0 || i>=tree.feature.length)throw new Error('Árbol inválido');
  }
  throw new Error('Árbol demasiado profundo');
}
export function predictFromModel(model,prepared) {
  if(model.format!=='raceestrategy-rf-logpace-v1')throw new Error('Formato inválido');
  const logPace=model.trees.reduce((sum,t)=>sum+evalTree(t,prepared.features),0)/model.trees.length;
  const estimatedMinutes=Math.exp(logPace)*prepared.features[0];
  if(!Number.isFinite(estimatedMinutes) || estimatedMinutes<=0)throw new Error('Predicción no finita');
  return {sport:'Carrera',estimatedMinutes:Math.round(estimatedMinutes*10)/10,
          baselineMinutes:Math.round(prepared.baselineMinutes*10)/10,
          historyActivities:prepared.historyCount,modelTestMAEMinutes:model.test_mae_minutes,
          label:'Estimación experimental. No equivale a una evaluación médica ni a una marca garantizada.'};
}
export function predictionForIndependentHistory(payload) {
  // Historial aportado voluntariamente mediante FIT original o ZIP de exportación manual; NUNCA API Strava.
  if(!['independent_garmin_fit','manual_user_file'].includes(payload?.source) || payload?.explicitConsent!==true) {
    clientError('Se admiten únicamente archivos aportados voluntariamente con autorización: FIT del dispositivo o ZIP descargado manualmente. No se admiten datos de API Strava.');
  }
  const prepared=makeFeatures(payload.history,payload.route);
  return predictFromModel(loadModel(),prepared);
}
