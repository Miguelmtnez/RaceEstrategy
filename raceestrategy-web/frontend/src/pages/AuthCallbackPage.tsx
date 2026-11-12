import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, LoaderCircle, ShieldCheck } from 'lucide-react';
import { api, User } from '../lib/api';
import { Brand, Landscape } from '../components/Brand';

export default function AuthCallbackPage() {
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    async function handleAuth() {
      try {
        // Supabase OAuth devuelve los tokens en el fragmento hash de la URL (#access_token=...&...)
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');

        if (!accessToken) {
          // Si vino por query string en vez de hash
          const queryParams = new URLSearchParams(window.location.search);
          const errDesc = queryParams.get('error_description') || queryParams.get('error');
          if (errDesc) throw new Error(errDesc);
          throw new Error('No se recibió el token de autenticación de Google.');
        }

        // Enviamos el access_token al backend para que verifique y cree la cookie de sesión de RaceEstrategy
        await api<{ user: User }>('/auth/google/session', {
          method: 'POST',
          body: JSON.stringify({ access_token: accessToken })
        });

        // Redirigir directamente al Dashboard
        navigate('/dashboard', { replace: true });
      } catch (err) {
        console.error('Error procesando callback de Google:', err);
        setError(err instanceof Error ? err.message : 'Error al iniciar sesión con Google.');
      }
    }

    handleAuth();
  }, [navigate]);

  return (
    <main className="auth-layout">
      <section className="auth-scenic">
        <div className="scenic-top"><Brand light /><span className="scenic-label">MOVE WITH PURPOSE <span>✳</span></span></div>
        <div className="scenic-copy">
          <span className="eyebrow light">TU CAMINO, A TU RITMO</span>
          <h1>Un nuevo paso<br/><em>empieza aquí.</em></h1>
          <p>Tu espacio deportivo te espera. Estamos preparando el acceso a tus rutas, actividades y progresos.</p>
        </div>
        <Landscape className="auth-landscape"/>
        <span className="scenic-footer">EL CAMINO ES PARTE DEL VIAJE</span>
      </section>

      <section className="auth-form-area">
        <div className="auth-mobile-brand"><Brand /></div>
        <div className="auth-box callback-box" aria-live="polite">
          <div className="auth-overline"><span className="tiny-dot" /> {error ? 'ACCESO NO COMPLETADO' : 'CONECTANDO TU CUENTA'}</div>
          <div className={`callback-icon${error ? ' has-error' : ''}`}>
            {error ? <AlertCircle size={25}/> : <LoaderCircle size={25}/>}
          </div>
          <h2>{error ? 'No se pudo completar el acceso.' : 'Preparando tu espacio.'}</h2>
          <p className="auth-subtitle">
            {error
              ? 'No hemos podido verificar tu cuenta. Vuelve a intentarlo para entrar en tu espacio.'
              : 'Estamos verificando tu cuenta y organizando tus actividades. Esto solo tardará un momento.'}
          </p>
          {error ? (
            <>
              <div className="callback-error" role="alert">{error}</div>
              <button onClick={() => navigate('/')} className="primary-btn callback-button">
                <ArrowLeft size={17}/> Volver al acceso
              </button>
            </>
          ) : (
            <div className="callback-progress" role="status">
              <span className="loader" aria-hidden="true"/>
              <span>Conectando de forma segura…</span>
            </div>
          )}
          <div className="callback-privacy"><ShieldCheck size={17}/> Tus datos se mantienen privados y seguros.</div>
        </div>
        <div className="auth-bottom">© {new Date().getFullYear()} RaceEstrategy <span>Hecho para amantes del deporte <span>✳</span></span></div>
      </section>
    </main>
  );
}
