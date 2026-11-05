// Lectura de originales Garmin FIT (incluidos .fit.gz de la exportación Strava).
// Conservamos solo un resumen, muestras de pulsaciones y un trazado simplificado.
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const MAX_DECOMPRESSED_BYTES = 45 * 1024 * 1024;
export const MAX_FIT_UPLOAD_BYTES = 15 * 1024 * 1024;
export const normalizeFileReference = value => String(value ?? '').trim().replace(/\\/g,'/').replace(/^\/+/, '').toLowerCase();

function sample(items, max) {
  if (items.length <= max) return items;
  const out=[];
  for (let i=0; i<max; i++) out.push(items[Math.round(i*(items.length-1)/(max-1))]);
  return out;
}
function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const v = Number(value);
  return Number.isFinite(v) ? v : null;
}
function heart(value) {
  const v = finite(value);
  return v !== null && v >= 25 && v <= 250 ? Math.round(v) : null;
}
function degrees(value) {
  const v=finite(value);
  if (v===null) return null;
  // FIT registra latitud/longitud en semicirculos; algunas bibliotecas convierten a grados.
  return Math.abs(v)>180 ? v*180/2**31 : v;
}
function dateOf(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === 'string') {
    const d=new Date(value); return Number.isFinite(d.getTime())?d:null;
  }
  const num=finite(value);
  if (num===null) return null;
  // La SDK convierte fechas a Date por defecto. Si no, timestamps FIT comienzan en 1989-12-31 UTC.
  const d=new Date(num>1e12?num:(num+631065600)*1000);
  return Number.isFinite(d.getTime())?d:null;
}
function validRoutePoint(lat,lon) { return lat!==null && lon!==null && lat>=-90 && lat<=90 && lon>=-180 && lon<=180; }
function gpsPath(records) {
  const positions=[];
  for (const record of records) {
    const lat=degrees(record.positionLat ?? record.position_lat);
    const lon=degrees(record.positionLong ?? record.position_long);
    if (validRoutePoint(lat,lon)) {
      if (!positions.length || positions[positions.length-1][0]!==lat || positions[positions.length-1][1]!==lon)
        positions.push([+lat.toFixed(6), +lon.toFixed(6)]);
    }
  }
  return sample(positions, 1800);
}
export function summarizeFitMessages(messages, fileName='Actividad FIT') {
  const records = messages?.recordMesgs || messages?.record || [];
  const sessions = messages?.sessionMesgs || messages?.session || [];
  const items = Array.isArray(records)?records:[];
  const session = Array.isArray(sessions)?sessions[0]||{}:{};
  const recorded = items.map(row=>({
    date: dateOf(row.timestamp), bpm: heart(row.heartRate ?? row.heart_rate)
  }));
  const firstDate = dateOf(session.startTime ?? session.start_time) || recorded.find(x=>x.date)?.date || dateOf(session.timestamp);
  if (!firstDate) throw new Error('El FIT no tiene una fecha de entrenamiento reconocible.');
  const beginning= firstDate.getTime();
  const validHR = recorded.filter(x=>x.date && x.bpm!==null && x.date.getTime()>=beginning && x.date.getTime()-beginning<=7*86400000);
  const hrPoints=sample(validHR.map(x=>({minute:Math.round((x.date.getTime()-beginning)/6000)/10,bpm:x.bpm})),300);
  const sessionAvg=heart(session.avgHeartRate ?? session.avg_heart_rate);
  const sessionMax=heart(session.maxHeartRate ?? session.max_heart_rate);
  const pulseValues=validHR.map(x=>x.bpm);
  const averageHeartRate=sessionAvg ?? (pulseValues.length?Math.round(pulseValues.reduce((a,b)=>a+b,0)/pulseValues.length):null);
  const maxHeartRate=sessionMax ?? (pulseValues.length?pulseValues.reduce((max,bpm)=>Math.max(max,bpm),0):null);
  const distance = finite(session.totalDistance ?? session.total_distance) ?? finite(items.at(-1)?.distance);
  const moving = finite(session.totalTimerTime ?? session.total_timer_time) ?? finite(session.totalElapsedTime ?? session.total_elapsed_time);
  const elevation = finite(session.totalAscent ?? session.total_ascent);
  const sport=String(session.sport||'').toLowerCase();
  const subSport=String(session.subSport ?? session.sub_sport ?? '').toLowerCase();
  const sport_type=sport==='running'?'Run':sport==='cycling'?(subSport.includes('mountain')?'MountainBikeRide':'Ride'):sport==='hiking'?'Hike':sport==='walking'?'Walk':'Workout';
  return {
    name:fileName.replace(/\.(fit|fit\.gz)$/i,'').slice(0,150) || 'Actividad FIT',
    date:firstDate.toISOString(), sport_type,
    distance: distance!==null && distance>=0 && distance<2e6?distance:0,
    moving_time: moving!==null && moving>=0 && moving<604800?moving:0,
    total_elevation_gain: elevation!==null && elevation>=0 && elevation<50000?elevation:0,
    averageHeartRate, maxHeartRate, heartPoints:hrPoints, routePoints:gpsPath(items)
  };
}
export async function decodeFitUpload(buffer, fileName='actividad.fit') {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length>MAX_FIT_UPLOAD_BYTES)
    throw new Error('El archivo FIT debe tener entre 1 byte y 15 MB.');
  let data=buffer;
  if (/\.fit\.gz$/i.test(fileName)) {
    try { data=gunzipSync(buffer,{maxOutputLength:MAX_DECOMPRESSED_BYTES}); }
    catch { throw new Error('No se pudo descomprimir el FIT.GZ o supera el límite permitido.'); }
  }
  const {Decoder,Stream}=await import('@garmin/fitsdk');
  const stream=Stream.fromBuffer(data);
  if(!Decoder.isFIT(stream)) throw new Error('El archivo no tiene una cabecera Garmin FIT válida.');
  const decoder=new Decoder(stream);
  if (!decoder.checkIntegrity()) throw new Error('El archivo FIT está incompleto o tiene errores de integridad.');
  const {messages,errors}=decoder.read({convertDateTimesToDates:true,applyScaleAndOffset:true});
  if (errors?.length) throw new Error('No se pudo decodificar el FIT correctamente.');
  const result=summarizeFitMessages(messages,fileName.split('/').at(-1));
  return {...result, contentId:`fit_${createHash('sha256').update(data).digest('hex').slice(0,24)}`};
}

// API: solo latlng de la propia actividad, sin persistir datos de Strava en la BD.
export function summarizeStravaStreams(streams) {
  const latlng=Array.isArray(streams?.latlng?.data)?streams.latlng.data:[];
  const routePoints=sample(latlng.filter(p=>Array.isArray(p)&&p.length===2)
    .map(p=>[finite(p[0]),finite(p[1])]).filter(p=>validRoutePoint(p[0],p[1])),1800);
  const times=streams?.time?.data, heartrate=streams?.heartrate?.data;
  const heartPoints=[];
  if (Array.isArray(times)&&Array.isArray(heartrate)) {
    for(let i=0;i<Math.min(times.length,heartrate.length);i++) {
      const t=finite(times[i]), bpm=heart(heartrate[i]);
      if(t!==null&&t>=0&&t<=7*86400&&bpm!==null) heartPoints.push({minute:Math.round(t/6)/10,bpm});
    }
  }
  const series=sample(heartPoints,300);
  return {available:routePoints.length>=2,points:routePoints,heartRate:{available:series.length>0,points:series}};
}
