import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import {
  MapPinned,
  Trash2,
  ExternalLink,
  CalendarDays,
  Mountain,
  Route as RouteIcon,
  Bike,
  Footprints,
  TreePine,
  Menu,
  ChevronRight,
  Sparkles,
  MapPin,
  Clock,
  Compass,
  ArrowRight
} from 'lucide-react';
import { api, confirmAndDeleteAccount, User, getSavedRoutes, deleteSavedRoute, SavedRoute } from '../lib/api';
import { Sidebar } from '../components/Sidebar';

export default function MyRoutesPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<SavedRoute | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [filterSport, setFilterSport] = useState<string>('all');

  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then(res => {
        setUser(res.user);
        loadRoutes();
      })
      .catch(() => navigate('/'));
  }, [navigate]);

  const loadRoutes = async () => {
    setLoading(true);
    try {
      const res = await getSavedRoutes();
      const list = res.routes || [];
      setRoutes(list);
      if (list.length > 0) {
        setSelectedRoute(list[0]);
      }
    } catch (err) {
      console.error('Error al cargar rutas guardadas', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('¿Seguro que deseas eliminar esta ruta de tu colección personal?')) return;
    setDeletingId(id);
    try {
      await deleteSavedRoute(id);
      const updated = routes.filter(r => r.id !== id);
      setRoutes(updated);
      if (selectedRoute?.id === id) {
        setSelectedRoute(updated[0] || null);
      }
    } catch {
      alert('No se pudo eliminar la ruta.');
    } finally {
      setDeletingId(null);
    }
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
      navigate('/');
    } catch {
      // Ignorar error al salir
    }
  };

  const deleteAccount = async () => {
    try {
      if (await confirmAndDeleteAccount()) navigate('/', { replace: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar la cuenta.');
    }
  };

  const getSportIcon = (sport: string) => {
    if (sport === 'Senderismo') return <TreePine size={16} />;
    if (sport === 'Running') return <Footprints size={16} />;
    return <Bike size={16} />;
  };

  if (!user) {
    return (
      <div className="loading-screen">
        <div className="loader" /> Preparando tu espacio…
      </div>
    );
  }

  const firstName = user.name.trim().split(' ')[0] || 'deportista';

  const filteredRoutes = routes.filter(r => {
    if (filterSport === 'all') return true;
    return r.sport.toLowerCase() === filterSport.toLowerCase();
  });

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        open={menuOpen}
        close={() => setMenuOpen(false)}
        logout={logout}
        deleteAccount={() => void deleteAccount()}
      />

      <main className="dashboard-main">
        {/* Topbar idéntica al Dashboard y Rutas */}
        <header className="dashboard-topbar">
          <div className="mobile-only">
            <button aria-label="Abrir menú" className="icon-btn" onClick={() => setMenuOpen(true)}>
              <Menu size={24} />
            </button>
          </div>
          <span className="breadcrumb">
            Mi espacio <ChevronRight size={15} /> <strong>Mis rutas guardadas</strong>
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

        <div className="dashboard-content">
          {/* Encabezado de la página */}
          <div className="intro-heading">
            <div>
              <span className="eyebrow">
                COLECCIÓN PERSONAL <span className="tiny-dot" />
              </span>
              <h1>Mis Rutas Guardadas</h1>
              <p>Estrategias y planes de recorrido generados con IA guardados en tu perfil.</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/rutas')}
              className="primary-btn"
              style={{ padding: '11px 18px', fontSize: '13px', borderRadius: '12px' }}
            >
              <Sparkles size={16} /> Crear nueva ruta
            </button>
          </div>

          {/* Banner Hero estilo RaceEstrategy */}
          <div className="hero-banner" style={{ minHeight: '160px', marginBottom: '25px' }}>
            <div className="hero-copy" style={{ padding: '24px 32px' }}>
              <span className="hero-pill">
                <Compass size={14} /> TU BIBLIOTECA DE ESTRATEGIAS
              </span>
              <h2 style={{ fontSize: 'clamp(20px, 2.3vw, 28px)', margin: '12px 0 6px' }}>
                {routes.length === 1 ? '1 ruta disponible' : `${routes.length} rutas listas`} para tus próximas salidas.
              </h2>
              <p style={{ maxWidth: '600px' }}>
                Consulta los desniveles, waypoints clave y recomendaciones nutricionales para cada recorrido.
              </p>
            </div>
          </div>

          {/* Filtros por deporte */}
          {routes.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setFilterSport('all')}
                style={{
                  border: filterSport === 'all' ? '1px solid #27775f' : '1px solid #e1e8e1',
                  background: filterSport === 'all' ? '#27775f' : '#ffffff',
                  color: filterSport === 'all' ? '#ffffff' : '#527762',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Todas ({routes.length})
              </button>
              {['Ciclismo', 'Running', 'Senderismo'].map(sp => {
                const count = routes.filter(r => r.sport.toLowerCase() === sp.toLowerCase()).length;
                if (count === 0) return null;
                const active = filterSport.toLowerCase() === sp.toLowerCase();
                return (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => setFilterSport(sp)}
                    style={{
                      border: active ? '1px solid #27775f' : '1px solid #e1e8e1',
                      background: active ? '#27775f' : '#ffffff',
                      color: active ? '#ffffff' : '#527762',
                      padding: '8px 16px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {getSportIcon(sp)} {sp} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {loading ? (
            <div className="stats-loading">
              <div className="loader" /> Cargando tus rutas guardadas…
            </div>
          ) : routes.length === 0 ? (
            <div className="empty-state">
              <div className="empty-art">
                <MapPinned size={34} />
              </div>
              <h3>Aún no tienes rutas guardadas</h3>
              <p>
                Diseña recorridos a tu medida con el generador de rutas con IA y pulsa en <strong>"Guardar en Mis Rutas"</strong> para tenerlas siempre a mano en cualquier momento.
              </p>
              <button
                type="button"
                onClick={() => navigate('/rutas')}
                className="primary-btn"
                style={{ marginTop: '20px', padding: '12px 24px', fontSize: '13px' }}
              >
                <Sparkles size={16} /> Diseñar mi primera ruta
              </button>
            </div>
          ) : (
            <div className="routes-layout-grid">
              {/* Columna Izquierda: Tarjetas de las rutas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <span className="eyebrow" style={{ fontSize: '11px' }}>
                    RUTAS DISPONIBLES ({filteredRoutes.length})
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '780px', overflowY: 'auto', paddingRight: '4px' }}>
                  {filteredRoutes.map(r => {
                    const isSelected = selectedRoute?.id === r.id;
                    const dateStr = new Date(r.created_at).toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    });

                    return (
                      <div
                        key={r.id}
                        onClick={() => setSelectedRoute(r)}
                        className="stat-card"
                        style={{
                          minHeight: 'auto',
                          padding: '18px 20px',
                          cursor: 'pointer',
                          border: isSelected ? '2px solid #27775f' : '1px solid #ebf0eb',
                          background: isSelected ? '#f5fbf7' : '#ffffff',
                          boxShadow: isSelected ? '0 4px 18px rgba(39, 119, 95, 0.12)' : '0 2px 10px rgba(0,0,0,0.02)',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span className="panel-chip" style={{ background: '#eaf4eb', color: '#1f5a46', fontWeight: 700 }}>
                              {getSportIcon(r.sport)} {r.sport}
                            </span>
                            <span style={{ fontSize: '11px', color: '#889e90', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={12} /> {dateStr}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => handleDelete(r.id, e)}
                            disabled={deletingId === r.id}
                            title="Eliminar ruta"
                            style={{
                              background: 'transparent',
                              border: 0,
                              color: '#a03c39',
                              cursor: 'pointer',
                              padding: '5px',
                              borderRadius: '8px',
                              display: 'grid',
                              placeItems: 'center',
                              opacity: deletingId === r.id ? 0.4 : 0.85
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        <div>
                          <h4 style={{ fontFamily: 'Manrope, sans-serif', fontSize: '16px', color: '#164332', margin: '0 0 6px', fontWeight: 800 }}>
                            {r.title}
                          </h4>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#688574', fontSize: '12px' }}>
                            <MapPin size={13} style={{ flexShrink: 0, color: '#27775f' }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.start_location}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', borderTop: '1px solid #eef3ef', paddingTop: '10px', fontSize: '12px', color: '#446654' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700 }}>
                            <RouteIcon size={14} color="#27775f" /> {r.distance}
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700 }}>
                            <Mountain size={14} color="#27775f" /> {r.elevation}
                          </span>
                          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', color: isSelected ? '#27775f' : '#a0b3a6', fontSize: '11px', fontWeight: 600 }}>
                            Ver plan <ArrowRight size={13} style={{ marginLeft: '3px' }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Columna Derecha: Detalle de la ruta seleccionada */}
              <div className="data-panel" style={{ padding: 'clamp(20px, 3.5vw, 32px)', minHeight: '520px' }}>
                {selectedRoute ? (
                  <div>
                    {/* Header del detalle */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', borderBottom: '1px solid #eef3ef', paddingBottom: '18px' }}>
                      <div style={{ flex: 1, minWidth: '240px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span className="panel-chip" style={{ background: '#eaf4eb', color: '#1f5a46', fontWeight: 700 }}>
                            {getSportIcon(selectedRoute.sport)} {selectedRoute.sport}
                          </span>
                          <span className="eyebrow" style={{ fontSize: '11px' }}>
                            PLAN PERSONALIZADO
                          </span>
                        </div>
                        <h2 style={{ fontFamily: 'Manrope, sans-serif', color: '#164332', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', margin: '0 0 8px', letterSpacing: '-0.5px' }}>
                          {selectedRoute.title}
                        </h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#557262' }}>
                          <MapPin size={15} color="#27775f" />
                          <span>
                            Salida: <strong>{selectedRoute.start_location}</strong>
                            {selectedRoute.end_location && selectedRoute.end_location !== selectedRoute.start_location && (
                              <> · Llegada: <strong>{selectedRoute.end_location}</strong></>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Métricas destacadas en píldoras */}
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ background: '#f5f8f5', border: '1px solid #e3eee5', padding: '8px 14px', borderRadius: '12px', textAlign: 'center' }}>
                          <span style={{ fontSize: '10px', color: '#7a9686', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>Distancia</span>
                          <strong style={{ fontSize: '15px', color: '#164332', fontFamily: 'Manrope, sans-serif' }}>{selectedRoute.distance}</strong>
                        </div>
                        <div style={{ background: '#f5f8f5', border: '1px solid #e3eee5', padding: '8px 14px', borderRadius: '12px', textAlign: 'center' }}>
                          <span style={{ fontSize: '10px', color: '#7a9686', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>Desnivel</span>
                          <strong style={{ fontSize: '15px', color: '#164332', fontFamily: 'Manrope, sans-serif' }}>{selectedRoute.elevation}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Banner de Google Maps si existe */}
                    {selectedRoute.maps_url && (
                      <div className="routes-maps-banner">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#ffffff', display: 'grid', placeItems: 'center', color: '#27775f', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                            <Compass size={22} />
                          </div>
                          <div>
                            <strong style={{ display: 'block', fontSize: '14px', color: '#164332', fontFamily: 'Manrope, sans-serif' }}>
                              Itinerario en Google Maps disponible
                            </strong>
                            <p style={{ margin: 0, fontSize: '12px', color: '#4f725f' }}>
                              Abre el itinerario generado paso a paso en tu móvil o navegador GPS.
                            </p>
                          </div>
                        </div>

                        <a
                          href={selectedRoute.maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="primary-btn"
                          style={{
                            padding: '10px 18px',
                            fontSize: '13px',
                            gap: '8px',
                            borderRadius: '11px',
                            textDecoration: 'none',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          Abrir mapa GPS <ExternalLink size={15} />
                        </a>
                      </div>
                    )}

                    {/* Contenido Markdown con la clase ai-route-result unificada */}
                    <div className="ai-route-result">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selectedRoute.recommendation}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', placeItems: 'center', minHeight: '380px', color: '#7a9686', textAlign: 'center' }}>
                    <div>
                      <MapPinned size={40} style={{ opacity: 0.4, margin: '0 auto 12px', display: 'block' }} />
                      <p style={{ margin: 0, fontSize: '14px' }}>Selecciona una ruta de la lista para ver su estrategia completa.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
