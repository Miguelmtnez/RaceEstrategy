import { FormEvent, useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Brand } from '../components/Brand';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('El enlace de recuperación no es válido o no contiene el token necesario.');
      return;
    }

    if (password.length < 10) {
      setError('La contraseña debe tener al menos 10 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      await api<{ ok: boolean; message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password })
      });
      setSuccess(true);
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al restablecer la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-layout" style={{ justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#090d16' }}>
      <div className="auth-box" style={{ maxWidth: '440px', width: '100%', margin: '0 auto', background: '#111827', padding: '32px', borderRadius: '12px', border: '1px solid #1f2937' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <Brand />
        </div>

        <h2>Restablecer contraseña</h2>
        <p className="auth-subtitle" style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '20px' }}>
          Introduce tu nueva contraseña para volver a entrar a tu cuenta.
        </p>

        {!token && (
          <div style={{ background: '#451a1a', border: '1px solid #7f1d1d', color: '#fca5a5', padding: '12px', borderRadius: '6px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <ShieldAlert size={18} /> Enlace inválido o incompleto. Solicita uno nuevo en la pantalla de acceso.
          </div>
        )}

        {success ? (
          <div style={{ background: '#064e3b', border: '1px solid #047857', color: '#6ee7b7', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
            <CheckCircle2 size={32} style={{ margin: '0 auto 8px auto', display: 'block' }} />
            <p style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>¡Contraseña actualizada con éxito!</p>
            <p style={{ fontSize: '13px', color: '#a7f3d0' }}>Redirigiéndote al inicio de sesión en unos segundos…</p>
          </div>
        ) : (
          <form onSubmit={submit} className="auth-fields">
            <label>
              <span>Nueva contraseña</span>
              <div className="input-wrap">
                <LockKeyhole size={18}/>
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  minLength={10}
                  placeholder="Mínimo 10 caracteres"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button type="button" className="show-password" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                </button>
              </div>
            </label>

            <label>
              <span>Confirmar nueva contraseña</span>
              <div className="input-wrap">
                <LockKeyhole size={18}/>
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  minLength={10}
                  placeholder="Repite tu nueva contraseña"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
              </div>
            </label>

            {error && <p className="form-error" role="alert">{error}</p>}

            <button className="primary-btn auth-submit" type="submit" disabled={loading || !token}>
              {loading ? 'Guardando…' : 'Cambiar contraseña'} <ArrowRight size={19}/>
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Volver a la pantalla de acceso
          </button>
        </div>
      </div>
    </main>
  );
}
