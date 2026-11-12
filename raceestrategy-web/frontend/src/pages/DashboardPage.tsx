import { useCallback, useEffect, useState, useRef, type ReactNode } from 'react';
import { Activity, FileUp, FolderOpen, Trash2, ArrowDownRight, ArrowRight, ArrowUpRight, Bike, CalendarDays, Check, ChevronRight, Clock3, ExternalLink, Footprints, HeartPulse, Link2, MapPinned, Menu, Mountain, RefreshCcw, ShieldCheck, TrendingUp, Unplug } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, confirmAndDeleteAccount, Overview, StravaStatus, ImportStatus, ImportResult, User } from '../lib/api';
import { extractStravaCSV } from '../lib/importStrava';
import { importHeartZip } from '../lib/importHeartZip';
import { Landscape } from '../components/Brand';
import { Sidebar } from '../components/Sidebar';

const COLORS = ['#2c806a', '#91c3a4', '#d7af74', '#cbd9d3'];
const formatNumber = (n: number, digits = 0) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits }).format(n);
const sportIcon = (sport: string) => sport === 'Carrera' ? <Footprints size={20}/> : sport === 'Ciclismo' ? <Bike size={20}/> : <Mountain size={20}/>;

function demoOverview(): Overview {
  const now = new Date();
  const monthly = Array.from({length:6}, (_,i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5-i), 1);
    return { label: new Intl.DateTimeFormat('es-ES',{month:'short'}).format(d).replace('.',''), key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, distanceKm: [67,92,78,128,110,146][i], activities: [8,11,9,14,13,17][i] };
  });
  return {
    athlete: { firstname: 'Alex', lastname: 'García', picture: null, stravaId: 0 },
    stats: { activities: 72, distanceKm: 621.4, movingHours: 87.6, elevationM: 5820 },
    bySport: [{ name:'Carrera',count: 45,distanceKm:307.4 },{ name:'Ciclismo',count:24,distanceKm:298.8 },{ name:'Senderismo',count:3,distanceKm:15.2 }],
    monthly, recent: [
      {id:'0',name:'Sendero del amanecer',sport:'Carrera',date:new Date(now.getFullYear(),now.getMonth(),now.getDate()-1).toISOString(),distanceKm:8.4,movingMinutes:43,elevationM:126,url:'#'},
      {id:'0',name:'Vuelta por la montaña',sport:'Ciclismo',date:new Date(now.getFullYear(),now.getMonth(),now.getDate()-3).toISOString(),distanceKm:42.7,movingMinutes:112,elevationM:580,url:'#'},
      {id:'0',name:'Rodaje suave',sport:'Carrera',date:new Date(now.getFullYear(),now.getMonth(),now.getDate()-5).toISOString(),distanceKm:6.1,movingMinutes:34,elevationM:42,url:'#'},
      {id:'0',name:'Ruta entre pinos',sport:'Senderismo',date:new Date(now.getFullYear(),now.getMonth(),now.getDate()-7).toISOString(),distanceKm:10.9,movingMinutes:156,elevationM:390,url:'#'}
    ], limited: false,sampleSize:72,syncedAt:now.toISOString(),cached:true
  };
}
const DEMO = demoOverview();

