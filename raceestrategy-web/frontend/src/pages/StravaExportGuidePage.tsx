import { useEffect, useState } from 'react';
import { ArrowLeft, Download, ExternalLink, FileArchive, FileSpreadsheet, HelpCircle, Info, Menu, ShieldCheck, Sparkles, UserCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api, confirmAndDeleteAccount, type User } from '../lib/api';
import { Sidebar } from '../components/Sidebar';

export default function StravaExportGuidePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api<{ user: User }>('/auth/me')
      .then((res) => {
        if (!cancelled) setUser(res.user);
      })
      .catch(() => {
        if (!cancelled) navigate('/');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      navigate('/');
    }
  };

  const deleteAccount = async () => {
    try {
      if (await confirmAndDeleteAccount()) navigate('/', { replace: true });
    } catch {
      // Ignorar o redirigir
    }
  };

  if (loading) {
    return (
      <main className="loading-screen">
        <span className="loader" aria-hidden="true" />
        <p>Cargando guía…</p>
      </main>
    );
  }

  if (!user) return null;

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        logout={logout}
        deleteAccount={deleteAccount}
        open={menuOpen}
        close={() => setMenuOpen(false)}
      />
      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="mobile-only">
            <button
              aria-label="Abrir menú"
              className="icon-btn"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={24} />
            </button>
          </div>
          <span className="breadcrumb">
            <Link to="/dashboard" style={{ color: 'inherit', textDecoration: 'none' }}>
              Resumen
            </Link>{' '}
            / <strong>Guía de exportación Strava</strong>
          </span>
          <div className="topbar-actions">
            <Link to="/dashboard" className="guide-back-link">
              <ArrowLeft size={16} /> Volver al Resumen
            </Link>
          </div>
        </header>

        <div className="dashboard-content guide-content">
          <div className="guide-hero">
            <div className="guide-hero-badge">
              <HelpCircle size={15} /> TUTORIAL PASO A PASO
            </div>
            <h1>Cómo extraer y descargar todos tus datos de Strava</h1>
            <p>
              Strava te permite descargar una copia completa de tu historial deportivo de forma totalmente gratuita y sin necesidad de tener suscripción Strava Subscription.
            </p>
          </div>

          <div className="guide-steps-grid">
            <section className="guide-step-card">
              <div className="guide-step-number">1</div>
              <div className="guide-step-body">
                <h3>Inicia sesión en Strava desde el navegador</h3>
                <p>
                  Entra en la web de Strava desde tu ordenador o navegador móvil (la descarga de datos se solicita desde la web, no desde la app móvil):
                </p>
                <a
                  href="https://www.strava.com/login"
                  target="_blank"
                  rel="noreferrer"
                  className="guide-external-btn"
                >
                  Abrir Strava.com <ExternalLink size={14} />
                </a>
              </div>
            </section>

            <section className="guide-step-card">
              <div className="guide-step-number">2</div>
              <div className="guide-step-body">
                <h3>Ve a la sección «Mi cuenta»</h3>
                <p>
                  Pasa el ratón sobre tu foto de perfil en la esquina superior derecha y haz clic en <strong>Configuración</strong> (o <em>Settings</em>). En el menú lateral izquierdo, haz clic en <strong>Mi cuenta</strong> (<em>My Account</em>).
                </p>
                <p className="guide-tip">
                  <Info size={14} /> Acceso directo: puedes ir directamente a{' '}
                  <a
                    href="https://www.strava.com/athlete/delete_your_account"
                    target="_blank"
                    rel="noreferrer"
                  >
                    strava.com/athlete/delete_your_account
                  </a>{' '}
                  (no te preocupes por el nombre de la URL: es la sección donde Strava ubica la opción de exportación antes de la eliminación de cuenta).
                </p>
              </div>
            </section>

            <section className="guide-step-card">
              <div className="guide-step-number">3</div>
              <div className="guide-step-body">
                <h3>Solicita tu archivo de datos</h3>
                <p>
                  Desplázate hacia abajo hasta el apartado titulado <strong>«Descargar o eliminar tu cuenta»</strong> (<em>Download or Delete Your Account</em>).
                </p>
                <p>
                  En el <strong>Paso 2</strong> («Descargar archivo»), haz clic en el botón naranja <strong>«Solicitar tu archivo»</strong> (<em>Request your archive</em>).
                </p>
                <div className="guide-alert-box">
                  <UserCheck size={16} />
                  <span>
                    Strava empezará a empaquetar tus entrenamientos. Dependiendo del volumen de tu historial, el proceso suele tardar entre 2 y 15 minutos.
                  </span>
                </div>
              </div>
            </section>

            <section className="guide-step-card">
              <div className="guide-step-number">4</div>
              <div className="guide-step-body">
                <h3>Descarga el archivo ZIP desde tu correo</h3>
                <p>
                  Strava te enviará un correo electrónico con el asunto <strong>«Tu archivo de datos de Strava está listo»</strong> que contiene un enlace de descarga directa.
                </p>
                <p>
                  Haz clic en el enlace para descargar un archivo comprimido (ejemplo: <code>export_xxxxxx.zip</code>).
                </p>
              </div>
            </section>

            <section className="guide-step-card guide-step-highlight">
              <div className="guide-step-number">
                <Sparkles size={18} />
              </div>
              <div className="guide-step-body">
                <h3>¡Listo para importar en RaceEstrategy!</h3>
                <p>
                  Vuelve a la pantalla de <strong>Resumen</strong> de RaceEstrategy. Tienes dos formas de subir tus datos según lo que quieras analizar:
                </p>
                <div className="guide-options-compare">
                  <div className="guide-option-item">
                    <div className="guide-option-title">
                      <FileArchive size={18} />
                      <strong>Subir el archivo .ZIP completo (Recomendado)</strong>
                    </div>
                    <p>
                      Importa todo tu historial y además extrae automáticamente las <strong>gráficas de pulsaciones</strong> de tus actividades que tengan frecuencia cardíaca registrada.
                    </p>
                  </div>
                  <div className="guide-option-item">
                    <div className="guide-option-title">
                      <FileSpreadsheet size={18} />
                      <strong>Subir solo el archivo activities.csv</strong>
                    </div>
                    <p>
                      Descomprime el ZIP en tu ordenador, entra en la carpeta y selecciona únicamente el archivo <code>activities.csv</code>. Es instantáneo y guardará las métricas principales (distancia, tiempos, desniveles y pulsaciones medias).
                    </p>
                  </div>
                </div>

                <div className="guide-cta-row">
                  <Link to="/dashboard" className="guide-primary-cta">
                    <Download size={16} /> Ir a importar mi archivo en el Resumen
                  </Link>
                </div>
              </div>
            </section>
          </div>

          <div className="guide-privacy-card">
            <ShieldCheck size={20} />
            <div>
              <strong>Privacidad garantizada</strong>
              <p>
                Tus archivos y datos solo se asocian a tu cuenta para generar tus estadísticas y modelos. No compartimos tus datos con terceros ni se usan para entrenar modelos externos.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
