import React from 'react';

export function Dashboard({ shipments, clients }) {
  const totalShipments = shipments.length;
  const totalBoxes = shipments.reduce((sum, s) => sum + (s.boxes || 0), 0);
  const totalUsd = shipments.reduce((sum, s) => sum + (s.totalUsd || 0), 0);
  const totalTons = ((totalBoxes * 10) / 1000).toFixed(2);
  const avgPriceKg = (totalBoxes * 10) > 0 ? (totalUsd / (totalBoxes * 10)).toFixed(2) : '0.00';

  return (
    <div className="tab-container">
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-title">Total Embarques</span>
          <div className="kpi-value">{totalShipments}</div>
          <span className="kpi-sub">Contenedores Reefer (22 Pallets)</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">Volumen Exportado</span>
          <div className="kpi-value">{totalTons} TN</div>
          <span className="kpi-sub">{totalBoxes.toLocaleString()} Cajas (10kg)</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">Valor Total Comercial</span>
          <div className="kpi-value">${totalUsd.toLocaleString('en-US')} USD</div>
          <span className="kpi-sub">Moneda Base: USD</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">Precio Promedio / Kg</span>
          <div className="kpi-value">${avgPriceKg} USD</div>
          <span className="kpi-sub">Ponderado global calibres</span>
        </div>
      </div>

      <div className="card">
        <h3>🚢 Últimos Embarques Registrados</h3>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Semana</th>
                <th>Cliente</th>
                <th>Condición</th>
                <th>Modalidad</th>
                <th>Producto</th>
                <th>Puerto</th>
                <th>Valor Total (USD)</th>
              </tr>
            </thead>
            <tbody>
              {shipments.slice(0, 5).map(s => {
                const client = clients.find(c => c.id === s.clientId) || {};
                return (
                  <tr key={s.id}>
                    <td><strong>{s.code}</strong></td>
                    <td>W{s.loadWeek}</td>
                    <td>{client.company} ({client.country})</td>
                    <td><span className="badge">{s.condition}</span></td>
                    <td><span className="badge badge-purple">{s.deal}</span></td>
                    <td>{s.product} ({s.fruitType})</td>
                    <td>{s.port}</td>
                    <td><strong>${s.totalUsd.toLocaleString('en-US')} USD</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}