import { useState } from 'react';
import { apiFetch } from '../api';
import { formatDate } from './ui';

// Los mismos cuatro datos reciben otro nombre según el transporte
const LABELS = {
  'Marítimo': { carrier: 'Naviera', vessel: 'Buque', containerNumber: 'N.° de contenedor', bookingNumber: 'Booking' },
  'Aéreo': { carrier: 'Aerolínea', vessel: 'Vuelo', containerNumber: 'Guía aérea (AWB)', bookingNumber: 'Reserva' },
  'Terrestre': { carrier: 'Transportista', vessel: 'Patente del camión', containerNumber: 'Carta de porte (CRT)', bookingNumber: 'Reserva' }
};
const FIELDS = ['carrier', 'vessel', 'containerNumber', 'bookingNumber'];

const readValues = (shipment) => ({
  carrier: shipment.carrier || '',
  vessel: shipment.vessel || '',
  containerNumber: shipment.containerNumber || '',
  bookingNumber: shipment.bookingNumber || '',
  actualDeparture: shipment.actualDeparture || '',
  actualArrival: shipment.actualArrival || ''
});

export function ShipmentLogistics({ shipment, readOnly, onSaved }) {
  const labels = LABELS[shipment.transport] || LABELS['Marítimo'];
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => readValues(shipment));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const hasData = Object.values(readValues(shipment)).some(Boolean);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/shipments/${shipment.id}/logistics`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar.');
      onSaved(data);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="logistics">
        <h3>Datos logísticos</h3>
        <form className="logistics-form" onSubmit={handleSubmit}>
          {FIELDS.map(field => (
            <div key={field}>
              <label htmlFor={`${field}-${shipment.id}`}>{labels[field]}</label>
              <input id={`${field}-${shipment.id}`} type="text" maxLength={120} value={form[field]} onChange={update(field)} />
            </div>
          ))}
          <div>
            <label htmlFor={`departure-${shipment.id}`}>Salida real</label>
            <input id={`departure-${shipment.id}`} type="date" value={form.actualDeparture} onChange={update('actualDeparture')} />
          </div>
          <div>
            <label htmlFor={`arrival-${shipment.id}`}>Llegada real</label>
            <input id={`arrival-${shipment.id}`} type="date" min={form.actualDeparture || undefined} value={form.actualArrival} onChange={update('actualArrival')} />
          </div>
          {error && <div className="action-error logistics-wide" role="alert">{error}</div>}
          <div className="logistics-actions logistics-wide">
            <button type="button" className="btn btn-small btn-subtle" onClick={() => setEditing(false)}>Cancelar</button>
            <button type="submit" className="btn btn-small btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="logistics">
      <h3>
        Datos logísticos
        {!readOnly && (
          <button
            type="button"
            className="btn btn-small logistics-edit"
            onClick={() => { setForm(readValues(shipment)); setEditing(true); }}
          >
            {hasData ? 'Editar' : 'Cargar'}
          </button>
        )}
      </h3>
      {hasData ? (
        <dl className="logistics-data">
          {FIELDS.filter(field => shipment[field]).map(field => (
            <div key={field}><dt>{labels[field]}</dt><dd>{shipment[field]}</dd></div>
          ))}
          {shipment.actualDeparture && <div><dt>Salida real</dt><dd>{formatDate(shipment.actualDeparture)}</dd></div>}
          {shipment.actualArrival && <div><dt>Llegada real</dt><dd>{formatDate(shipment.actualArrival)}</dd></div>}
        </dl>
      ) : (
        <span className="kpi-sub">Todavía no hay datos logísticos.</span>
      )}
    </div>
  );
}
