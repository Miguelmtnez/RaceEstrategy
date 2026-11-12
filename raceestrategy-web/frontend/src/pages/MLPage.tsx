import { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowRight, BrainCircuit, ChevronRight, Clock3, FileUp,
  Footprints, Gauge, Leaf, Menu, Mountain, ShieldCheck, Trash2, TrendingUp,
  Compass, FileCode, CheckCircle2, Zap, Route as RouteIcon,
  BookmarkCheck, History, Sparkles
} from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api, type User, type SavedRoute, type ActivityItem, getSavedRoutes } from '../lib/api';
import { extractStravaCSV } from '../lib/importStrava';
import { Sidebar } from '../components/Sidebar';
import MLActivityPicker, { type MlActivity, type ActivityType } from '../components/MLActivityPicker';

type MlSport = 'Carrera'|'Bicicleta'|'MTB'|'Senderismo';
const SPORT_OPTIONS: MlSport[] = ['Carrera', 'Bicicleta', 'MTB', 'Senderismo'];

type MlProfile = {
  count: number; totalKm: number; medianPaceMinPerKm: number|null; medianSpeedKmH?: number|null; totalAscentM?: number; longestKm: number|null;
  firstActivity: string|null; lastActivity: string|null; distinctDays: number;
  modelReady: boolean; provenance: string; description: string; selectedCount: number; excludedCount: number;
};

type ImprovementTip = {
  title: string;
  tag: string;
  desc: string;
};

type MlPrediction = {
  sport: string; estimatedMinutes: number; baselineMinutes: number|null; historyActivities: number;
  modelTestMAEMinutes: number|null; historyLastDate?: string|null; label: string; caveat: string; mode: 'rodaje'|'competicion';
  projectionKind: string; reference?: { name: string; date: string; distanceKm: number; durationMinutes: number; ascentM: number|null };
  previousMinutes?: number|null;
  improvementTips?: ImprovementTip[];
};

type ParsedRouteSource = {
  ok: boolean;
  source: 'gpx' | 'fit' | 'maps';
  filename?: string;
  distanceKm?: number;
  ascentM?: number;
  descentM?: number;
  minElevation?: number|null;
  maxElevation?: number|null;
  estimatedDistanceKm?: number|null;
  url?: string;
  note?: string;
  durationMinutes?: number|null;
  averageHeartRate?: number|null;
};

type ArchiveResult = {
  ok: boolean; sourceRows: number; selectedRunning: number; eligibleRunning: number; selectedCount: number;
  eligibleTotal?: number; bySport?: Record<MlSport, { found: number; eligible: number; invalid: number }>;
  invalidRunning: number; ignoredOtherSports: number; invalidIdOrDateOrDuplicate: number;
  added: number; duplicates: number; count: number; notice: string;
};

type MlStored = { items: MlActivity[]; total: number; selected: number; limit: number };
type HistoryDiagnostics = { manualTotal: number; manualUnrecognized: number; labTotal: number; bySport: Record<MlSport, { manualFound: number; manualEligible: number; manualExcluded: number; labStored: number; ratingValid: number }>; explanation: string };
type ManualSyncResult = { ok: boolean; added: number; duplicates: number; skippedFitEquivalent: number; count: number; selectedCount: number; report: { total: number; unrecognized: number; bySport: Record<MlSport, { found: number; eligible: number; invalid: number }> } };
type MlPreview = Omit<ArchiveResult, 'added'|'duplicates'|'count'|'notice'|'selectedCount'> & { items: (Omit<MlActivity, 'id'> & { contentId: string })[] };

const fmt = (x: number, d = 1) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: d }).format(x);
const clock = (v: number) => { const m = Math.round(v), h = Math.floor(m / 60); return h ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; };
const pace = (v: number|null) => v == null ? '—' : `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, '0')} min/km`;
const nextDate = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

