// Parser de la exportación CSV oficial de Strava. Lee métricas de actividad y FC de resumen; no guarda GPS ni fotos.
// Las columnas repetidas del CSV de Strava se conservan y se usa la última cifra válida.
const MAX_ROWS = 100_000;

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quote = false;
  const csv = text.replace(/^\uFEFF/, '');
  for (let i=0; i<csv.length; i++) {
    const c = csv[i];
    if (quote) {
      if (c === '"' && csv[i+1] === '"') { field+='"'; i++; }
      else if (c === '"') quote = false;
      else field += c;
    } else if (c === '"' && field === '') quote = true;
    else if (c === ',') { row.push(field); field=''; }
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && csv[i+1] === '\n') i++;
      row.push(field); field='';
      if (row.some(v => v.trim())) rows.push(row);
      if (rows.length > MAX_ROWS+1) throw new Error('El CSV supera el máximo de 100.000 actividades permitido en esta versión.');
      row=[];
    } else field += c;
  }
  if (quote) throw new Error('El CSV tiene comillas sin cerrar.');
  row.push(field);
  if (row.some(v=>v.trim())) rows.push(row);
  return rows;
}
const key = s => String(s||'').replace(/^\uFEFF/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
function numberOrNull(raw) {
  const text = String(raw ?? '').trim().replace(/\u00a0/g,'');
  if (!text) return null;
  const normalized = /^-?\d+,\d+$/.test(text) ? text.replace(',','.') : text;
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
function seconds(raw) {
  const text = String(raw||'').trim();
  if (/^\d+:\d{1,2}(?::\d{1,2})?$/.test(text)) {
    const parts = text.split(':').map(Number);
    return parts.length === 3 ? parts[0]*3600+parts[1]*60+parts[2] : parts[0]*60+parts[1];
  }
  return numberOrNull(text);
}
function parseDate(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  // Formatos habituales de Strava y variaciones internacionales.
  // Se interpretan en UTC para obtener ordenación y métricas consistentes.
  const asUTC = (year, month, day, hh = 0, mm = 0, ss = 0, meridian = '') => {
    let h = Number(hh);
    const ampm = String(meridian).toLowerCase();
    if (ampm) {
      if (h < 1 || h > 12) return null;
      h = h % 12 + (ampm === 'pm' ? 12 : 0);
    }
    const d = new Date(Date.UTC(+year, +month - 1, +day, h, +mm, +ss));
    if (d.getUTCFullYear() !== +year || d.getUTCMonth() + 1 !== +month ||
        d.getUTCDate() !== +day || d.getUTCHours() !== h ||
        d.getUTCMinutes() !== +mm || d.getUTCSeconds() !== +ss) return null;
    return d.toISOString();
  };

  const hhmm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i;
  const parseParts = value => {
    if (!value) return [0, 0, 0, ''];
    const match = String(value).trim().match(hhmm);
    return match ? [match[1],match[2],match[3] || 0,match[4] || ''] : null;
  };

  const eu = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:[ T,]+(.+))?$/);
  if (eu) {
    const parts = parseParts(eu[4]);
    return parts ? asUTC(eu[3],eu[2],eu[1],...parts) : null;
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]+(.+))?$/);
  if (iso && (!iso[4] || hhmm.test(iso[4].trim()))) {
    const parts = parseParts(iso[4]);
    return parts ? asUTC(iso[1],iso[2],iso[3],...parts) : null;
  }

  const monthWords = {
    ene:1, enero:1, jan:1, january:1, feb:2, febrero:2, february:2,
    mar:3, marzo:3, march:3, abr:4, abril:4, apr:4, april:4,
    may:5, mayo:5, jun:6, junio:6, june:6, jul:7, julio:7, july:7,
    ago:8, agosto:8, aug:8, august:8, sep:9, sept:9, septiembre:9,
    set:9, setiembre:9, september:9, oct:10, octubre:10, october:10,
    nov:11, noviembre:11, november:11, dic:12, diciembre:12, dec:12, december:12
  };
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const words = normalized.match(/^(\d{1,2})\s+(?:de\s+)?([a-z]+)\.?\s+(?:de\s+)?(\d{4})(?:[, ]+(.+))?$/);
  if (words && monthWords[words[2]]) {
    const parts = parseParts(words[4]);
    return parts ? asUTC(words[3],monthWords[words[2]],words[1],...parts) : null;
  }
  // Date.parse entiende formatos ingleses del CSV oficial (Oct 30, 2026, 7:15 AM),
  // ISO con zona horaria y otras variantes válidas.
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
export function parseStravaExport(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('El archivo CSV está vacío.');
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('El CSV no contiene actividades.');
  const headers = rows[0].map(key);
  const indices = name => headers.map((v,i)=>v===key(name)?i:-1).filter(i=>i>=0);
  const first = (...names) => names.flatMap(indices)[0];
  const idCol=first('Activity ID','ID Actividad','ID de actividad');
  const dateCol=first('Activity Date','Fecha de actividad','Fecha de la actividad');
  if (idCol===undefined || dateCol===undefined) {
    throw new Error('No parece el activities.csv de Strava: faltan las columnas Activity ID o Activity Date.');
  }
  const get = (r,...names) => { for (const name of names) for (const i of indices(name)) if (String(r[i]??'').trim()) return String(r[i]).trim(); return ''; };
  const value = (r,...names) => {
    // Puede haber "Distance" dos veces; preferir la última columna con valor numérico.
    for (const i of names.flatMap(indices).reverse()) {
      const n=numberOrNull(r[i]); if (n!==null) return n;
    }
    return null;
  };
  const timeValue = (r,...names) => {
    for (const i of names.flatMap(indices).reverse()) {
      const n=seconds(r[i]); if(n!==null) return n;
    }
    return null;
  };
  const activities=[];
  let skipped=0, noMovingTime=0, noMetrics=0;
  const skippedByReason = { invalidId: 0, invalidDate: 0, duplicateId: 0 };
  const skippedExamples = [];
  const seen=new Set();
  const skip = (reason, row, rowNumber) => {
    skipped++; skippedByReason[reason]++;
    // Devuelve hasta 100 ejemplos (los primeros 50 y los últimos 50).
    // Permite localizar actividades recientes aunque el CSV esté ordenado de más antigua a nueva.
    // No se guardan en la base de datos; solo se devuelven a la cuenta que importó el CSV.
    const example = {
      row: rowNumber, reason,
      name: get(row, 'Activity Name', 'Nombre de actividad', 'Nombre de la actividad').slice(0,100),
      date: get(row, 'Activity Date', 'Fecha de actividad', 'Fecha de la actividad').slice(0,70)
    };
    if (skippedExamples.length < 100) skippedExamples.push(example);
    else { skippedExamples.splice(50, 1); skippedExamples.push(example); }
  };
  for (const [index, r] of rows.slice(1).entries()) {
    const id=get(r,'Activity ID','ID Actividad','ID de actividad');
    const date=parseDate(get(r,'Activity Date','Fecha de actividad','Fecha de la actividad'));
    if(!/^\d{1,20}$/.test(id)) { skip('invalidId',r,index+2); continue; }
    if(!date) { skip('invalidDate',r,index+2); continue; }
    if(seen.has(id)) { skip('duplicateId',r,index+2); continue; }
    const distance=value(r,'Distance','Distancia');
    const moving=timeValue(r,'Moving Time','Tiempo en movimiento');
    const elapsed=timeValue(r,'Elapsed Time','Tiempo transcurrido');
    const elevation=value(r,'Elevation Gain','Desnivel positivo','Desnivel acumulado');
    // El export de Strava usa metros y segundos. No inventar distancia o tiempo para filas incompletas.
    // Una actividad sin métricas sigue siendo una actividad real.
    // Se conserva con 0 en los campos desconocidos y se informa al usuario.
    // Esas estadísticas serían parciales: no interpretar 0 como una medición real.
    if(distance===null && moving===null && elapsed===null) noMetrics++;
    const safeDistance=distance !== null && distance>=0 && distance<=2_000_000 ? distance : 0;
    const safeTime=moving !== null && moving>=0 && moving<=604800 ? moving : 0;
    if (moving===null) noMovingTime++;
    activities.push({
      id, name:get(r,'Activity Name','Nombre de actividad','Nombre de la actividad').slice(0,180)||'Actividad sin nombre',
      sport_type:get(r,'Activity Type','Tipo de actividad','Type','Tipo').slice(0,80)||'Workout',
      start_date:date,
      distance:safeDistance,
      moving_time:safeTime,
      total_elevation_gain:elevation!==null && elevation>=0 && elevation<=50_000?elevation:0,
      average_heartrate: (()=>{const v=value(r,'Average Heart Rate','Avg Heart Rate','Frecuencia cardíaca media','Frecuencia cardíaca promedio','FC media','FC promedio');return v!==null&&v>=25&&v<=250?Math.round(v):null;})(),
      max_heartrate: (()=>{const v=value(r,'Max Heart Rate','Maximum Heart Rate','Frecuencia cardíaca máxima','FC máxima');return v!==null&&v>=25&&v<=250?Math.round(v):null;})()
    });
    seen.add(id);
  }
  if(!activities.length) throw new Error('No se encontraron actividades válidas. Comprueba que sea el CSV original exportado de Strava.');
  return { activities, skipped, noMovingTime, noMetrics, skippedByReason, skippedExamples,
    sourceRows: rows.length - 1 };
}
