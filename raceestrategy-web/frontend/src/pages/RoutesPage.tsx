import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import {
  Compass,
  Sparkles,
  Loader2,
  Navigation,
  AlertCircle,
  Menu,
  ChevronRight,
  CalendarDays,
  MapPin,
  Mountain,
  Gauge,
  Route as RouteIcon,
  CheckCircle2,
  FileText,
  ExternalLink,
  Map,
  Bike,
  Footprints,
  LocateFixed,
  Flag
} from 'lucide-react';
import { api, User, getRouteRecommendation, RouteParams } from '../lib/api';
import { Sidebar } from '../components/Sidebar';
import { MapLocationModal } from '../components/MapLocationModal';

// Opciones de distancia de 5 en 5 km (de 5 km a 150 km)
const DISTANCE_OPTIONS_CYCLING = Array.from({ length: 30 }, (_, i) => `${(i + 1) * 5} km`);
const DISTANCE_OPTIONS_RUNNING = Array.from({ length: 9 }, (_, i) => `${(i + 1) * 5} km`);

// Opciones de desnivel de 100 en 100 m hasta 2000 m
const ELEVATION_OPTIONS = [
  '0 m (Totalmente llano)',
  ...Array.from({ length: 20 }, (_, i) => `+${(i + 1) * 100} m`)
];

// 5 Niveles de tipo de recorrido
const ROUTE_TYPES = [
  'Nivel 1: Llano costero / Vías verdes (Muy fácil)',
  'Nivel 2: Ondulado / Falsos llanos (Fácil)',
  'Nivel 3: Media montaña y repechos (Moderado)',
  'Nivel 4: Puertos de montaña / Sierra interior (Exigente)',
  'Nivel 5: Alta montaña / Desafío rompepiernas (Muy difícil)'
];

