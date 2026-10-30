import { CALIBERS_MASTER } from '../data/mockData';
import { formatUsd } from './ui';

export function CaliberList() {
  return (
    <section style={{ maxWidth: 1000 }}>
      <div className="page-header">
        <h1>Calibres</h1>
        <span className="badge brand">Matriz oficial · {CALIBERS_MASTER.length} calibres</span>
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
                  <td className="strong">{c.code}</td>
                  <td data-label="Denominación">{c.label}</td>
                  <td data-label="Frutos / caja 10 kg" className="num">{c.fruitsBox}</td>
                  <td data-label="Peso del fruto" className="num">{c.avgWeightGrams} g</td>
                  <td data-label="Precio de referencia" className="num">{formatUsd(c.defaultPriceKg)} / kg</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
