import { MonthlyChart, RankingChart } from './Charts';
import { StatusBadge, formatDate, formatUsd } from './ui';
import { getFinance, sumBy, today } from '../lib/finance';

const MONTHS = 12;
const UPCOMING_DAYS = 14;
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// createdAt está en UTC; alcanza para agrupar por mes
function buildMonthlySales(shipments) {
  const now = new Date();
  const months = [];
  for (let i = MONTHS - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    months.push({
      key,
      value: 0,
      shortLabel: MONTH_NAMES[date.getMonth()],
      label: `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`
    });
  }
  shipments.forEach(shipment => {
    const month = months.find(item => item.key === (shipment.createdAt || '').slice(0, 7));
    if (month) month.value += shipment.totalUsd || 0;
  });
  return months;
}

function addDays(date, days) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function Dashboard({ shipments, clients, onNew, onViewAll, onOpenShipment, onViewCollections }) {
  const clientName = (shipment) => clients.find(c => c.id === shipment.clientId)?.company || 'N/A';
  const totalBoxes = shipments.reduce((sum, s) => sum + (s.boxes || 0), 0);
  const totalUsd = shipments.reduce((sum, s) => sum + (s.totalUsd || 0), 0);
  const totalTons = ((totalBoxes * 10) / 1000).toFixed(2);
  const avgPriceKg = (totalBoxes * 10) > 0 ? totalUsd / (totalBoxes * 10) : 0;

  const finances = shipments.map(shipment => ({ shipment, finance: getFinance(shipment) }));
  const withCosts = finances.filter(({ finance }) => finance.costs > 0);
  const margin = withCosts.reduce((sum, { finance }) => sum + finance.margin, 0);
  const salesWithCosts = withCosts.reduce((sum, { finance }) => sum + finance.total, 0);
  const balance = finances.reduce((sum, { finance }) => sum + Math.max(finance.balance, 0), 0);
  const overdue = finances.filter(({ finance }) => finance.isOverdue);
  const overdueUsd = overdue.reduce((sum, { finance }) => sum + finance.balance, 0);

  const date = today();
  const limit = addDays(date, UPCOMING_DAYS);
  const pendingDelivery = shipments
    .filter(s => s.status !== 'Entregado' && s.deliveryDate && s.deliveryDate <= limit)
    .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));

  return (
    <section>
      <div className="page-header">
        <h1>Dashboard</h1>
        <div className="right">
          <button className="btn btn-primary" onClick={onNew}>+ Nuevo embarque</button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Valor comercial total</div>
          <div className="kpi-value">{formatUsd(totalUsd)}</div>
          <div className="kpi-sub">{shipments.length} embarques · {totalTons} TN</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Margen</div>
          <div className="kpi-value">{withCosts.length > 0 ? formatUsd(margin) : '—'}</div>
          <div className="kpi-sub">
            {withCosts.length > 0
              ? `${((margin / salesWithCosts) * 100).toFixed(1)}% · ${withCosts.length} de ${shipments.length} con costos`
              : 'Cargá costos en un embarque'}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Por cobrar</div>
          <div className="kpi-value">{formatUsd(balance)}</div>
          <div className="kpi-sub">
            {overdue.length > 0 ? `${formatUsd(overdueUsd)} vencido` : 'Sin cobros vencidos'}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Precio promedio / kg</div>
          <div className="kpi-value">{formatUsd(avgPriceKg)}</div>
          <div className="kpi-sub">{totalBoxes.toLocaleString('en-US')} cajas de 10 kg</div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <h2>Ventas por mes</h2>
          <div className="right kpi-sub">Últimos {MONTHS} meses, en USD, por fecha de registro</div>
        </div>
        <div className="section-body">
          <MonthlyChart data={buildMonthlySales(shipments)} />
        </div>
      </div>

      <div className="dashboard-columns">
        <div className="section">
          <div className="section-header"><h2>Ventas por cliente</h2></div>
          <div className="section-body">
            {shipments.length === 0 ? <div className="kpi-sub">Sin datos todavía.</div> : (
              <RankingChart data={sumBy(shipments, clientName, s => s.totalUsd || 0)} />
            )}
          </div>
        </div>
        <div className="section">
          <div className="section-header"><h2>Ventas por producto</h2></div>
          <div className="section-body">
            {shipments.length === 0 ? <div className="kpi-sub">Sin datos todavía.</div> : (
              <RankingChart data={sumBy(shipments, s => s.product, s => s.totalUsd || 0)} />
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-columns">
        <div className="section">
          <div className="section-header">
            <h2>Entregas próximas y vencidas</h2>
            <div className="right">
              <button className="btn btn-small" onClick={onViewAll}>Ver embarques</button>
            </div>
          </div>
          {pendingDelivery.length === 0 ? (
            <div className="empty">No hay entregas en los próximos {UPCOMING_DAYS} días.</div>
          ) : (
            <ul className="dashboard-list">
              {pendingDelivery.map(s => (
                <li key={s.id}>
                  <button type="button" onClick={() => onOpenShipment(s.id)}>
                    <span>
                      <span className="mono strong">{s.code}</span>
                      <span className="kpi-sub">{clientName(s)}</span>
                    </span>
                    <span className="dashboard-list-end">
                      <span className="strong">{formatDate(s.deliveryDate)}</span>
                      {s.deliveryDate < date ? <span className="badge alert">Vencida</span> : <StatusBadge status={s.status} />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="section">
          <div className="section-header">
            <h2>Cobros vencidos</h2>
            <div className="right">
              <button className="btn btn-small" onClick={onViewCollections}>Ver cobros</button>
            </div>
          </div>
          {overdue.length === 0 ? (
            <div className="empty">No hay cobros vencidos.</div>
          ) : (
            <ul className="dashboard-list">
              {overdue.map(({ shipment, finance }) => (
                <li key={shipment.id}>
                  <button type="button" onClick={() => onOpenShipment(shipment.id)}>
                    <span>
                      <span className="mono strong">{shipment.code}</span>
                      <span className="kpi-sub">{clientName(shipment)} · venció {formatDate(shipment.paymentDueDate)}</span>
                    </span>
                    <span className="strong">{formatUsd(finance.balance)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
