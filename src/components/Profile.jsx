import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import { prepareAvatar } from '../lib/avatarImage';
import { NOTIFICATION_TYPES } from './NotificationCenter';
import { ChangePasswordModal } from './Sidebar';
import { AvatarImage, ICONS, Icon, PhotoViewer, Stat, formatDateTime, formatUsd, ownAvatarUrl } from './ui';

const formatMonth = (value) => new Date(`${value.replace(' ', 'T')}Z`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

const editableValues = (user) => ({
  fullName: user.fullName || '',
  username: user.username || '',
  email: user.email || '',
  country: user.country || ''
});

export function Profile({ user, onUserChange, onOpenShipment }) {
  const [summary, setSummary] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => editableValues(user));
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const fileInput = useRef(null);

  const isAdmin = user.role === 'admin';
  const displayName = user.fullName || user.username;
  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  useEffect(() => {
    let ignore = false;
    apiFetch('/api/auth/profile')
      .then(response => {
        if (!response.ok) throw new Error('No se pudo cargar tu actividad.');
        return response.json();
      })
      .then(data => { if (!ignore) setSummary(data); })
      .catch(err => { if (!ignore) setLoadError(err.message); });
    return () => { ignore = true; };
  }, []);

  const sendAvatar = async (method, body) => {
    const response = await apiFetch('/api/auth/avatar', { method, headers: body ? { 'Content-Type': body.type } : undefined, body });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo actualizar la foto.');
    onUserChange(data);
  };

  const runAvatarChange = async (action) => {
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      await action();
    } catch (err) {
      setAvatarError(err.message);
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAvatarFile = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) runAvatarChange(async () => sendAvatar('PUT', await prepareAvatar(file)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setSaved(false);
    try {
      const response = await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron guardar los cambios.');
      onUserChange(data);
      setEditing(false);
      setSaved(true);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const stats = summary?.stats;

  return (
    <section className="profile">
      <div className="profile-cover">
        <div className="profile-avatar-wrap">
          {user.hasAvatar ? (
            <button type="button" className="profile-avatar-open" aria-label="Ver foto de perfil" onClick={() => setShowPhoto(true)}>
              <AvatarImage className="profile-avatar" name={displayName} src={ownAvatarUrl(user)} />
            </button>
          ) : (
            <AvatarImage className="profile-avatar" name={displayName} src={null} />
          )}
          <button
            type="button"
            className="profile-avatar-edit"
            aria-label={user.hasAvatar ? 'Cambiar foto de perfil' : 'Agregar foto de perfil'}
            title={user.hasAvatar ? 'Cambiar foto' : 'Agregar foto'}
            disabled={avatarBusy}
            onClick={() => fileInput.current.click()}
          >
            <Icon paths={['M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z', 'M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z']} size={15} />
          </button>
          <input ref={fileInput} className="profile-avatar-input" type="file" aria-label="Elegir foto de perfil" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarFile} />
        </div>
        <div className="profile-identity">
          <h1>{displayName}</h1>
          <p>@{user.username}</p>
          <div className="profile-tags">
            <span className="profile-tag">{isAdmin ? 'Administrador' : 'Cliente'}</span>
            {user.clientCompany && <span className="profile-tag">{user.clientCompany}</span>}
            {user.status === 'pending' && <span className="profile-tag profile-tag-pending">Pendiente de aprobación</span>}
          </div>
          <div className="profile-avatar-actions">
            <button type="button" disabled={avatarBusy} onClick={() => fileInput.current.click()}>
              {avatarBusy ? 'Guardando…' : (user.hasAvatar ? 'Cambiar foto' : 'Agregar foto')}
            </button>
            {user.hasAvatar && (
              <button type="button" disabled={avatarBusy} onClick={() => runAvatarChange(() => sendAvatar('DELETE'))}>Quitar foto</button>
            )}
          </div>
          {avatarError && <div className="profile-avatar-error" role="alert">{avatarError}</div>}
        </div>
      </div>

      <div className="kpi-grid stat-grid">
        {isAdmin ? (
          <>
            <Stat icon={ICONS.trend} label="Movimientos" value={stats?.movements ?? '—'} sub="Registrados por vos" />
            <Stat icon={ICONS.clock} label="Últimos 30 días" value={stats?.recent ?? '—'} sub="Movimientos recientes" />
            <Stat icon={ICONS.shipments} label="Embarques creados" value={stats?.shipmentsCreated ?? '—'} sub="Con tu usuario" />
            <Stat icon={ICONS.collections} label="Cobros registrados" value={stats?.paymentsRegistered ?? '—'} sub="Con tu usuario" />
          </>
        ) : (
          <>
            <Stat icon={ICONS.box} label="Embarques" value={stats?.shipments ?? '—'} sub={`${stats?.inTransit ?? 0} en tránsito`} />
            <Stat icon={ICONS.check} label="Entregados" value={stats?.delivered ?? '—'} sub="Con entrega registrada" />
            <Stat icon={ICONS.prospects} label="Propuestas" value={stats?.prospects ?? '—'} sub="Enviadas a tu empresa" />
            <Stat icon={ICONS.collections} label="Total comprado" value={stats ? formatUsd(stats.totalUsd) : '—'} sub="Suma de tus embarques" />
          </>
        )}
      </div>

      <div className="profile-columns">
        <div className="profile-side">
          <div className="section">
            <div className="section-header">
              <h2>Datos personales</h2>
              {!editing && (
                <div className="right">
                  <button
                    className="btn btn-small"
                    onClick={() => { setForm(editableValues(user)); setFormError(null); setSaved(false); setEditing(true); }}
                  >
                    Editar
                  </button>
                </div>
              )}
            </div>
            <div className="section-body">
              {editing ? (
                <form className="profile-form" onSubmit={handleSubmit}>
                  <div>
                    <label htmlFor="profileName">Nombre y apellido</label>
                    <input id="profileName" type="text" autoComplete="name" autoFocus maxLength={120} value={form.fullName} onChange={update('fullName')} required />
                  </div>
                  <div>
                    <label htmlFor="profileUsername">Usuario</label>
                    <input id="profileUsername" type="text" autoComplete="username" autoCapitalize="none" maxLength={60} value={form.username} onChange={update('username')} required />
                  </div>
                  <div>
                    <label htmlFor="profileEmail">Email</label>
                    <input id="profileEmail" type="email" autoComplete="email" maxLength={160} value={form.email} onChange={update('email')} required={!isAdmin} />
                  </div>
                  {!isAdmin && (
                    <div>
                      <label htmlFor="profileCountry">País</label>
                      <input id="profileCountry" type="text" autoComplete="country-name" maxLength={80} value={form.country} onChange={update('country')} required />
                    </div>
                  )}
                  {formError && <div className="action-error" role="alert">{formError}</div>}
                  <div className="profile-form-actions">
                    <button type="button" className="btn btn-subtle" onClick={() => setEditing(false)}>Cancelar</button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
                  </div>
                </form>
              ) : (
                <>
                  {saved && <div className="profile-saved" role="status">Tus datos se guardaron.</div>}
                  <dl className="profile-data">
                    <div><dt>Nombre</dt><dd>{user.fullName || '—'}</dd></div>
                    <div><dt>Usuario</dt><dd>{user.username}</dd></div>
                    <div><dt>Email</dt><dd>{user.email || '—'}</dd></div>
                    {!isAdmin && <div><dt>País</dt><dd>{user.country || '—'}</dd></div>}
                    {!isAdmin && <div><dt>Empresa</dt><dd>{user.clientCompany || user.company || '—'}</dd></div>}
                    <div><dt>Miembro desde</dt><dd className="profile-capitalize">{user.createdAt ? formatMonth(user.createdAt) : '—'}</dd></div>
                    <div><dt>Último ingreso</dt><dd>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Sesión actual'}</dd></div>
                  </dl>
                </>
              )}
            </div>
          </div>

          <div className="section">
            <div className="section-header"><h2>Seguridad</h2></div>
            <div className="section-body profile-security">
              <span className="profile-security-icon"><Icon paths={ICONS.shield} /></span>
              <div>
                <strong>Contraseña</strong>
                <p>Al cambiarla se cierran tus otras sesiones.</p>
              </div>
              <button className="btn btn-small" onClick={() => setShowPassword(true)}>Cambiar</button>
            </div>
          </div>
        </div>

        <div className="section profile-activity">
          <div className="section-header">
            <h2>{isAdmin ? 'Tus últimos movimientos' : 'Movimientos de tus embarques'}</h2>
          </div>
          {loadError && <div className="empty">{loadError}</div>}
          {!loadError && !summary && <div className="empty">Cargando actividad…</div>}
          {summary?.movements.length === 0 && <div className="empty">Todavía no hay movimientos.</div>}
          {summary?.movements.length > 0 && (
            <ol className="profile-timeline">
              {summary.movements.map(item => {
                const type = NOTIFICATION_TYPES[item.type] || { label: item.type, badge: 'gray' };
                const content = (
                  <>
                    <span className="profile-timeline-top">
                      <span className={`badge ${type.badge}`}>{type.label}</span>
                      <span className="profile-timeline-time">{formatDateTime(item.createdAt)}</span>
                    </span>
                    <span className="profile-timeline-message">{item.message}</span>
                    <span className="mono profile-timeline-code">{item.shipmentCode}</span>
                  </>
                );
                return (
                  <li key={item.id}>
                    {item.shipmentId
                      ? <button type="button" onClick={() => onOpenShipment(item.shipmentId)}>{content}</button>
                      : <div>{content}</div>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} />}
      {showPhoto && user.hasAvatar && <PhotoViewer src={ownAvatarUrl(user)} alt={`Foto de perfil de ${displayName}`} onClose={() => setShowPhoto(false)} />}
    </section>
  );
}
