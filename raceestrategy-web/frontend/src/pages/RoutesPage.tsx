import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, Sparkles, Loader2, Navigation, AlertCircle } from 'lucide-react';
import { api, User, getRouteRecommendation, RouteParams } from '../lib/api';
import { Sidebar } from '../components/Sidebar';

export default function RoutesPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [activitiesCount, setActivitiesCount] = useState<number>(0);

  const [form, setForm] = useState<RouteParams>({
    targetDistance: '50 km',
    targetElevation: 'Moderado (~500m)',
    routeType: 'Circular por la costa y media montaña',
    startLocation: 'Alicante centro',
  });

  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then(res => setUser(res.user))
      .catch(() => navigate('/'));
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRecommendation(null);

    try {
      const res = await getRouteRecommendation(form, 'import');
      setRecommendation(res.recommendation);
      setActivitiesCount(res.usedActivitiesCount);
    } catch (err: any) {
      setError(err.message || 'Error al conectar con la IA de Gemini.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="layout">
      <Sidebar
        user={user}
        open={sidebarOpen}
        close={() => setSidebarOpen(false)}
        logout={() => api('/auth/logout', { method: 'POST' }).then(() => navigate('/'))}
        deleteAccount={() => {}}
      />

      <main className="main-content">
        <header className="page-header" style={{ marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.6rem' }}>
              <Compass className="text-primary" size={28} /> Generador de Rutas con IA (Gemini)
            </h1>
            <p className="text-muted" style={{ marginTop: '0.25rem' }}>
              Gemini analiza tus últimas actividades y diseña una ruta personalizada para tu entrenamiento de hoy.
            </p>
          </div>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {/* Formulario de Parámetros */}
          <div className="card" style={{ padding: '1.5rem', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Navigation size={18} /> Parámetros para la nueva ruta
            </h2>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Distancia objetivo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: ~50 km o 15 km"
                  value={form.targetDistance}
                  onChange={e => setForm({ ...form, targetDistance: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Desnivel buscado
                </label>
                <input
                  type="text"
                  placeholder="Ej: Alto / Moderado / Llano (~400m)"
                  value={form.targetElevation}
                  onChange={e => setForm({ ...form, targetElevation: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Tipo de recorrido
                </label>
                <input
                  type="text"
                  placeholder="Ej: Circular por la costa, interior de montaña..."
                  value={form.routeType}
                  onChange={e => setForm({ ...form, routeType: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Punto de salida / llegada
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Alicante centro, Playa San Juan..."
                  value={form.startLocation}
                  onChange={e => setForm({ ...form, startLocation: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                {loading ? 'Consultando a Gemini...' : 'Generar recomendación'}
              </button>
            </form>

            {error && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', display: 'flex', gap: '0.5rem' }}>
                <AlertCircle size={18} /> <span>{error}</span>
              </div>
            )}
          </div>

          {/* Resultado de la recomendación */}
          <div className="card" style={{ padding: '1.5rem', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', minHeight: '300px' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={18} className="text-primary" /> Estrategia y Ruta Propuesta
            </h2>

            {loading && (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto 1rem' }} />
                <p>Analizando tus últimas 10 actividades y trazando la ruta óptima...</p>
              </div>
            )}

            {!loading && !recommendation && (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                <Compass size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                <p>Introduce tus preferencias en el formulario y pulsa <strong>"Generar recomendación"</strong> para que Gemini cree tu plan de hoy.</p>
              </div>
            )}

            {!loading && recommendation && (
              <div>
                <div style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', color: '#166534', fontSize: '0.85rem' }}>
                  ✓ Ruta personalizada calculada en base a <strong>{activitiesCount} actividades</strong> recientes.
                </div>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '0.95rem', color: '#334155' }}>
                  {recommendation}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}