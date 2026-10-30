import { useEffect, useState } from 'react';
import { SESSION_EXPIRED_EVENT } from './api';
import AdminApp from './AdminApp';
import ClientPortal from './ClientPortal';
import { Login } from './components/Login';
import './index.css';

export default function App() {
  // undefined: todavía no se sabe; null: sin sesión
  const [user, setUser] = useState(undefined);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadSession() {
      try {
        const response = await fetch('/api/auth/me');
        if (response.status === 401) {
          setUser(null);
        } else if (response.ok) {
          setUser(await response.json());
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (err) {
        console.error('Error validando la sesión:', err);
        setError('No se pudo conectar con el servidor.');
      }
    }

    loadSession();

    const handleExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  };

  if (error) {
    return (
      <div className="status-screen">
        <h2>{error}</h2>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Reintentar</button>
      </div>
    );
  }

  if (user === undefined) {
    return <div className="status-screen">Cargando…</div>;
  }

  if (!user) {
    return <Login onAuthenticated={setUser} />;
  }

  return user.role === 'admin'
    ? <AdminApp user={user} onLogout={handleLogout} />
    : <ClientPortal user={user} onLogout={handleLogout} />;
}
