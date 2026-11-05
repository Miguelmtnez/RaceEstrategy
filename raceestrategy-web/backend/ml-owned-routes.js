// RaceEstrategy ML v1.4: selección personal y persistente de actividades para inferencia.
// SOLO datos aportados manualmente: no consulta tablas de sincronización de la API de Strava.
import express from 'express';
import { decodeFitUpload, MAX_FIT_UPLOAD_BYTES } from './fit-import.js';
import { predictionForIndependentHistory } from './ml-predict.js';
import { validRunningFit, summarizeOwnedRows } from './ml-owned-metrics.js';
import { parseUserStravaArchiveCsv } from './ml-archive-import.js';

const LIMIT_ACTIVITIES=2500;
const LIST_COLUMNS=`content_id,activity_name,activity_date,sport,distance_km,duration_minutes,ascent_m,use_for_prediction`;

export function setupOwnedMl(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS ml_owned_activities (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id TEXT NOT NULL,
    activity_date TEXT NOT NULL,
    sport TEXT NOT NULL,
    distance_km REAL NOT NULL,
    duration_minutes REAL NOT NULL,
    ascent_m REAL NOT NULL,
    attested_at INTEGER NOT NULL,
    activity_name TEXT NOT NULL DEFAULT 'Carrera',
    use_for_prediction INTEGER NOT NULL DEFAULT 1 CHECK(use_for_prediction IN (0,1)),
    PRIMARY KEY(user_id,content_id)
  );
  CREATE INDEX IF NOT EXISTS idx_ml_owned_user_date ON ml_owned_activities(user_id,activity_date);`);
  // Migración idempotente para conservar todas las actividades importadas con v1.2 / v1.3.
  const cols=new Set(db.prepare('PRAGMA table_info(ml_owned_activities)').all().map(x=>x.name));
  if(!cols.has('activity_name')) db.exec("ALTER TABLE ml_owned_activities ADD COLUMN activity_name TEXT NOT NULL DEFAULT 'Carrera'");
  if(!cols.has('use_for_prediction')) db.exec('ALTER TABLE ml_owned_activities ADD COLUMN use_for_prediction INTEGER NOT NULL DEFAULT 1 CHECK(use_for_prediction IN (0,1))');
  db.exec('CREATE INDEX IF NOT EXISTS idx_ml_owned_selection ON ml_owned_activities(user_id,use_for_prediction)');
}

function httpError(message,status=400){const e=new Error(message);e.status=status;return e;}
function validateArchive(text) {
  if(typeof text!=='string'||!text.trim())throw httpError('No hemos recibido activities.csv.');
  const data=parseUserStravaArchiveCsv(text);
  if(!data.stats.selectedRunning)throw httpError('No encontramos actividades de Carrera en activities.csv.',422);
  if(data.rows.length>LIMIT_ACTIVITIES) throw httpError(`El archivo contiene más de ${LIMIT_ACTIVITIES} carreras válidas. Divide el historial antes de importarlo.`,413);
  return data;
}
function formatRow(r){
  return {
    id:r.content_id, name:r.activity_name||'Carrera',date:r.activity_date,
    sport:r.sport,distanceKm:r.distance_km,durationMinutes:r.duration_minutes,
    ascentM:r.ascent_m,selected:Number(r.use_for_prediction)===1,
    source:r.content_id.startsWith('fit_')?'fit':'archivo'
  };
}
function isContentId(id){return typeof id==='string' && /^(?:archive_strava_\d{1,20}|fit_[a-f0-9]{24})$/.test(id);}

export function mountMlOwnedRoutes(app, account, db) {
  setupOwnedMl(db);
  const all=db.prepare(`SELECT ${LIST_COLUMNS} FROM ml_owned_activities
    WHERE user_id=? ORDER BY activity_date DESC,content_id DESC LIMIT ?`);
  const countQ=db.prepare('SELECT COUNT(*) AS n FROM ml_owned_activities WHERE user_id=?');
  const getId=db.prepare(`SELECT ${LIST_COLUMNS} FROM ml_owned_activities WHERE user_id=? AND content_id=?`);
  const equivalentFit=db.prepare(`SELECT ${LIST_COLUMNS} FROM ml_owned_activities WHERE user_id=? AND content_id LIKE 'fit_%'
    AND activity_date=? AND ABS(distance_km - ?)<0.02 AND ABS(duration_minutes - ?)<0.25 LIMIT 1`);
  const updateSelection=db.prepare('UPDATE ml_owned_activities SET use_for_prediction=? WHERE user_id=? AND content_id=?');
  const updateImported=db.prepare('UPDATE ml_owned_activities SET activity_name=?,use_for_prediction=? WHERE user_id=? AND content_id=?');
  const insert=db.prepare(`INSERT OR IGNORE INTO ml_owned_activities
    (user_id,content_id,activity_date,sport,distance_km,duration_minutes,ascent_m,attested_at,activity_name,use_for_prediction)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  function fail(res,e,context){
    if(!e.status)console.error(`[${context}]`,e?.message||e);
    return res.status(e.status||500).json({error:e.status?e.message:'No se pudo completar la operación.'});
  }
  function rows(userId){return all.all(userId,LIMIT_ACTIVITIES);}
  function preview(userId,rawCsv){
    const {rows:running,stats}=validateArchive(rawCsv);
    const items=running.map(r=>{
      const stored=getId.get(userId,r.contentId)||equivalentFit.get(userId,r.date,r.distanceKm,r.durationMinutes);
      return {...r, selected:stored?Number(stored.use_for_prediction)===1:true, alreadyImported:!!stored};
    });
    return {ok:true,...stats,items};
  }
  function saveArchive(userId,rawCsv,chosenIds){
    const {rows:running,stats}=validateArchive(rawCsv);
    if(chosenIds!==null){
      if(!Array.isArray(chosenIds)||chosenIds.length>LIMIT_ACTIVITIES||chosenIds.some(id=>!isContentId(id)||!id.startsWith('archive_strava_')))
        throw httpError('La selección de actividades no es válida.');
      const validIds=new Set(running.map(x=>x.contentId));
      if(chosenIds.some(id=>!validIds.has(id)) || new Set(chosenIds).size!==chosenIds.length)
        throw httpError('La selección contiene actividades ajenas al archivo o identificadores repetidos.');
    }
    const allowed=chosenIds===null?null:new Set(chosenIds);
    const result=db.transaction(()=>{
      let count=countQ.get(userId).n,added=0,duplicates=0;
      for(const row of running){
        const selected=allowed===null?1:Number(allowed.has(row.contentId));
        const existing=getId.get(userId,row.contentId)||equivalentFit.get(userId,row.date,row.distanceKm,row.durationMinutes);
        if(existing){
          // Al reimportar se actualiza la selección, no se crean duplicados ni se borran entrenamientos.
          updateImported.run(row.name,selected,userId,existing.content_id);
          duplicates++;continue;
        }
        if(count>=LIMIT_ACTIVITIES)throw httpError(`Has alcanzado el límite de ${LIMIT_ACTIVITIES} actividades del Laboratorio IA.`,413);
        const r=insert.run(userId,row.contentId,row.date,row.sport,row.distanceKm,row.durationMinutes,row.ascentM,
          Date.now(),row.name,selected);
        if(r.changes){added++;count++;}else duplicates++;
      }
      return {added,duplicates,count};
    })();
    return {ok:true,...stats,...result,
      selectedCount:rows(userId).filter(x=>x.use_for_prediction===1).length,
      notice:'Las carreras excluidas quedan guardadas, pero se omiten del perfil y de las predicciones. No se guardan GPS ni pulsaciones.'};
  }
  app.get('/api/ml/owned-profile',account,(req,res)=>{
    try {res.json(summarizeOwnedRows(rows(req.user.id)))}catch(e){fail(res,e,'ML profile')}
  });
  app.get('/api/ml/owned-activities',account,(req,res)=>{
    try {
      const items=rows(req.user.id).map(formatRow);
      res.json({items,total:items.length,selected:items.filter(x=>x.selected).length,limit:LIMIT_ACTIVITIES});
    }catch(e){fail(res,e,'ML activities')}
  });
  app.post('/api/ml/owned-selection',account,express.text({type:'text/plain',limit:'80kb'}),(req,res)=>{
    try {
      const {ids,selected}=JSON.parse(req.body||'{}');
      if(!Array.isArray(ids)||ids.length<1||ids.length>LIMIT_ACTIVITIES||typeof selected!=='boolean'
        ||ids.some(id=>!isContentId(id))||new Set(ids).size!==ids.length)
        throw httpError('Envía identificadores de actividad únicos y selected=true/false.');
      db.transaction(()=>{
        for(const id of ids){
          const r=updateSelection.run(selected?1:0,req.user.id,id);
          if(r.changes!==1)throw httpError('No se encontró alguna actividad de tu historial.',404);
        }
      })();
      const items=rows(req.user.id);
      res.json({ok:true,changed:ids.length,selectedCount:items.filter(x=>x.use_for_prediction===1).length});
    }catch(e){if(e instanceof SyntaxError)e.status=400;fail(res,e,'ML selection')}
  });
  app.post('/api/ml/owned-fit',account,express.raw({type:'application/octet-stream',limit:'15mb'}),async(req,res)=>{
    if(req.headers['x-ml-independent-consent']!=='true')return res.status(400).json({error:'Confirma que el FIT procede de un dispositivo y autorizas su análisis.'});
    const filename=typeof req.query.filename==='string'?req.query.filename.slice(0,260):'';
    if(!/\.fit(?:\.gz)?$/i.test(filename)||!Buffer.isBuffer(req.body)||req.body.length<1||req.body.length>MAX_FIT_UPLOAD_BYTES)
      return res.status(400).json({error:'Selecciona un FIT/FIT.GZ de hasta 15 MB.'});
    try {
      const decoded=await decodeFitUpload(req.body,filename),fit=validRunningFit(decoded);
      const existing=getId.get(req.user.id,fit.contentId);
      if(existing)return res.json({ok:true,alreadyImported:true,date:fit.date,distanceKm:+fit.distanceKm.toFixed(2),count:rows(req.user.id).length});
      if(countQ.get(req.user.id).n>=LIMIT_ACTIVITIES)throw httpError('Has alcanzado el máximo de actividades guardadas.',413);
      const r=insert.run(req.user.id,fit.contentId,fit.date,fit.sport,fit.distanceKm,fit.durationMinutes,fit.ascentM,
        Date.now(),`Carrera FIT · ${fit.date}`,1);
      res.json({ok:true,alreadyImported:!r.changes,date:fit.date,distanceKm:+fit.distanceKm.toFixed(2),count:rows(req.user.id).length});
    }catch(e){fail(res,e,'ML FIT')}
  });
  app.post('/api/ml/owned-strava-preview',account,express.text({type:'text/csv',limit:'24mb'}),(req,res)=>{
    if(req.headers['x-ml-user-file-consent']!=='true')return res.status(400).json({error:'Autoriza primero el análisis del archivo que aportas.'});
    try {res.json(preview(req.user.id,req.body))}catch(e){
      if(!e.status && /csv|actividad|columna|filas|comillas|strava|export/i.test(e.message))e.status=400;
      fail(res,e,'ML ZIP preview');
    }
  });
  // Compatibilidad con v1.3: importar todo el CSV sin selección explícita.
  app.post('/api/ml/owned-strava-archive',account,express.text({type:'text/csv',limit:'24mb'}),(req,res)=>{
    if(req.headers['x-ml-user-file-consent']!=='true')return res.status(400).json({error:'Autoriza primero el análisis del archivo que aportas.'});
    try {res.json(saveArchive(req.user.id,req.body,null))}catch(e){
      if(!e.status && /csv|actividad|columna|filas|comillas|strava|export/i.test(e.message))e.status=400;
      fail(res,e,'ML ZIP legacy');
    }
  });
  // Nuevo flujo: el navegador muestra la lista y envía el CSV + IDs escogidos, sin subir el ZIP.
  app.post('/api/ml/owned-strava-archive-selection',account,
    express.text({type:'text/plain',limit:'32mb'}),(req,res)=>{
      if(req.headers['x-ml-user-file-consent']!=='true')return res.status(400).json({error:'Autoriza primero el análisis del archivo que aportas.'});
      try {
        if(typeof req.body!=='string'||req.body.length>32*1024*1024)throw httpError('Archivo demasiado grande.',413);
        const data=JSON.parse(req.body);
        if(!data||typeof data.csv!=='string'||!Array.isArray(data.selectedIds))throw httpError('Formato de selección inválido.');
        res.json(saveArchive(req.user.id,data.csv,data.selectedIds));
      }catch(e){
        if(e instanceof SyntaxError)e.status=400;
        if(!e.status&&/csv|actividad|columna|filas|comillas|strava|export/i.test(e.message))e.status=400;
        fail(res,e,'ML ZIP selected');
      }
    });
  app.post('/api/ml/predict-owned',account,(req,res)=>{
    try {
      const chosen=rows(req.user.id).filter(r=>Number(r.use_for_prediction)===1);
      const history=chosen.map(r=>({date:r.activity_date,distanceKm:r.distance_km,
        durationMinutes:r.duration_minutes,ascentM:r.ascent_m}));
      const result=predictionForIndependentHistory({source:'manual_user_file',explicitConsent:true,
        history,route:req.body?.route});
      res.json({...result,selectedActivities:chosen.length,historyLastDate:[...history].sort((a,b)=>a.date.localeCompare(b.date)).at(-1)?.date||null,
        origin:'manual_uploaded_archive_or_fit_no_api',
        caveat:'Predicción experimental de Carrera con SOLO las actividades marcadas y anteriores a la ruta objetivo. El error medio FitRec no garantiza tu error individual.'});
    }catch(e){fail(res,e,'ML predict')}
  });
  app.delete('/api/ml/owned-history',account,(req,res)=>{
    try {const r=db.prepare('DELETE FROM ml_owned_activities WHERE user_id=?').run(req.user.id);res.json({ok:true,removed:r.changes})}
    catch(e){fail(res,e,'ML delete')}
  });
}
