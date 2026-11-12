import express from 'express';
import { decodeHeartFile, compatibleWithActivity } from './imported-heart-parser.js';

export function mountImportedHeartRoutes(app, account, dbService) {
  app.get('/api/import/heartrate-ids', account, async (req,res)=>{
    try { res.json({ids:await dbService.getImportedHeartRateIds(req.user.id)}); }
    catch(e){console.error('[HR ids]',e);res.status(500).json({error:'No se pudo consultar el estado de pulsaciones.'});}
  });
  app.get('/api/import/heartrate/:id', account, async (req,res)=>{
    if(!/^\d{1,20}$/.test(req.params.id))return res.status(400).json({error:'Actividad inválida.'});
    try {
      const owned=await dbService.getImportedActivityById(req.user.id,req.params.id);
      if(!owned)return res.status(404).json({error:'Actividad no encontrada en tu historial importado.'});
      const data=await dbService.getImportedHeartRate(req.user.id,req.params.id);
      res.json({available:Array.isArray(data?.points)&&data.points.length>0,points:data?.points||[]});
    }catch(e){console.error('[HR detail]',e);res.status(500).json({error:'No se pudieron recuperar las pulsaciones.'});}
  });
  app.post('/api/import/heartrate/:id', account,
    express.raw({type:'application/octet-stream',limit:'15mb'}), async (req,res)=>{
      if(req.headers['x-race-hr-consent']!=='true')return res.status(400).json({error:'Debes autorizar explícitamente la importación de pulsaciones.'});
      if(!/^\d{1,20}$/.test(req.params.id))return res.status(400).json({error:'Identificador de actividad inválido.'});
      const name=typeof req.query.filename==='string'?req.query.filename:'';
      if(!/\.(?:fit|tcx|gpx)(?:\.gz)?$/i.test(name) || name.length>260 || !Buffer.isBuffer(req.body))
        return res.status(400).json({error:'Envía un archivo FIT, TCX o GPX válido.'});
      try {
        const owned=await dbService.getImportedActivityById(req.user.id,req.params.id);
        if(!owned)return res.status(404).json({error:'Importa primero la actividad mediante activities.csv.'});
        const parsed=await decodeHeartFile(req.body,name);
        if(!compatibleWithActivity(owned,parsed))return res.status(422).json({error:'La fecha del archivo original no coincide con la actividad. No se han guardado datos.'});
        if(parsed.averageHeartRate===null && parsed.maxHeartRate===null && !parsed.points.length)
          return res.json({ok:true,imported:false,reason:'sin_pulsaciones'});
        await dbService.saveImportedHeartRate(req.user.id,req.params.id,parsed);
        res.json({ok:true,imported:true,averageHeartRate:parsed.averageHeartRate,maxHeartRate:parsed.maxHeartRate,samples:parsed.points.length});
      }catch(e){
        if(/FIT|formato|archivo|XML|muestra|descomprim|límite|cabecera|integridad/i.test(e.message))
          return res.status(422).json({error:'No hemos podido leer las pulsaciones de este archivo.'});
        console.error('[HR upload]',e);res.status(500).json({error:'No se pudieron guardar las pulsaciones.'});
      }
    });
}
