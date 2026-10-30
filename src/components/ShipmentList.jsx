import { Fragment, useEffect, useState } from 'react';
import { NOTIFICATION_TYPES } from './NotificationCenter';
import { Modal, StatusBadge, formatDate, formatDateTime, formatUsd } from './ui';

const SHIPMENT_STATUSES = ['Programado', 'En Tránsito', 'Entregado'];
const BOXES_PER_PALLET = 104;
const KG_PER_BOX = 10;

// Diferencia entre lo entregado y lo cargado, y si respeta la tolerancia acordada
function getLoadDifference(boxes, deliveredBoxes, variance) {
  const diff = deliveredBoxes - boxes;
  const percent = boxes > 0 ? (diff / boxes) * 100 : 0;
  return { diff, percent, withinTolerance: Math.abs(percent) <= (variance ?? 0) };
}

const formatDifference = ({ diff, percent }) =>
  `${diff > 0 ? '+' : ''}${diff.toLocaleString('en-US')} (${percent > 0 ? '+' : ''}${percent.toFixed(1)}%)`;

function DifferenceBadge({ shipment }) {
  if (shipment.deliveredBoxes === null || shipment.deliveredBoxes === undefined) {
    return <span className="kpi-sub">—</span>;
  }
  const difference = getLoadDifference(shipment.boxes, shipment.deliveredBoxes, shipment.variance);
  return (
    <span className={`badge ${difference.withinTolerance ? 'ok' : 'alert'}`} title={`Tolerancia: ±${shipment.variance}%`}>
      {formatDifference(difference)}
    </span>
  );
}

