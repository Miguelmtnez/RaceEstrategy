import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowRight, BrainCircuit, ChevronRight, Clock3, FileUp, Footprints, Gauge, Leaf, Menu, Mountain, ShieldCheck, Trash2, TrendingUp } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type User } from '../lib/api';
import { extractStravaCSV } from '../lib/importStrava';
import { Sidebar } from '../components/Sidebar';
import MLActivityPicker, { type MlActivity, type ActivityType } from '../components/MLActivityPicker';

type MlSport = 'Carrera'|'Bicicleta'|'MTB'|'Senderismo';
const SPORT_OPTIONS:MlSport[]=['Carrera','Bicicleta','MTB','Senderismo'];
const MAX_ROUTE_DISTANCE:Record<MlSport,number>={Carrera:42.3,Bicicleta:400,MTB:250,Senderismo:100};
type MlProfile = {
  count:number;totalKm:number;medianPaceMinPerKm:number|null;medianSpeedKmH?:number|null;totalAscentM?:number;longestKm:number|null;
  firstActivity:string|null;lastActivity:string|null;distinctDays:number;
  modelReady:boolean;provenance:string;description:string;selectedCount:number;excludedCount:number;
};
type MlPrediction = {sport:string;estimatedMinutes:number;baselineMinutes:number|null;historyActivities:number;
  modelTestMAEMinutes:number|null;historyLastDate?:string|null;label:string;caveat:string;mode:'rodaje'|'competicion';
  projectionKind:string;reference?:{name:string;date:string;distanceKm:number;durationMinutes:number;ascentM:number|null}};
type FitResult={ok:boolean;alreadyImported:boolean;date:string;distanceKm:number;count:number};
type ArchiveResult={ok:boolean;sourceRows:number;selectedRunning:number;eligibleRunning:number;selectedCount:number;
  eligibleTotal?:number;bySport?:Record<MlSport,{found:number;eligible:number;invalid:number}>;
  invalidRunning:number;ignoredOtherSports:number;invalidIdOrDateOrDuplicate:number;
  added:number;duplicates:number;count:number;notice:string};
type MlStored={items:MlActivity[];total:number;selected:number;limit:number};
type HistoryDiagnostics={manualTotal:number;manualUnrecognized:number;labTotal:number;bySport:Record<MlSport,{manualFound:number;manualEligible:number;manualExcluded:number;labStored:number;ratingValid:number}>;explanation:string};
type ManualSyncResult={ok:boolean;added:number;duplicates:number;skippedFitEquivalent:number;count:number;selectedCount:number;report:{total:number;unrecognized:number;bySport:Record<MlSport,{found:number;eligible:number;invalid:number}>}};
type MlPreview=Omit<ArchiveResult,'added'|'duplicates'|'count'|'notice'|'selectedCount'> & {items:(Omit<MlActivity,'id'> & {contentId:string})[]};
const fmt=(x:number,d=1)=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:d}).format(x);
const clock=(v:number)=>{const m=Math.round(v),h=Math.floor(m/60);return h?`${h} h ${String(m%60).padStart(2,'0')} min`:`${m} min`;};
const pace=(v:number|null)=>v==null?'—':`${Math.floor(v)}:${String(Math.round((v%1)*60)).padStart(2,'0')} min/km`;
const nextDate=()=>new Date(Date.now()+86400000).toISOString().slice(0,10);

