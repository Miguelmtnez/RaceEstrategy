import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowRight, BrainCircuit, ChevronRight, Clock3, FileUp, Footprints, Gauge, Leaf, Menu, Mountain, ShieldCheck, Trash2, TrendingUp } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type User } from '../lib/api';
import { extractStravaCSV } from '../lib/importStrava';
import { Sidebar } from '../components/Sidebar';
import MLActivityPicker, { type MlActivity } from '../components/MLActivityPicker';

type MlProfile = {
  count:number;totalKm:number;medianPaceMinPerKm:number|null;longestKm:number|null;
  firstActivity:string|null;lastActivity:string|null;distinctDays:number;
  modelReady:boolean;provenance:string;description:string;selectedCount:number;excludedCount:number;
};
type MlPrediction = {sport:string;estimatedMinutes:number;baselineMinutes:number;historyActivities:number;
  modelTestMAEMinutes:number;historyLastDate:string|null;label:string;caveat:string};
type FitResult={ok:boolean;alreadyImported:boolean;date:string;distanceKm:number;count:number};
type ArchiveResult={ok:boolean;sourceRows:number;selectedRunning:number;eligibleRunning:number;selectedCount:number;
  invalidRunning:number;ignoredOtherSports:number;invalidIdOrDateOrDuplicate:number;
  added:number;duplicates:number;count:number;notice:string};
