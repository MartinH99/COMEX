import { useState } from 'react';
import { apiFetch } from '../api';
import { Modal } from './ui';

const ICONS = {
  dashboard: ['M12 20V10', 'M18 20V4', 'M6 20v-4'],
  prospects: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'M14 2v6h6', 'M9 13h6', 'M9 17h6'],
  shipments: ['M2 20h20', 'M4 20l-1-6h18l-2 6', 'M6 14V8h12v6', 'M12 8V3'],
  clients: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  calibers: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  users: ['M12 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M5 21a7 7 0 0 1 14 0', 'M12 2v2']
};

export const ADMIN_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: ICONS.dashboard },
  { id: 'prospects', label: 'Prospectos', icon: ICONS.prospects },
  { id: 'shipments', label: 'Embarques', icon: ICONS.shipments },
  { id: 'clients', label: 'Clientes', icon: ICONS.clients },
  { id: 'calibers', label: 'Calibres', icon: ICONS.calibers },
  { id: 'users', label: 'Usuarios', icon: ICONS.users }
];

export const CLIENT_NAV = [
  { id: 'shipments', label: 'Mis embarques', icon: ICONS.shipments },
  { id: 'prospects', label: 'Mis prospectos', icon: ICONS.prospects }
];

function NavItem({ item, active, badge, onClick }) {
  return (
    <button
      className={`nav-item${active ? ' active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {item.icon.map(d => <path key={d} d={d} />)}
      </svg>
      {item.label}
      {badge > 0 && <span className="nav-count" aria-label={`${badge} pendientes`}>{badge}</span>}
    </button>
  );
}

function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cambiar la contraseña.');
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Cambiar contraseña" onClose={onClose}>
      {saved ? (
        <>
          <p>Tu contraseña se actualizó y se cerraron tus otras sesiones.</p>
          <div className="modal-actions">
            <button className="btn btn-primary" autoFocus onClick={onClose}>Listo</button>
          </div>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="modal-field">
            <label htmlFor="currentPassword">Contraseña actual</label>
            <input id="currentPassword" type="password" autoComplete="current-password" autoFocus value={form.currentPassword} onChange={update('currentPassword')} required />
          </div>
          <div className="modal-field">
            <label htmlFor="newPassword">Contraseña nueva (mínimo 8 caracteres)</label>
            <input id="newPassword" type="password" autoComplete="new-password" minLength={8} value={form.newPassword} onChange={update('newPassword')} required />
          </div>
          {error && <div className="modal-note alert" role="alert">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-subtle" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Cambiar'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function Sidebar({ items, currentTab, setTab, user, onLogout, badges = {}, unread, onOpenNotifications }) {
  const [showPassword, setShowPassword] = useState(false);

  // Los formularios de alta son parte de su sección
  const parentTab = { 'new-shipment': 'shipments', 'prospect-form': 'prospects' };
  const activeTab = parentTab[currentTab] || currentTab;
  const displayName = user.fullName || user.username;

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <button className="sb-home" aria-label="COMEX, ir al inicio" title="Ir al inicio" onClick={() => setTab('home')}>
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="15" fill="#7A5A32" />
            <circle cx="16" cy="16" r="12.5" fill="#B7D84B" />
            <circle cx="16" cy="16" r="4" fill="#F4F7EC" />
          </svg>
          <span className="sb-name">COMEX</span>
        </button>
        {onOpenNotifications && (
          <button
            className="bell"
            aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
            title="Notificaciones"
            onClick={onOpenNotifications}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
            {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
          </button>
        )}
      </div>
      <div className="sb-sub">Gestión de exportaciones</div>

      <nav className="sb-nav">
        {items.map(item => (
          <NavItem key={item.id} item={item} active={activeTab === item.id} badge={badges[item.id]} onClick={() => setTab(item.id)} />
        ))}
      </nav>

      <div className="sb-user">
        <div className="sb-avatar" aria-hidden="true">{displayName.charAt(0).toUpperCase()}</div>
        <div className="sb-user-text">
          <div className="sb-user-name">{displayName}</div>
          <button className="sb-link" onClick={() => setShowPassword(true)}>Cambiar contraseña</button>
        </div>
        <button className="sb-link sb-logout" onClick={onLogout}>Salir</button>
      </div>

      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} />}
    </aside>
  );
}
