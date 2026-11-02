import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { COST_CATEGORIES, PAYMENT_BADGE, getFinance, today } from '../lib/finance';
import { formatDate, formatUsd } from './ui';

function DeleteRowButton({ label, onClick }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title="Eliminar" onClick={onClick}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 6 6 18" />
        <path d="M6 6l12 12" />
      </svg>
    </button>
  );
}

// Costos, margen y cobros de un embarque. Solo se muestra a usuarios admin
export function ShipmentFinance({ shipment, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cost, setCost] = useState({ category: COST_CATEGORIES[0], description: '', amountUsd: '' });
  const [payment, setPayment] = useState({ amountUsd: '', paidAt: today(), note: '' });

  useEffect(() => {
    let ignore = false;
    apiFetch(`/api/shipments/${shipment.id}/finance`)
      .then(response => {
        if (!response.ok) throw new Error('No se pudieron cargar los costos y cobros.');
        return response.json();
      })
      .then(data => { if (!ignore) setDetail(data); })
      .catch(err => { if (!ignore) setError(err.message); });
    return () => { ignore = true; };
  }, [shipment.id]);

  const finance = getFinance(detail ? { ...shipment, costsUsd: detail.costsUsd, paidUsd: detail.paidUsd } : shipment);

  // Todas las operaciones devuelven el detalle actualizado
  const send = async (path, method, body) => {
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/shipments/${shipment.id}/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar.');
      setDetail(data);
      onChanged(shipment.id, { costsUsd: data.costsUsd, paidUsd: data.paidUsd });
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleAddCost = async (e) => {
    e.preventDefault();
    const saved = await send('costs', 'POST', { ...cost, amountUsd: Number(cost.amountUsd) });
    if (saved) setCost({ ...cost, description: '', amountUsd: '' });
  };

  const handlePayFullBalance = () => send('payments', 'POST', {
    amountUsd: finance.balance,
    paidAt: payment.paidAt,
    note: payment.note
  });

  const handleAddPayment = async (e) => {
    e.preventDefault();
    const saved = await send('payments', 'POST', { ...payment, amountUsd: Number(payment.amountUsd) });
    if (saved) setPayment({ ...payment, amountUsd: '', note: '' });
  };

  const categoryListId = `cost-categories-${shipment.id}`;

  return (
    <div className="finance">
      <h3>Costos y cobros <span className="finance-private">Interno: el cliente no lo ve</span></h3>

      <div className="finance-summary">
        <div><span>Venta</span><strong>{formatUsd(finance.total)}</strong></div>
        <div><span>Costos</span><strong>{formatUsd(finance.costs)}</strong></div>
        <div>
          <span>Margen</span>
          <strong>{finance.costs > 0 ? `${formatUsd(finance.margin)} (${finance.marginPercent.toFixed(1)}%)` : 'Sin costos cargados'}</strong>
        </div>
        <div><span>Cobrado</span><strong>{formatUsd(finance.paid)}</strong></div>
        <div>
          <span>Saldo</span>
          <strong>{formatUsd(finance.balance)}</strong>
          <span className={`badge ${PAYMENT_BADGE[finance.paymentStatus]}`}>{finance.paymentStatus}</span>
        </div>
      </div>

      {error && <div className="action-error" role="alert">{error}</div>}

      <div className="finance-columns">
        <section>
          <h4>Costos</h4>
          <form className="finance-form" onSubmit={handleAddCost}>
            <div>
              <label htmlFor={`cost-category-${shipment.id}`}>Concepto</label>
              <input id={`cost-category-${shipment.id}`} list={categoryListId} maxLength={80} value={cost.category} onChange={e => setCost({ ...cost, category: e.target.value })} required />
              <datalist id={categoryListId}>
                {COST_CATEGORIES.map(category => <option key={category} value={category} />)}
              </datalist>
            </div>
            <div>
              <label htmlFor={`cost-amount-${shipment.id}`}>Importe USD</label>
              <input id={`cost-amount-${shipment.id}`} type="number" min="0.01" step="0.01" value={cost.amountUsd} onChange={e => setCost({ ...cost, amountUsd: e.target.value })} required />
            </div>
            <div className="finance-form-wide">
              <label htmlFor={`cost-note-${shipment.id}`}>Detalle (opcional)</label>
              <input id={`cost-note-${shipment.id}`} type="text" maxLength={300} value={cost.description} onChange={e => setCost({ ...cost, description: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-small" disabled={saving}>Agregar costo</button>
          </form>
          <ul className="finance-list">
            {detail?.costs.map(item => (
              <li key={item.id}>
                <span>{item.category}{item.description ? ` · ${item.description}` : ''}</span>
                <strong>{formatUsd(item.amountUsd)}</strong>
                <DeleteRowButton label={`Eliminar costo ${item.category}`} onClick={() => send(`costs/${item.id}`, 'DELETE')} />
              </li>
            ))}
            {detail?.costs.length === 0 && <li className="kpi-sub">Sin costos cargados.</li>}
          </ul>
        </section>

        <section>
          <h4>Cobros</h4>
          <form className="finance-form" onSubmit={handleAddPayment}>
            <div>
              <label htmlFor={`pay-amount-${shipment.id}`}>Importe USD</label>
              <input id={`pay-amount-${shipment.id}`} type="number" min="0.01" step="0.01" max={finance.balance > 0 ? finance.balance : undefined} value={payment.amountUsd} onChange={e => setPayment({ ...payment, amountUsd: e.target.value })} required />
            </div>
            <div>
              <label htmlFor={`pay-date-${shipment.id}`}>Fecha</label>
              <input id={`pay-date-${shipment.id}`} type="date" value={payment.paidAt} onChange={e => setPayment({ ...payment, paidAt: e.target.value })} required />
            </div>
            <div className="finance-form-wide">
              <label htmlFor={`pay-note-${shipment.id}`}>Nota (opcional)</label>
              <input id={`pay-note-${shipment.id}`} type="text" maxLength={300} value={payment.note} onChange={e => setPayment({ ...payment, note: e.target.value })} />
            </div>
            <div className="finance-form-actions">
              <button type="submit" className="btn btn-small" disabled={saving || finance.balance <= 0}>Registrar cobro</button>
              {finance.balance > 0 && (
                <button type="button" className="btn btn-small btn-primary" disabled={saving} onClick={handlePayFullBalance}>
                  Cobrar saldo completo ({formatUsd(finance.balance)})
                </button>
              )}
            </div>
          </form>
          <ul className="finance-list">
            {detail?.payments.map(item => (
              <li key={item.id}>
                <span>{formatDate(item.paidAt)}{item.note ? ` · ${item.note}` : ''}</span>
                <strong>{formatUsd(item.amountUsd)}</strong>
                <DeleteRowButton label={`Eliminar cobro del ${formatDate(item.paidAt)}`} onClick={() => send(`payments/${item.id}`, 'DELETE')} />
              </li>
            ))}
            {detail?.payments.length === 0 && <li className="kpi-sub">Sin cobros registrados.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
