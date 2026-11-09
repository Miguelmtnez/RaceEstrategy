// RaceEstrategy Rating: percentiles ESTADÍSTICOS de FitRec, no predicciones ML.
// Utiliza TODO el historial manual del usuario (Mis actividades + Laboratorio IA), sin filtrar su seleccion de prediccion.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {validOwnedSummary,isOwnedSport} from './ml-sports.js';
const ref=JSON.parse(readFileSync(fileURLToPath(new URL('./ml-rating-reference.json',import.meta.url)),'utf8'));
const weights={resistencia:.30,velocidad:.30,desnivel:.15,constancia:.25};
const round=(x,d=2)=>Math.round(x*10**d)/10**d;
function percentile(values,x){
  if(!values?.length||!Number.isFinite(x))return null;
  let lo=0,hi=values.length;
  while(lo<hi){const m=(lo+hi)>>1;if(values[m]<x)lo=m+1;else hi=m;}const below=lo;
  hi=values.length;
  while(lo<hi){const m=(lo+hi)>>1;if(values[m]<=x)lo=m+1;else hi=m;}const equal=lo-below;
  return Math.round((below+equal/2)/values.length*100);
}
function quantile(numbers,q){if(!numbers.length)return null;const a=[...numbers].sort((x,y)=>x-y),p=(a.length-1)*q,lo=Math.floor(p),hi=Math.ceil(p);return a[lo]+(a[hi]-a[lo])*(p-lo);}
function day(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?Math.floor(d.getTime()/86400000):null;}
export function makeOwnedRating(rows,sport){
  if(!isOwnedSport(sport)){const e=new Error('Modalidad de ficha no válida.');e.status=400;throw e;}
  const data=(Array.isArray(rows)?rows:[]).filter(r=>r.sport===sport)
    .map(r=>({day:day(r.activity_date),km:Number(r.distance_km),mins:Number(r.duration_minutes),up:Number(r.ascent_m)}))
    .filter(r=>r.day!==null&&validOwnedSummary(sport,r.km,r.mins,r.up)).sort((a,b)=>a.day-b.day);
  const n=data.length;
  const raw={resistencia:null,velocidad:null,desnivel:null,constancia:null};
  if(n>=5){raw.resistencia=quantile(data.map(x=>x.km),.75);raw.velocidad=quantile(data.map(x=>x.km*60/x.mins),.5);raw.desnivel=quantile(data.map(x=>x.up*10/x.km),.75);}
  const span=n>0?data.at(-1).day-data[0].day:0;
  let activeWeeks=null,sessions12=null;
  if(span>=83){const last=data.at(-1).day;const recent=data.filter(x=>x.day>=last-83);activeWeeks=new Set(recent.map(x=>Math.floor((last-x.day)/7))).size;sessions12=recent.length;raw.constancia=.7*(activeWeeks/12)+.3*Math.min(sessions12/36,1);}
  const scored={resistencia:null,velocidad:null,desnivel:null,constancia:null};
  if(n>=10&&ref.data[sport])for(const key of Object.keys(scored))if(Number.isFinite(raw[key]))scored[key]=percentile(ref.data[sport][key],raw[key]);
  const keys=Object.keys(scored).filter(k=>scored[k]!==null);
  const canGlobal=n>=10&&scored.resistencia!==null&&scored.velocidad!==null&&keys.length>=3;
  const totalWeight=keys.reduce((s,k)=>s+weights[k],0);
  const global=canGlobal?Math.round(keys.reduce((s,k)=>s+weights[k]*scored[k],0)/totalWeight):null;
  const status=sport==='Senderismo'?'sin_referencia':n<10?'historial_insuficiente':global===null?'incompleto':'disponible';
  return {sport,score:global,attributes:scored,raw:{resistanceP75Km:raw.resistencia===null?null:round(raw.resistencia),
    medianSpeedKmh:raw.velocidad===null?null:round(raw.velocidad),ascentP75Per10Km:raw.desnivel===null?null:round(raw.desnivel),
    regularity:raw.constancia===null?null:round(raw.constancia,3),activeWeeks12:activeWeeks,sessions12,
    longestKm:n?round(Math.max(...data.map(x=>x.km))):null,
    sessionsAtLeast10Km:data.filter(x=>x.km>=10).length,
    sessionsAtLeast20Km:data.filter(x=>x.km>=20).length},
    activities:n,historyDays:span,status,confidence:n<10?'insuficiente':n<30?'limitada':n<100?'media':'alta',
    referenceUsers:ref.data[sport]?Object.fromEntries(Object.entries(ref.data[sport]).map(([k,v])=>[k,v.length])):null,
    methodology:'Percentiles estadísticos frente a perfiles FitRec 2010–2016 de la misma modalidad; NO entrenamiento ML. Constancia en las 12 semanas anteriores al último registro. El desnivel mide exposición a ascenso, no habilidad para subir. El rendimiento no se ajusta por terreno ni esfuerzo.',
    provenance:'historial_manual_completo_sin_filtrar_seleccion',
    strengths:global===null?[]:Object.entries(scored).filter(([,v])=>v!==null).sort((a,b)=>b[1]-a[1]).slice(0,1).map(([k])=>k),
    development:global===null?[]:Object.entries(scored).filter(([,v])=>v!==null).sort((a,b)=>a[1]-b[1]).slice(0,1).map(([k])=>k),
  };
}