function DeliveryModal({ shipment, onSave, onClose }) {
  const [value, setValue] = useState(String(shipment.deliveredBoxes ?? shipment.boxes));
  const [saving, setSaving] = useState(false);

  const deliveredBoxes = Number(value);
  const isValid = value !== '' && Number.isInteger(deliveredBoxes) && deliveredBoxes >= 0;
  const difference = isValid ? getLoadDifference(shipment.boxes, deliveredBoxes, shipment.variance) : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) return;
    setSaving(true);
    const saved = await onSave(shipment.id, deliveredBoxes);
    setSaving(false);
    if (saved) onClose();
  };

  return (
    <Modal title="Registrar entrega" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p>{shipment.code} · Cargadas: <strong>{shipment.boxes.toLocaleString('en-US')} cajas</strong></p>
        <div className="modal-field">
          <label htmlFor="deliveredBoxes">Cajas entregadas</label>
          <input id="deliveredBoxes" type="number" min="0" step="1" autoFocus value={value} onChange={e => setValue(e.target.value)} required />
        </div>
        {difference && (
          <div className={`modal-note ${difference.withinTolerance ? 'ok' : 'alert'}`}>
            Diferencia: <strong>{formatDifference(difference)}</strong> · {(difference.diff * KG_PER_BOX).toLocaleString('en-US')} kg
            <br />
            {difference.withinTolerance ? 'Dentro' : 'Fuera'} de la tolerancia de ±{shipment.variance}%
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-subtle" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={!isValid || saving}>{saving ? 'Guardando…' : 'Guardar entrega'}</button>
        </div>
      </form>
    </Modal>
  );
}

function Tracking({ shipment, activityVersion, onChangeStatus, onRegisterDelivery, onAddFollowUp }) {
  const [history, setHistory] = useState([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetch(`/api/shipments/${shipment.id}/notifications`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => { if (!ignore) setHistory(data); })
      .catch(err => console.warn('No se pudo cargar el historial:', err));
    return () => { ignore = true; };
  }, [shipment.id, activityVersion]);

  // Pasar a Entregado pide las cajas entregadas para poder calcular la diferencia
  const handleStatusChange = (e) => {
    if (e.target.value === 'Entregado') {
      onRegisterDelivery(shipment);
    } else {
      onChangeStatus(shipment.id, e.target.value);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const saved = await onAddFollowUp(shipment.id, note);
    setSaving(false);
    if (saved) setNote('');
  };

  return (
    <div className="tracking">
      <h3>Seguimiento</h3>
      <div className="tracking-status">
        <label htmlFor={`status-${shipment.id}`}>Estado</label>
        <select id={`status-${shipment.id}`} value={shipment.status} onChange={handleStatusChange}>
          {SHIPMENT_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
        </select>
      </div>
      <form className="tracking-form" onSubmit={handleSubmit}>
        <input
          type="text"
          aria-label="Nuevo seguimiento"
          placeholder="Ej: Contenedor cargado en puerto"
          maxLength={500}
          value={note}
          onChange={e => setNote(e.target.value)}
          required
        />
        <button type="submit" className="btn btn-small" disabled={saving}>Agregar</button>
      </form>
      {history.length === 0 ? (
        <span className="kpi-sub">Sin movimientos registrados.</span>
      ) : (
        <ul className="timeline">
          {history.map(item => (
            <li key={item.id}>
              {item.message}
              <span className="when">{NOTIFICATION_TYPES[item.type]?.label || item.type} · {formatDateTime(item.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CaliberDetail({ shipment, onRegisterDelivery }) {
  const rows = Object.entries(shipment.calibres || {}).filter(([, item]) => item.boxes > 0);
  const isRegistered = shipment.deliveredBoxes !== null && shipment.deliveredBoxes !== undefined;

  return (
    <>
      <div className="detail-meta">
        <span>Puerto: {shipment.port}</span>
        <span>Condición: {shipment.condition} · {shipment.deal}</span>
        <span>Calidad: {shipment.fruitType}</span>
        <span>Transporte: {shipment.transport}</span>
        <span>Pallets: {(shipment.boxes / BOXES_PER_PALLET).toFixed(1)}</span>
        <span>Pago: {shipment.paymentTerms}</span>
        <span>Tolerancia: ±{shipment.variance}%</span>
        {isRegistered && <span>Entregadas: {shipment.deliveredBoxes.toLocaleString('en-US')} cajas</span>}
      </div>
      {rows.length === 0 ? (
        <span className="kpi-sub">Sin detalle de calibres.</span>
      ) : (
        <table className="detail">
          <thead>
            <tr>
              <th>Calibre</th>
              <th className="num">Cajas</th>
              <th className="num">USD / Kg</th>
              <th className="num">Subtotal USD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([code, item]) => (
              <tr key={code}>
                <td>{code}</td>
                <td className="num">{item.boxes.toLocaleString('en-US')}</td>
                <td className="num">{formatUsd(item.priceKg)}</td>
                <td className="num">{formatUsd(item.boxes * KG_PER_BOX * item.priceKg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="detail-actions">
        <button className="btn btn-small" onClick={() => onRegisterDelivery(shipment)}>
          {isRegistered ? 'Editar entrega' : 'Registrar entrega'}
        </button>
      </div>
    </>
  );
}

export function ShipmentList({ shipments, clients, initialOpenId, activityVersion, onNew, onDelete, onRegisterDelivery, onChangeStatus, onAddFollowUp }) {
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [openId, setOpenId] = useState(initialOpenId ?? null);
  const [deliveryShipmentId, setDeliveryShipmentId] = useState(null);

  // Al llegar desde una notificación, llevar el embarque a la vista
  useEffect(() => {
    if (initialOpenId) {
      document.getElementById(`shipment-${initialOpenId}`)?.scrollIntoView({ block: 'center' });
    }
  }, [initialOpenId]);

  const statuses = ['Todos', ...new Set(shipments.map(s => s.status))];
  const visible = statusFilter === 'Todos' ? shipments : shipments.filter(s => s.status === statusFilter);
  const totalBoxes = visible.reduce((sum, s) => sum + (s.boxes || 0), 0);
  const totalUsd = visible.reduce((sum, s) => sum + (s.totalUsd || 0), 0);
  const deliveryShipment = shipments.find(s => s.id === deliveryShipmentId);

  return (
    <section>
      <div className="page-header">
        <h1>Embarques</h1>
        <div className="pills">
          {statuses.map(status => (
            <button key={status} className={statusFilter === status ? 'active' : ''} onClick={() => setStatusFilter(status)}>
              {status}
            </button>
          ))}
        </div>
        <div className="right">
          <button className="btn btn-primary" onClick={onNew}>+ Nuevo embarque</button>
        </div>
      </div>

      <div className="section">
        {visible.length === 0 ? (
          <div className="empty">No hay embarques para mostrar.</div>
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cliente</th>
                  <th>Producto</th>
                  <th>Salida</th>
                  <th>Entrega est.</th>
                  <th>Estado</th>
                  <th className="num">Cajas</th>
                  <th className="num">Dif. entrega</th>
                  <th className="num">Total USD</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {visible.map(s => {
                  const client = clients.find(c => c.id === s.clientId);
                  const isOpen = openId === s.id;
                  return (
                    <Fragment key={s.id}>
                      <tr id={`shipment-${s.id}`} className={`expandable${isOpen ? ' open' : ''}`} aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? null : s.id)}>
                        <td><span className="mono strong">{s.code}</span></td>
                        <td data-label="Cliente">{client?.company || 'N/A'}</td>
                        <td data-label="Producto">{s.product}</td>
                        <td data-label="Salida">W{s.loadWeek}</td>
                        <td data-label="Entrega est.">{s.deliveryDate ? formatDate(s.deliveryDate) : (s.etaWeek || '—')}</td>
                        <td data-label="Estado"><StatusBadge status={s.status} /></td>
                        <td data-label="Cajas" className="num">{s.boxes.toLocaleString('en-US')}</td>
                        <td data-label="Dif. entrega" className="num"><DifferenceBadge shipment={s} /></td>
                        <td data-label="Total USD" className="num strong">{formatUsd(s.totalUsd)}</td>
                        <td>
                          <button
                            className="icon-btn"
                            aria-label={`Eliminar embarque ${s.code}`}
                            title="Eliminar"
                            onClick={e => { e.stopPropagation(); onDelete(s); }}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M19 6l-1 14H6L5 6" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="detail-row">
                          <td colSpan={10}>
                            <div className="detail-grid">
                              <div>
                                <CaliberDetail shipment={s} onRegisterDelivery={shipment => setDeliveryShipmentId(shipment.id)} />
                              </div>
                              <Tracking
                                shipment={s}
                                activityVersion={activityVersion}
                                onChangeStatus={onChangeStatus}
                                onRegisterDelivery={shipment => setDeliveryShipmentId(shipment.id)}
                                onAddFollowUp={onAddFollowUp}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6}>{visible.length} {visible.length === 1 ? 'embarque' : 'embarques'}</td>
                  <td data-label="Cajas" className="num">{totalBoxes.toLocaleString('en-US')}</td>
                  <td />
                  <td data-label="Total USD" className="num">{formatUsd(totalUsd)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {deliveryShipment && (
        <DeliveryModal
          shipment={deliveryShipment}
          onSave={onRegisterDelivery}
          onClose={() => setDeliveryShipmentId(null)}
        />
      )}
    </section>
  );
}
