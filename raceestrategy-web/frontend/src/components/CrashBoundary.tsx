import React from 'react';

type Props = { children: React.ReactNode };
type State = { failed: boolean };

/** Evita que una excepción inesperada deje una pantalla en blanco sin explicación. */
export class CrashBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[RaceEstrategy] Error al renderizar la interfaz:', error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f6f8f3', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: 540, background: 'white', border: '1px solid #dce8de', borderRadius: 22, padding: 32, boxShadow: '0 14px 40px #214e2b12' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🌿</div>
          <h1 style={{ color: '#234a37', margin: '0 0 12px', fontSize: 25 }}>No se ha podido mostrar esta pantalla</h1>
          <p style={{ color: '#52675a', lineHeight: 1.65 }}>La interfaz ha encontrado un error. Puedes volver a la página de acceso o recargar. Si continúa, abre F12 → Consola y copia el primer error rojo.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
            <button type="button" onClick={() => window.location.assign('/')} style={{ border: 0, borderRadius: 10, padding: '12px 18px', background: '#2c806a', color: '#fff', cursor: 'pointer' }}>Volver al inicio</button>
            <button type="button" onClick={() => window.location.reload()} style={{ border: '1px solid #dce8de', borderRadius: 10, padding: '12px 18px', background: 'white', color: '#234a37', cursor: 'pointer' }}>Recargar</button>
          </div>
        </div>
      </main>
    );
  }
}
