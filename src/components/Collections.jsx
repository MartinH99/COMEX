import { useState } from 'react';
import { PAYMENT_BADGE, getFinance, today } from '../lib/finance';
import { Entity, ICONS, Modal, PageHeader, Stat, formatDate, formatUsd } from './ui';

function PayFullModal({ shipment, balance, onConfirm, onClose }) {
  const [paidAt, setPaidAt] = useState(today());
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const saved = await onConfirm(shipment, balance, paidAt);
    setSaving(false);
    if (saved) onClose();
  };

  return (
    <Modal title="Marcar como pagado" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p>Se registra un cobro de <strong>{formatUsd(balance)}</strong> en {shipment.code} y su saldo queda en cero.</p>
        <div className="modal-field">
          <label htmlFor="payFullDate">Fecha del cobro</label>
          <input id="payFullDate" type="date" autoFocus value={paidAt} onChange={e => setPaidAt(e.target.value)} required />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-subtle" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Marcar como pagado'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function Collections({ shipments, clients, onOpenShipment, onPayFull }) {
  const [view, setView] = useState('pending');
  const [payingId, setPayingId] = useState(null);

  const rows = shipments.map(shipment => ({
    shipment,
    client: clients.find(c => c.id === shipment.clientId),
    finance: getFinance(shipment)
  }));
  const pending = rows.filter(row => row.finance.balance > 0);
  const overdue = pending.filter(row => row.finance.isOverdue);
  const paidRows = rows.filter(row => row.finance.total > 0 && row.finance.balance <= 0);
  const views = { pending, overdue, paid: paidRows };
  const paying = rows.find(row => row.shipment.id === payingId);
  const visible = [...views[view]]
    .sort((a, b) => (a.shipment.paymentDueDate || '9999').localeCompare(b.shipment.paymentDueDate || '9999'));

  const sum = (list, get) => list.reduce((total, row) => total + get(row), 0);
  const totalBalance = sum(pending, row => row.finance.balance);
  const totalOverdue = sum(overdue, row => row.finance.balance);
  const totalPaid = sum(rows, row => row.finance.paid);

  const byClient = new Map();
  pending.forEach(row => {
    const key = row.shipment.clientId;
    const current = byClient.get(key) || { name: row.client?.company || 'N/A', balance: 0, overdue: 0, count: 0 };
    current.balance += row.finance.balance;
    current.overdue += row.finance.isOverdue ? row.finance.balance : 0;
    current.count += 1;
    byClient.set(key, current);
  });
  const clientRows = [...byClient.entries()].sort((a, b) => b[1].balance - a[1].balance);

  return (
    <section>
      <PageHeader icon={ICONS.collections} title="Cobros" description="Saldos pendientes, vencimientos y pagos de cada embarque." />

      <div className="kpi-grid stat-grid">
        <Stat icon={ICONS.clock} label="Por cobrar" value={formatUsd(totalBalance)} sub={`${pending.length} ${pending.length === 1 ? 'embarque' : 'embarques'} con saldo`} />
        <Stat
          icon={ICONS.alert}
          tone={overdue.length > 0 ? 'alert' : undefined}
          label="Vencido"
          value={formatUsd(totalOverdue)}
          sub={`${overdue.length} ${overdue.length === 1 ? 'embarque vencido' : 'embarques vencidos'}`}
        />
        <Stat icon={ICONS.check} label="Cobrado" value={formatUsd(totalPaid)} sub="Total registrado" />
      </div>

      <div className="pills page-filter">
        <button className={view === 'pending' ? 'active' : ''} onClick={() => setView('pending')}>Pendientes ({pending.length})</button>
        <button className={view === 'overdue' ? 'active' : ''} onClick={() => setView('overdue')}>Vencidos ({overdue.length})</button>
        <button className={view === 'paid' ? 'active' : ''} onClick={() => setView('paid')}>Pagados ({paidRows.length})</button>
      </div>

      <div className="section">
        <div className="section-header"><h2>{view === 'paid' ? 'Embarques pagados' : 'Embarques con saldo'}</h2></div>
        {visible.length === 0 ? (
          <div className="empty">{{ pending: 'No hay saldos pendientes.', overdue: 'No hay cobros vencidos.', paid: 'Todavía no hay embarques pagados.' }[view]}</div>
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cliente</th>
                  <th>Vencimiento</th>
                  <th>Estado</th>
                  <th className="num">Total USD</th>
                  <th className="num">Cobrado</th>
                  <th className="num">Saldo</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {visible.map(({ shipment, client, finance }) => (
                  <tr key={shipment.id}>
                    <td><span className="mono strong">{shipment.code}</span></td>
                    <td data-label="Cliente"><Entity name={client?.company || 'N/A'} /></td>
                    <td data-label="Vencimiento">{shipment.paymentDueDate ? formatDate(shipment.paymentDueDate) : 'Sin fecha'}</td>
                    <td data-label="Estado"><span className={`badge ${PAYMENT_BADGE[finance.paymentStatus]}`}>{finance.paymentStatus}</span></td>
                    <td data-label="Total USD" className="num">{formatUsd(finance.total)}</td>
                    <td data-label="Cobrado" className="num">
                      <span className="paid-cell">
                        {formatUsd(finance.paid)}
                        <span className="paid-track" aria-hidden="true">
                          <span className="paid-bar" style={{ width: `${finance.total > 0 ? Math.min(100, (finance.paid / finance.total) * 100) : 0}%` }} />
                        </span>
                      </span>
                    </td>
                    <td data-label="Saldo" className="num strong">{formatUsd(finance.balance)}</td>
                    <td>
                      <div className="row-actions">
                        {finance.balance > 0 && (
                          <button className="btn btn-small btn-primary" onClick={() => setPayingId(shipment.id)}>Marcar como pagado</button>
                        )}
                        <button className="btn btn-small" onClick={() => onOpenShipment(shipment.id)}>Ver embarque</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {clientRows.length > 0 && (
        <div className="section">
          <div className="section-header"><h2>Saldo por cliente</h2></div>
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="num">Embarques</th>
                  <th className="num">Vencido</th>
                  <th className="num">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {clientRows.map(([id, row]) => (
                  <tr key={id}>
                    <td><Entity name={row.name} /></td>
                    <td data-label="Embarques" className="num">{row.count}</td>
                    <td data-label="Vencido" className="num">{formatUsd(row.overdue)}</td>
                    <td data-label="Saldo" className="num strong">{formatUsd(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {paying && paying.finance.balance > 0 && (
        <PayFullModal
          shipment={paying.shipment}
          balance={paying.finance.balance}
          onConfirm={onPayFull}
          onClose={() => setPayingId(null)}
        />
      )}
    </section>
  );
}
