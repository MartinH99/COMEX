import { useState } from 'react';

const EMPTY_CLIENT = { company: '', country: '', contact: '', rating: 5, defaultPayment: '' };

export function ClientList({ clients, onCreate }) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_CLIENT);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const created = await onCreate({ ...form, rating: Number(form.rating) });
    setSaving(false);
    if (created) {
      setForm(EMPTY_CLIENT);
      setShowForm(false);
    }
  };

  return (
    <section style={{ maxWidth: 1000 }}>
      <div className="page-header">
        <h1>Clientes</h1>
        <span className="badge brand">{clients.length} registrados</span>
        <div className="right">
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cerrar' : '+ Nuevo cliente'}
          </button>
        </div>
      </div>

      <div className="section">
        {showForm && (
          <form className="section-form" onSubmit={handleSubmit}>
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
              <button type="button" className="btn btn-subtle" onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cliente'}</button>
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
                  <td data-label="Condición de pago">{c.defaultPayment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
