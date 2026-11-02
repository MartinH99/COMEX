import { CALIBERS_MASTER } from '../data/mockData';
import { ICONS, PageHeader, Stat, formatUsd } from './ui';

export function CaliberList() {
  const prices = CALIBERS_MASTER.map(c => c.defaultPriceKg);
  const weights = CALIBERS_MASTER.map(c => c.avgWeightGrams);
  const maxPrice = Math.max(...prices);

  return (
    <section>
      <PageHeader icon={ICONS.calibers} title="Calibres" description="Matriz oficial de tamaños y precios de referencia por caja de 10 kg." />

      <div className="kpi-grid stat-grid">
        <Stat icon={ICONS.calibers} label="Calibres" value={CALIBERS_MASTER.length} sub={`De ${CALIBERS_MASTER[0].code} a ${CALIBERS_MASTER[CALIBERS_MASTER.length - 1].code}`} />
        <Stat icon={ICONS.tag} label="Precio de referencia" value={`${formatUsd(Math.min(...prices))} - ${formatUsd(maxPrice)}`} sub="USD por kg" />
        <Stat icon={ICONS.scale} label="Peso del fruto" value={`${Math.min(...weights)} - ${Math.max(...weights)} g`} sub="Promedio por calibre" />
      </div>

      <div className="section">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Calibre</th>
                <th>Denominación</th>
                <th className="num">Frutos / caja 10 kg</th>
                <th className="num">Peso del fruto</th>
                <th className="num">Precio de referencia</th>
              </tr>
            </thead>
            <tbody>
              {CALIBERS_MASTER.map(c => (
                <tr key={c.code}>
                  <td><span className="code-chip">{c.code}</span></td>
                  <td data-label="Denominación">{c.label}</td>
                  <td data-label="Frutos / caja 10 kg" className="num">{c.fruitsBox}</td>
                  <td data-label="Peso del fruto" className="num">{c.avgWeightGrams} g</td>
                  <td data-label="Precio de referencia" className="num">
                    <span className="paid-cell">
                      {formatUsd(c.defaultPriceKg)} / kg
                      <span className="paid-track" aria-hidden="true">
                        <span className="paid-bar" style={{ width: `${(c.defaultPriceKg / maxPrice) * 100}%` }} />
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