export default function RoutesPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locatingStart, setLocatingStart] = useState(false);
  const [locatingEnd, setLocatingEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [activitiesCount, setActivitiesCount] = useState<number>(0);
  const [mapsUrl, setMapsUrl] = useState<string | null>(null);

  // Estado del modal de mapa interactivo
  const [mapPickerTarget, setMapPickerTarget] = useState<'startLocation' | 'endLocation' | null>(null);

  const [form, setForm] = useState<RouteParams>({
    sport: 'Ciclismo',
    targetDistance: '50 km',
    targetElevation: '+500 m',
    routeType: ROUTE_TYPES[2],
    startLocation: 'Alicante centro',
    endLocation: 'Alicante centro',
  });

  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then(res => setUser(res.user))
      .catch(() => navigate('/'));
  }, [navigate]);

  const handleSportChange = (sport: 'Ciclismo' | 'Running') => {
    setForm(prev => ({
      ...prev,
      sport,
      targetDistance: sport === 'Running' ? '10 km' : '50 km',
      targetElevation: sport === 'Running' ? '+100 m' : '+500 m',
    }));
  };

  // Función para obtener la ubicación actual por GPS del navegador
  const handleGetCurrentLocation = (field: 'startLocation' | 'endLocation') => {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización.');
      return;
    }

    if (field === 'startLocation') setLocatingStart(true);
    else setLocatingEnd(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude.toFixed(5);
        const lng = pos.coords.longitude.toFixed(5);
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`);
          const data = await res.json();
          const addr = data.address || {};
          const street = addr.road || addr.pedestrian || addr.square || '';
          const locality = addr.city || addr.town || addr.village || addr.suburb || 'Ubicación actual';
          const name = street ? `${street}, ${locality}` : locality;
          setForm(prev => ({ ...prev, [field]: name }));
        } catch {
          setForm(prev => ({ ...prev, [field]: 'Ubicación actual' }));
        } finally {
          if (field === 'startLocation') setLocatingStart(false);
          else setLocatingEnd(false);
        }
      },
      (err) => {
        if (field === 'startLocation') setLocatingStart(false);
        else setLocatingEnd(false);
        alert(`No se pudo obtener tu ubicación: ${err.message}. Puedes seleccionarla en el mapa.`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRecommendation(null);
    setMapsUrl(null);

    try {
      const res = await getRouteRecommendation(form, 'import');
      setRecommendation(res.recommendation);
      setActivitiesCount(res.usedActivitiesCount);

      const match = res.recommendation.match(/https:\/\/www\.google\.com\/maps\/dir\/[^\s)]+/);
      if (match) {
        setMapsUrl(match[0]);
      } else {
        const origin = encodeURIComponent(form.startLocation);
        const dest = encodeURIComponent(form.endLocation || form.startLocation);
        const mode = form.sport === 'Running' ? 'walking' : 'bicycling';
        setMapsUrl(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=${mode}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al conectar con la IA de Gemini.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
      navigate('/');
    } catch {
      // Ignorar error de red al salir
    }
  };

  if (!user) {
    return (
      <div className="loading-screen">
        <div className="loader" /> Preparando tu espacio…
      </div>
    );
  }

  const firstName = user.name.trim().split(' ')[0] || 'deportista';
  const distances = form.sport === 'Running' ? DISTANCE_OPTIONS_RUNNING : DISTANCE_OPTIONS_CYCLING;

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        open={menuOpen}
        close={() => setMenuOpen(false)}
        logout={logout}
        deleteAccount={() => {}}
      />

      <main className="dashboard-main">
        {/* Barra superior común con soporte móvil */}
        <header className="dashboard-topbar">
          <div className="mobile-only">
            <button aria-label="Abrir menú" className="icon-btn" onClick={() => setMenuOpen(true)}>
              <Menu size={24} />
            </button>
          </div>
          <span className="breadcrumb">
            Mi espacio <ChevronRight size={15} /> <strong>Explorar rutas con IA</strong>
          </span>
          <div className="topbar-actions">
            <span className="today-label">
              <CalendarDays size={17} />{' '}
              {new Intl.DateTimeFormat('es-ES', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }).format(new Date())}
            </span>
            <div className="small-avatar">{firstName.slice(0, 1).toUpperCase()}</div>
          </div>
        </header>

        {/* Contenido principal adaptativo */}
        <div className="dashboard-content">
          <div className="intro-heading">
            <div>
              <span className="eyebrow">
                DISEÑADOR INTELIGENTE <span className="tiny-dot" />
              </span>
              <h1>Planificador de Rutas con IA</h1>
              <p>
                Configura los parámetros de tu salida, marca puntos en el mapa y Gemini trazará la ruta con Google Maps.
              </p>
            </div>
          </div>

          {/* Banner Hero Responsivo */}
          <section
            className="hero-banner"
            style={{
              minHeight: '140px',
              marginBottom: '24px',
              background: 'linear-gradient(106deg, #1f5a46 0%, #2e7a5e 55%, #6a9b7b 100%)',
            }}
          >
            <div className="hero-copy" style={{ padding: 'clamp(18px, 4vw, 28px)' }}>
              <span className="hero-pill">
                <Sparkles size={13} style={{ marginRight: '4px' }} /> GEMINI + MAPA INTERACTIVO
              </span>
              <h2 style={{ fontSize: 'clamp(19px, 3.2vw, 26px)', margin: '10px 0 6px' }}>
                Tu ruta deportiva a medida
              </h2>
              <p style={{ maxWidth: '680px', fontSize: 'clamp(11px, 2vw, 13px)', lineHeight: 1.6 }}>
                Selecciona tu disciplina, distancia y haz clic en el mapa interactivo para elegir exactamente dónde salir y dónde llegar.
              </p>
            </div>
          </section>

          {/* Grid Responsivo (2 columnas en ordenador, 1 columna fluida en móvil/tablet) */}
          <div className="routes-layout-grid">
            {/* Columna Izquierda: Formulario */}
            <div className="data-panel" style={{ padding: 'clamp(16px, 3.5vw, 26px)' }}>
              <div className="panel-header" style={{ marginBottom: '18px' }}>
                <div>
                  <span className="eyebrow">PARÁMETROS DEL DÍA</span>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Navigation size={18} color="#2c806a" /> Configurar nueva ruta
                  </h3>
                </div>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 1. Selector de Deporte: Ciclismo o Running */}
                <div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#41574c',
                      marginBottom: '8px',
                    }}
                  >
                    Disciplina
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => handleSportChange('Ciclismo')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '10px',
                        borderRadius: '10px',
                        border: form.sport === 'Ciclismo' ? '2px solid #27775f' : '1px solid #dce8df',
                        background: form.sport === 'Ciclismo' ? '#eaf4eb' : '#f8faf8',
                        color: form.sport === 'Ciclismo' ? '#1f5a46' : '#617568',
                        fontWeight: 700,
                        fontSize: '13px',
                      }}
                    >
                      <Bike size={18} /> Ciclismo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSportChange('Running')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '10px',
                        borderRadius: '10px',
                        border: form.sport === 'Running' ? '2px solid #27775f' : '1px solid #dce8df',
                        background: form.sport === 'Running' ? '#eaf4eb' : '#f8faf8',
                        color: form.sport === 'Running' ? '#1f5a46' : '#617568',
                        fontWeight: 700,
                        fontSize: '13px',
                      }}
                    >
                      <Footprints size={18} /> Running
                    </button>
                  </div>
                </div>

                {/* 2. Selector Desplegable de Distancia */}
                <div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#41574c',
                      marginBottom: '6px',
                    }}
                  >
                    <RouteIcon size={14} color="#557c67" /> Distancia objetivo
                  </label>
                  <select
                    value={form.targetDistance}
                    onChange={e => setForm({ ...form, targetDistance: e.target.value })}
                    style={{
                      width: '100%',
                      height: '42px',
                      background: '#f8faf8',
                      border: '1px solid #dce8df',
                      borderRadius: '10px',
                      padding: '0 12px',
                      fontSize: '13px',
                      color: '#2e5140',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {distances.map(dist => (
                      <option key={dist} value={dist}>
                        {dist}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Selector Desplegable de Desnivel */}
                <div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#41574c',
                      marginBottom: '6px',
                    }}
                  >
                    <Mountain size={14} color="#557c67" /> Desnivel positivo buscado
                  </label>
                  <select
                    value={form.targetElevation}
                    onChange={e => setForm({ ...form, targetElevation: e.target.value })}
                    style={{
                      width: '100%',
                      height: '42px',
                      background: '#f8faf8',
                      border: '1px solid #dce8df',
                      borderRadius: '10px',
                      padding: '0 12px',
                      fontSize: '13px',
                      color: '#2e5140',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {ELEVATION_OPTIONS.map(elev => (
                      <option key={elev} value={elev}>
                        {elev}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Selector Desplegable de Tipo de Recorrido */}
                <div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#41574c',
                      marginBottom: '6px',
                    }}
                  >
                    <Gauge size={14} color="#557c67" /> Tipo de recorrido (5 niveles)
                  </label>
                  <select
                    value={form.routeType}
                    onChange={e => setForm({ ...form, routeType: e.target.value })}
                    style={{
                      width: '100%',
                      height: '42px',
                      background: '#f8faf8',
                      border: '1px solid #dce8df',
                      borderRadius: '10px',
                      padding: '0 12px',
                      fontSize: '13px',
                      color: '#2e5140',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {ROUTE_TYPES.map(type => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 5. Punto de Salida */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#41574c',
                      }}
                    >
                      <MapPin size={14} color="#27775f" /> Punto de salida
                    </label>
                    <div className="routes-actions-row">
                      <button
                        type="button"
                        onClick={() => setMapPickerTarget('startLocation')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: '#eaf4eb',
                          border: '1px solid #c2e2ce',
                          borderRadius: '6px',
                          color: '#206b4b',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: '4px 8px',
                        }}
                      >
                        <Map size={12} /> Elegir en mapa
                      </button>
                      <button
                        type="button"
                        disabled={locatingStart}
                        onClick={() => handleGetCurrentLocation('startLocation')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          background: 'none',
                          border: 'none',
                          color: '#27775f',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: '4px 6px',
                        }}
                      >
                        <LocateFixed size={13} className={locatingStart ? 'spin' : ''} />
                        {locatingStart ? '...' : 'Mi ubicación'}
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Calle San Fernando, Alicante..."
                    value={form.startLocation}
                    onChange={e => setForm({ ...form, startLocation: e.target.value })}
                    style={{
                      width: '100%',
                      height: '42px',
                      background: '#f8faf8',
                      border: '1px solid #dce8df',
                      borderRadius: '10px',
                      padding: '0 12px',
                      fontSize: '13px',
                      color: '#2e5140',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* 6. Punto de Llegada */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#41574c',
                      }}
                    >
                      <Flag size={14} color="#d97706" /> Punto de llegada
                    </label>
                    <div className="routes-actions-row">
                      <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, endLocation: prev.startLocation }))}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#557c67',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '4px 6px',
                        }}
                      >
                        Mismo
                      </button>
                      <button
                        type="button"
                        onClick={() => setMapPickerTarget('endLocation')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: '#fef3c7',
                          border: '1px solid #fde68a',
                          borderRadius: '6px',
                          color: '#92400e',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: '4px 8px',
                        }}
                      >
                        <Map size={12} /> Elegir en mapa
                      </button>
                      <button
                        type="button"
                        disabled={locatingEnd}
                        onClick={() => handleGetCurrentLocation('endLocation')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          background: 'none',
                          border: 'none',
                          color: '#27775f',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: '4px 6px',
                        }}
                      >
                        <LocateFixed size={13} className={locatingEnd ? 'spin' : ''} />
                        {locatingEnd ? '...' : 'Mi ubicación'}
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Alicante centro (o llegada diferente)"
                    value={form.endLocation || ''}
                    onChange={e => setForm({ ...form, endLocation: e.target.value })}
                    style={{
                      width: '100%',
                      height: '42px',
                      background: '#f8faf8',
                      border: '1px solid #dce8df',
                      borderRadius: '10px',
                      padding: '0 12px',
                      fontSize: '13px',
                      color: '#2e5140',
                      outline: 'none',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="primary-btn"
                  style={{
                    width: '100%',
                    marginTop: '8px',
                    padding: '13px',
                    borderRadius: '11px',
                    fontSize: '13px',
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="spin" size={17} /> Trazando con Gemini…
                    </>
                  ) : (
                    <>
                      <Sparkles size={17} /> Generar recomendación con IA
                    </>
                  )}
                </button>
              </form>

              {error && (
                <div
                  className="info-banner error"
                  style={{ marginTop: '16px', marginBottom: 0, fontSize: '12px' }}
                >
                  <AlertCircle size={16} /> {error}
                </div>
              )}
            </div>

            {/* Columna Derecha: Resultado o Estado de Espera */}
            <div className="data-panel" style={{ padding: 'clamp(16px, 3.5vw, 26px)', minHeight: '380px' }}>
              <div className="panel-header" style={{ marginBottom: '18px' }}>
                <div>
                  <span className="eyebrow">ESTRATEGIA Y PROPUESTA</span>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Compass size={20} color="#2c806a" /> Trazado sugerido
                  </h3>
                </div>
                {recommendation && (
                  <span
                    className="panel-chip"
                    style={{ background: '#eaf4eb', color: '#267356', fontWeight: 700 }}
                  >
                    <CheckCircle2 size={13} /> {activitiesCount} actividades analizadas
                  </span>
                )}
              </div>

              {/* Botón destacado responsivo para abrir en Google Maps */}
              {mapsUrl && !loading && (
                <div className="routes-maps-banner">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: '#2c806a',
                        color: '#fff',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Map size={22} />
                    </div>
                    <div>
                      <strong style={{ display: 'block', fontSize: '14px', color: '#23523f' }}>
                        Recorrido listo para navegar ({form.sport})
                      </strong>
                      <span style={{ fontSize: '12px', color: '#577c68' }}>
                        De {form.startLocation} a {form.endLocation || form.startLocation}
                      </span>
                    </div>
                  </div>
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="primary-btn"
                    style={{
                      padding: '10px 18px',
                      fontSize: '12px',
                      gap: '8px',
                      borderRadius: '10px',
                      textDecoration: 'none',
                    }}
                  >
                    Abrir en Google Maps <ExternalLink size={15} />
                  </a>
                </div>
              )}

              {loading && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '260px',
                    gap: '16px',
                    color: '#65806f',
                  }}
                >
                  <div className="loader" />
                  <p style={{ fontSize: '13px', maxWidth: '380px', textAlign: 'center', lineHeight: 1.6 }}>
                    Gemini está diseñando tu ruta de {form.sport.toLowerCase()} ({form.targetDistance}, {form.targetElevation}) y generando el mapa...
                  </p>
                </div>
              )}

              {!loading && !recommendation && (
                <div
                  className="empty-state"
                  style={{
                    border: '1px dashed #d5e5d8',
                    padding: 'clamp(30px, 6vw, 50px) 20px',
                    margin: '10px 0',
                    background: '#fafcfa',
                  }}
                >
                  <div className="empty-art" style={{ width: '56px', height: '56px', borderRadius: '16px' }}>
                    <FileText size={26} />
                  </div>
                  <h3>Tu recomendación aparecerá aquí</h3>
                  <p>
                    Selecciona tus parámetros o haz clic en <strong>"Elegir en mapa"</strong> y pulsa <strong>"Generar recomendación con IA"</strong>.
                  </p>
                </div>
              )}

              {!loading && recommendation && (
                <div className="ai-route-result">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {recommendation}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Modal de Mapa Interactivo Responsivo */}
      {mapPickerTarget && (
        <MapLocationModal
          title={mapPickerTarget === 'startLocation' ? 'Elegir calle de salida' : 'Elegir calle de llegada'}
          onSelect={(locationText) => {
            setForm(prev => ({ ...prev, [mapPickerTarget]: locationText }));
          }}
          onClose={() => setMapPickerTarget(null)}
        />
      )}
    </div>
  );
}