type MlStored={items:MlActivity[];total:number;selected:number;limit:number};
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
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [consent,setConsent]=useState(false);
  const [files,setFiles]=useState<File[]>([]);
  const [progress,setProgress]=useState('');
  const [archiveReport,setArchiveReport]=useState<ArchiveResult|null>(null);
  const [stored,setStored]=useState<MlActivity[]>([]);
  const [previewRows,setPreviewRows]=useState<MlActivity[]>([]);
  const [previewSelected,setPreviewSelected]=useState<Set<string>>(new Set());
  const [archiveCsv,setArchiveCsv]=useState('');
  const requestToken=useRef(0);
  const [distance,setDistance]=useState('10');
  const [ascent,setAscent]=useState('100');
  const [descent,setDescent]=useState('100');
  const [date,setDate]=useState(nextDate);
  const [prediction,setPrediction]=useState<MlPrediction|null>(null);

  const refresh=async()=>{
    const [p,activities]=await Promise.all([api<MlProfile>('/ml/owned-profile'),api<MlStored>('/ml/owned-activities')]);
    setProfile(p);setStored(activities.items);
  };
  const updateStoredSelection=async(ids:string[],selected:boolean)=>{
    if(!ids.length)return;
    setBusy(true);setError('');setPrediction(null);
    try{
      await api('/ml/owned-selection',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({ids,selected})});
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar la selección.');}
    finally{setBusy(false)}
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
    setBusy(false);setProgress('');setFiles(selectedFiles);setArchiveCsv('');setPreviewRows([]);setPreviewSelected(new Set());
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
      setPreviewSelected(new Set(items.filter(x=>x.selected).map(x=>x.id)));
      setMessage(`${r.selectedRunning} carreras detectadas; ${r.eligibleRunning} tienen métricas válidas. Selecciona las que quieres usar para IA y guarda.`);
    }catch(e){if(token===requestToken.current)setError(e instanceof Error?e.message:'Error al preparar el ZIP.');}
    finally{if(token===requestToken.current){setBusy(false);setProgress('')}}
  }
  useEffect(()=>{
    let alive=true;
    Promise.all([api<{user:User}>('/auth/me'),api<MlProfile>('/ml/owned-profile'),api<MlStored>('/ml/owned-activities')])
      .then(([auth,data,activities])=>{if(alive){setUser(auth.user);setProfile(data);setStored(activities.items)}})
      .catch(e=>{if(alive){const text=e instanceof Error?e.message:'Error de conexión';if(/sesión|inicia sesión/i.test(text))navigate('/',{replace:true});else setError(text)}})
      .finally(()=>{if(alive)setLoading(false)});
    return ()=>{alive=false};
  },[navigate]);
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
          body:JSON.stringify({csv:archiveCsv,selectedIds:[...previewSelected]})
        });
        setArchiveReport(r);
        setMessage(`Importadas: ${r.added}. Ya existentes: ${r.duplicates}. Seleccionadas para IA: ${r.selectedCount}. Puedes modificarlo en la lista de abajo.`);
        setPreviewRows([]);setPreviewSelected(new Set());setArchiveCsv('');
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
    setError('');setMessage('');setPrediction(null);
    const distanceKm=Number(distance),ascentM=Number(ascent),descentM=Number(descent);
    if(!Number.isFinite(distanceKm)||distanceKm<.5||!Number.isFinite(ascentM)||ascentM<0||!Number.isFinite(descentM)||descentM<0) {setError('Introduce una ruta válida.');return}
    setBusy(true);
    try{
      const r=await api<MlPrediction>('/ml/predict-owned',{method:'POST',body:JSON.stringify({route:{date,distanceKm,ascentM,descentM}})});
      setPrediction(r);
    }catch(e){setError(e instanceof Error?e.message:'No se pudo realizar la predicción.')}finally{setBusy(false)}
  }
  async function clear(){
    if(!window.confirm('¿Borrar todas las carreras utilizadas en el Laboratorio IA (FIT y ZIP/CSV)? No afecta al historial habitual ni a tu cuenta.'))return;
    setBusy(true);setError('');setPrediction(null);
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
        <div className="intro-heading"><div><span className="eyebrow">RACESTRATEGY · MODELO PREDICTIVO v1</span><h1>Laboratorio IA</h1><p>Tu historial de carrera, transformado en una estimación personalizada.</p></div><Link to="/perfil" className="refresh-btn"><Activity size={16}/> Perfil deportivo</Link></div>
        <section className="ml-hero"><div><span className="hero-pill"><BrainCircuit size={15}/> MACHINE LEARNING</span><h2>¿Cuánto tardarías en tu próxima ruta?</h2><p>El modelo aprende de los entrenamientos de FitRec y adapta sus estimaciones a tu historial independiente de carrera.</p></div><span className="ml-hero-emblem"><Footprints size={63}/></span></section>
        {error&&<div className="info-banner error" role="alert">{error}</div>}
        {message&&<div className="ml-success" role="status">{message}</div>}
        <div className="ml-grid">
          <section className="data-panel ml-upload"><span className="eyebrow">PASO 01 · TU HISTORIAL</span><h3>Elige qué entrenamientos analizar</h3>
            <p>Importa tu ZIP de Strava. Verás <strong>todas las carreras con datos válidos</strong> y podrás excluir calentamientos, recuperaciones u otras sesiones que no representen tu rendimiento. No se eliminan: podrás activarlas después.</p>
            <label className="ml-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>Confirmo que tengo derecho a analizar estos archivos y autorizo guardar las métricas seleccionadas para realizar predicciones. Son archivos aportados manualmente, no datos obtenidos mediante la API de Strava.</span></label>
            <label className="ml-drop"><FileUp size={27}/><strong>{files.length===1?files[0].name:files.length>1?`${files.length} FIT seleccionados`:'Seleccionar ZIP de Strava'}</strong><span>También admite activities.csv o FIT/FIT.GZ individuales</span><input type="file" accept=".zip,.csv,.fit,.gz" multiple onChange={e=>{const chosen=Array.from(e.target.files??[]);e.target.value='';void chooseFiles(chosen)}}/></label>
            <p className="ml-upload-hint">Para el ZIP se lee solo activities.csv. Las carreras se muestran antes de guardarlas. No se envían imágenes, recorridos GPS ni pulsaciones.</p>
            {files.some(f=>/\.(?:zip|csv)$/i.test(f.name))&&!archiveCsv&&<button className="primary-btn ml-btn" disabled={!consent||busy||files.length!==1} onClick={()=>void prepareArchive(files[0])}><Footprints size={17}/> Ver carreras del ZIP</button>}
            {!files.some(f=>/\.(?:zip|csv)$/i.test(f.name))&&files.length>0&&<button className="primary-btn ml-btn" disabled={!consent||busy} onClick={()=>void upload()}><FileUp size={17}/>{busy?'Importando…':'Importar FIT seleccionados'}</button>}
            {busy&&progress&&<p role="status" className="ml-upload-hint">{progress}</p>}
            {archiveReport&&<div className="ml-import-report" role="status"><strong>Importación completada</strong><span>Carreras detectadas: {archiveReport.selectedRunning} · Nuevas: {archiveReport.added} · Ya existentes: {archiveReport.duplicates}</span><span>Otros deportes ignorados: {archiveReport.ignoredOtherSports} · Sin datos válidos: {archiveReport.invalidRunning}</span><small>{archiveReport.count} carreras guardadas · {archiveReport.selectedCount} incluidas para IA.</small></div>}
          </section>
          <section className="data-panel ml-summary"><span className="eyebrow">TU PERFIL · DATOS DISPONIBLES</span><h3>Historial de Carrera</h3>
            <div className="ml-metrics"><div><Footprints size={18}/><strong>{profile?.selectedCount??0} / {profile?.count??0}</strong><small>elegidas / importadas</small></div><div><Gauge size={18}/><strong>{fmt(profile?.totalKm??0)} km</strong><small>kilómetros seleccionados</small></div><div><Clock3 size={18}/><strong>{pace(profile?.medianPaceMinPerKm??null)}</strong><small>ritmo mediano</small></div><div><Mountain size={18}/><strong>{profile?.longestKm?`${fmt(profile.longestKm)} km`:'—'}</strong><small>mayor distancia</small></div></div>
            <div className="ml-profile-note"><ShieldCheck size={19}/><span>{profile?.modelReady?'Selección suficiente para una primera predicción experimental.':'Marca al menos 5 carreras válidas de al menos 2 días distintos y anteriores a la ruta objetivo.'}</span></div>
            {!!profile?.count&&<button className="ml-clear" disabled={busy} onClick={()=>void clear()}><Trash2 size={15}/> Borrar historial de IA</button>}
          </section>
        </div>
            {!!previewRows.length&&<section className="data-panel ml-preview-box"><MLActivityPicker items={previewRows} selectedIds={previewSelected} busy={busy} onSelection={updatePreviewSelection} kind="preview"/>
              <div className="ml-preview-save"><span><strong>{previewSelected.size}</strong> carreras participarán en las predicciones. {previewSelected.size<5?'Necesitas al menos 5 seleccionadas en fechas anteriores a la ruta objetivo.':''}</span>
                <button className="primary-btn ml-btn" disabled={busy} onClick={()=>void upload()}><FileUp size={17}/> Guardar carreras y selección</button>
              </div></section>}
                {!!stored.length&&<section className="data-panel ml-saved-runs"><div className="panel-header"><div><span className="eyebrow">PASO 02 · SELECCIÓN PERMANENTE</span><h3>Mis carreras para la IA</h3></div><Footprints size={24}/></div>
          <MLActivityPicker items={stored} selectedIds={new Set(stored.filter(x=>x.selected).map(x=>x.id))} busy={busy} kind="saved" onSelection={(ids,selected)=>void updateStoredSelection(ids,selected)}/>
        </section>}
        <section className="data-panel ml-predict"><div className="panel-header"><div><span className="eyebrow">PASO 03 · TU PRÓXIMA RUTA</span><h3>Calcula tu tiempo estimado</h3></div><BrainCircuit size={25}/></div>
          <div className="ml-form"><label>Distancia (km)<input type="number" min="0.5" step="0.1" value={distance} onChange={e=>setDistance(e.target.value)}/></label><label>Desnivel positivo (m)<input type="number" min="0" step="5" value={ascent} onChange={e=>setAscent(e.target.value)}/></label><label>Desnivel negativo (m)<input type="number" min="0" step="5" value={descent} onChange={e=>setDescent(e.target.value)}/></label><label>Fecha de la ruta<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div>
          <button className="primary-btn ml-btn" disabled={busy||!profile?.modelReady} onClick={()=>void predict()}><BrainCircuit size={17}/>{busy?'Calculando…':'Predecir rendimiento'}<ArrowRight size={17}/></button>
          {prediction&&<div className="ml-result"><div><span className="eyebrow">PREDICCIÓN PARA CARRERA</span><strong>{clock(prediction.estimatedMinutes)}</strong><p>Tiempo calculado para {fmt(Number(distance))} km. Baseline de ritmo histórico: {clock(prediction.baselineMinutes)}.</p></div><div className="ml-result-side"><TrendingUp size={25}/><strong>{prediction.historyActivities} carreras elegidas</strong><span>seleccionadas y anteriores a esta ruta</span></div></div>}
          {prediction&&<p className="ml-disclaimer">MAE de prueba en FitRec: {fmt(prediction.modelTestMAEMinutes,2)} min de promedio; no es un margen garantizado para tu ruta. No mide condición clínica ni predice lo que ocurrirá exactamente en el terreno.</p>}
        </section>
        <div className="ml-info"><ShieldCheck size={18}/><p>Solo usamos para IA las actividades que hayas marcado y que sean anteriores a la fecha de la ruta objetivo. Los calentamientos excluidos siguen guardados, pero no influyen en el cálculo. Solo utilizamos para IA datos que subes voluntariamente aquí (ZIP/CSV de exportación manual o FIT originales). No consultamos ni mezclamos las actividades obtenidas mediante la API de Strava. Las predicciones son experimentales y requieren pruebas con usuarios reales. La base SQLite de Render Free sin disco persistente puede perder estos datos al reiniciarse.</p></div>
        <footer className="dashboard-footer"><span>RaceEstrategy · IA experimental para Carrera</span><span>Predicción de tiempo · Ficha FIFA en desarrollo</span></footer>
      </div>
    </main>
  </div>;
}
