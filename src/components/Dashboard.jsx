import { StatusBadge, formatUsd } from './ui';

export function Dashboard({ shipments, clients, onNew, onViewAll }) {
  const totalShipments = shipments.length;
  const totalBoxes = shipments.reduce((sum, s) => sum + (s.boxes || 0), 0);
  const totalUsd = shipments.reduce((sum, s) => sum + (s.totalUsd || 0), 0);
  const totalTons = ((totalBoxes * 10) / 1000).toFixed(2);
  const avgPriceKg = (totalBoxes * 10) > 0 ? totalUsd / (totalBoxes * 10) : 0;

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
          <div className="kpi-label">Total embarques</div>
          <div className="kpi-value">{totalShipments}</div>
          <div className="kpi-sub">Contenedores reefer (22 pallets)</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Volumen exportado</div>
          <div className="kpi-value">{totalTons} TN</div>
          <div className="kpi-sub">{totalBoxes.toLocaleString('en-US')} cajas (10 kg)</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Valor comercial total</div>
          <div className="kpi-value">{formatUsd(totalUsd)}</div>
          <div className="kpi-sub">Moneda base: USD</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Precio promedio / kg</div>
          <div className="kpi-value">{formatUsd(avgPriceKg)}</div>
          <div className="kpi-sub">Ponderado global de calibres</div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <h2>Últimos embarques</h2>
          <div className="right">
            <button className="btn btn-small" onClick={onViewAll}>Ver todos</button>
          </div>
        </div>
        {shipments.length === 0 ? (
          <div className="empty">Todavía no hay embarques registrados.</div>
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Salida</th>
                  <th>Cliente</th>
                  <th>Modalidad</th>
                  <th>Producto</th>
                  <th>Puerto</th>
                  <th>Estado</th>
                  <th className="num">Total USD</th>
                </tr>
              </thead>
              <tbody>
                {shipments.slice(0, 5).map(s => {
                  const client = clients.find(c => c.id === s.clientId);
                  return (
                    <tr key={s.id}>
                      <td><span className="mono strong">{s.code}</span></td>
                      <td>W{s.loadWeek}</td>
                      <td>{client ? `${client.company} (${client.country})` : 'N/A'}</td>
                      <td>{s.condition} · {s.deal}</td>
                      <td>{s.product} ({s.fruitType})</td>
                      <td>{s.port}</td>
                      <td><StatusBadge status={s.status} /></td>
                      <td className="num strong">{formatUsd(s.totalUsd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
