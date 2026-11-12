import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowLeft, Bike, CalendarDays, ChevronLeft, ChevronRight, Clock3, ExternalLink, Footprints, MapPin, Menu, Mountain, HeartPulse, RefreshCcw, Search, SlidersHorizontal } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, confirmAndDeleteAccount, type ActivityItem, type ActivityListing, type ImportStatus, type StravaStatus, type User } from '../lib/api';
import { Sidebar } from '../components/Sidebar';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HeartRateSeries } from '../lib/api';

const fmt = (num: number, decimals = 0) => new Intl.NumberFormat('es-ES', {maximumFractionDigits:decimals}).format(num);
function elapsed(n: number | null) {
  if (n === null) return 'No disponible';
  const hours=Math.floor(n/3600), mins=Math.floor((n%3600)/60);
  return hours ? `${hours} h ${mins} min` : `${mins} min`;
}
function dateLabel(iso: string | null) {
  if (!iso) return 'Fecha no disponible';
  const d=new Date(iso);
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short',year:'numeric'}).format(d) : 'Fecha no disponible';
}
function paceLabel(item: ActivityItem) {
  if (item.paceSecPerKm !== null && item.category === 'running') {
    const mins=Math.floor(item.paceSecPerKm/60), secs=String(item.paceSecPerKm%60).padStart(2,'0');
    return `${mins}:${secs} min/km`;
  }
  if (item.speedKmH !== null) return `${fmt(item.speedKmH,1)} km/h`;
  return 'No disponible';
}
function SportIcon({category}:{category:string}) {
  return category === 'running' ? <Footprints size={20}/> : category === 'cycling' ? <Bike size={20}/> : category === 'hiking' ? <Mountain size={20}/> : <Activity size={20}/>;
}
function HeartRatePanel({ activity }: {activity: ActivityItem}) {
  const [series,setSeries]=useState<HeartRateSeries|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  useEffect(()=>{
    if (!activity.hasHeartRate) return;
    let active=true; setLoading(true); setSeries(null); setError('');
    const path=activity.source==='api'
      ? `/strava/activities/${encodeURIComponent(activity.id)}/heart-rate`
      : `/import/heartrate/${encodeURIComponent(activity.id)}`;
    void api<HeartRateSeries>(path)
      .then(result=>{if(active)setSeries(result)})
      .catch(err=>{if(active)setError(err instanceof Error?err.message:'No se pudieron cargar las pulsaciones.')})
      .finally(()=>{if(active)setLoading(false)});
    return ()=>{active=false};
  },[activity.id,activity.source,activity.hasHeartRate]);
  return <section className="data-panel heart-panel">
    <div className="panel-header"><div><span className="eyebrow">FRECUENCIA CARDIACA</span><h3><HeartPulse size={21}/> Tus pulsaciones</h3></div></div>
    {!activity.hasHeartRate ? <p>No hay datos de pulsaciones en este origen. Para recuperarlos desde un ZIP, vuelve a importarlo en el panel principal marcando «Recuperar también las pulsaciones».</p> : <>
      <div className="heart-stat-grid"><div className="heart-stat"><span>Media</span><strong>{activity.averageHeartRate===null?'—':`${activity.averageHeartRate} ppm`}</strong></div><div className="heart-stat"><span>Máxima</span><strong>{activity.maxHeartRate===null?'—':`${activity.maxHeartRate} ppm`}</strong></div></div>
      {loading?<p>Consultando la evolución en Strava…</p>:error?<p role="alert">{error}</p>:series?.available?<div className="heart-chart" aria-label="Gráfica de frecuencia cardiaca por minuto"><ResponsiveContainer width="100%" height={260}><AreaChart data={series.points}><defs><linearGradient id="heartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d87780" stopOpacity={0.3}/><stop offset="100%" stopColor="#d87780" stopOpacity={0.03}/></linearGradient></defs><CartesianGrid stroke="#ecedf0" strokeDasharray="3 4"/><XAxis dataKey="minute" tickFormatter={v=>`${v}′`} tick={{fontSize:12}}/><YAxis domain={['dataMin - 10','dataMax + 10']} unit=" ppm" width={62} tick={{fontSize:12}}/><Tooltip formatter={v=>[`${v} ppm`,'Pulsaciones']} labelFormatter={v=>`Minuto ${v}`}/><Area type="monotone" dataKey="bpm" stroke="#ce6872" fill="url(#heartFill)" strokeWidth={2} dot={false}/></AreaChart></ResponsiveContainer></div>:<p>Strava no ofrece una serie temporal de pulsaciones para esta actividad.</p>}
      <p className="heart-note">Pulsaciones visibles solo en tu cuenta. En el historial manual se guarda una serie simplificada; no se utiliza para entrenar IA. En Strava conectado se consulta bajo demanda.</p>
    </>}
  </section>;
}
export default function ActivitiesPage() {
  const navigate=useNavigate();
  const {activityId}=useParams();
  const [urlParams,setUrlParams]=useSearchParams();
  const [user,setUser]=useState<User|null>(null);
  const [status,setStatus]=useState<StravaStatus|null>(null);
  const [importStatus,setImportStatus]=useState<ImportStatus|null>(null);
  const [source,setSource]=useState<'import'|'api'>(urlParams.get('source')==='api'?'api':'import');
  const [loadingProfile,setLoadingProfile]=useState(true);
  const [menuOpen,setMenuOpen]=useState(false);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [listing,setListing]=useState<ActivityListing|null>(null);
  const [detail,setDetail]=useState<ActivityItem|null>(null);
  const [search,setSearch]=useState('');
  const [debouncedSearch,setDebouncedSearch]=useState('');
  const [sport,setSport]=useState('all');
  const [from,setFrom]=useState('');
  const [to,setTo]=useState('');
  const [sort,setSort]=useState('newest');
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(10);
  const [reload,setReload]=useState(0);
  useEffect(()=>{ const t=setTimeout(()=>setDebouncedSearch(search),250);return ()=>clearTimeout(t); },[search]);
  useEffect(()=>{
    let live=true;
    void Promise.all([api<{user:User}>('/auth/me'),api<StravaStatus>('/strava/status'),api<ImportStatus>('/import/status')])
      .then(([me,s,im])=>{
        if(!live)return;
        setUser(me.user);setStatus(s);setImportStatus(im);
        if(!im.imported && s.connected) setSource('api');
      })
      .catch(e=>{
        if(!live)return;
        if(/inicia sesión|sesión ha caducado/i.test(String(e?.message)))navigate('/',{replace:true});
        else setError(e instanceof Error?e.message:'Error al iniciar la página.');
      })
      .finally(()=>{if(live)setLoadingProfile(false);});
    return()=>{live=false};
  },[navigate]);
  const changeSource=useCallback((v:'import'|'api')=>{
    setSource(v);setPage(1);setListing(null);setDetail(null);
    setUrlParams({source:v});
    if(activityId) navigate(`/actividades?source=${v}`);
  },[activityId,navigate,setUrlParams]);
  useEffect(()=>{setPage(1)},[debouncedSearch,sport,from,to,sort,pageSize]);
  useEffect(()=>{
    if(source!=='api'||!status?.connected)return;
    let active=true;
    const interval=setInterval(()=>{void api<StravaStatus>('/strava/status').then(v=>{
      if(!active)return;
      if(v.lastEventAt && v.lastEventAt!==status.lastEventAt){setStatus(v);setReload(n=>n+1)}
    }).catch(()=>{});},60000);
    return()=>{active=false;clearInterval(interval)};
  },[source,status?.connected,status?.lastEventAt]);
  useEffect(()=>{
    if(!user || activityId)return;
    let active=true;
    const params=new URLSearchParams({source,sort,sport,page:String(page),pageSize:String(pageSize)});
    if(debouncedSearch)params.set('q',debouncedSearch);
    if(from)params.set('from',from);
    if(to)params.set('to',to);
    setLoading(true);setError('');
    void api<ActivityListing>(`/activities?${params.toString()}`).then(v=>{if(active)setListing(v)}).catch(e=>{if(active)setError(e instanceof Error?e.message:'No se pudo cargar el historial.')}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[user,source,sort,sport,page,pageSize,debouncedSearch,from,to,activityId,reload]);
  useEffect(()=>{
    if(!user || !activityId)return;
    let active=true;setLoading(true);setError('');setDetail(null);
    void api<{activity:ActivityItem}>(`/activities/${encodeURIComponent(activityId)}?source=${source}`)
      .then(v=>{if(active)setDetail(v.activity)})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'No se pudo cargar esta actividad.')})
      .finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[user,activityId,source,reload]);
  async function logout() {
    try {await api('/auth/logout',{method:'POST'});navigate('/',{replace:true})}
    catch(e){setError(e instanceof Error?e.message:'No se pudo cerrar la sesión.')}
  }
  async function deleteAccount() {
    try { if (await confirmAndDeleteAccount()) navigate('/',{replace:true}); }
    catch(e){setError(e instanceof Error?e.message:'No se pudo eliminar la cuenta.')}
  }
  const sourcesAvailable=(status?.connected?1:0)+(importStatus?.imported?1:0);
  const noSource=(source==='import'&&!importStatus?.imported)||(source==='api'&&!status?.connected);
  const detailBack=`/actividades?source=${source}`;
  if(loadingProfile)return <div className="loading-screen"><span className="loader"/> Preparando tus actividades…</div>;
  if(!user)return <div className="loading-screen"><p>{error||'Necesitas iniciar sesión.'}</p><Link className="primary-btn" to="/">Ir al inicio</Link></div>;
  return <div className="app-shell">
    <Sidebar user={user} logout={()=>void logout()} deleteAccount={()=>void deleteAccount()} open={menuOpen} close={()=>setMenuOpen(false)}/>
    <main className="dashboard-main">
      <header className="dashboard-topbar">
        <div className="mobile-only"><button className="icon-btn" aria-label="Abrir menú" onClick={()=>setMenuOpen(true)}><Menu size={24}/></button></div>
        <span className="breadcrumb">Mi espacio <ChevronRight size={15}/> <strong>Mis actividades</strong></span>
        <div className="topbar-actions"><span className="today-label"><CalendarDays size={16}/> Tu diario de aventuras</span><div className="small-avatar">{user.name.slice(0,1).toUpperCase()}</div></div>
      </header>
      <div className="dashboard-content">
        {activityId ? <>
          <Link to={detailBack} className="activity-back"><ArrowLeft size={17}/> Volver a todas las actividades</Link>
          {error&&<div className="info-banner error" role="alert">{error}</div>}
          {loading&&<div className="stats-loading"><span className="loader"/> Cargando entrenamiento…</div>}
          {detail&&<>
            <div className="activity-hero"><span className="eyebrow">MI DIARIO DEPORTIVO</span><h1>{detail.name}</h1><p><CalendarDays size={17}/> {dateLabel(detail.date)} · {detail.sport} · {detail.source==='api'?'Conexión Strava':'Exportación Strava'}</p></div>
            <div className="activity-detail-grid">
              <section className="activity-detail-card"><span>Distancia</span><strong>{detail.distanceKm===null?'No disponible':`${fmt(detail.distanceKm,2)} km`}</strong></section>
              <section className="activity-detail-card"><span>Tiempo en movimiento</span><strong>{elapsed(detail.movingSeconds)}</strong></section>
              <section className="activity-detail-card"><span>Desnivel positivo</span><strong>{detail.elevationM===null?'No disponible':`${fmt(detail.elevationM)} m`}</strong></section>
              <section className="activity-detail-card"><span>{detail.category==='running'?'Ritmo medio':'Velocidad media'}</span><strong>{paceLabel(detail)}</strong></section>
            </div>
            <HeartRatePanel activity={detail}/>
            <section className="data-panel activity-explain"><span className="eyebrow">DATOS DE LA ACTIVIDAD</span><h3>Tu entrenamiento, de un vistazo</h3><p>Estas métricas proceden del resumen de Strava. Para mostrar el mapa GPS y analizar los tramos necesitaremos importar GPX, FIT o TCX en una fase posterior.</p>{detail.url&&<a href={detail.url} target="_blank" rel="noopener noreferrer" className="activity-external">Abrir actividad en Strava <ExternalLink size={16}/></a>}</section>
          </>}
        </> : <>
          <div className="intro-heading"><div><span className="eyebrow">TU HISTORIAL DE ENTRENAMIENTOS <span className="tiny-dot"/></span><h1>Mis actividades</h1><p>Vuelve a recorrer cada kilómetro de tu historia deportiva.</p></div><Link className="refresh-btn" to="/dashboard"><ArrowLeft size={16}/> Volver al resumen</Link></div>
          <div className="activity-banner"><div><span className="hero-pill">CADA SALIDA CUENTA</span><h2>Hay una historia<br/>detrás de cada ruta.</h2><p>Explora, compara y celebra tus entrenamientos.</p></div><Mountain size={140} strokeWidth={1.1}/></div>
          {sourcesAvailable>1&&<div className="source-select"><span>Origen de datos:</span><button className={source==='import'?'active':''} onClick={()=>changeSource('import')}>Historial importado</button><button className={source==='api'?'active':''} onClick={()=>changeSource('api')}>Strava conectado</button></div>}
          {noSource ? <section className="empty-state"><div className="empty-art"><MapPin size={32}/></div><h3>Todavía no hay actividades en este origen</h3><p>Importa tu historial desde el dashboard o conecta Strava para comenzar.</p><Link to="/dashboard" className="primary-btn activity-start">Importar mis actividades</Link></section> : <>
            <div className="activity-filters data-panel"><div className="panel-header"><div><span className="eyebrow">ENCUENTRA TU ENTRENAMIENTO</span><h3>Busca y filtra</h3></div><SlidersHorizontal size={21}/></div>
              <div className="activity-filter-grid"><label className="activity-search"><Search size={18}/><input type="search" placeholder="Buscar por nombre o modalidad" value={search} onChange={e=>setSearch(e.target.value)}/></label>
                <label className="activity-control"><span>Deporte</span><select value={sport} onChange={e=>setSport(e.target.value)}><option value="all">Todos</option><option value="running">Carrera</option><option value="cycling">Ciclismo</option><option value="hiking">Senderismo</option><option value="other">Otros</option></select></label>
                <label className="activity-control"><span>Ordenar</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Más recientes</option><option value="oldest">Más antiguas</option><option value="distance">Mayor distancia</option><option value="duration">Más duración</option></select></label>
                <label className="activity-control"><span>Desde</span><input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)}/></label>
                <label className="activity-control"><span>Hasta</span><input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label>
              </div>
              {(search||sport!=='all'||from||to||sort!=='newest')&&<button className="activity-clear" onClick={()=>{setSearch('');setSport('all');setFrom('');setTo('');setSort('newest')}}>Limpiar filtros</button>}
            </div>
            {error&&<div className="info-banner error" role="alert">{error}</div>}
            <section className="data-panel activity-results"><div className="panel-header"><div><span className="eyebrow">TODOS TUS ENTRENAMIENTOS</span><h3>{loading?'Consultando actividades…':`${fmt(listing?.total||0)} actividades`}</h3></div><span className="panel-chip"><RefreshCcw size={14}/> {source==='import'?'Historial importado':'Sincronizadas'}</span></div>
              {listing&&listing.total>0&&<div className="activity-mini-stats"><span><MapPin size={16}/>{fmt(listing.totals.distanceKm,1)} km</span><span><Clock3 size={16}/>{fmt(listing.totals.movingHours,1)} h</span><span><Mountain size={16}/>{fmt(listing.totals.elevationM)} m+</span></div>}
              {loading?<div className="stats-loading"><span className="loader"/> Cargando actividades…</div>:listing?.total===0?<div className="activity-empty">No hemos encontrado entrenamientos con esos filtros.</div>:<div className="activity-rows">{listing?.items.map(a=><Link className="activity-row" key={a.id} to={`/actividades/${encodeURIComponent(a.id)}?source=${source}`}>
                <span className={`activity-glyph ${a.category}`}><SportIcon category={a.category}/></span><span className="activity-row-name"><strong>{a.name}</strong><small>{dateLabel(a.date)} · {a.sport}</small></span><span className="activity-row-metric"><strong>{a.distanceKm===null?'—':`${fmt(a.distanceKm,2)} km`}</strong><small>Distancia</small></span><span className="activity-row-metric activity-hide-mobile"><strong>{elapsed(a.movingSeconds)}</strong><small>Duración</small></span><span className="activity-row-metric activity-hide-mobile"><strong>{paceLabel(a)}</strong><small>Ritmo / velocidad</small></span><span className="activity-row-metric activity-hide-mobile"><strong>{a.averageHeartRate===null?'—':`${a.averageHeartRate} ppm`}</strong><small>FC media</small></span><ChevronRight size={17} className="activity-chevron"/>
              </Link>)}</div>}
              {listing&&listing.total>0&&<div className="activity-pagination"><label>Mostrar <select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}><option value="10">10</option><option value="20">20</option><option value="50">50</option></select></label><p>Página {listing.page} de {listing.pages}</p><div><button aria-label="Página anterior" disabled={listing.page<=1||loading} onClick={()=>setPage(p=>Math.max(1,p-1))}><ChevronLeft size={19}/></button><button aria-label="Página siguiente" disabled={listing.page>=listing.pages||loading} onClick={()=>setPage(p=>p+1)}><ChevronRight size={19}/></button></div></div>}
              {listing?.limited&&<p className="limitation-note">La conexión actual con Strava consulta como máximo las últimas 200 actividades. Para visualizar el historial completo, utiliza la importación ZIP/CSV.</p>}
            </section>
          </>}
        </>}
        <footer className="dashboard-footer"><span>RaceEstrategy · Tu historia en movimiento</span><span>Fase 2: historial deportivo</span></footer>
      </div>
    </main>
  </div>;
}
