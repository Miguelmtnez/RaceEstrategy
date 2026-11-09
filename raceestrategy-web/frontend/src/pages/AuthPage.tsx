import { FormEvent, useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, UserRound, CheckCircle2, ShieldCheck, KeyRound, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, User } from '../lib/api';
import { Brand, Landscape } from '../components/Brand';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [devResetLink, setDevResetLink] = useState('');
  const navigate = useNavigate();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccessMessage('');
    setDevResetLink('');
    setLoading(true);

    try {
      if (mode === 'forgot') {
        const res = await api<{ ok: boolean; message: string; resetLink?: string }>('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email })
        });
        setSuccessMessage(res.message);
        if (res.resetLink) {
          setDevResetLink(res.resetLink);
        }
      } else {
        const payload = mode === 'register' ? { name, email, password } : { email, password };
        await api<{ user: User }>(`/auth/${mode === 'register' ? 'register' : 'login'}`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión.');
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: 'login' | 'register' | 'forgot') {
    setMode(next);
    setError('');
    setSuccessMessage('');
    setDevResetLink('');
    setPassword('');
  }

  return (
    <main className="auth-layout">
      <section className="auth-scenic">
        <div className="scenic-top"><Brand light /><span className="scenic-label">MOVE WITH PURPOSE <span>✳</span></span></div>
        <div className="scenic-copy">
          <span className="eyebrow light">TU NUEVA AVENTURA COMIENZA AQUÍ</span>
          <h1>Encuentra tu<br/><em>propio ritmo.</em></h1>
          <p>Cada ruta cuenta una historia. Descubre la tuya, conecta tus actividades y observa todo lo que eres capaz de conseguir.</p>
          <div className="scenic-pills"><span>✦ Tus rutas</span><span>✦ Tu progreso</span><span>✦ Tu estrategia</span></div>
        </div>
        <Landscape className="auth-landscape"/>
        <span className="scenic-footer">EL CAMINO ES PARTE DEL VIAJE</span>
      </section>

      <section className="auth-form-area">
        <div className="auth-mobile-brand"><Brand /></div>
        <div className="auth-box">
          <div className="auth-overline"><span className="tiny-dot" /> RACEESTRATEGY CLUB</div>
          <h2>
            {mode === 'register' ? 'Empecemos por ti.' : mode === 'login' ? 'Qué alegría verte de nuevo.' : 'Recuperar contraseña'}
          </h2>
          <p className="auth-subtitle">
            {mode === 'register'
              ? 'Crea tu espacio para entender y disfrutar cada entrenamiento.'
              : mode === 'login'
              ? 'Inicia sesión para volver a tus rutas y estadísticas.'
              : 'Introduce tu correo y te enviaremos un enlace seguro para restablecerla.'}
          </p>

          {mode !== 'forgot' ? (
            <div className="auth-switch" role="group" aria-label="Acceso">
              <button className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')} type="button">Crear cuenta</button>
              <button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')} type="button">Iniciar sesión</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => switchMode('login')}
              style={{ background: 'none', border: 'none', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: '16px', fontWeight: 600, padding: 0 }}
            >
              <ArrowLeft size={16} /> Volver a Iniciar sesión
            </button>
          )}

          <form onSubmit={submit} className="auth-fields">
            {mode === 'register' && (
              <label>
                <span>Tu nombre</span>
                <div className="input-wrap">
                  <UserRound size={18}/>
                  <input required minLength={2} maxLength={80} autoComplete="name" placeholder="¿Cómo te llamas?" value={name} onChange={e=>setName(e.target.value)}/>
                </div>
              </label>
            )}

            <label>
              <span>Correo electrónico</span>
              <div className="input-wrap">
                <Mail size={18}/>
                <input required type="email" autoComplete="email" placeholder="tu@email.com" value={email} onChange={e=>setEmail(e.target.value)}/>
              </div>
            </label>

            {mode !== 'forgot' && (
              <label>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Contraseña</span>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      style={{ background: 'none', border: 'none', color: '#059669', fontSize: '12px', cursor: 'pointer', fontWeight: 500, padding: 0 }}
                    >
                      ¿Has olvidado tu contraseña?
                    </button>
                  )}
                </div>
                <div className="input-wrap">
                  <LockKeyhole size={18}/>
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    minLength={mode === 'register' ? 10 : undefined}
                    placeholder="Mínimo 10 caracteres"
                    value={password}
                    onChange={e=>setPassword(e.target.value)}
                  />
                  <button type="button" className="show-password" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={()=>setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                  </button>
                </div>
              </label>
            )}

            {error && <p className="form-error" role="alert">{error}</p>}
            {successMessage && <p style={{ color: '#059669', fontSize: '14px', background: '#ecfdf5', padding: '10px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>{successMessage}</p>}

            {devResetLink && (
              <div style={{ marginTop: '10px', padding: '12px', background: '#f8fafc', border: '1px dashed #0284c7', borderRadius: '6px', fontSize: '13px' }}>
                <span style={{ fontWeight: 600, color: '#0369a1', display: 'block', marginBottom: '4px' }}>🔗 Enlace directo (Modo Desarrollo):</span>
                <a href={devResetLink} style={{ color: '#0284c7', wordBreak: 'break-all' }}>{devResetLink}</a>
              </div>
            )}

            <button className="primary-btn auth-submit" type="submit" disabled={loading}>
              {loading
                ? 'Un momento…'
                : mode === 'register'
                ? 'Crear mi cuenta'
                : mode === 'login'
                ? 'Entrar a mi espacio'
                : 'Enviar enlace de recuperación'}
              {mode === 'forgot' ? <KeyRound size={19} /> : <ArrowRight size={19}/>}
            </button>
          </form>

          {mode !== 'forgot' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0 16px', gap: '12px' }}>
                <div style={{ flex: 1, height: '1px', background: '#334155' }} />
                <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>O continúa con</span>
                <div style={{ flex: 1, height: '1px', background: '#334155' }} />
              </div>

              <a
                href="/api/auth/google"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '11px 16px',
                  borderRadius: '8px',
                  background: '#ffffff',
                  color: '#1f2937',
                  fontWeight: 600,
                  fontSize: '14px',
                  textDecoration: 'none',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  transition: 'background-color 0.2s',
                  boxSizing: 'border-box'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Continuar con Google
              </a>
            </>
          )}

          <div className="auth-footnote"><ShieldCheck size={17}/> Tus actividades son privadas y solo podrás verlas tú.</div>
          {mode === 'register' && (
            <div className="auth-benefits">
              <span><CheckCircle2 size={17}/> Perfil personal</span>
              <span><CheckCircle2 size={17}/> Conexión opcional con Strava</span>
            </div>
          )}
        </div>
        <div className="auth-bottom">© {new Date().getFullYear()} RaceEstrategy <span>Hecho para amantes del deporte <span>✳</span></span></div>
      </section>
    </main>
  );
}
