import { useState } from 'react';
import { ConfirmModal } from './ui';

const EMPTY_CLIENT = { company: '', country: '', contact: '', rating: 5, defaultPayment: '' };

export function ClientList({ clients, onCreate, onUpdate, onDelete }) {
  // null: formulario cerrado; 'new': alta; un cliente: edición
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_CLIENT);
  const [clientToDelete, setClientToDelete] = useState(null);

  const isEditing = editing && editing !== 'new';
  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const openNew = () => {
    setForm(EMPTY_CLIENT);
    setEditing('new');
  };

  const openEdit = (client) => {
    setForm({
      company: client.company,
      country: client.country,
      contact: client.contact,
      rating: client.rating,
      defaultPayment: client.defaultPayment
    });
    setEditing(client);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const data = { ...form, rating: Number(form.rating) };
    const saved = isEditing ? await onUpdate(editing.id, data) : await onCreate(data);
    setSaving(false);
    if (saved) setEditing(null);
  };

  const handleConfirmDelete = async () => {
    const client = clientToDelete;
    setClientToDelete(null);
    const deleted = await onDelete(client);
    if (deleted && editing?.id === client.id) setEditing(null);
  };

  return (
    <section style={{ maxWidth: 1000 }}>
      <div className="page-header">
        <h1>Clientes</h1>
        <span className="badge brand">{clients.length} registrados</span>
        <div className="right">
          <button className="btn btn-primary" onClick={editing ? () => setEditing(null) : openNew}>
            {editing ? 'Cerrar' : '+ Nuevo cliente'}
          </button>
        </div>
      </div>

      <div className="section">
        {editing && (
          <form className="section-form" onSubmit={handleSubmit}>
            <h2>{isEditing ? `Editar ${editing.company}` : 'Nuevo cliente'}</h2>
            <div className="form-grid">
              <div>
                <label htmlFor="company">Empresa</label>
                <input id="company" type="text" autoFocus value={form.company} onChange={update('company')} required />
              </div>
              <div>
                <label htmlFor="country">País</label>
                <input id="country" type="text" value={form.country} onChange={update('country')} required />
              </div>
              <div>
                <label htmlFor="contact">Contacto</label>
                <input id="contact" type="text" value={form.contact} onChange={update('contact')} required />
              </div>
              <div>
                <label htmlFor="rating">Calificación</label>
                <select id="rating" value={form.rating} onChange={update('rating')}>
                  {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} {n === 1 ? 'estrella' : 'estrellas'}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="defaultPayment">Condición de pago habitual</label>
                <input id="defaultPayment" type="text" placeholder="Ej: 50/50; 15 días llegada fruta" value={form.defaultPayment} onChange={update('defaultPayment')} required />
              </div>
            </div>
            <div className="form-footer">
              <button type="button" className="btn btn-subtle" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando…' : (isEditing ? 'Guardar cambios' : 'Guardar cliente')}
              </button>
            </div>
          </form>
        )}

        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>País</th>
                <th>Contacto</th>
                <th>Calificación</th>
                <th>Condición de pago habitual</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id}>
                  <td className="strong">{c.company}</td>
                  <td data-label="País">{c.country}</td>
                  <td data-label="Contacto">{c.contact}</td>
                  <td data-label="Calificación">
                    <span className="stars" aria-label={`${c.rating} de 5`}>
                      {'★'.repeat(c.rating)}<span className="off">{'★'.repeat(5 - c.rating)}</span>
                    </span>
                  </td>
                  <td data-label="Condición de pago">{c.defaultPayment || '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-small" onClick={() => openEdit(c)}>Editar</button>
                      <button
                        className="icon-btn"
                        aria-label={`Eliminar cliente ${c.company}`}
                        title="Eliminar"
                        onClick={() => setClientToDelete(c)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M19 6l-1 14H6L5 6" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {clientToDelete && (
        <ConfirmModal
          title="Eliminar cliente"
          message={`Se va a eliminar a ${clientToDelete.company}. Solo es posible si no tiene embarques, prospectos ni usuarios vinculados.`}
          confirmLabel="Eliminar"
          onConfirm={handleConfirmDelete}
          onCancel={() => setClientToDelete(null)}
        />
      )}
    </section>
  );
}