function Statistic({ icon, eyebrow, value, suffix, sub }: { icon: ReactNode; eyebrow: string; value: string; suffix: string; sub: string }) {
  return <div className="stat-card"><div className="stat-top"><span className="stat-icon">{icon}</span><span className="stat-spark"><TrendingUp size={15}/></span></div>
    <p className="stat-label">{eyebrow}</p><div className="stat-value">{value}<span>{suffix}</span></div><p className="stat-sub">{sub}</p></div>;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<StravaStatus | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);
  const [source, setSource] = useState<'api'|'import'|null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [importIssues, setImportIssues] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(false);
  const [error, setError] = useState('');
  const [demo, setDemo] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadOverview = useCallback(async (kind: 'api'|'import') => {
    setLoadingStats(true); setError(''); setOverview(null);
    try { setOverview(await api<Overview>(kind === 'api' ? '/strava/overview' : '/import/overview')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Error al recuperar estadísticas.'); }
    finally { setLoadingStats(false); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const me = await api<{user:User}>('/auth/me');
        const [currentStatus, imported] = await Promise.all([api<StravaStatus>('/strava/status'), api<ImportStatus>('/import/status')]);
        if (cancelled) return;
        setUser(me.user); setStatus(currentStatus); setImportStatus(imported);
        const initial = currentStatus.connected ? 'api' : imported.imported ? 'import' : null;
        setSource(initial);
        if (initial) await loadOverview(initial);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '';
        if (/sesión|inicia sesión/i.test(message)) navigate('/', {replace:true});
        else setError(message || 'No se pudo abrir el dashboard.');
      } finally { if (!cancelled) setLoading(false); }
    }
    void init();
    return () => { cancelled=true; };
  }, [navigate,loadOverview]);

  // El webhook invalida la caché en Render. Esta comprobación actualiza el panel abierto.
  useEffect(() => {
    if (!status?.connected || source !== 'api') return;
    let live=true;
    const poll=async () => {
      try {
        const latest=await api<StravaStatus>('/strava/status');
        if (!live) return;
        if (latest.lastEventAt && latest.lastEventAt !== status.lastEventAt) {
          setStatus(latest);
          await loadOverview('api');
        }
      } catch { /* reconexión cuando vuelva a estar accesible */ }
    };
    const interval=setInterval(()=>{void poll()},60000);
    return ()=>{live=false;clearInterval(interval)};
  },[status?.connected,status?.lastEventAt,source,loadOverview]);

  async function deleteAccount() {
    try { if (await confirmAndDeleteAccount()) navigate('/',{replace:true}); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo eliminar la cuenta.'); }
  }
  async function logout() {
    try { await api('/auth/logout', {method:'POST'}); navigate('/',{replace:true}); }
    catch (err) { setError(err instanceof Error ? err.message : 'Error al cerrar sesión.'); }
  }
  async function disconnect() {
    if (!window.confirm('¿Quieres revocar el acceso de RaceEstrategy a Strava? Tu cuenta de RaceEstrategy se conservará.')) return;
    setDisconnecting(true);setError('');
    try { await api('/strava/disconnect',{method:'DELETE'}); setStatus({connected:false,athleteId:null,scopes:null});
      const next=importStatus?.imported?'import':null;setSource(next);setOverview(null);setDemo(false);if(next) await loadOverview(next); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo desconectar.'); }
    finally {setDisconnecting(false);}
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    setImporting(true); setError(''); setImportMessage(''); setImportIssues(null);
    try {
      const csv = await extractStravaCSV(file);
      const result = await api<ImportResult>('/import/strava-csv', {method:'POST',headers:{'Content-Type':'text/csv'},body:csv});
      const updated = await api<ImportStatus>('/import/status');
      setImportStatus(updated);setSource('import');setDemo(false);
      setImportMessage(`Importadas ${result.count.toLocaleString('es-ES')} de ${result.sourceRows.toLocaleString('es-ES')} filas.${result.skipped ? ` ${result.skipped} omitidas; consulta los motivos abajo.` : ''}${result.noMetrics ? ` ${result.noMetrics} conservadas sin distancia ni tiempo disponibles.` : ''}${result.noMovingTime ? ` ${result.noMovingTime} sin tiempo en movimiento.` : ''}`);
      setImportIssues(result);
      await loadOverview('import');
      if(/\.zip$/i.test(file.name)) {
        try {
          const resultHR=await importHeartZip(file,csv,setImportMessage);
          setImportMessage(`Historial guardado: ${result.count} actividades. Pulsaciones recuperadas: ${resultHR.imported}. Sin pulsaciones: ${resultHR.noHeart}. No asociadas o demasiado grandes: ${resultHR.unmatched}. Errores: ${resultHR.errors}. Ya presentes: ${resultHR.already}.`);
        } catch(e) {
          setImportMessage(`Historial guardado (${result.count} actividades), pero no se completó la lectura de pulsaciones: ${e instanceof Error?e.message:'Error desconocido'}`);
        }
      }
    } catch(err) { setError(err instanceof Error ? err.message : 'No hemos podido importar el archivo.'); }
    finally { setImporting(false); if(fileInputRef.current) fileInputRef.current.value=''; }
  }
  async function removeImport() {
    if (!window.confirm('¿Eliminar las actividades importadas de RaceEstrategy? No elimina nada de Strava.')) return;
    try {
      await api('/import',{method:'DELETE'});
      setImportStatus({imported:false,count:0,updatedAt:null,skipped:0,noMovingTime:0});setImportMessage('Historial importado eliminado.');setImportIssues(null);
      const next = status?.connected ? 'api' : null;
      setSource(next);setOverview(null);if(next) await loadOverview(next);
    } catch(err) { setError(err instanceof Error ? err.message : 'No se pudo eliminar el historial.'); }
  }
  async function changeSource(next: 'api'|'import') {
    if (next===source) return;
    setSource(next);setDemo(false);await loadOverview(next);
  }
  const visible = source ? overview : demo ? DEMO : null;
  const showingDemo = !source && demo;
  const firstName = user?.name.trim().split(' ')[0] || 'deportista';
  const greeting = new Date().getHours() < 12 ? 'Buenos días' : new Date().getHours() < 20 ? 'Buenas tardes' : 'Buenas noches';
  if (loading) return (
    <main className="dashboard-loading" role="status" aria-live="polite">
      <section className="dashboard-loading-card">
        <div className="dashboard-loading-brand" aria-label="RaceEstrategy">
          <span className="dashboard-loading-brand-icon"><Mountain size={21} strokeWidth={2.3}/></span>
          <span>race<span>estrategy</span><i>.</i></span>
        </div>
        <div className="dashboard-loading-art" aria-hidden="true">
          <span className="dashboard-loading-orbit dashboard-loading-orbit-outer"/>
          <span className="dashboard-loading-orbit dashboard-loading-orbit-inner"/>
          <span className="dashboard-loading-mountain"><Mountain size={34} strokeWidth={1.7}/></span>
        </div>
        <span className="dashboard-loading-eyebrow">TU ESPACIO DEPORTIVO</span>
        <h1>Preparando tu resumen</h1>
        <p>Estamos organizando tu espacio y tus actividades deportivas.</p>
        <div className="dashboard-loading-message">
          <span className="loader" aria-hidden="true"/>
          <span>Cargando tus datos…</span>
        </div>
        <div className="dashboard-loading-progress" aria-hidden="true"><span/></div>
      </section>
      <p className="dashboard-loading-footer">Un pequeño paso cada día te lleva a sitios increíbles.</p>
    </main>
  );
  if (!user) return <main className="loading-screen"><p>{error || 'No se pudo cargar tu perfil.'}</p><button className="primary-btn" onClick={()=>navigate('/')}>Volver a entrar</button></main>;

  return <div className="app-shell">
    <Sidebar user={user} logout={logout} deleteAccount={deleteAccount} open={menuOpen} close={()=>setMenuOpen(false)}/>
    <main className="dashboard-main">
      <header className="dashboard-topbar"><div className="mobile-only"><button aria-label="Abrir menú" className="icon-btn" onClick={()=>setMenuOpen(true)}><Menu size={24}/></button></div>
        <span className="breadcrumb">Mi espacio <ChevronRight size={15}/> <strong>Resumen</strong></span>
        <div className="topbar-actions"><span className="today-label"><CalendarDays size={17}/> {new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'long',year:'numeric'}).format(new Date())}</span><div className="small-avatar">{firstName.slice(0,1).toUpperCase()}</div></div>
      </header>
      <div className="dashboard-content">
        <div className="intro-heading"><div><span className="eyebrow">TU ESPACIO DEPORTIVO <span className="tiny-dot"/></span><h1>{greeting}, {firstName} <span className="wave">✳</span></h1><p>Un pequeño paso cada día te lleva a sitios increíbles.</p></div>
          {source && <button className="refresh-btn" onClick={()=>void loadOverview(source)} disabled={loadingStats}><RefreshCcw size={17} className={loadingStats?'spin':''}/> Actualizar datos</button>}
        </div>
        <section className="hero-banner"><div className="hero-copy"><span className="hero-pill"><span className="tiny-dot"/> EL MEJOR MOMENTO ES HOY</span><h2>Tu siguiente aventura<br/><em>empieza contigo.</em></h2><p>Conecta, descubre y celebra cada kilómetro de tu camino.</p></div><Landscape className="hero-landscape"/></section>
        {params.get('strava_connected') && <div className="info-banner success"><Check size={19}/> ¡Tu cuenta de Strava se ha conectado correctamente!</div>}
        {params.get('strava_error') && <div className="info-banner error" role="alert">{params.get('strava_error')}</div>}
        {error && <div className="info-banner error" role="alert">{error}</div>}
        {!status?.connected && <div className="connection-card"><div className="connection-icon"><Link2 size={23}/></div><div className="connection-copy"><h3>Conecta tu actividad, descubre tu progreso.</h3><p>Autoriza la lectura de tus actividades en Strava para ver tus kilómetros, desnivel, entrenamientos y evolución. Tus datos solo se mostrarán en tu cuenta.</p><div className="connection-privacy"><ShieldCheck size={15}/> Solo lectura · Permiso revocable · Sin entrenar IA con datos de Strava</div></div><a className="strava-btn" href="/api/strava/connect">Conectar con Strava <ArrowUpRight size={18}/></a></div>}
        {status?.connected && <div className="connected-row"><span><Check size={16}/> Strava conectado {source==='api' && visible?.athlete.picture && <img className="strava-avatar" src={visible.athlete.picture} alt="Foto de perfil de Strava"/>} {source==='api' && visible?.athlete.firstname ? `· ${visible.athlete.firstname} ${visible.athlete.lastname}` : ''} {source==='api' && visible?.athlete.stravaId ? <a className="strava-profile-link" href={`https://www.strava.com/athletes/${visible.athlete.stravaId}`} target="_blank" rel="noreferrer">Ver en Strava</a> : null}</span><div><span className="sync-label">{visible ? `Sincronizado: ${new Intl.DateTimeFormat('es-ES',{dateStyle:'short',timeStyle:'short'}).format(new Date(visible.syncedAt))}` : ''}</span><button onClick={()=>void disconnect()} className="text-btn" disabled={disconnecting}><Unplug size={15}/> {disconnecting?'Desconectando…':'Desconectar'}</button></div></div>}
        <div className="import-card">
          <div className="import-card-icon"><FileUp size={25}/></div>
          <div className="import-card-content"><h3>Importar mi historial de Strava</h3>
            <p>¿Prefieres no conectar tu cuenta? Descarga tus datos en Strava y selecciona aquí el archivo <strong>.zip</strong> o <strong>activities.csv</strong>. No necesitas suscripción.</p>
            <p className="import-hint" id="import-heart-notice"><ShieldCheck size={15}/> <span><strong>Importación con pulsaciones:</strong> al elegir tu archivo autorizas guardar tu frecuencia cardíaca disponible para mostrarla en tu cuenta, no para entrenar IA. Con un CSV se guardan la media y la máxima disponibles; con un ZIP también recuperamos automáticamente las gráficas (hasta 240 muestras por actividad). Los archivos FIT/TCX/GPX se envían individualmente al servidor para extraer las pulsaciones y no se guardan en Supabase. Si se interrumpe, vuelve a importar el ZIP para recuperar las series pendientes.</span></p>
            {importStatus?.imported && <p className="import-existing"><Check size={15}/> Historial guardado: {formatNumber(importStatus.count)} actividades · Última importación: {importStatus.updatedAt ? new Intl.DateTimeFormat('es-ES',{dateStyle:'short'}).format(new Date(importStatus.updatedAt)):'—'}</p>}
            {importMessage && <p className="import-existing" role="status">{importMessage}</p>}
            {importIssues && importIssues.skipped > 0 && <details className="import-report">
              <summary>Ver por qué se han omitido {importIssues.skipped} filas</summary>
              <p>Identificador inválido: {importIssues.skippedByReason.invalidId} · Fecha no reconocida: {importIssues.skippedByReason.invalidDate} · Duplicadas: {importIssues.skippedByReason.duplicateId}</p>
              {importIssues.skippedExamples.length > 0 && <ul>{importIssues.skippedExamples.map((item,i)=><li key={`${item.row}-${i}`}>
                Fila {item.row}: {item.name || 'Actividad sin nombre'} ({item.date || 'sin fecha'}) — {item.reason === 'invalidId' ? 'identificador no válido' : item.reason === 'invalidDate' ? 'formato de fecha no reconocido' : 'duplicada'}
              </li>)}</ul>}
              <small>Se muestran como máximo 100 ejemplos. Este detalle solo aparece después de importar el archivo; no se almacena en el servidor.</small>
            </details>}
          </div>
          <input ref={fileInputRef} type="file" accept=".zip,.csv,application/zip,text/csv" className="sr-only-input" aria-label="Seleccionar exportación Strava e importar pulsaciones" aria-describedby="import-heart-notice" onChange={e=>void importFile(e.currentTarget.files?.[0])} />
          <div className="import-actions"><button className="import-button" type="button" aria-describedby="import-heart-notice" disabled={importing} onClick={()=>fileInputRef.current?.click()}><FolderOpen size={17}/>{importing?'Importando…':importStatus?.imported?'Reimportar historial y pulsaciones':'Importar historial y pulsaciones'}</button>
          {importStatus?.imported && <button className="text-btn" type="button" disabled={importing} onClick={()=>void removeImport()}><Trash2 size={15}/> Borrar importación</button>}</div>
        </div>
        {status?.connected && importStatus?.imported && <div className="source-select" aria-label="Seleccionar origen de estadísticas"><span>Mostrar estadísticas de:</span><button className={source==='api'?'active':''} onClick={()=>void changeSource('api')}>Strava conectado</button><button className={source==='import'?'active':''} onClick={()=>void changeSource('import')}>Archivo importado ({formatNumber(importStatus.count)})</button></div>}
        {(!status?.connected && !importStatus?.imported) && <div className="preview-row"><span>¿Quieres ver cómo quedará con estadísticas?</span><button onClick={()=>setDemo(v=>!v)} className="preview-button">{demo?'Ocultar ejemplo':'Ver dashboard de ejemplo'} <ArrowRight size={16}/></button></div>}
        {showingDemo && <div className="demo-banner"><span className="demo-tag">MODO DEMOSTRACIÓN</span> Todos los números de esta pantalla son ficticios y no proceden de Strava.</div>}
        {loadingStats && !visible && <div className="stats-loading"><div className="loader"/> Preparando tus estadísticas…</div>}
        {visible && <>
          <div className="section-title-row"><div><span className="eyebrow">TU ACTIVIDAD EN NÚMEROS</span><h2>El camino recorrido</h2></div><span className="section-help">{showingDemo?'Datos ficticios':source==='import'?`Historial importado · ${formatNumber(visible.sampleSize)} actividades`:`Últimas ${visible.sampleSize} actividades disponibles`}</span></div>
          <div className="stats-grid">
            <Statistic icon={<Activity size={22}/>} eyebrow="Actividades" value={formatNumber(visible.stats.activities)} suffix="" sub="Entrenamientos analizados"/>
            <Statistic icon={<MapPinned size={22}/>} eyebrow="Distancia total" value={formatNumber(visible.stats.distanceKm,1)} suffix="km" sub="Cada kilómetro suma"/>
            <Statistic icon={<Clock3 size={22}/>} eyebrow="Tiempo en movimiento" value={formatNumber(visible.stats.movingHours,1)} suffix="h" sub="Tiempo disfrutando del camino"/>
            <Statistic icon={<Mountain size={22}/>} eyebrow="Desnivel positivo" value={formatNumber(visible.stats.elevationM)} suffix="m" sub="Metros de ascenso acumulado"/>
          </div>
          <div className="analytics-grid">
            <section className="data-panel evolution-panel"><div className="panel-header"><div><span className="eyebrow">TU EVOLUCIÓN</span><h3>Kilómetros mes a mes</h3></div><span className="panel-chip"><TrendingUp size={15}/> Últimos 6 meses</span></div>
              <div className="chart-container" aria-label="Distancia mensual, representada en un gráfico de área">
                <ResponsiveContainer width="100%" height="100%"><AreaChart data={visible.monthly} margin={{top:12,right:6,left:-22,bottom:0}}>
                  <defs><linearGradient id="distanceFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#44967b" stopOpacity={0.23}/><stop offset="100%" stopColor="#44967b" stopOpacity={0.015}/></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="#e9efeb" strokeDasharray="4 4"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill:'#84918a',fontSize:12}} dy={10}/><YAxis axisLine={false} tickLine={false} tick={{fill:'#9da9a1',fontSize:12}}/>
                  <Tooltip formatter={value=>[`${formatNumber(Number(value)||0,1)} km`,'Distancia']} contentStyle={{border:'1px solid #e4eae5',borderRadius:14,boxShadow:'0 10px 25px #183c3012'}}/>
                  <Area type="monotone" dataKey="distanceKm" stroke="#2c806a" strokeWidth={3} fill="url(#distanceFill)" dot={{r:4,strokeWidth:3,fill:'white'}} activeDot={{r:6}}/>
                </AreaChart></ResponsiveContainer>
              </div><p className="chart-note">Distancia de las actividades incluidas en el análisis; no representa necesariamente todo tu historial.</p></section>
            <section className="data-panel sports-panel"><div className="panel-header"><div><span className="eyebrow">TUS DISCIPLINAS</span><h3>Así te mueves</h3></div></div>
              <div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={visible.bySport} dataKey="count" nameKey="name" innerRadius={65} outerRadius={87} paddingAngle={4} stroke="none">
                {visible.bySport.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip formatter={value=>[`${Number(value)||0} actividades`,'Total']}/></PieChart></ResponsiveContainer>
                <div className="donut-center"><strong>{visible.stats.activities}</strong><small>actividades</small></div></div>
              <div className="sports-legend">{visible.bySport.map((s,i)=><div className="legend-row" key={s.name}><span><i style={{background:COLORS[i%COLORS.length]}}/>{s.name}</span><strong>{s.count} <small>({formatNumber(s.distanceKm,1)} km)</small></strong></div>)}</div>
            </section>
          </div>
          <section className="data-panel recent-panel"><div className="panel-header"><div><span className="eyebrow">RECUERDOS DE TUS AVENTURAS</span><h3>Últimas actividades</h3></div><Link className="panel-chip panel-link" to={`/actividades?source=${source === 'api' ? 'api' : 'import'}`}>Ver todas <ArrowRight size={15}/></Link></div>
            <div className="recent-list">{visible.recent.map((activity,i)=><div className="recent-item" key={`${activity.id}-${i}`}><div className={`activity-glyph ${activity.sport === 'Carrera' ? 'running' : 'cycling'}`}>{sportIcon(activity.sport)}</div><div className="recent-name"><strong>{activity.name}</strong><span>{new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short',year:'numeric'}).format(new Date(activity.date))} <span className="activity-dot">·</span> {activity.sport}</span></div>
                <div className="recent-metrics"><span><MapPinned size={15}/>{formatNumber(activity.distanceKm,2)} km</span><span><Clock3 size={15}/>{activity.movingMinutes} min</span><span><Mountain size={15}/>{activity.elevationM} m</span></div>
                {showingDemo ? <span className="row-chevron"><ArrowDownRight size={18}/></span> : <a className="row-chevron" href={activity.url} target="_blank" rel="noreferrer" aria-label={`Ver ${activity.name} en Strava`} title="Ver en Strava"><ExternalLink size={17}/></a>}
              </div>)}</div>
            {!showingDemo && <p className="chart-note">{source==='import'?'Historial importado manualmente desde activities.csv. Para ver el detalle original, abre la actividad en Strava.':'Datos recuperados mediante la API de Strava. Para ver el detalle original, abre la actividad en Strava.'}</p>}
          </section>
          {!showingDemo && source==='api' && visible.limited && <p className="limitation-note"><HeartPulse size={17}/> Este resumen está limitado a las 200 actividades más recientes, no a todo el historial de tu cuenta.</p>}
        </>}
        {!visible && !loadingStats && <section className="empty-state"><div className="empty-art"><Mountain size={40}/></div><h3>Tu historia deportiva todavía está por contar</h3><p>Cuando conectes Strava o importes tu historial, aquí aparecerán tus estadísticas, la evolución de tus entrenamientos y tus últimas actividades.</p></section>}
        <footer className="dashboard-footer"><span>© {new Date().getFullYear()} RaceEstrategy · Diseñado para disfrutar el camino.</span><span>Integración independiente, no afiliada a Strava <ArrowRight size={14}/></span></footer>
      </div>
    </main>
  </div>;
}
