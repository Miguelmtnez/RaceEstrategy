import { FormEvent, useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, UserRound, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, User } from '../lib/api';
import { Brand, Landscape } from '../components/Brand';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const payload = mode === 'register' ? { name, email, password } : { email, password };
      await api<{ user: User }>(`/auth/${mode === 'register' ? 'register' : 'login'}`, {
        method: 'POST', body: JSON.stringify(payload)
      });
      navigate('/dashboard', { replace: true });
    } catch (err) { setError(err instanceof Error ? err.message : 'Error de conexión.'); }
    finally { setLoading(false); }
  }
  function switchMode(next: 'login' | 'register') { setMode(next); setError(''); setPassword(''); }
  return <main className="auth-layout">
    <section className="auth-scenic">
      <div className="scenic-top"><Brand light /><span className="scenic-label">MOVE WITH PURPOSE <span>✳</span></span></div>
      <div className="scenic-copy"><span className="eyebrow light">TU NUEVA AVENTURA COMIENZA AQUÍ</span>
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
        <h2>{mode === 'register' ? 'Empecemos por ti.' : 'Qué alegría verte de nuevo.'}</h2>
        <p className="auth-subtitle">{mode === 'register' ? 'Crea tu espacio para entender y disfrutar cada entrenamiento.' : 'Inicia sesión para volver a tus rutas y estadísticas.'}</p>
        <div className="auth-switch" role="group" aria-label="Acceso">
          <button className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')} type="button">Crear cuenta</button>
          <button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')} type="button">Iniciar sesión</button>
        </div>
        <form onSubmit={submit} className="auth-fields">
          {mode === 'register' && <label><span>Tu nombre</span><div className="input-wrap"><UserRound size={18}/><input required minLength={2} maxLength={80} autoComplete="name" placeholder="¿Cómo te llamas?" value={name} onChange={e=>setName(e.target.value)}/></div></label>}
          <label><span>Correo electrónico</span><div className="input-wrap"><Mail size={18}/><input required type="email" autoComplete="email" placeholder="tu@email.com" value={email} onChange={e=>setEmail(e.target.value)}/></div></label>
          <label><span>Contraseña</span><div className="input-wrap"><LockKeyhole size={18}/><input required type={showPassword ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 10 : undefined} placeholder="Mínimo 10 caracteres" value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" className="show-password" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={()=>setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-btn auth-submit" type="submit" disabled={loading}>{loading ? 'Un momento…' : mode === 'register' ? 'Crear mi cuenta' : 'Entrar a mi espacio'} <ArrowRight size={19}/></button>
        </form>
        <div className="auth-footnote"><ShieldCheck size={17}/> Tus actividades son privadas y solo podrás verlas tú.</div>
        {mode === 'register' && <div className="auth-benefits"><span><CheckCircle2 size={17}/> Perfil personal</span><span><CheckCircle2 size={17}/> Conexión opcional con Strava</span></div>}
      </div>
      <div className="auth-bottom">© {new Date().getFullYear()} RaceEstrategy <span>Hecho para amantes del deporte <span>✳</span></span></div>
    </section>
  </main>;
}
