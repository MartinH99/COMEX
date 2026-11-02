import { useState } from 'react';
import { formatUsd } from './ui';

const compact = (value) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
};

// Columnas de una sola serie. El detalle aparece al pasar el mouse o con el teclado
export function MonthlyChart({ data }) {
  const [active, setActive] = useState(null);
  const max = Math.max(...data.map(item => item.value), 1);
  const highlighted = data[active];

  return (
    <div className="chart">
      <div className="chart-readout" aria-live="polite">
        {highlighted ? `${highlighted.label}: ${formatUsd(highlighted.value)}` : `Máximo: ${compact(max)}`}
      </div>
      <div className="chart-columns">
        {data.map((item, index) => (
          <button
            type="button"
            key={item.label}
            className={`chart-column${active === index ? ' active' : ''}`}
            aria-label={`${item.label}: ${formatUsd(item.value)}`}
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
          >
            <span className="chart-column-track">
              <span className="chart-column-bar" style={{ height: `${(item.value / max) * 100}%` }} />
            </span>
            <span className="chart-column-label">{item.shortLabel}</span>
          </button>
        ))}
      </div>
      <details className="chart-table">
        <summary>Ver como tabla</summary>
        <table className="detail">
          <thead><tr><th>Mes</th><th className="num">Ventas USD</th></tr></thead>
          <tbody>
            {data.map(item => (
              <tr key={item.label}><td>{item.label}</td><td className="num">{formatUsd(item.value)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// Barras horizontales ordenadas, con el valor al final de cada una
export function RankingChart({ data, limit = 6 }) {
  const top = data.slice(0, limit);
  const rest = data.slice(limit);
  const rows = rest.length > 0
    ? [...top, { label: `Otros (${rest.length})`, value: rest.reduce((sum, item) => sum + item.value, 0) }]
    : top;
  const max = Math.max(...rows.map(item => item.value), 1);

  return (
    <ul className="chart-ranking">
      {rows.map(item => (
        <li key={item.label} title={`${item.label}: ${formatUsd(item.value)}`}>
          <span className="chart-ranking-label">{item.label}</span>
          <span className="chart-ranking-track">
            <span className="chart-ranking-bar" style={{ width: `${(item.value / max) * 100}%` }} />
          </span>
          <span className="chart-ranking-value">{compact(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}
