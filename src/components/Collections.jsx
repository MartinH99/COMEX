import { useState } from 'react';
import { PAYMENT_BADGE, getFinance } from '../lib/finance';
import { formatDate, formatUsd } from './ui';

export function Collections({ shipments, clients, onOpenShipment }) {
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const rows = shipments.map(shipment => ({
    shipment,
    client: clients.find(c => c.id === shipment.clientId),
    finance: getFinance(shipment)
  }));
  const pending = rows.filter(row => row.finance.balance > 0);
  const overdue = pending.filter(row => row.finance.isOverdue);
  const visible = (onlyOverdue ? overdue : pending)
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
      <div className="page-header">
        <h1>Cobros</h1>
        <div className="pills">
          <button className={!onlyOverdue ? 'active' : ''} onClick={() => setOnlyOverdue(false)}>Pendientes</button>
          <button className={onlyOverdue ? 'active' : ''} onClick={() => setOnlyOverdue(true)}>Vencidos ({overdue.length})</button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Por cobrar</div>
          <div className="kpi-value">{formatUsd(totalBalance)}</div>
          <div className="kpi-sub">{pending.length} {pending.length === 1 ? 'embarque' : 'embarques'} con saldo</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Vencido</div>
          <div className="kpi-value">{formatUsd(totalOverdue)}</div>
          <div className="kpi-sub">{overdue.length} {overdue.length === 1 ? 'embarque vencido' : 'embarques vencidos'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Cobrado</div>
          <div className="kpi-value">{formatUsd(totalPaid)}</div>
          <div className="kpi-sub">Total registrado</div>
        </div>
      </div>

      <div className="section">
        <div className="section-header"><h2>Embarques con saldo</h2></div>
        {visible.length === 0 ? (
          <div className="empty">{onlyOverdue ? 'No hay cobros vencidos.' : 'No hay saldos pendientes.'}</div>
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
                    <td data-label="Cliente">{client?.company || 'N/A'}</td>
                    <td data-label="Vencimiento">{shipment.paymentDueDate ? formatDate(shipment.paymentDueDate) : 'Sin fecha'}</td>
                    <td data-label="Estado"><span className={`badge ${PAYMENT_BADGE[finance.paymentStatus]}`}>{finance.paymentStatus}</span></td>
                    <td data-label="Total USD" className="num">{formatUsd(finance.total)}</td>
                    <td data-label="Cobrado" className="num">{formatUsd(finance.paid)}</td>
                    <td data-label="Saldo" className="num strong">{formatUsd(finance.balance)}</td>
                    <td>
                      <div className="row-actions">
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
                    <td className="strong">{row.name}</td>
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
    </section>
  );
}
