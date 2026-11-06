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
  Sparkles
} from 'lucide-react';
import { api, User, getSavedRoutes, deleteSavedRoute, SavedRoute } from '../lib/api';
import { Sidebar } from '../components/Sidebar';

export default function MyRoutesPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<SavedRoute | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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
      setRoutes(res.routes || []);
      if (res.routes && res.routes.length > 0) {
        setSelectedRoute(res.routes[0]);
      }
    } catch (err) {
      console.error('Error al cargar rutas guardadas', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('¿Seguro que deseas eliminar esta ruta de tu colección?')) return;
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

  const getSportIcon = (sport: string) => {
    if (sport === 'Senderismo') return <TreePine size={16} color="#27775f" />;
    if (sport === 'Running') return <Footprints size={16} color="#27775f" />;
    return <Bike size={16} color="#27775f" />;
  };

  if (!user) {
    return (
      <div className="loading-screen">
        <div className="loader" /> Preparando tu espacio…
      </div>
    );
  }

  const firstName = user.name.trim().split(' ')[0] || 'deportista';

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        open={menuOpen}
        close={() => setMenuOpen(false)}
        logout={logout}
        deleteAccount={() => {}}
      />

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="menu-btn"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumbs">
              <span>RaceEstrategy</span>
              <ChevronRight size={14} />
              <span className="current">Mis rutas</span>
            </div>
          </div>
          <div className="topbar-user">
            <div className="user-pill">
              <span className="user-avatar">{firstName[0]?.toUpperCase() || 'U'}</span>
              <span>{firstName}</span>
            </div>
          </div>
        </header>

        <div className="content-container" style={{ maxWidth: '1280px', margin: '0 auto', padding: 'clamp(16px, 3vw, 28px)' }}>
          {/* Header de Sección */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
            <div>
              <span className="eyebrow" style={{ color: '#27775f' }}>COLECCIÓN PERSONAL</span>
              <h1 style={{ fontFamily: 'Manrope, sans-serif', fontSize: 'clamp(1.5rem, 3.5vw, 2rem)', color: '#164332', margin: '4px 0 6px' }}>
                Mis Rutas Guardadas
              </h1>
              <p style={{ color: '#526e5e', fontSize: '14px', margin: 0 }}>
                Todas las estrategias y rutas generadas con IA que has decidido conservar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/rutas')}
              className="primary-btn"
              style={{ padding: '10px 18px', fontSize: '13px', gap: '8px', borderRadius: '12px', textDecoration: 'none' }}
            >
              <Sparkles size={16} /> Crear nueva ruta con IA
            </button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
              <div className="loader" />
            </div>
          ) : routes.length === 0 ? (
            <div
              className="empty-state"
              style={{
                border: '1px dashed #d5e5d8',
                padding: 'clamp(40px, 8vw, 70px) 20px',
                background: '#fafcfa',
                borderRadius: '16px',
                textAlign: 'center'
              }}
            >
              <div className="empty-art" style={{ width: '64px', height: '64px', borderRadius: '20px', margin: '0 auto 16px' }}>
                <MapPinned size={30} color="#27775f" />
              </div>
              <h3 style={{ fontFamily: 'Manrope, sans-serif', color: '#1a4e3b' }}>Aún no tienes rutas guardadas</h3>
              <p style={{ color: '#557262', maxWidth: '440px', margin: '8px auto 20px', fontSize: '14px', lineHeight: 1.6 }}>
                Explora el planificador de rutas con IA, diseña recorridos a tu medida y pulsa en <strong>"Guardar en Mis Rutas"</strong> para acceder a ellos siempre que quieras.
              </p>
              <button
                type="button"
                onClick={() => navigate('/rutas')}
                className="primary-btn"
                style={{ padding: '10px 22px', fontSize: '13px', borderRadius: '12px', margin: '0 auto' }}
              >
                Diseñar mi primera ruta
              </button>
            </div>
          ) : (
            <div className="routes-layout-grid">
              {/* Lista de Rutas Guardadas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#4a6b58', textTransform: 'uppercase' }}>
                    Tus rutas ({routes.length})
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '720px', overflowY: 'auto', paddingRight: '4px' }}>
                  {routes.map(r => {
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
                        style={{
                          background: isSelected ? '#f2f8f4' : '#ffffff',
                          border: isSelected ? '2px solid #27775f' : '1px solid #e1ece4',
                          borderRadius: '14px',
                          padding: '16px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: '#eaf4eb',
                                color: '#1f5a46',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                              }}
                            >
                              {getSportIcon(r.sport)} {r.sport}
                            </span>
                            <span style={{ fontSize: '12px', color: '#688775', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <CalendarDays size={12} /> {dateStr}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => handleDelete(r.id, e)}
                            disabled={deletingId === r.id}
                            title="Eliminar de mis rutas"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#a34848',
                              cursor: 'pointer',
                              padding: '4px',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        <strong style={{ fontSize: '15px', color: '#1a4e3b', fontFamily: 'Manrope, sans-serif' }}>
                          {r.title}
                        </strong>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: '#456653' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                            <RouteIcon size={13} color="#27775f" /> {r.distance}
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                            <Mountain size={13} color="#27775f" /> {r.elevation}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

                {/* Detalle de la Ruta Seleccionada */}
              <div className="data-panel" style={{ padding: 'clamp(18px, 3.5vw, 26px)', minHeight: '400px' }}>
                {selectedRoute ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
                      <div>
                        <span className="eyebrow" style={{ color: '#27775f' }}>DETALLE DEL PLAN</span>
                        <h2 style={{ fontFamily: 'Manrope, sans-serif', color: '#164332', fontSize: '1.4rem', margin: '4px 0 6px' }}>
                          {selectedRoute.title}
                        </h2>
                        <span style={{ fontSize: '12px', color: '#557262' }}>
                          De <strong>{selectedRoute.start_location}</strong> a <strong>{selectedRoute.end_location || selectedRoute.start_location}</strong>
                        </span>
                      </div>

                      {selectedRoute.maps_url && (
                        <a
                          href={selectedRoute.maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="primary-btn"
                          style={{
                            padding: '9px 16px',
                            fontSize: '12px',
                            gap: '8px',
                            borderRadius: '10px',
                            textDecoration: 'none',
                          }}
                        >
                          Ver en Google Maps <ExternalLink size={15} />
                        </a>
                      )}
                    </div>

                    <div className="ai-route-result">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selectedRoute.recommendation}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', placeItems: 'center', minHeight: '300px', color: '#688775' }}>
                    Selecciona una ruta de la lista para ver su detalle
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
