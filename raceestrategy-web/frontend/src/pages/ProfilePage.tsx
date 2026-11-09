import { useEffect, useState, type ReactNode } from 'react';
import { Activity, ArrowRight, BarChart3, Bike, CalendarDays, ChevronRight, Clock3, Footprints, HelpCircle, Leaf, Menu, Mountain, Route, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link, useNavigate } from 'react-router-dom';
import { api, type ImportStatus, type ProfileSport, type SportProfile, type StravaStatus, type User } from '../lib/api';
import { Landscape } from '../components/Brand';
import { Sidebar } from '../components/Sidebar';
import SportsRatingCard from '../components/SportsRatingCard';

const SPORT_NAMES: Record<ProfileSport, string> = {all:'Todos',run:'Carrera',cycle:'Bicicleta',mtb:'MTB',hike:'Senderismo',other:'Otros'};
const fmt=(value:number,digits=0)=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:digits}).format(value);
function paceLabel(seconds:number|null) {if(seconds===null)return '—';const n=Math.round(seconds);return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')} min/km`;}
function changeLabel(curr:number,prev:number,suffix='') {
  if(prev===0)return curr===0?'Sin cambios':'Sin referencia previa';
  const difference=(curr-prev)/prev*100;
  return `${difference>0?'+':''}${fmt(difference,0)} %${suffix}`;
}
function SportGlyph({sport}:{sport:ProfileSport}) {
  if(sport==='run')return <Footprints size={19}/>;
  if(sport==='cycle'||sport==='mtb')return <Bike size={19}/>;
  if(sport==='hike')return <Mountain size={19}/>;
  return <Activity size={19}/>;
}
function ProfileKpi({label,value,note,icon}:{label:string;value:string;note:string;icon:ReactNode}) {
  return <div className="profile-kpi"><span className="profile-kpi-icon">{icon}</span><span className="profile-kpi-label">{label}</span><strong>{value}</strong><span className="profile-kpi-note">{note}</span></div>;
}
function Trend({title,value,prev}:{title:string;value:number;prev:number}) {
  return <div className="profile-trend"><span>{title}</span><strong>{fmt(value,1)}</strong><small className={value>prev?'up':value<prev?'down':''}>{value>prev?<TrendingUp size={14}/>:value<prev?<TrendingDown size={14}/>:<Activity size={14}/>} {changeLabel(value,prev)}</small></div>;
}

export default function ProfilePage(){
  const navigate=useNavigate();
  const [user,setUser]=useState<User|null>(null);
  const [status,setStatus]=useState<StravaStatus|null>(null);
  const [importStatus,setImportStatus]=useState<ImportStatus|null>(null);
  const [loadingUser,setLoadingUser]=useState(true);
  const [source,setSource]=useState<'import'|'api'|null>(null);
  const [sport,setSport]=useState<ProfileSport>('all');
  const [period,setPeriod]=useState<'monthly'|'weekly'>('monthly');
  const [profile,setProfile]=useState<SportProfile|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [menuOpen,setMenuOpen]=useState(false);
  const [reload,setReload]=useState(0);

  useEffect(()=>{
    let cancelled=false;
    Promise.all([api<{user:User}>('/auth/me'),api<StravaStatus>('/strava/status'),api<ImportStatus>('/import/status')])
      .then(([me,connected,imported])=>{
        if(cancelled)return;
        setUser(me.user);setStatus(connected);setImportStatus(imported);
        setSource(imported.imported?'import':connected.connected?'api':null);
      }).catch(err=>{
        if(cancelled)return;
        const message=err instanceof Error?err.message:'No se pudo abrir el perfil.';
        if(/sesión|inicia sesión/i.test(message))navigate('/',{replace:true});
        else setError(message);
      }).finally(()=>{if(!cancelled)setLoadingUser(false)});
    return ()=>{cancelled=true};
  },[navigate]);

  useEffect(()=>{
    if(source!=='api'||!status?.connected)return;
    let active=true;
    const timer=setInterval(()=>{void api<StravaStatus>('/strava/status').then(latest=>{
      if(active && latest.lastEventAt && latest.lastEventAt!==status.lastEventAt){
        setStatus(latest);setReload(v=>v+1);
      }
    }).catch(()=>{});},60000);
    return()=>{active=false;clearInterval(timer)};
  },[source,status?.connected,status?.lastEventAt]);

  useEffect(()=>{
    if(!user || !source) {setProfile(null);return;}
    let cancelled=false;
    setLoading(true);setError('');setProfile(null);
    api<SportProfile>(`/profile?source=${source}&sport=${sport}`)
      .then(value=>{if(!cancelled)setProfile(value)})
      .catch(err=>{if(!cancelled)setError(err instanceof Error?err.message:'No se pudo cargar el perfil.')})
      .finally(()=>{if(!cancelled)setLoading(false)});
    return ()=>{cancelled=true};
  },[user,source,sport,reload]);

  async function logout(){try{await api('/auth/logout',{method:'POST'});navigate('/',{replace:true})}catch(e){setError(e instanceof Error?e.message:'Error al cerrar sesión.')}}
  async function deleteAccount(){
    if(!window.confirm('¿Eliminar tu cuenta de RaceEstrategy y todos los datos guardados?'))return;
    if(window.prompt('Escribe ELIMINAR para confirmar')!=='ELIMINAR')return;
    try{await api('/auth/account',{method:'DELETE'});navigate('/',{replace:true})}catch(e){setError(e instanceof Error?e.message:'Error al eliminar la cuenta.')}
  }
  if(loadingUser)return <div className="loading-screen"><span className="loader"/> Preparando tu perfil deportivo…</div>;
  if(!user)return <div className="loading-screen"><p>{error||'Inicia sesión para continuar.'}</p><Link to="/" className="primary-btn">Volver</Link></div>;

  const choices:ProfileSport[]=['all','run','cycle','mtb','hike','other'];
  const chartData=period==='monthly'?profile?.monthly:profile?.weekly;
  const comparable=profile?.comparison;
  const active=profile?.summary.activities??0;
  return <div className="app-shell">
    <Sidebar user={user} logout={()=>void logout()} deleteAccount={()=>void deleteAccount()} open={menuOpen} close={()=>setMenuOpen(false)}/>
    <main className="dashboard-main">
      <header className="dashboard-topbar"><div className="mobile-only"><button className="icon-btn" aria-label="Abrir menú" onClick={()=>setMenuOpen(true)}><Menu size={24}/></button></div>
        <span className="breadcrumb">Mi espacio <ChevronRight size={15}/><strong>Perfil deportivo</strong></span>
        <div className="topbar-actions"><span className="today-label"><Leaf size={16}/> Tu progreso, a tu ritmo</span><div className="small-avatar">{user.name.slice(0,1).toUpperCase()}</div></div>
      </header>
      <div className="dashboard-content">
        <div className="intro-heading"><div><span className="eyebrow">TU HISTORIA DEPORTIVA <span className="tiny-dot"/></span><h1>Perfil deportivo</h1><p>Descubre cómo has evolucionado con cada entrenamiento.</p></div><Link to="/actividades" className="refresh-btn"><Route size={16}/> Mis actividades</Link></div>
        <section className="profile-hero"><div className="profile-hero-copy"><span className="hero-pill"><Sparkles size={13}/> SIN NECESIDAD DE IA</span><h2>Tu esfuerzo se convierte<br/>en perspectiva.</h2><p>Conoce tus hábitos, compara periodos y visualiza tu recorrido.</p></div><Landscape className="profile-hero-art"/></section>
        <div className="profile-source-row"><div className="profile-source-info"><span className="eyebrow">ORIGEN DEL HISTORIAL</span><p>Las estadísticas corresponden al origen seleccionado.</p></div><div className="profile-source-actions">
          {importStatus?.imported&&<button className={source==='import'?'active':''} onClick={()=>setSource('import')}>Archivo importado</button>}
          {status?.connected&&<button className={source==='api'?'active':''} onClick={()=>setSource('api')}>Cuenta conectada</button>}
        </div></div>
        <SportsRatingCard/>
        {!source ? <section className="data-panel profile-empty"><Mountain size={34}/><h3>Tu perfil empieza con una actividad</h3><p>Importa el historial de Strava o conecta tu cuenta desde el resumen para ver tu evolución.</p><Link to="/dashboard" className="primary-btn">Ir al resumen <ArrowRight size={17}/></Link></section> : <>
          <div className="profile-sport-tabs" role="group" aria-label="Filtrar por modalidad deportiva">{choices.map(choice=><button key={choice} className={sport===choice?'active':''} onClick={()=>setSport(choice)}><SportGlyph sport={choice}/>{SPORT_NAMES[choice]}</button>)}</div>
          {error&&<div className="info-banner error" role="alert">{error}</div>}
          {loading?<div className="stats-loading"><span className="loader"/> Calculando estadísticas…</div>:profile&&<>
            <div className="profile-kpis">
              <ProfileKpi label="Actividades registradas" value={fmt(profile.summary.activities)} note="Historial disponible" icon={<Activity size={22}/>}/>
              <ProfileKpi label="Distancia acumulada" value={`${fmt(profile.summary.distanceKm,1)} km`} note={`${fmt(profile.summary.withDistance)} con distancia válida`} icon={<Route size={22}/>}/>
              <ProfileKpi label="Tiempo en movimiento" value={`${fmt(profile.summary.movingHours,1)} h`} note={`${fmt(profile.summary.withTime)} con tiempo válido`} icon={<Clock3 size={22}/>}/>
              <ProfileKpi label="Desnivel positivo" value={`${fmt(profile.summary.elevationM)} m`} note="Suma del desnivel registrado" icon={<Mountain size={22}/>}/>
            </div>
            {active===0?<section className="data-panel profile-empty"><HelpCircle size={27}/><h3>Aún no hay actividades de {SPORT_NAMES[sport].toLowerCase()}</h3><p>Prueba a seleccionar otra modalidad o añade nuevos entrenamientos a tu historial.</p></section>:<>
              <div className="profile-chart-row">
                <section className="data-panel profile-chart-panel"><div className="panel-header"><div><span className="eyebrow">EVOLUCIÓN DEL ENTRENAMIENTO</span><h3>Distancia recorrida</h3></div><div className="profile-chart-tabs"><button className={period==='monthly'?'active':''} onClick={()=>setPeriod('monthly')}>Mensual</button><button className={period==='weekly'?'active':''} onClick={()=>setPeriod('weekly')}>Semanal</button></div></div>
                  <p className="profile-chart-sub">{period==='monthly'?'Últimos 12 meses':'Últimas 12 semanas'} · km por periodo</p>
                  <div className="profile-chart-container"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData||[]} margin={{top:15,right:12,left:-24,bottom:5}}><defs><linearGradient id="profile-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3d8c6e" stopOpacity={0.27}/><stop offset="100%" stopColor="#3d8c6e" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid stroke="#e9f0e9" vertical={false}/><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{fontSize:11,fill:'#819587'}}/><YAxis tickLine={false} axisLine={false} tick={{fontSize:11,fill:'#819587'}}/><Tooltip formatter={value=>[`${fmt(Number(value)||0,1)} km`,'Distancia']} labelStyle={{color:'#335e49'}}/><Area type="monotone" dataKey="distanceKm" stroke="#2e8064" strokeWidth={2.8} fill="url(#profile-area)" activeDot={{r:5}}/></AreaChart></ResponsiveContainer></div>
                </section>
                <section className="data-panel profile-consistency"><span className="eyebrow">ÚLTIMOS 90 DÍAS</span><span className="profile-consistency-icon"><Leaf size={27}/></span><h3>Tu constancia</h3><strong>{profile.consistency.label}</strong><p>Una mirada a la frecuencia de tus entrenamientos.</p><div className="profile-consistency-grid"><div><b>{fmt(profile.consistency.activities90d)}</b><small>actividades</small></div><div><b>{fmt(profile.consistency.weeks90d)}</b><small>semanas activas</small></div></div><p className="profile-consistency-disclaimer">No es una puntuación de forma física: solo describe el historial registrado.</p></section>
              </div>
              <div className="profile-bottom-grid">
                <section className="data-panel profile-comparison"><div className="panel-header"><div><span className="eyebrow">COMPARATIVA RECIENTE</span><h3>Últimos 30 días vs. los 30 anteriores</h3></div><CalendarDays size={22}/></div><div className="profile-trends"><Trend title="Distancia (km)" value={comparable?.last30.distanceKm??0} prev={comparable?.previous30.distanceKm??0}/><Trend title="Actividades" value={comparable?.last30.activities??0} prev={comparable?.previous30.activities??0}/><Trend title="Horas en movimiento" value={comparable?.last30.movingHours??0} prev={comparable?.previous30.movingHours??0}/></div><p className="profile-muted">Una reducción de kilómetros no implica necesariamente una pérdida de rendimiento.</p></section>
                <section className="data-panel profile-highlights"><span className="eyebrow">ASPECTOS DESTACADOS</span><h3>Así se dibuja tu historia</h3><div className="profile-highlight-item"><span className="profile-highlight-icon"><Route size={19}/></span><div><small>Actividad de mayor distancia disponible</small><strong>{profile.insights.longest?`${fmt(profile.insights.longest.distanceKm,1)} km`:'Sin datos'}</strong><span>{profile.insights.longest?.name||'No hay una distancia registrada'}</span></div></div>
                {profile.insights.medianPaceSecPerKm!==null&&<div className="profile-highlight-item"><span className="profile-highlight-icon"><Footprints size={19}/></span><div><small>Mediana de ritmos de carrera</small><strong>{paceLabel(profile.insights.medianPaceSecPerKm)}</strong><span>{profile.insights.paceSamples} actividades con ritmos plausibles y ≥ 2 km</span></div></div>}
                {profile.insights.medianSpeedKmH!==null&&<div className="profile-highlight-item"><span className="profile-highlight-icon"><Bike size={19}/></span><div><small>Mediana de velocidades de ciclismo</small><strong>{fmt(profile.insights.medianSpeedKmH,1)} km/h</strong><span>{profile.insights.speedSamples} actividades con velocidad plausible y ≥ 3 km</span></div></div>}
                {profile.insights.medianPaceSecPerKm===null&&profile.insights.medianSpeedKmH===null&&<p className="profile-muted">Cuando registres más entrenamientos con distancia y tiempo podrás comparar ritmos y velocidades.</p>}</section>
              </div>
              {sport==='all'&&<section className="data-panel profile-disciplines"><div className="panel-header"><div><span className="eyebrow">REPARTO POR DEPORTE</span><h3>¿En qué disciplinas te mueves?</h3></div><BarChart3 size={22}/></div><div className="profile-disciplines-list">{profile.sportBreakdown.filter(x=>x.activities>0).map(s=><button key={s.key} onClick={()=>setSport(s.key as ProfileSport)}><span className="profile-discipline-icon"><SportGlyph sport={s.key as ProfileSport}/></span><span className="profile-discipline-name"><strong>{s.name}</strong><small>{s.activities} actividades</small></span><span className="profile-discipline-bar"><i style={{width:`${Math.max(2,s.activities/Math.max(profile.summary.activities,1)*100)}%`}}/></span><strong>{fmt(s.distanceKm,1)} km</strong><ChevronRight size={16}/></button>)}</div></section>}
            </>}
            <section className="profile-data-notice"><HelpCircle size={19}/><p>Datos de <strong>{source==='import'?'exportación CSV':'conexión con Strava'}</strong>. {profile.limited?'La API consulta un máximo de 200 actividades; los resultados pueden estar incompletos. ':''}Los ritmos son medianas descriptivas, no predicciones del modelo. {profile.summary.missingDistance>0||profile.summary.missingTime>0?`Hay ${profile.summary.missingDistance} actividades sin distancia útil y ${profile.summary.missingTime} sin tiempo útil; se conservan en el recuento, pero no se inventan métricas. `:''}Las ventanas temporales usan la fecha de hoy; la exportación manual solo se actualiza cuando la vuelves a importar.</p></section>
          </>}
        </>}
        <footer className="dashboard-footer"><span>RaceEstrategy · Sigue tu propio camino</span><span>Perfil deportivo · Estadísticas, todavía sin IA</span></footer>
      </div>
    </main>
  </div>;
}
