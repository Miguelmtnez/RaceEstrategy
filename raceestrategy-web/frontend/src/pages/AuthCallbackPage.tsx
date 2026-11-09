import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, User } from '../lib/api';
import { Brand } from '../components/Brand';

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
    <main className="auth-layout" style={{ justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#090d16' }}>
      <div className="auth-box" style={{ maxWidth: '440px', width: '100%', margin: '0 auto', background: '#111827', padding: '32px', borderRadius: '12px', border: '1px solid #1f2937', textAlign: 'center' }}>
        <Brand />
        <h2 style={{ marginTop: '20px' }}>Iniciando sesión con Google…</h2>
        {error ? (
          <div style={{ marginTop: '16px' }}>
            <p style={{ color: '#ef4444', fontSize: '14px', marginBottom: '16px' }}>{error}</p>
            <button
              onClick={() => navigate('/')}
              className="primary-btn"
              style={{ margin: '0 auto' }}
            >
              Volver a la pantalla de acceso
            </button>
          </div>
        ) : (
          <p style={{ color: '#9ca3af', fontSize: '14px', marginTop: '12px' }}>
            Verificando tu cuenta y preparando tu espacio personal…
          </p>
        )}
      </div>
    </main>
  );
}