export default function MLPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User|null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState<MlProfile|null>(null);
  const [sport, setSport] = useState<MlSport>('Carrera');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState('');
  const [archiveReport, setArchiveReport] = useState<ArchiveResult|null>(null);
  const [stored, setStored] = useState<MlActivity[]>([]);
  const [historyDiagnostics, setHistoryDiagnostics] = useState<HistoryDiagnostics|null>(null);
  const [previewRows, setPreviewRows] = useState<MlActivity[]>([]);
  const [previewSelected, setPreviewSelected] = useState<Set<string>>(new Set());
  const [previewTypeEdited, setPreviewTypeEdited] = useState<Set<string>>(new Set());
  const [archiveCsv, setArchiveCsv] = useState('');
  const requestToken = useRef(0);

  // Parámetros de la ruta a predecir
  const [distance, setDistance] = useState('10');
  const [ascent, setAscent] = useState('100');
  const [descent, setDescent] = useState('100');
  const [date, setDate] = useState(nextDate);
  const [mode, setMode] = useState<'rodaje'|'competicion'>('rodaje');
  const [prediction, setPrediction] = useState<MlPrediction|null>(null);
  const [predictionError, setPredictionError] = useState('');

  // Modos de entrada de ruta: desde 'mis-rutas', 'mis-actividades', 'maps', 'file' o 'manual'
  const [routeInputMode, setRouteInputMode] = useState<'saved-routes' | 'activities' | 'maps' | 'file' | 'manual'>('saved-routes');
  const [routeFileLoading, setRouteFileLoading] = useState(false);
  const [routeFileSuccess, setRouteFileSuccess] = useState<string>('');
  const [mapsUrlInput, setMapsUrlInput] = useState('');

  // Listados cargados para selección directa
  const [savedRoutesList, setSavedRoutesList] = useState<SavedRoute[]>([]);
  const [loadingSavedRoutes, setLoadingSavedRoutes] = useState(false);
  const [selectedSavedRouteId, setSelectedSavedRouteId] = useState<number | null>(null);

  const [activitiesList, setActivitiesList] = useState<ActivityItem[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

  // Cargar lista de rutas guardadas y actividades al montar
  useEffect(() => {
    setLoadingSavedRoutes(true);
    getSavedRoutes()
      .then(res => {
        if (res.routes && res.routes.length > 0) {
          setSavedRoutesList(res.routes);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingSavedRoutes(false));

    setLoadingActivities(true);
    // Intentar primero con las actividades importadas manualmente, y si no con Strava API
    api<{ items: ActivityItem[] }>('/activities?source=import&pageSize=100')
      .catch(() => api<{ items: ActivityItem[] }>('/activities?source=api&pageSize=100'))
      .then(res => {
        if (res.items && res.items.length > 0) {
          setActivitiesList(res.items);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingActivities(false));
  }, []);

  // Recibir ruta automáticamente si el usuario viene de "Explorar Rutas" o "Mis Rutas"
  useEffect(() => {
    const state = location.state as {
      sport?: string;
      distance?: string | number;
      elevation?: string | number;
      mapsUrl?: string;
      title?: string;
    } | null;

    if (state) {
      if (state.sport) {
        if (state.sport === 'Ciclismo') setSport('Bicicleta');
        else if (state.sport === 'Running') setSport('Carrera');
        else if (state.sport === 'Senderismo') setSport('Senderismo');
      }
      if (state.distance) {
        const num = typeof state.distance === 'number'
          ? state.distance
          : parseFloat(String(state.distance).replace(/[^0-9.]/g, ''));
        if (Number.isFinite(num) && num > 0) setDistance(String(num));
      }
      if (state.elevation) {
        const num = typeof state.elevation === 'number'
          ? state.elevation
          : parseFloat(String(state.elevation).replace(/[^0-9.]/g, ''));
        if (Number.isFinite(num) && num >= 0) {
          setAscent(String(num));
          setDescent(String(num));
        }
      }
      if (state.mapsUrl) {
        setMapsUrlInput(state.mapsUrl);
        setRouteInputMode('maps');
      }
      setRouteFileSuccess(`Ruta cargada: ${state.title || 'Propuesta de Explorar Rutas'} · Recorrido y métricas listos.`);
    }
  }, [location.state]);

  const confirmedMarks = stored.filter(x => x.sport === 'Carrera' && x.selected && x.activityType === 'competicion' && x.typeSource === 'manual');
  const targetKm = Number(distance);
  const comparableMarks = confirmedMarks.filter(x => {
    const ratio = targetKm / x.distanceKm;
    const paceMinKm = x.durationMinutes / x.distanceKm;
    return /^\d{4}-\d{2}-\d{2}$/.test(x.date) && x.date < date &&
      x.distanceKm >= 1 && x.distanceKm <= 42.3 && x.durationMinutes > 0 &&
      Number.isFinite(paceMinKm) && paceMinKm >= 2.4 && paceMinKm <= 20 &&
      Number.isFinite(ratio) && ratio >= 0.5 && ratio <= 2;
  }).sort((a, b) => Math.abs(Math.log(targetKm / a.distanceKm)) - Math.abs(Math.log(targetKm / b.distanceKm)) || b.date.localeCompare(a.date));
  const previewMark = comparableMarks[0] ?? null;

  const refresh = async () => {
    const [p, activities] = await Promise.all([
      api<MlProfile>(`/ml/owned-profile?sport=${encodeURIComponent(sport)}`),
      api<MlStored>('/ml/owned-activities')
    ]);
    setProfile(p);
    setStored(activities.items);
  };

  const updateStoredType = async (ids: string[], activityType: ActivityType) => {
    try {
      await api('/ml/owned-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: ids.map(id => ({ id, activityType })) })
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar tipo.');
    }
  };

  const updateStoredSelection = async (ids: string[], selected: boolean) => {
    try {
      await api('/ml/owned-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, selected })
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cambiar selección.');
    }
  };

  const updatePreviewType = (ids: string[], activityType: ActivityType) => {
    const idsSet = new Set(ids);
    setPreviewRows(previous => previous.map(x => idsSet.has(x.id) ? { ...x, activityType, typeSource: 'manual' } : x));
    setPreviewTypeEdited(previous => new Set([...previous, ...ids]));
  };

  const updatePreviewSelection = (ids: string[], selected: boolean) => {
    setPreviewSelected(previous => {
      const next = new Set(previous);
      for (const id of ids) { if (selected) next.add(id); else next.delete(id); }
      return next;
    });
  };

  async function chooseFiles(selectedFiles: File[]) {
    const token = ++requestToken.current;
    setBusy(false); setProgress(''); setFiles(selectedFiles); setArchiveCsv(''); setPreviewRows([]); setPreviewSelected(new Set()); setPreviewTypeEdited(new Set());
    setArchiveReport(null); setMessage(''); setError(''); setPrediction(null);
    const archives = selectedFiles.filter(f => /\.(?:zip|csv)$/i.test(f.name));
    if (!archives.length) return;
    if (selectedFiles.length !== 1) { setError('Selecciona el ZIP de Strava por separado.'); return; }
    if (!consent) { setMessage('Marca primero la autorización y pulsa «Ver actividades del ZIP».'); return; }
    await prepareArchive(selectedFiles[0], token);
  }

  async function prepareArchive(file: File, token = ++requestToken.current) {
    setBusy(true); setProgress('Leyendo el ZIP y preparando las actividades…'); setError('');
    try {
      const csv = await extractStravaCSV(file);
      const r = await api<MlPreview>('/ml/owned-strava-preview', {
        method: 'POST', headers: { 'Content-Type': 'text/csv; charset=utf-8', 'X-ML-User-File-Consent': 'true' }, body: csv
      });
      if (token !== requestToken.current) return;
      const items = r.items.map(({ contentId, ...other }) => ({ ...other, id: contentId }));
      setArchiveCsv(csv); setPreviewRows(items);
      setPreviewSelected(new Set(items.filter(x => x.selected).map(x => x.id))); setPreviewTypeEdited(new Set());
      setMessage(`${r.eligibleTotal ?? r.eligibleRunning} actividades válidas detectadas. Abre cada modalidad para revisar su selección antes de guardar.`);
    } catch (e) { if (token === requestToken.current) setError(e instanceof Error ? e.message : 'Error al preparar el ZIP.'); }
    finally { if (token === requestToken.current) { setBusy(false); setProgress(''); } }
  }

  useEffect(() => {
    let alive = true;
    Promise.all([
      api<{ user: User }>('/auth/me'),
      api<MlProfile>(`/ml/owned-profile?sport=${encodeURIComponent(sport)}`),
      api<MlStored>('/ml/owned-activities')
    ])
      .then(([auth, data, activities]) => { if (alive) { setUser(auth.user); setProfile(data); setStored(activities.items); } })
      .catch(e => { if (alive) { const text = e instanceof Error ? e.message : 'Error de conexión'; if (/sesión|inicia sesión/i.test(text)) navigate('/', { replace: true }); else setError(text); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [navigate]);

  useEffect(() => {
    let active = true; setProfile(null);
    api<MlProfile>(`/ml/owned-profile?sport=${encodeURIComponent(sport)}`)
      .then(r => { if (active) setProfile(r); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'No se pudo cargar el perfil.'); });
    return () => { active = false; };
  }, [sport]);

  const logout = async () => { try { await api('/auth/logout', { method: 'POST' }); navigate('/', { replace: true }); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cerrar sesión'); } };
  const deleteAccount = async () => {
    if (!window.confirm('¿Eliminar tu cuenta y tus datos?') || window.prompt('Escribe ELIMINAR para confirmar') !== 'ELIMINAR') return;
    try { await api('/auth/account', { method: 'DELETE' }); navigate('/', { replace: true }); } catch (e) { setError(e instanceof Error ? e.message : 'Error al eliminar la cuenta'); }
  };

  async function upload() {
    if (!consent || !files.length) return;
    setBusy(true); setError(''); setArchiveReport(null); setPrediction(null);
    try {
      if (archiveCsv) {
        const typeOverrides = Array.from(previewTypeEdited).map(id => {
          const row = previewRows.find(x => x.id === id);
          return { id, activityType: row?.activityType || 'sin_clasificar' };
        });
        const rep = await api<ArchiveResult>('/ml/owned-strava-archive-selection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-ML-User-File-Consent': 'true' },
          body: JSON.stringify({ csv: archiveCsv, selectedIds: Array.from(previewSelected), typeOverrides })
        });
        setArchiveReport(rep);
        setPreviewRows([]);
        setArchiveCsv('');
        setFiles([]);
        await refresh();
        return;
      }
      for (const f of files) {
        const buffer = await f.arrayBuffer();
        await api('/ml/owned-fit?filename=' + encodeURIComponent(f.name), {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-ML-Independent-Consent': 'true' },
          body: buffer
        });
      }
      await refresh();
      setFiles([]);
      setMessage('Archivos FIT importados correctamente.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al subir archivos.');
    } finally {
      setBusy(false);
    }
  }

  // Manejador para cargar una ruta guardada de "Mis Rutas"
  function handleSelectSavedRoute(routeId: number) {
    const selected = savedRoutesList.find(r => r.id === routeId);
    if (!selected) return;
    setSelectedSavedRouteId(routeId);
    setPrediction(null);
    setError('');

    // Ajustar deporte
    if (selected.sport === 'Ciclismo') setSport('Bicicleta');
    else if (selected.sport === 'Running') setSport('Carrera');
    else if (selected.sport === 'Senderismo') setSport('Senderismo');

    // Parsear distancia ("45 km" -> 45)
    const distNum = parseFloat(selected.distance.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(distNum) && distNum > 0) setDistance(String(distNum));

    // Parsear desnivel ("+600 m" -> 600)
    const elevNum = parseFloat(selected.elevation.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(elevNum) && elevNum >= 0) {
      setAscent(String(elevNum));
      setDescent(String(elevNum));
    }

    if (selected.maps_url) {
      setMapsUrlInput(selected.maps_url);
    }

    setRouteFileSuccess(`Ruta cargada: «${selected.title}» (${selected.distance}, ${selected.elevation}). Datos y GPS listos para la estimación.`);
  }

  // Manejador para cargar una actividad previa de "Mis Actividades"
  function handleSelectActivity(actId: string) {
    const selected = activitiesList.find(a => a.id === actId);
    if (!selected) return;
    setSelectedActivityId(actId);
    setPrediction(null);
    setError('');

    // Ajustar deporte
    if (selected.sport === 'Ciclismo') setSport('Bicicleta');
    else if (selected.sport === 'Carrera') setSport('Carrera');
    else if (selected.sport === 'Senderismo') setSport('Senderismo');

    if (selected.distanceKm) setDistance(String(selected.distanceKm));
    if (selected.elevationM !== null && selected.elevationM !== undefined) {
      setAscent(String(selected.elevationM));
      setDescent(String(selected.elevationM));
    }

    const timeMin = selected.movingSeconds ? Math.round(selected.movingSeconds / 60) : null;
    setRouteFileSuccess(`Actividad seleccionada: «${selected.name}» (${selected.distanceKm} km${selected.elevationM ? `, +${selected.elevationM}m` : ''}${timeMin ? ` hecha en ${timeMin} min` : ''}). Estimando tiempo con tu forma actual.`);
  }

  // Manejador para extraer datos de archivo GPX / FIT de la ruta objetivo
  async function handleRouteSourceUpload(file: File) {
    setRouteFileLoading(true);
    setRouteFileSuccess('');
    setError('');
    setPrediction(null);
    try {
      const buffer = await file.arrayBuffer();
      const isGpx = /\.gpx$/i.test(file.name);
      const isFit = /\.fit(?:\.gz)?$/i.test(file.name);

      if (!isGpx && !isFit) {
        throw new Error('Selecciona un archivo .gpx o .fit.');
      }

      const res = await api<ParsedRouteSource>('/ml/parse-route-source?filename=' + encodeURIComponent(file.name), {
        method: 'POST',
        headers: { 'Content-Type': isGpx ? 'application/gpx+xml' : 'application/octet-stream' },
        body: buffer
      });

      if (res.distanceKm) setDistance(String(res.distanceKm));
      if (res.ascentM !== undefined && res.ascentM !== null) setAscent(String(res.ascentM));
      if (res.descentM !== undefined && res.descentM !== null) setDescent(String(res.descentM));

      setRouteFileSuccess(`Ruta cargada desde ${file.name}: ${res.distanceKm} km · +${res.ascentM}m desnivel.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo de ruta.');
    } finally {
      setRouteFileLoading(false);
    }
  }

  // Manejador para extraer datos de Google Maps URL
  async function handleGoogleMapsAnalyze() {
    if (!mapsUrlInput.trim()) {
      setError('Pega una URL válida de Google Maps.');
      return;
    }
    setRouteFileLoading(true);
    setRouteFileSuccess('');
    setError('');
    setPrediction(null);
    try {
      const res = await api<ParsedRouteSource>('/ml/parse-route-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: mapsUrlInput.trim() })
      });

      if (res.estimatedDistanceKm) {
        setDistance(String(res.estimatedDistanceKm));
        setRouteFileSuccess(`Enlace analizado: ~${res.estimatedDistanceKm} km estimados.`);
      } else {
        setRouteFileSuccess('Enlace de Google Maps registrado. Confirma los kilómetros para calcular la predicción.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al procesar el enlace de Google Maps.');
    } finally {
      setRouteFileLoading(false);
    }
  }

  async function predict() {
    setBusy(true); setError(''); setPrediction(null); setPredictionError('');
    try {
      const res = await api<MlPrediction>('/ml/predict-owned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sport,
          mode,
          route: { distanceKm: Number(distance), ascentM: Number(ascent), descentM: Number(descent), date }
        })
      });
      setPrediction(res);
    } catch (e) {
      setPredictionError(e instanceof Error ? e.message : 'Error en la predicción.');
    } finally {
      setBusy(false);
    }
  }

  async function syncManualHistory() {
    if (!consent) { setError('Marca primero la autorización de uso de archivos importados.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api<ManualSyncResult>('/ml/sync-imported', {
        method: 'POST', headers: { 'X-ML-User-File-Consent': 'true' }
      });
      await refresh();
      setHistoryDiagnostics(await api<HistoryDiagnostics>('/ml/history-diagnostics'));
      setMessage(`Actividades añadidas desde Mis actividades: ${result.added}. Ya existentes: ${result.duplicates}.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo sincronizar el historial.'); }
    finally { setBusy(false); }
  }

  async function clear() {
    if (!window.confirm('¿Borrar todas las actividades guardadas en el Laboratorio IA?')) return;
    setBusy(true); setError(''); setPrediction(null); setPredictionError('');
    try {
      await api('/ml/owned-history', { method: 'DELETE' });
      await refresh();
      setPreviewRows([]); setArchiveCsv(''); setFiles([]);
      setMessage('Historial de IA eliminado.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al borrar historial'); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="loading-screen"><span className="loader"/> Abriendo el laboratorio de IA…</div>;
  if (!user) return <div className="loading-screen"><p>{error || 'Inicia sesión para continuar'}</p><Link to="/" className="primary-btn">Volver</Link></div>;

  return (
    <div className="app-shell">
      <Sidebar user={user} logout={() => void logout()} deleteAccount={() => void deleteAccount()} open={menuOpen} close={() => setMenuOpen(false)}/>
      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="mobile-only"><button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu size={24}/></button></div>
          <span className="breadcrumb">Mi espacio <ChevronRight size={15}/><strong>Laboratorio IA</strong></span>
          <div className="topbar-actions"><span className="today-label"><Leaf size={16}/> Tu progreso, a tu ritmo</span><div className="small-avatar">{user.name.slice(0, 1).toUpperCase()}</div></div>
        </header>

        <div className="dashboard-content">
          <div className="intro-heading">
            <div>
              <span className="eyebrow">RACESTRATEGY · MODELO PREDICTIVO v1</span>
              <h1>Laboratorio IA</h1>
              <p>Analiza cualquier ruta por archivo o mapa y optimiza tus tiempos con predicción inteligente.</p>
            </div>
            <Link to="/perfil" className="refresh-btn"><Activity size={16}/> Perfil deportivo</Link>
          </div>

          <section className="ml-hero">
            <div>
              <span className="hero-pill"><BrainCircuit size={15}/> MACHINE LEARNING & GPS PARSER</span>
              <h2>¿Cuánto tardarías en tu próxima ruta?</h2>
              <p>Pega un enlace de Google Maps, sube un archivo GPX o FIT y el Laboratorio calculará tu tiempo estimado y tips tácticos para rebajarlo.</p>
            </div>
            <span className="ml-hero-emblem"><Footprints size={63}/></span>
          </section>

          <div className="ml-sport-tabs" role="group" aria-label="Modalidad del Laboratorio IA">
            {SPORT_OPTIONS.map(s => (
              <button type="button" key={s} className={sport === s ? 'active' : ''} onClick={() => { setSport(s); setPrediction(null); setPredictionError(''); setMode('rodaje'); }}>
                {s}
              </button>
            ))}
          </div>

          {error && <div className="info-banner error" role="alert">{error}</div>}
          {message && <div className="ml-success" role="status">{message}</div>}

          <div className="ml-grid">
            {/* PASO 1: TU HISTORIAL */}
            <section className="data-panel ml-upload">
              <span className="eyebrow">PASO 01 · TU HISTORIAL</span>
              <h3>Entrenamientos para calibrar el modelo</h3>
              <p>Importa tu historial de entrenamientos en ZIP o FIT para que el modelo conozca tus ritmos habituales.</p>
              <label className="ml-consent">
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>
                <span>Autorizo utilizar estos archivos para calibrar las predicciones. Datos 100% privados y procesados en tu cuenta.</span>
              </label>

              <label className="ml-drop">
                <FileUp size={27}/>
                <strong>{files.length === 1 ? files[0].name : files.length > 1 ? `${files.length} FIT seleccionados` : 'Seleccionar ZIP de Strava / FIT'}</strong>
                <span>Admite activities.csv, ZIP o archivos FIT de Garmin/Wahoo</span>
                <input type="file" accept=".zip,.csv,.fit,.gz" multiple onChange={e => { const chosen = Array.from(e.target.files ?? []); e.target.value = ''; void chooseFiles(chosen); }}/>
              </label>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0 6px' }}>
                <button type="button" className="primary-btn ml-btn" disabled={busy || !consent} onClick={() => void syncManualHistory()}>
                  <FileUp size={17}/> Incorporar desde Mis actividades
                </button>
              </div>

              {files.some(f => /\.(?:zip|csv)$/i.test(f.name)) && !archiveCsv && (
                <button className="primary-btn ml-btn" disabled={!consent || busy || files.length !== 1} onClick={() => void prepareArchive(files[0])}>
                  <Footprints size={17}/> Ver actividades del ZIP
                </button>
              )}
              {!files.some(f => /\.(?:zip|csv)$/i.test(f.name)) && files.length > 0 && (
                <button className="primary-btn ml-btn" disabled={!consent || busy} onClick={() => void upload()}>
                  <FileUp size={17}/>{busy ? 'Importando…' : 'Importar FIT seleccionados'}
                </button>
              )}
              {busy && progress && <p role="status" className="ml-upload-hint">{progress}</p>}
            </section>

            {/* RESUMEN DE TU HISTORIAL */}
            <section className="data-panel ml-summary">
              <span className="eyebrow">TU PERFIL · DATOS DISPONIBLES</span>
              <h3>Historial de {sport}</h3>
              <div className="ml-metrics">
                <div><Footprints size={18}/><strong>{profile?.selectedCount ?? 0} / {profile?.count ?? 0}</strong><small>elegidas / importadas</small></div>
                <div><Gauge size={18}/><strong>{fmt(profile?.totalKm ?? 0)} km</strong><small>kilómetros base</small></div>
                <div><Clock3 size={18}/><strong>{sport === 'Carrera' ? pace(profile?.medianPaceMinPerKm ?? null) : profile?.medianSpeedKmH != null ? `${fmt(profile.medianSpeedKmH, 1)} km/h` : '—'}</strong><small>ritmo mediano</small></div>
                <div><Mountain size={18}/><strong>{profile?.longestKm ? `${fmt(profile.longestKm)} km` : '—'}</strong><small>mayor distancia</small></div>
              </div>
              <div className="ml-profile-note">
                <ShieldCheck size={19}/>
                <span>{profile?.modelReady ? 'Modelo calibrado y listo para estimar tiempos.' : `Necesitas al menos ${sport === 'Carrera' ? 5 : 3} actividades de ${sport} para realizar la predicción.`}</span>
              </div>
              {!!profile?.count && (
                <button className="ml-clear" disabled={busy} onClick={() => void clear()}>
                  <Trash2 size={15}/> Borrar historial de IA
                </button>
              )}
            </section>
          </div>

          {archiveReport && (
            <div className="ml-success" style={{ margin: '16px 0' }}>
              <CheckCircle2 size={16} /> {archiveReport.notice || 'Archivo procesado correctamente.'}
            </div>
          )}

          {historyDiagnostics && (
            <p className="ml-upload-hint" style={{ margin: '10px 0' }}>{historyDiagnostics.explanation}</p>
          )}

          {/* Vista previa de actividades del ZIP */}
          {!!previewRows.length && (
            <section className="data-panel ml-preview-box" style={{ marginTop: '20px' }}>
              <MLActivityPicker
                key={`preview-${sport}`}
                items={previewRows.filter(x => x.sport === sport)}
                selectedIds={previewSelected}
                busy={busy}
                onSelection={updatePreviewSelection}
                onTypeChange={updatePreviewType}
                kind="preview"
              />
              <div className="ml-preview-save">
                <span><strong>{previewSelected.size}</strong> actividades seleccionadas entre todas las modalidades. Revisa cada pestaña antes de guardarlas.</span>
                <button className="primary-btn ml-btn" disabled={busy} onClick={() => void upload()}>
                  <FileUp size={17} /> Guardar actividades y selección
                </button>
              </div>
            </section>
          )}

          {/* Selector de actividades guardadas */}
          {!!stored.length && (
            <section className="data-panel ml-saved-runs" style={{ marginTop: '20px' }}>
              <div className="panel-header">
                <div>
                  <span className="eyebrow">SELECCIÓN DE ENTRENAMIENTOS</span>
                  <h3>Mis actividades de {sport} calibrando la IA</h3>
                </div>
                <Footprints size={24} />
              </div>
              <MLActivityPicker
                key={`saved-${sport}`}
                items={stored.filter(x => x.sport === sport)}
                selectedIds={new Set(stored.filter(x => x.selected).map(x => x.id))}
                busy={busy}
                kind="saved"
                onSelection={(ids, sel) => void updateStoredSelection(ids, sel)}
                onTypeChange={(ids, t) => void updateStoredType(ids, t)}
              />
            </section>
          )}

          {/* PASO 3: CARGAR RUTA Y ESTIMAR TIEMPO */}
          <section className="data-panel ml-predict" style={{ marginTop: '24px' }}>
            <div className="panel-header">
              <div>
                <span className="eyebrow">PASO 02 · RUTA OBJETIVO A ANALIZAR</span>
                <h3>Carga o diseña la ruta a estudiar</h3>
              </div>
              <BrainCircuit size={25}/>
            </div>

            {/* Selector de método de entrada de la ruta */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setRouteInputMode('saved-routes')}
                style={{
                  border: routeInputMode === 'saved-routes' ? '1px solid #27775f' : '1px solid #dce8df',
                  background: routeInputMode === 'saved-routes' ? '#eaf4eb' : '#ffffff',
                  color: routeInputMode === 'saved-routes' ? '#1f5a46' : '#527762',
                  padding: '9px 15px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', gap: '7px', cursor: 'pointer'
                }}
              >
                <BookmarkCheck size={16}/> Mis Rutas Guardadas
              </button>
              <button
                type="button"
                onClick={() => setRouteInputMode('activities')}
                style={{
                  border: routeInputMode === 'activities' ? '1px solid #27775f' : '1px solid #dce8df',
                  background: routeInputMode === 'activities' ? '#eaf4eb' : '#ffffff',
                  color: routeInputMode === 'activities' ? '#1f5a46' : '#527762',
                  padding: '9px 15px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', gap: '7px', cursor: 'pointer'
                }}
              >
                <History size={16}/> Mis Actividades
              </button>
              <button
                type="button"
                onClick={() => setRouteInputMode('maps')}
                style={{
                  border: routeInputMode === 'maps' ? '1px solid #27775f' : '1px solid #dce8df',
                  background: routeInputMode === 'maps' ? '#eaf4eb' : '#ffffff',
                  color: routeInputMode === 'maps' ? '#1f5a46' : '#527762',
                  padding: '9px 15px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', gap: '7px', cursor: 'pointer'
                }}
              >
                <Compass size={16}/> Recorrido Google Maps
              </button>
              <button
                type="button"
                onClick={() => setRouteInputMode('file')}
                style={{
                  border: routeInputMode === 'file' ? '1px solid #27775f' : '1px solid #dce8df',
                  background: routeInputMode === 'file' ? '#eaf4eb' : '#ffffff',
                  color: routeInputMode === 'file' ? '#1f5a46' : '#527762',
                  padding: '9px 15px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', gap: '7px', cursor: 'pointer'
                }}
              >
                <FileCode size={16}/> Archivo GPX / FIT
              </button>
              <button
                type="button"
                onClick={() => setRouteInputMode('manual')}
                style={{
                  border: routeInputMode === 'manual' ? '1px solid #27775f' : '1px solid #dce8df',
                  background: routeInputMode === 'manual' ? '#eaf4eb' : '#ffffff',
                  color: routeInputMode === 'manual' ? '#1f5a46' : '#527762',
                  padding: '9px 15px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', gap: '7px', cursor: 'pointer'
                }}
              >
                <RouteIcon size={16}/> Ajustar datos
              </button>
            </div>

            {/* VISTA 1: MIS RUTAS GUARDADAS */}
            {routeInputMode === 'saved-routes' && (
              <div style={{ background: '#f8faf8', border: '1px solid #dce8df', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <strong style={{ fontSize: '14px', color: '#164332', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <BookmarkCheck size={18} color="#27775f" /> Selecciona una ruta guardada
                  </strong>
                  <Link to="/rutas" style={{ fontSize: '12px', color: '#27775f', textDecoration: 'none', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Sparkles size={14} /> Explorar / Generar nueva ruta
                  </Link>
                </div>

                {loadingSavedRoutes ? (
                  <p style={{ fontSize: '13px', color: '#688574', margin: 0 }}>Cargando tus rutas guardadas…</p>
                ) : savedRoutesList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#688574', fontSize: '13px' }}>
                    <p style={{ margin: '0 0 10px' }}>Aún no tienes rutas guardadas en tu colección.</p>
                    <Link to="/rutas" className="primary-btn" style={{ padding: '8px 16px', fontSize: '12px', textDecoration: 'none', display: 'inline-flex' }}>
                      <Sparkles size={14} /> Generar ruta con IA en Explorar Rutas
                    </Link>
                  </div>
                ) : (
                  <div>
                    <select
                      value={selectedSavedRouteId ?? ''}
                      onChange={e => {
                        const val = Number(e.target.value);
                        if (val) handleSelectSavedRoute(val);
                      }}
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        borderRadius: '10px',
                        border: '1px solid #cde0d2',
                        background: '#ffffff',
                        fontSize: '13px',
                        color: '#164332',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">-- Elige una ruta de tu lista ({savedRoutesList.length} disponibles) --</option>
                      {savedRoutesList.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.title} · {r.sport} · {r.distance} ({r.elevation}) {r.maps_url ? '🗺️ Con GPS Maps' : ''}
                        </option>
                      ))}
                    </select>
                    <span style={{ display: 'block', fontSize: '11px', color: '#688574', marginTop: '8px' }}>
                      Al seleccionarla se auto-rellenan los km, el desnivel y su enlace GPS de Google Maps.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* VISTA 2: MIS ACTIVIDADES */}
            {routeInputMode === 'activities' && (
              <div style={{ background: '#f8faf8', border: '1px solid #dce8df', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
                <strong style={{ display: 'block', fontSize: '14px', color: '#164332', marginBottom: '10px' }}>
                  <History size={18} color="#27775f" style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                  Selecciona una de tus actividades previas para repetir o mejorar tiempo
                </strong>

                {loadingActivities ? (
                  <p style={{ fontSize: '13px', color: '#688574', margin: 0 }}>Cargando actividades recientes…</p>
                ) : activitiesList.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#688574', margin: 0 }}>No hay actividades registradas aún en tu historial.</p>
                ) : (
                  <div>
                    <select
                      value={selectedActivityId ?? ''}
                      onChange={e => {
                        if (e.target.value) handleSelectActivity(e.target.value);
                      }}
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        borderRadius: '10px',
                        border: '1px solid #cde0d2',
                        background: '#ffffff',
                        fontSize: '13px',
                        color: '#164332',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">-- Elige una actividad previa ({activitiesList.length} disponibles) --</option>
                      {activitiesList.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name} · {a.sport} · {a.distanceKm ? `${a.distanceKm} km` : ''} {a.elevationM ? `(+${a.elevationM}m)` : ''} · {a.date ? a.date.slice(0, 10) : ''}
                        </option>
                      ))}
                    </select>
                    <span style={{ display: 'block', fontSize: '11px', color: '#688574', marginTop: '8px' }}>
                      Calcularemos cuánto tardarías hoy con tu nivel y estado de forma actual sobre ese mismo recorrido.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* VISTA 3: SUBIR GPX O FIT */}
            {routeInputMode === 'file' && (
              <div style={{ background: '#f8faf8', border: '1px dashed #cde0d2', borderRadius: '14px', padding: '24px', textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#eaf4eb', color: '#27775f', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
                  <FileCode size={24} />
                </div>
                <strong style={{ display: 'block', fontSize: '15px', color: '#164332', marginBottom: '4px' }}>
                  Sube el archivo .GPX o .FIT de la ruta
                </strong>
                <p style={{ color: '#688574', fontSize: '12px', maxWidth: '480px', margin: '0 auto 16px' }}>
                  Extraeremos automáticamente los kilómetros, desniveles acumulados y perfil de altitud de Wikiloc, Strava, Garmin, etc.
                </p>
                <label className="primary-btn" style={{ padding: '10px 20px', fontSize: '13px', cursor: 'pointer', display: 'inline-flex', margin: '0 auto' }}>
                  {routeFileLoading ? 'Analizando trazado…' : 'Examinar archivo GPX / FIT'}
                  <input
                    type="file"
                    accept=".gpx,.fit,.gz"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) void handleRouteSourceUpload(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            )}

            {/* VISTA 4: ENLACE DE GOOGLE MAPS */}
            {routeInputMode === 'maps' && (
              <div style={{ background: '#f8faf8', border: '1px solid #dce8df', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
                <strong style={{ display: 'block', fontSize: '14px', color: '#164332', marginBottom: '6px' }}>
                  Recorrido generado en Google Maps
                </strong>
                <p style={{ color: '#688574', fontSize: '12px', margin: '0 0 12px' }}>
                  Pega cualquier enlace de Google Maps con waypoints o generado por la IA en «Explorar rutas».
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input
                    type="url"
                    placeholder="https://maps.app.goo.gl/... o https://www.google.com/maps/dir/..."
                    value={mapsUrlInput}
                    onChange={e => setMapsUrlInput(e.target.value)}
                    style={{ flex: 1, minWidth: '260px', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cde0d2', fontSize: '13px' }}
                  />
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => void handleGoogleMapsAnalyze()}
                    disabled={routeFileLoading}
                    style={{ padding: '10px 18px', fontSize: '13px' }}
                  >
                    {routeFileLoading ? 'Extrayendo…' : 'Analizar mapa'}
                  </button>
                </div>
              </div>
            )}

            {routeFileSuccess && (
              <div style={{ background: '#eaf4eb', border: '1px solid #bce0c6', color: '#1f5a46', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
                <CheckCircle2 size={17} /> {routeFileSuccess}
              </div>
            )}

            {/* CAMPOS REVISABLES / MANUALES */}
            <div className="ml-form">
              <label>
                Objetivo
                <select value={mode} onChange={e => { setMode(e.target.value as 'rodaje'|'competicion'); setPrediction(null); setPredictionError(''); }}>
                  <option value="rodaje">Rodaje / Entrenamiento regular</option>
                  {sport === 'Carrera' && <option value="competicion">Competición / Intentar récord</option>}
                </select>
              </label>
              <label>
                Distancia (km)
                <input type="number" min="0.5" step="0.1" value={distance} onChange={e => { setDistance(e.target.value); setPrediction(null); setPredictionError(''); }}/>
              </label>
              <label>
                Desnivel positivo (+m)
                <input type="number" min="0" step="5" value={ascent} onChange={e => { setAscent(e.target.value); setPrediction(null); setPredictionError(''); }}/>
              </label>
              <label>
                Desnivel negativo (-m)
                <input type="number" min="0" step="5" value={descent} onChange={e => { setDescent(e.target.value); setPrediction(null); setPredictionError(''); }}/>
              </label>
              <label>
                Fecha prevista
                <input type="date" value={date} onChange={e => { setDate(e.target.value); setPrediction(null); setPredictionError(''); }}/>
              </label>
            </div>

            <button
              type="button"
              className="primary-btn ml-btn"
              disabled={busy || (mode === 'rodaje' && !profile?.modelReady)}
              onClick={() => void predict()}
              style={{ marginTop: '16px' }}
            >
              <BrainCircuit size={17}/>
              {busy ? 'Calculando con IA…' : 'Estimar tiempo y tips de mejora'}
              <ArrowRight size={17}/>
            </button>

            {previewMark && mode === 'competicion' && (
              <div className="ml-profile-note" role="status" style={{ marginTop: 12 }}>
                <ShieldCheck size={19}/>
                <span>Marca histórica comparable: <strong>{previewMark.name}</strong> ({previewMark.date}) · {fmt(previewMark.distanceKm, 2)} km en {clock(previewMark.durationMinutes)}.</span>
              </div>
            )}

            {predictionError && (
              <div className="info-banner error" role="alert" style={{ marginTop: 14 }}>
                {predictionError}
              </div>
            )}

            {/* RESULTADO DE LA PREDICCIÓN CON TIEMPO ESTIMADO */}
            {prediction && (
              <div style={{ marginTop: '24px' }}>
                <div className="ml-result">
                  <div>
                    <span className="eyebrow">
                      {prediction.mode === 'competicion' ? 'TIEMPO OBJETIVO · COMPETER' : 'ESTIMACIÓN INTELIGENTE · ML v1'}
                    </span>
                    <strong>{clock(prediction.estimatedMinutes)}</strong>
                    <p>
                      {sport === 'Bicicleta' || sport === 'MTB' ? (
                        <>Velocidad media estimada: <strong>{prediction.estimatedMinutes > 0 ? fmt((Number(distance) / prediction.estimatedMinutes) * 60, 1) : '—'} km/h</strong></>
                      ) : (
                        <>Ritmo previsto: <strong>{pace(Number(distance) > 0 ? prediction.estimatedMinutes / Number(distance) : null)}</strong></>
                      )} para {fmt(Number(distance))} km y +{ascent}m de desnivel.
                      {prediction.previousMinutes && (
                        <> · Mejor registro anterior en esta distancia: <strong>{clock(prediction.previousMinutes)}</strong></>
                      )}
                    </p>
                  </div>
                  <div className="ml-result-side">
                    <TrendingUp size={25}/>
                    <strong>{prediction.mode === 'competicion' ? 'Ritmo de carrera' : 'Basado en tu forma'}</strong>
                    <span>{prediction.historyActivities} actividades de {sport} analizadas</span>
                  </div>
                </div>

                {/* TIPS DE MEJORA PARA REBAJAR EL TIEMPO */}
                {prediction.improvementTips && prediction.improvementTips.length > 0 && (
                  <div style={{ marginTop: '20px', background: '#ffffff', border: '1px solid #e1ece4', borderRadius: '14px', padding: '22px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                      <Zap size={18} color="#eab308" />
                      <h4 style={{ fontFamily: 'Manrope, sans-serif', color: '#164332', fontSize: '16px', margin: 0, fontWeight: 800 }}>
                        Estrategia y tips tácticos para rebajar el tiempo
                      </h4>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                      {prediction.improvementTips.map((tip, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: '#f8faf8',
                            border: '1px solid #eef3ef',
                            borderRadius: '11px',
                            padding: '14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 800, color: '#27775f', background: '#eaf4eb', padding: '3px 8px', borderRadius: '6px' }}>
                              {tip.tag}
                            </span>
                          </div>
                          <strong style={{ fontSize: '13px', color: '#164332', fontFamily: 'Manrope, sans-serif' }}>
                            {tip.title}
                          </strong>
                          <p style={{ margin: 0, fontSize: '12px', color: '#557262', lineHeight: 1.5 }}>
                            {tip.desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <footer className="dashboard-footer">
            <span>RaceEstrategy · Laboratorio IA</span>
            <span>Compatible con archivos .GPX, .FIT y Google Maps</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
