import { useState } from 'react';

const EMPTY_FORM = { username: '', password: '', fullName: '', company: '', country: '', email: '' };

export function Login({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const isRegister = mode === 'register';
  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(isRegister ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isRegister ? form : { username: form.username, password: form.password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo continuar.');
      onAuthenticated(data);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <svg width="36" height="36" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="15" fill="#7A5A32" />
            <circle cx="16" cy="16" r="12.5" fill="#B7D84B" />
            <circle cx="16" cy="16" r="4" fill="#F4F7EC" />
          </svg>
          <span className="login-name">COMEX</span>
        </div>
        <h1>{isRegister ? 'Crear cuenta de cliente' : 'Iniciar sesión'}</h1>
        <p className="login-sub">
          {isRegister ? 'Un administrador va a vincular tu cuenta con tu empresa.' : 'Gestión de exportaciones'}
        </p>

        {isRegister && (
          <>
            <div className="login-field">
              <label htmlFor="fullName">Nombre y apellido</label>
              <input id="fullName" type="text" autoComplete="name" autoFocus value={form.fullName} onChange={update('fullName')} required />
            </div>
            <div className="login-field">
              <label htmlFor="company">Empresa</label>
              <input id="company" type="text" autoComplete="organization" value={form.company} onChange={update('company')} required />
            </div>
            <div className="login-field">
              <label htmlFor="country">País</label>
              <input id="country" type="text" autoComplete="country-name" value={form.country} onChange={update('country')} required />
            </div>
            <div className="login-field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" value={form.email} onChange={update('email')} required />
            </div>
          </>
        )}

        <div className="login-field">
          <label htmlFor="username">Usuario</label>
          <input id="username" type="text" autoComplete="username" autoCapitalize="none" autoFocus={!isRegister} value={form.username} onChange={update('username')} required />
        </div>
        <div className="login-field">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            minLength={isRegister ? 8 : undefined}
            value={form.password}
            onChange={update('password')}
            required
          />
          {isRegister && <div className="kpi-sub">Mínimo 8 caracteres.</div>}
        </div>

        {error && <div className="login-error" role="alert">{error}</div>}

        <button type="submit" className="btn btn-primary login-submit" disabled={saving}>
          {saving ? 'Un momento…' : (isRegister ? 'Crear cuenta' : 'Ingresar')}
        </button>

        <p className="login-switch">
          {isRegister ? '¿Ya tenés cuenta?' : '¿Sos cliente y no tenés cuenta?'}{' '}
          <button type="button" className="link-btn" onClick={() => changeMode(isRegister ? 'login' : 'register')}>
            {isRegister ? 'Iniciá sesión' : 'Registrate'}
          </button>
        </p>
      </form>
    </main>
  );
}
