import { useState } from 'react';
import { Modal } from './ui';

const STATUS = {
  pending: { label: 'Pendiente', badge: 'pend' },
  active: { label: 'Activo', badge: 'ok' },
  disabled: { label: 'Deshabilitado', badge: 'gray' }
};

const NEW_CLIENT = '__new__';

function ClientLink({ user, clients, onUpdate }) {
  const [selected, setSelected] = useState(user.clientId ? String(user.clientId) : '');
  const changed = selected !== (user.clientId ? String(user.clientId) : '');

  const handleSave = () => {
    onUpdate(user.id, selected === NEW_CLIENT ? { createClient: true } : { clientId: Number(selected) });
  };

  return (
    <span className="user-link">
      <select aria-label={`Cliente de ${user.username}`} value={selected} onChange={e => setSelected(e.target.value)}>
        <option value="">Sin vincular</option>
        {clients.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
        <option value={NEW_CLIENT}>+ Crear cliente: {user.company}</option>
      </select>
      {changed && selected && (
        <button className="btn btn-small btn-primary" onClick={handleSave}>
          {user.status === 'pending' ? 'Aprobar' : 'Guardar'}
        </button>
      )}
    </span>
  );
}

function ResetPasswordModal({ user, onSave, onClose }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const saved = await onSave(user.id, { password });
    setSaving(false);
    if (saved) onClose();
  };

  return (
    <Modal title="Restablecer contraseña" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p>Se va a reemplazar la contraseña de <strong>{user.username}</strong> y se cerrarán sus sesiones. Pasásela por un medio seguro.</p>
        <div className="modal-field">
          <label htmlFor="resetPassword">Contraseña nueva (mínimo 8 caracteres)</label>
          <input id="resetPassword" type="password" autoComplete="new-password" minLength={8} autoFocus value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-subtle" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Restablecer'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function UserList({ users, clients, currentUserId, onUpdate }) {
  const [resetUser, setResetUser] = useState(null);
  const pending = users.filter(u => u.status === 'pending').length;

  return (
    <section>
      <div className="page-header">
        <h1>Usuarios</h1>
        {pending > 0 && <span className="badge pend">{pending} {pending === 1 ? 'pendiente' : 'pendientes'} de aprobación</span>}
      </div>

      <div className="section">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Tipo</th>
                <th>Empresa declarada</th>
                <th>Estado</th>
                <th>Cliente vinculado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const status = STATUS[u.status];
                const isSelf = u.id === currentUserId;
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="strong">{u.username}</div>
                      <div className="kpi-sub">{[u.fullName, u.email].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td data-label="Tipo">{u.role === 'admin' ? 'Admin' : 'Cliente'}</td>
                    <td data-label="Empresa declarada">{u.company ? `${u.company}${u.country ? ` (${u.country})` : ''}` : '—'}</td>
                    <td data-label="Estado"><span className={`badge ${status.badge}`}>{status.label}</span></td>
                    <td data-label="Cliente vinculado">
                      {u.role === 'client'
                        ? <ClientLink key={u.clientId} user={u} clients={clients} onUpdate={onUpdate} />
                        : '—'}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-small" onClick={() => setResetUser(u)}>Contraseña</button>
                        {!isSelf && u.status === 'active' && (
                          <button className="btn btn-small" onClick={() => onUpdate(u.id, { status: 'disabled' })}>Deshabilitar</button>
                        )}
                        {!isSelf && u.status === 'disabled' && (
                          <button className="btn btn-small" onClick={() => onUpdate(u.id, { status: 'active' })}>Habilitar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {resetUser && <ResetPasswordModal user={resetUser} onSave={onUpdate} onClose={() => setResetUser(null)} />}
    </section>
  );
}
