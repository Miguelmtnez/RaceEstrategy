import { BlobReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js';
import { api } from './api';

// Los originales FIT/TCX/GPX se transmiten individualmente, con consentimiento,
// SOLO para extraer las pulsaciones. No enviamos el ZIP completo ni guardamos GPS.
const ALLOWED = /\.(?:fit|tcx|gpx)(?:\.gz)?$/i;
const MAX_PER_FILE = 15 * 1024 * 1024;

function parseCSV(csv: string): string[][] {
  const out:string[][]=[]; let fields:string[]=[]; let value=''; let quotes=false;
  for(let i=0;i<csv.length;i++){
    const char=csv[i];
    if(quotes){if(char==='"' && csv[i+1]==='"'){value+='"';i++;}else if(char==='"')quotes=false;else value+=char;}
    else if(char==='"' && !value)quotes=true;
    else if(char===','){fields.push(value);value='';}
    else if(char==='\r'||char==='\n'){if(char==='\r'&&csv[i+1]==='\n')i++;fields.push(value);value='';if(fields.some(f=>f.trim()))out.push(fields);fields=[];}
    else value+=char;
  }
  fields.push(value);if(fields.some(f=>f.trim()))out.push(fields);
  if(quotes)throw new Error('El CSV contiene comillas sin cerrar.');
  return out;
}
const normalize = (str:string)=>str.replace(/\\/g,'/').replace(/^\/+/, '').trim().toLowerCase();

export type HeartZipResult = {found:number, imported:number,noHeart:number,errors:number,already:number,unmatched:number};
export async function importHeartZip(file:File,csv:string,update:(msg:string)=>void):Promise<HeartZipResult> {
  if(!/\.zip$/i.test(file.name))return {found:0,imported:0,noHeart:0,errors:0,already:0,unmatched:0};
  const rows=parseCSV(csv);
  const headers=(rows[0]||[]).map(s=>s.replace(/^\uFEFF/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase());
  const find=(...choices:string[])=>headers.findIndex(h=>choices.includes(h));
  const idCol=find('activity id','id actividad','id de actividad');
  const fileCol=find('filename','activity filename','nombre de archivo','nombre del archivo','archivo');
  if(idCol<0)throw new Error('No se ha encontrado la columna Activity ID para asociar los originales.');
  const references=new Map<string,string>();
  const validIds=new Set<string>();
  for(const row of rows.slice(1)) {
    const id=String(row[idCol]||'').trim();
    if(!/^\d{1,20}$/.test(id))continue;
    validIds.add(id);
    const name=fileCol>=0?normalize(row[fileCol]||''):'';
    if(name && ALLOWED.test(name))references.set(name,id);
  }
  const previously=await api<{ids:string[]}>('/import/heartrate-ids');
  const existing=new Set(previously.ids);
  const reader=new ZipReader(new BlobReader(file),{useWebWorkers:false});
  try {
    const entries=await reader.getEntries();
    const candidates=[] as {entry:(typeof entries)[number],id:string}[];
    let unmatched=0,already=0;
    for(const entry of entries) {
      if(entry.directory || !ALLOWED.test(entry.filename))continue;
      const full=normalize(entry.filename);
      const basename=full.split('/').at(-1)||'';
      // Preferimos la referencia exacta del CSV. Solo sin referencia se usa el ID del nombre.
      let id=references.get(full) || references.get('activities/'+basename) || references.get(basename);
      if(!id){
        const match=basename.match(/^(\d{6,20})(?:\.|_)/);
        if(match && validIds.has(match[1]))id=match[1];
      }
      if(!id){unmatched++;continue;}
      if(existing.has(id)){already++;continue;}
      if(entry.uncompressedSize>MAX_PER_FILE){unmatched++;continue;}
      candidates.push({entry,id});
      existing.add(id); // Un ZIP puede repetir entradas del mismo original.
    }
    const result:HeartZipResult={found:candidates.length,imported:0,noHeart:0,errors:0,already,unmatched};
    if(!candidates.length){update('No hay archivos nuevos asociables a actividades. Comprueba que el ZIP incluya activities/ y la columna Filename.');return result;}
    for(let i=0;i<candidates.length;i++){
      const {entry,id}=candidates[i];
      update(`Leyendo pulsaciones: ${i+1}/${candidates.length} · recuperadas ${result.imported}`);
      try {
        if (entry.directory) {
          throw new Error('Entrada no disponible: es un directorio');
        }

        const bytes = await entry.getData(new Uint8ArrayWriter());
        if(bytes.length>MAX_PER_FILE)throw new Error('Original mayor de 15 MB.');
        const body=new Blob([new Uint8Array(bytes)],{type:'application/octet-stream'});
        const response=await api<{ok:boolean,imported:boolean}>(`/import/heartrate/${id}?filename=${encodeURIComponent(entry.filename.split('/').at(-1)||'')}`,
          {method:'POST',headers:{'Content-Type':'application/octet-stream','X-Race-HR-Consent':'true'},body});
        if(response.imported)result.imported++;else result.noHeart++;
      }catch {result.errors++;}
    }
    return result;
  }finally {await reader.close();}
}
