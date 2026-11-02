import { useState } from 'react';
import { apiFetch } from '../api';
import { AvatarImage, ICONS, Modal, ownAvatarUrl } from './ui';

const DASHBOARD_ICON = ['M12 20V10', 'M18 20V4', 'M6 20v-4'];

export const ADMIN_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: DASHBOARD_ICON },
  { id: 'prospects', label: 'Prospectos', icon: ICONS.prospects },
  { id: 'shipments', label: 'Embarques', icon: ICONS.shipments },
  { id: 'collections', label: 'Cobros', icon: ICONS.collections },
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

export function ChangePasswordModal({ onClose }) {
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
        <button
          className={`sb-profile${currentTab === 'profile' ? ' active' : ''}`}
          aria-current={currentTab === 'profile' ? 'page' : undefined}
          onClick={() => setTab('profile')}
        >
          <AvatarImage className="sb-avatar" name={displayName} src={ownAvatarUrl(user)} />
          <span className="sb-user-text">
            <span className="sb-user-name">{displayName}</span>
            <span className="sb-user-link">Mi perfil</span>
          </span>
        </button>
        <button className="sb-link sb-logout" onClick={onLogout}>Salir</button>
      </div>
    </aside>
  );
}
