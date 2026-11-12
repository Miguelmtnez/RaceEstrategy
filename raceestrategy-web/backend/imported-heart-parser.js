// Frecuencia cardíaca obtenida SOLO de archivos que el usuario aporta voluntariamente.
// El servidor no conserva FIT/TCX/GPX, ubicaciones ni GPS: solo FC resumida y 240 puntos.
import { gunzipSync } from 'node:zlib';
import { decodeFitUpload } from './fit-import.js';

const MAX_UNCOMPRESSED = 35 * 1024 * 1024;
const VALID_FORMAT = /\.(fit|tcx|gpx)(\.gz)?$/i;
const bpmOf = value => {
  const x = Number(value);
  return Number.isFinite(x) && x >= 25 && x <= 250 ? Math.round(x) : null;
};

export function compressHeartPoints(points, max=240) {
  if (!points.length) return [];
  const sorted = points.filter(p => Number.isFinite(p.minute) && p.minute >= 0 && p.minute <= 10080 && bpmOf(p.bpm) !== null)
    .map(p=>({minute:Math.round(p.minute*10)/10,bpm:bpmOf(p.bpm)}))
    .sort((a,b)=>a.minute-b.minute);
  if (sorted.length <= max) return sorted;
  return Array.from({length:max},(_,i)=>sorted[Math.round(i*(sorted.length-1)/(max-1))]);
}
function heartReport(samples, startDate=null) {
  if (!samples.length) return {date:startDate,averageHeartRate:null,maxHeartRate:null,points:[]};
  const valid = samples.filter(x => x.time instanceof Date && Number.isFinite(x.time.getTime()) && bpmOf(x.bpm)!==null);
  if (!valid.length) return {date:startDate,averageHeartRate:null,maxHeartRate:null,points:[]};
  valid.sort((a,b)=>a.time-b.time);
  const base = startDate && Number.isFinite(Date.parse(startDate)) ? Date.parse(startDate) : valid[0].time.getTime();
  const normalized = valid.filter(x=>x.time.getTime()>=base-60000 && x.time.getTime()-base<=7*86400000)
    .map(x=>({minute:Math.max(0,(x.time.getTime()-base)/60000),bpm:bpmOf(x.bpm)}));
  const values = normalized.map(x=>x.bpm);
  if(!values.length) return {date:startDate,averageHeartRate:null,maxHeartRate:null,points:[]};
  return {date:startDate||valid[0].time.toISOString(),averageHeartRate:Math.round(values.reduce((a,b)=>a+b,0)/values.length),
    maxHeartRate:values.reduce((a,b)=>Math.max(a,b),0),points:compressHeartPoints(normalized)};
}

// No interpretamos XML genérico con DTD, ni necesitamos leer sus coordenadas.
export function parseHeartXML(text, format) {
  if(typeof text!=='string' || text.length>MAX_UNCOMPRESSED) throw new Error('XML inválido o demasiado grande.');
  if(/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('No se permiten entidades XML.');
  const tag = format==='tcx' ? 'Trackpoint' : 'trkpt';
  const regex = new RegExp(`<(?:(?:[A-Za-z][\\w-]*):)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[A-Za-z][\\w-]*):)?${tag}\\s*>`, 'gi');
  const time = /<(?:\w+:)?Time\b[^>]*>([^<]+)<\/(?:\w+:)?Time>/i;
  const hrTcx = /<(?:\w+:)?HeartRateBpm\b[^>]*>[\s\S]*?<(?:\w+:)?Value\b[^>]*>([^<]+)<\/(?:\w+:)?Value>/i;
  const hrGpx = /<(?:[\w.-]+:)?(?:hr|heartrate)\b[^>]*>([^<]+)<\/(?:[\w.-]+:)?(?:hr|heartrate)>/i;
  const samples = []; let match;
  while((match=regex.exec(text))!==null) {
    if(samples.length>100000) throw new Error('Demasiadas muestras en el XML.');
    const block=match[1];
    const stamp=block.match(time)?.[1];
    const heart=(format==='tcx'?block.match(hrTcx):block.match(hrGpx))?.[1];
    if(!stamp || !heart) continue;
    const date=new Date(stamp);
    if(!Number.isFinite(date.getTime()))continue;
    samples.push({time:date,bpm:heart});
  }
  return heartReport(samples);
}

export async function decodeHeartFile(bytes, filename) {
  if(!Buffer.isBuffer(bytes) || !bytes.length || bytes.length>15*1024*1024) throw new Error('Archivo inválido o mayor de 15 MB.');
  const name=String(filename||'').split(/[\\/]/).at(-1);
  const extension=name?.match(VALID_FORMAT)?.[1]?.toLowerCase();
  if(!extension)throw new Error('El formato debe ser FIT, TCX o GPX (opcionalmente .gz).');
  if(extension==='fit') {
    const parsed=await decodeFitUpload(bytes,name);
    return {date:parsed.date,averageHeartRate:parsed.averageHeartRate,maxHeartRate:parsed.maxHeartRate,
      points:compressHeartPoints(parsed.heartPoints||[]),format:'fit'};
  }
  const data=name.toLowerCase().endsWith('.gz') ? gunzipSync(bytes,{maxOutputLength:MAX_UNCOMPRESSED}) : bytes;
  if(data.length>MAX_UNCOMPRESSED)throw new Error('El archivo descomprimido supera el límite permitido.');
  const parsed=parseHeartXML(data.toString('utf8'),extension);
  return {...parsed,format:extension};
}

export function compatibleWithActivity(activity, report) {
  // Asociación por ID de activities.csv + comprobación adicional de fecha.
  const actual=Date.parse(activity?.start_date);
  const fromFile=Date.parse(report?.date);
  return Number.isFinite(actual) && Number.isFinite(fromFile) && Math.abs(actual-fromFile)<=36*3600*1000;
}