export default function MLPage(){
  const navigate=useNavigate();
  const [user,setUser]=useState<User|null>(null);
  const [menuOpen,setMenuOpen]=useState(false);
  const [profile,setProfile]=useState<MlProfile|null>(null);
  const [sport,setSport]=useState<MlSport>('Carrera');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [consent,setConsent]=useState(false);
  const [files,setFiles]=useState<File[]>([]);
  const [progress,setProgress]=useState('');
  const [archiveReport,setArchiveReport]=useState<ArchiveResult|null>(null);
  const [stored,setStored]=useState<MlActivity[]>([]);
  const [historyDiagnostics,setHistoryDiagnostics]=useState<HistoryDiagnostics|null>(null);
  const [previewRows,setPreviewRows]=useState<MlActivity[]>([]);
  const [previewSelected,setPreviewSelected]=useState<Set<string>>(new Set());
  const [previewTypeEdited,setPreviewTypeEdited]=useState<Set<string>>(new Set());
  const [archiveCsv,setArchiveCsv]=useState('');
  const requestToken=useRef(0);
  const [distance,setDistance]=useState('10');
  const [ascent,setAscent]=useState('100');
  const [descent,setDescent]=useState('100');
  const [date,setDate]=useState(nextDate);
  const [mode,setMode]=useState<'rodaje'|'competicion'>('rodaje');
  const [prediction,setPrediction]=useState<MlPrediction|null>(null);
  const [predictionError,setPredictionError]=useState('');

  // Vista previa local: usa los mismos criterios básicos que el backend.
  // Solo competiciones confirmadas manualmente, incluidas y anteriores a la ruta objetivo.
  const confirmedMarks=stored.filter(x=>x.sport==='Carrera'&&x.selected&&x.activityType==='competicion'&&x.typeSource==='manual');
  const targetKm=Number(distance);
  const comparableMarks=confirmedMarks.filter(x=>{
    const ratio=targetKm/x.distanceKm;
    const paceMinKm=x.durationMinutes/x.distanceKm;
    return /^\d{4}-\d{2}-\d{2}$/.test(x.date)&&x.date<date&&
      x.distanceKm>=1&&x.distanceKm<=42.3&&x.durationMinutes>0&&
      Number.isFinite(paceMinKm)&&paceMinKm>=2.4&&paceMinKm<=20&&
      Number.isFinite(ratio)&&ratio>=0.5&&ratio<=2;
  }).sort((a,b)=>Math.abs(Math.log(targetKm/a.distanceKm))-Math.abs(Math.log(targetKm/b.distanceKm))||b.date.localeCompare(a.date));
  const previewMark=comparableMarks[0]??null;

  const refresh=async()=>{
    const [p,activities]=await Promise.all([api<MlProfile>(`/ml/owned-profile?sport=${encodeURIComponent(sport)}`),api<MlStored>('/ml/owned-activities')]);
    setProfile(p);setStored(activities.items);
  };
  const updateStoredSelection=async(ids:string[],selected:boolean)=>{
    if(!ids.length)return;
    setBusy(true);setError('');setPrediction(null);setPredictionError('');
    try{
      await api('/ml/owned-selection',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({ids,selected})});
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar la selección.');}
    finally{setBusy(false)}
  };
  const updateStoredType=async(ids:string[],activityType:ActivityType)=>{
    if(!ids.length)return;
    setBusy(true);setError('');setPrediction(null);setPredictionError('');
    try {
      await api('/ml/owned-types',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({ids,activityType})});
      await refresh();
      setMessage(`Tipo actualizado en ${ids.length} actividad(es). No cambia todavía el modelo de predicción v1.`);
    }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar el tipo de actividad.');}
    finally{setBusy(false)}
  };
  const updatePreviewType=(ids:string[],activityType:ActivityType)=>{
    const idsSet=new Set(ids);
    setPreviewRows(previous=>previous.map(x=>idsSet.has(x.id)?{...x,activityType,typeSource:'manual'}:x));
    setPreviewTypeEdited(previous=>new Set([...previous,...ids]));
  };
  const updatePreviewSelection=(ids:string[],selected:boolean)=>{
    setPreviewSelected(previous=>{
      const next=new Set(previous);
      for(const id of ids){if(selected)next.add(id);else next.delete(id);}
      return next;
    });
  };
  async function chooseFiles(selectedFiles:File[]){
    const token=++requestToken.current;
    setBusy(false);setProgress('');setFiles(selectedFiles);setArchiveCsv('');setPreviewRows([]);setPreviewSelected(new Set());setPreviewTypeEdited(new Set());
    setArchiveReport(null);setMessage('');setError('');setPrediction(null);
    const archives=selectedFiles.filter(f=>/\.(?:zip|csv)$/i.test(f.name));
    if(!archives.length)return;
    if(selectedFiles.length!==1){setError('Selecciona el ZIP de Strava por separado.');return;}
    if(!consent){setMessage('Marca primero la autorización y pulsa «Ver carreras del ZIP».');return;}
    await prepareArchive(selectedFiles[0],token);
  }
  async function prepareArchive(file:File,token=++requestToken.current){
    setBusy(true);setProgress('Leyendo el ZIP y preparando las actividades de running…');setError('');
    try{
      const csv=await extractStravaCSV(file);
      const r=await api<MlPreview>('/ml/owned-strava-preview',{
        method:'POST',headers:{'Content-Type':'text/csv; charset=utf-8','X-ML-User-File-Consent':'true'},body:csv
      });
      if(token!==requestToken.current)return;
      const items=r.items.map(({contentId,...other})=>({...other,id:contentId}));
      setArchiveCsv(csv);setPreviewRows(items);
      setPreviewSelected(new Set(items.filter(x=>x.selected).map(x=>x.id)));setPreviewTypeEdited(new Set());
      setMessage(`${r.eligibleTotal??r.eligibleRunning} actividades válidas detectadas entre Carrera, Bicicleta, MTB y Senderismo. Abre cada modalidad para revisar su selección antes de guardar.`);
    }catch(e){if(token===requestToken.current)setError(e instanceof Error?e.message:'Error al preparar el ZIP.');}
    finally{if(token===requestToken.current){setBusy(false);setProgress('')}}
  }
  useEffect(()=>{
    let alive=true;
    Promise.all([api<{user:User}>('/auth/me'),api<MlProfile>(`/ml/owned-profile?sport=${encodeURIComponent(sport)}`),api<MlStored>('/ml/owned-activities')])
      .then(([auth,data,activities])=>{if(alive){setUser(auth.user);setProfile(data);setStored(activities.items)}})
      .catch(e=>{if(alive){const text=e instanceof Error?e.message:'Error de conexión';if(/sesión|inicia sesión/i.test(text))navigate('/',{replace:true});else setError(text)}})
      .finally(()=>{if(alive)setLoading(false)});
    return ()=>{alive=false};
  },[navigate]);
  useEffect(()=>{
    let active=true;setProfile(null);
    api<MlProfile>(`/ml/owned-profile?sport=${encodeURIComponent(sport)}`)
      .then(r=>{if(active)setProfile(r)})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'No se pudo cargar el perfil.')});
    return()=>{active=false};
  },[sport]);
  const logout=async()=>{try{await api('/auth/logout',{method:'POST'});navigate('/',{replace:true});}catch(e){setError(e instanceof Error?e.message:'No se pudo cerrar sesión')}};
  const deleteAccount=async()=>{
    if(!window.confirm('¿Eliminar tu cuenta y tus datos?')||window.prompt('Escribe ELIMINAR para confirmar')!=='ELIMINAR')return;
    try{await api('/auth/account',{method:'DELETE'});navigate('/',{replace:true})}catch(e){setError(e instanceof Error?e.message:'Error al eliminar la cuenta')}
  };
  async function upload(){
    if(!consent||!files.length)return;
    setBusy(true);setError('');setArchiveReport(null);setPrediction(null);
    try{
      const archives=files.filter(f=>/\.(?:zip|csv)$/i.test(f.name));
      if(archives.length){
        if(!archiveCsv)throw new Error('Primero pulsa «Ver carreras del ZIP» para elegir los entrenamientos.');
        setProgress('Guardando las carreras y tu selección personal…');
        const r=await api<ArchiveResult>('/ml/owned-strava-archive-selection',{
          method:'POST',headers:{'Content-Type':'text/plain','X-ML-User-File-Consent':'true'},
          body:JSON.stringify({csv:archiveCsv,selectedIds:[...previewSelected],
            typeOverrides:previewRows.filter(x=>previewTypeEdited.has(x.id)).map(x=>({id:x.id,activityType:x.activityType}))})
        });
        setArchiveReport(r);
        setMessage(`Actividades importadas: ${r.added}. Ya existentes: ${r.duplicates}. Seleccionadas para IA (todas las modalidades): ${r.selectedCount}. Puedes modificarlo en la lista de abajo.`);
        setPreviewRows([]);setPreviewSelected(new Set());setPreviewTypeEdited(new Set());setArchiveCsv('');
      }else{
        if(files.length>30)throw new Error('Para FIT individuales, selecciona hasta 30 archivos por lote. Con el ZIP no necesitas hacerlo uno a uno.');
        let added=0,duplicates=0;
        for(const [i,file] of files.entries()){
          setProgress(`Importando FIT ${i+1} de ${files.length}…`);
          if(!/\.fit(?:\.gz)?$/i.test(file.name)||file.size>15*1024*1024)
            throw new Error(`Formato o tamaño incorrecto: ${file.name}`);
          const r=await api<FitResult>(`/ml/owned-fit?filename=${encodeURIComponent(file.name)}`,{
            method:'POST',headers:{'Content-Type':'application/octet-stream','X-ML-Independent-Consent':'true'},body:file});
          if(r.alreadyImported)duplicates++;else added++;
        }
        setMessage(`FIT importados: ${added}. Duplicados ignorados: ${duplicates}. Ya puedes incluirlos o excluirlos en la lista.`);
      }
      setFiles([]);await refresh();
    }catch(e){setError(e instanceof Error?e.message:'No se pudieron importar los archivos.');}
    finally{setProgress('');setBusy(false)}
  }
  async function predict(){
    setError('');setPredictionError('');setMessage('');setPrediction(null);
    const distanceKm=Number(distance),ascentM=Number(ascent),descentM=Number(descent);
    const maxKm=MAX_ROUTE_DISTANCE[sport];
    if(!Number.isFinite(distanceKm)||distanceKm<0.5||distanceKm>maxKm||!Number.isFinite(ascentM)||ascentM<0||!Number.isFinite(descentM)||descentM<0||!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setPredictionError(`Introduce una fecha, una distancia de 0,5 a ${maxKm} km y desniveles válidos.`);return;
    }
    if(mode==='competicion'&&!comparableMarks.length){
      setPredictionError(confirmedMarks.length
        ?'Tienes competiciones confirmadas, pero ninguna es anterior a la fecha de la ruta y comparable en distancia (de la mitad al doble). Comprueba las fechas y las casillas «Incluida».'
        :'No hay competiciones confirmadas e incluidas. Marca una actividad como «Competición» en «Mis carreras para la IA» antes de proyectar.');
      return;
    }
    setBusy(true);
    try{
      const r=await api<MlPrediction>('/ml/predict-owned',{method:'POST',body:JSON.stringify({sport,mode,route:{date,distanceKm,ascentM,descentM}})});
      if(r.mode!==mode){
        throw new Error('El backend ha respondido en otro modo. Es posible que el servidor todavía tenga una versión anterior. Detén y reinicia npm run dev en backend; si estás en Netlify, comprueba que el despliegue de Render incluye la v1.6.');
      }
      if(!Number.isFinite(r.estimatedMinutes)||r.estimatedMinutes<=0){
        throw new Error('El backend ha devuelto un tiempo no válido. Revisa los logs de la API.');
      }
      setPrediction(r);
    }catch(e){
      const reason=e instanceof Error?e.message:'No se pudo realizar la predicción.';
      if(mode==='competicion'&&previewMark){
        // Respaldo sin comunicación externa: la proyección Riegel depende solo de la marca ya cargada.
        // Se presenta explícitamente como referencia matemática, no como predicción ML actual.
        const minutes=previewMark.durationMinutes*Math.pow(distanceKm/previewMark.distanceKm,1.06);
        const ageDays=Math.round((new Date(`${date}T00:00:00Z`).getTime()-new Date(`${previewMark.date}T00:00:00Z`).getTime())/86400000);
        setPrediction({mode:'competicion',projectionKind:'historical_riegel_local_fallback',sport:'Carrera',
          estimatedMinutes:Math.round(minutes*10)/10,baselineMinutes:null,modelTestMAEMinutes:null,
          historyActivities:comparableMarks.length,
          label:'Proyección histórica local calculada con una competición confirmada',
          reference:{name:previewMark.name,date:previewMark.date,distanceKm:previewMark.distanceKm,
            durationMinutes:previewMark.durationMinutes,ascentM:previewMark.ascentM},
          caveat:`Proyección matemática local basada en una marca de hace ${ageDays} días. No estima la forma física actual ni ajusta el terreno, el desnivel o el entrenamiento reciente.`});
        setPredictionError(`La API no ha confirmado la proyección (${reason}). Se muestra una referencia matemática calculada en el navegador con la marca guardada; revisa el backend antes de publicarla.`);
      }else{
        setPredictionError(reason);
      }
    }
    finally{setBusy(false)}
  }
  async function inspectManualHistory(){
    setBusy(true);setError('');
    try{
      setHistoryDiagnostics(await api<HistoryDiagnostics>('/ml/history-diagnostics'));
    }catch(e){setError(e instanceof Error?e.message:'No se pudo consultar el origen de las actividades.')}
    finally{setBusy(false)}
  }
  async function syncManualHistory(){
    if(!consent){setError('Marca primero la autorización de uso de archivos importados.');return;}
    setBusy(true);setError('');setMessage('');
    try{
      const result=await api<ManualSyncResult>('/ml/sync-imported',{
        method:'POST',headers:{'X-ML-User-File-Consent':'true'}
      });
      await refresh();
      setHistoryDiagnostics(await api<HistoryDiagnostics>('/ml/history-diagnostics'));
      setMessage(`Actividades añadidas desde archivos de Mis actividades: ${result.added}. Ya existentes: ${result.duplicates}. Equivalentes a FIT: ${result.skippedFitEquivalent}. Las nuevas están desmarcadas; selecciona cuáles usar en cada modalidad.`);
      if(result.report.total===0)setMessage('No hay actividades importadas manualmente en Mis actividades. Si ahí estás viendo datos de la API, importa primero el CSV/ZIP original como archivo; no utilizamos datos de la API para IA.');
    }catch(e){setError(e instanceof Error?e.message:'No se pudo incorporar el historial manual.')}
    finally{setBusy(false)}
  }
  async function clear(){
    if(!window.confirm('¿Borrar todas las carreras utilizadas en el Laboratorio IA (FIT y ZIP/CSV)? No afecta al historial habitual ni a tu cuenta.'))return;
    setBusy(true);setError('');setPrediction(null);setPredictionError('');
    try{await api('/ml/owned-history',{method:'DELETE'});await refresh();setPreviewRows([]);setArchiveCsv('');setFiles([]);setMessage('Historial de IA eliminado.')}catch(e){setError(e instanceof Error?e.message:'Error al borrar historial')}finally{setBusy(false)}
  }
  if(loading)return <div className="loading-screen"><span className="loader"/> Abriendo el laboratorio de IA…</div>;
  if(!user)return <div className="loading-screen"><p>{error||'Inicia sesión para continuar'}</p><Link to="/" className="primary-btn">Volver</Link></div>;
  return <div className="app-shell">
    <Sidebar user={user} logout={()=>void logout()} deleteAccount={()=>void deleteAccount()} open={menuOpen} close={()=>setMenuOpen(false)}/>
    <main className="dashboard-main">
      <header className="dashboard-topbar"><div className="mobile-only"><button className="icon-btn" onClick={()=>setMenuOpen(true)} aria-label="Abrir menú"><Menu size={24}/></button></div>
        <span className="breadcrumb">Mi espacio <ChevronRight size={15}/><strong>Laboratorio IA</strong></span>
        <div className="topbar-actions"><span className="today-label"><Leaf size={16}/> Tu progreso, a tu ritmo</span><div className="small-avatar">{user.name.slice(0,1).toUpperCase()}</div></div>
      </header>
      <div className="dashboard-content">
        <div className="intro-heading"><div><span className="eyebrow">RACESTRATEGY · MODELO PREDICTIVO v1</span><h1>Laboratorio IA</h1><p>Selecciona tu modalidad y utiliza el historial adecuado para cada ruta.</p></div><Link to="/perfil" className="refresh-btn"><Activity size={16}/> Perfil deportivo</Link></div>
        <section className="ml-hero"><div><span className="hero-pill"><BrainCircuit size={15}/> MACHINE LEARNING</span><h2>¿Cuánto tardarías en tu próxima ruta?</h2><p>Carrera: modelo de FitRec para rodajes y referencia histórica para competición. Bicicleta, MTB y Senderismo: estimaciones estadísticas de actividades comparables, todavía sin modelo ML entrenado.</p></div><span className="ml-hero-emblem"><Footprints size={63}/></span></section>
        <div className="ml-sport-tabs" role="group" aria-label="Modalidad del Laboratorio IA">{SPORT_OPTIONS.map(s=><button type="button" key={s} className={sport===s?'active':''} onClick={()=>{setSport(s);setPrediction(null);setPredictionError('');setMode('rodaje')}}>{s}</button>)}</div>
        {error&&<div className="info-banner error" role="alert">{error}</div>}
        {message&&<div className="ml-success" role="status">{message}</div>}
        <div className="ml-grid">
          <section className="data-panel ml-upload"><span className="eyebrow">PASO 01 · TU HISTORIAL</span><h3>Elige qué entrenamientos analizar</h3>
            <p>Importa un ZIP de Strava una sola vez: reconoceremos las actividades de <strong>Carrera, Bicicleta, MTB y Senderismo</strong>. Cambia de modalidad arriba para decidir cuáles utilizar. Puedes excluir calentamientos y sesiones atípicas sin borrarlas.</p>
            <label className="ml-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>Confirmo que tengo derecho a analizar estos archivos y autorizo guardar las métricas seleccionadas para realizar predicciones. Son archivos aportados manualmente, no datos obtenidos mediante la API de Strava.</span></label>
            <label className="ml-drop"><FileUp size={27}/><strong>{files.length===1?files[0].name:files.length>1?`${files.length} FIT seleccionados`:'Seleccionar ZIP de Strava'}</strong><span>También admite activities.csv o FIT/FIT.GZ individuales</span><input type="file" accept=".zip,.csv,.fit,.gz" multiple onChange={e=>{const chosen=Array.from(e.target.files??[]);e.target.value='';void chooseFiles(chosen)}}/></label>
            <p className="ml-upload-hint">Importamos solo el CSV de actividades y no enviamos GPS ni pulsaciones. Las categorías sugeridas se basan en el nombre; las competiciones de Carrera deben confirmarse manualmente.</p>
            <div className="ml-profile-note"><ShieldCheck size={19}/><span><strong>¿Ya aparecen actividades en Mis actividades?</strong> Si proceden de un archivo que importaste, puedes incorporarlas aquí sin subir el ZIP otra vez. No se incluyen automáticamente en las predicciones.</span></div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap',margin:'12px 0'}}>
              <button type="button" className="primary-btn ml-btn" disabled={busy||!consent} onClick={()=>void syncManualHistory()}><FileUp size={17}/> Incorporar desde Mis actividades</button>
              <button type="button" className="ml-clear" disabled={busy} onClick={()=>void inspectManualHistory()}>Ver recuentos y descartes</button>
            </div>
            {historyDiagnostics&&<div className="ml-import-report" role="status"><strong>Comparación de historiales (solo archivos manuales)</strong>
              <span>Registros en Mis actividades: {historyDiagnostics.manualTotal} · Guardados en Laboratorio IA: {historyDiagnostics.labTotal} · Modalidades desconocidas: {historyDiagnostics.manualUnrecognized}</span>
              {SPORT_OPTIONS.map(s=><span key={s}><b>{s}</b>: archivo {historyDiagnostics.bySport[s].manualFound}; aptas {historyDiagnostics.bySport[s].manualEligible}; descartadas {historyDiagnostics.bySport[s].manualExcluded}; guardadas para IA {historyDiagnostics.bySport[s].labStored}; válidas para Rating {historyDiagnostics.bySport[s].ratingValid}</span>)}
              <small>{historyDiagnostics.explanation}</small>
            </div>}
            {files.some(f=>/\.(?:zip|csv)$/i.test(f.name))&&!archiveCsv&&<button className="primary-btn ml-btn" disabled={!consent||busy||files.length!==1} onClick={()=>void prepareArchive(files[0])}><Footprints size={17}/> Ver actividades del ZIP</button>}
            {!files.some(f=>/\.(?:zip|csv)$/i.test(f.name))&&files.length>0&&<button className="primary-btn ml-btn" disabled={!consent||busy} onClick={()=>void upload()}><FileUp size={17}/>{busy?'Importando…':'Importar FIT seleccionados'}</button>}
            {busy&&progress&&<p role="status" className="ml-upload-hint">{progress}</p>}
            {archiveReport&&<div className="ml-import-report" role="status"><strong>Importación completada</strong><span>Actividades válidas: {archiveReport.eligibleTotal??archiveReport.eligibleRunning} · Nuevas: {archiveReport.added} · Ya existentes: {archiveReport.duplicates}</span><span>Otros deportes ignorados: {archiveReport.ignoredOtherSports}</span><small>{archiveReport.count} actividades guardadas · {archiveReport.selectedCount} incluidas para IA.</small></div>}
          </section>
          <section className="data-panel ml-summary"><span className="eyebrow">TU PERFIL · DATOS DISPONIBLES</span><h3>Historial de {sport}</h3>
            <div className="ml-metrics"><div><Footprints size={18}/><strong>{profile?.selectedCount??0} / {profile?.count??0}</strong><small>elegidas / importadas</small></div><div><Gauge size={18}/><strong>{fmt(profile?.totalKm??0)} km</strong><small>kilómetros seleccionados</small></div><div><Clock3 size={18}/><strong>{sport==='Carrera'?pace(profile?.medianPaceMinPerKm??null):profile?.medianSpeedKmH!=null?`${fmt(profile.medianSpeedKmH,1)} km/h`:'—'}</strong><small>{sport==='Carrera'?'ritmo mediano':'velocidad mediana'}</small></div><div><Mountain size={18}/><strong>{profile?.longestKm?`${fmt(profile.longestKm)} km`:'—'}</strong><small>mayor distancia</small></div></div>
            <div className="ml-profile-note"><ShieldCheck size={19}/><span>{profile?.modelReady?'Selección suficiente para una primera predicción experimental.':`Marca al menos ${sport==='Carrera'?5:3} actividades válidas de ${sport} en 2 días distintos, anteriores a la ruta objetivo.`}</span></div>
            {!!profile?.count&&<button className="ml-clear" disabled={busy} onClick={()=>void clear()}><Trash2 size={15}/> Borrar historial de IA</button>}
          </section>
        </div>
            {!!previewRows.length&&<section className="data-panel ml-preview-box"><MLActivityPicker key={`preview-${sport}`} items={previewRows.filter(x=>x.sport===sport)} selectedIds={previewSelected} busy={busy} onSelection={updatePreviewSelection} onTypeChange={updatePreviewType} kind="preview"/>
              <div className="ml-preview-save"><span><strong>{previewSelected.size}</strong> actividades seleccionadas entre todas las modalidades. Revisa cada pestaña antes de guardarlas.</span>
                <button className="primary-btn ml-btn" disabled={busy} onClick={()=>void upload()}><FileUp size={17}/> Guardar actividades y selección</button>
              </div></section>}
                {!!stored.length&&<section className="data-panel ml-saved-runs"><div className="panel-header"><div><span className="eyebrow">PASO 02 · SELECCIÓN PERMANENTE</span><h3>Mis actividades de {sport} para la IA</h3></div><Footprints size={24}/></div>
          <MLActivityPicker key={`saved-${sport}`} items={stored.filter(x=>x.sport===sport)} selectedIds={new Set(stored.filter(x=>x.selected).map(x=>x.id))} busy={busy} kind="saved" onSelection={(ids,selected)=>void updateStoredSelection(ids,selected)} onTypeChange={(ids,type)=>void updateStoredType(ids,type)}/>
        </section>}
        <p className="ml-phase-note">{sport==='Carrera'?'Para Rodaje usamos el modelo experimental de FitRec; para Competición, una proyección matemática de una marca confirmada. Ninguno garantiza tu tiempo real.':`Para ${sport} usamos únicamente salidas comparables de tu historial seleccionado: referencia estadística personal, no modelo ML entrenado. No se mezcla con Carrera ni otras modalidades.`}</p>
        <section className="data-panel ml-predict"><div className="panel-header"><div><span className="eyebrow">PASO 03 · TU PRÓXIMA RUTA</span><h3>Calcula tu tiempo estimado</h3></div><BrainCircuit size={25}/></div>
          <div className="ml-form"><label>Objetivo de la ruta<select value={mode} onChange={e=>{setMode(e.target.value as 'rodaje'|'competicion');setPrediction(null);setPredictionError('');}}><option value="rodaje">Rodaje / entrenamiento</option>{sport==='Carrera'&&<option value="competicion">Competición / intentar marca</option>}</select></label><label>Distancia (km)<input type="number" min="0.5" step="0.1" value={distance} onChange={e=>{setDistance(e.target.value);setPrediction(null);setPredictionError('')}}/></label><label>Desnivel positivo (m)<input type="number" min="0" step="5" value={ascent} onChange={e=>{setAscent(e.target.value);setPrediction(null);setPredictionError('')}}/></label><label>Desnivel negativo (m)<input type="number" min="0" step="5" value={descent} onChange={e=>{setDescent(e.target.value);setPrediction(null);setPredictionError('')}}/></label><label>Fecha de la ruta<input type="date" value={date} onChange={e=>{setDate(e.target.value);setPrediction(null);setPredictionError('')}}/></label></div>
          <p className="ml-upload-hint">{sport!=='Carrera'?`Referencia de ${sport} mediante el tiempo mediano extrapolado de al menos tres salidas similares anteriores, con distancia comparable. No es ML ni ajusta científicamente el desnivel.`:mode==='competicion'?'Se proyectará una competición confirmada y anterior a la ruta mediante Riegel: referencia histórica, no predicción ML actual.':'El modelo v1 estima una actividad habitual de Carrera, no una marca competitiva. Mezcla todavía tipos de sesión.'}</p>
          {mode==='competicion'&&<div className="ml-profile-note" role="status" style={{marginBottom:12}}>
            <ShieldCheck size={19}/>
            <span>{previewMark
              ?<>Marca válida encontrada: <strong>{previewMark.name}</strong> ({previewMark.date}), {fmt(previewMark.distanceKm,2)} km en {clock(previewMark.durationMinutes)}. Se utilizará para proyectar tu marca histórica.</>
              :confirmedMarks.length
                ?`Hay ${confirmedMarks.length} competiciones confirmadas, pero ninguna es comparable y anterior a la fecha objetivo. Revisa distancia y fecha.`
                :'No hay competiciones incluidas y confirmadas manualmente para proyectar. Marca alguna como «Competición» en tu historial.'}</span>
          </div>}
          <button type="button" className="primary-btn ml-btn" disabled={busy||(mode==='rodaje'&&!profile?.modelReady)} onClick={()=>void predict()}><BrainCircuit size={17}/>{busy?'Calculando…':mode==='competicion'?'Proyectar desde mis marcas':sport==='Carrera'?'Estimar tiempo de rodaje':'Estimar según mis salidas'}<ArrowRight size={17}/></button>
          {predictionError&&<div className="info-banner error" role="alert" style={{marginTop:12}}><strong>{prediction?.projectionKind==='historical_riegel_local_fallback'?'Proyección calculada localmente: ':'No se ha podido calcular: '}</strong>{predictionError}</div>}
          {prediction&&<div className="ml-result"><div><span className="eyebrow">{prediction.mode==='competicion'?'PROYECCIÓN DE MARCA HISTÓRICA':prediction.projectionKind==='similar_activities_statistical'?'REFERENCIA ESTADÍSTICA · NO ML':'ESTIMACIÓN DE ENTRENAMIENTO · ML v1'}</span><strong>{clock(prediction.estimatedMinutes)}</strong><p>{prediction.mode==='competicion'&&prediction.reference?`Referencia: ${prediction.reference.name}, ${prediction.reference.date} · ${fmt(prediction.reference.distanceKm,2)} km en ${clock(prediction.reference.durationMinutes)}.`:`Para ${fmt(Number(distance))} km. Referencia de ritmo histórico: ${prediction.baselineMinutes!==null?clock(prediction.baselineMinutes):'—'}.`}</p></div><div className="ml-result-side"><TrendingUp size={25}/><strong>{prediction.mode==='competicion'?'Referencia de competición':'Historial seleccionado'}</strong><span>{prediction.mode==='competicion'?'No ajustada por forma actual':`${prediction.historyActivities} actividades de ${sport} anteriores a la ruta`}</span></div></div>}
          {prediction&&<p className="ml-disclaimer">{prediction.caveat}{prediction.mode==='rodaje'&&prediction.projectionKind==='ml_training_v1'&&prediction.modelTestMAEMinutes!==null?` Error medio en actividades FitRec: ${fmt(prediction.modelTestMAEMinutes,2)} min; no equivale a un intervalo de confianza.`:''}</p>}
        </section>
        <div className="ml-info"><ShieldCheck size={18}/><p>La estimación usa solo actividades seleccionadas de la modalidad elegida y anteriores a la fecha objetivo. Las excluidas permanecen guardadas. Solo analizamos archivos aportados voluntariamente (ZIP/CSV descargado o FIT original), nunca datos obtenidos por API de Strava. Para Carrera existe un modelo experimental; para los demás deportes solo hay referencias estadísticas. Las predicciones requieren validación. SQLite en Render Free sin disco puede perder estos datos en reinicios.</p></div>
        <footer className="dashboard-footer"><span>RaceEstrategy · Laboratorio por modalidad</span><span>Predicción experimental · Ficha deportiva en Perfil</span></footer>
      </div>
    </main>
  </div>;
}
