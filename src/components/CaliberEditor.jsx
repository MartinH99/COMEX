import { CALIBERS_MASTER } from '../data/mockData';
import { formatUsd } from './ui';

export const getCaliberTotals = (calibres) => ({
  boxes: Object.values(calibres).reduce((sum, item) => sum + item.boxes, 0),
  usd: Object.values(calibres).reduce((sum, item) => sum + (item.boxes * 10 * item.priceKg), 0)
});

// Tabla de calibres elegidos; `calibres` solo contiene los que lleva la operación
export function CaliberEditor({ calibres, setCalibres }) {
  const selectedCalibers = CALIBERS_MASTER.filter(c => calibres[c.code]);
  const availableCalibers = CALIBERS_MASTER.filter(c => !calibres[c.code]);
  const totalBoxes = getCaliberTotals(calibres).boxes;
  const totalPallets = (totalBoxes / 104).toFixed(1);
  const totalTons = ((totalBoxes * 10) / 1000).toFixed(2);

  const handleAddCaliber = (e) => {
    const caliber = CALIBERS_MASTER.find(c => c.code === e.target.value);
    if (!caliber) return;
    setCalibres(prev => ({
      ...prev,
      [caliber.code]: { boxes: 0, priceKg: caliber.defaultPriceKg }
    }));
  };

  const handleRemoveCaliber = (code) => {
    setCalibres(prev => {
      const updated = { ...prev };
      delete updated[code];
      return updated;
    });
  };

  const handleCaliberBoxChange = (code, value) => {
    setCalibres(prev => ({
      ...prev,
      [code]: { ...prev[code], boxes: parseInt(value, 10) || 0 }
    }));
  };

  const handleCaliberPriceChange = (code, value) => {
    setCalibres(prev => ({
      ...prev,
      [code]: { ...prev[code], priceKg: parseFloat(value) || 0 }
    }));
  };

  // Reparte las 2,288 cajas entre los calibres elegidos (o el mix habitual si no hay ninguno)
  const distributeEquitativeMix = () => {
    setCalibres(prev => {
      const codes = Object.keys(prev).length > 0 ? Object.keys(prev) : ['C27', 'C30', 'C33', 'C36'];
      const boxesEach = Math.floor(2288 / codes.length);
      const remainder = 2288 % codes.length;
      const updated = {};
      codes.forEach((code, i) => {
        const priceKg = prev[code]?.priceKg ?? CALIBERS_MASTER.find(c => c.code === code).defaultPriceKg;
        updated[code] = { priceKg, boxes: boxesEach + (i < remainder ? 1 : 0) };
      });
      return updated;
    });
  };

  return (
    <div className="section">
      <div className="section-header">
        <h2>Calibres</h2>
        <div className="right">
          <select
            className="caliber-picker"
            aria-label="Agregar calibre"
            value=""
            disabled={availableCalibers.length === 0}
            onChange={handleAddCaliber}
          >
            <option value="">+ Agregar calibre</option>
            {availableCalibers.map(c => (
              <option key={c.code} value={c.code}>{c.code} · {c.label}</option>
            ))}
          </select>
          <button type="button" className="btn btn-small" onClick={distributeEquitativeMix}>Distribuir homogéneo</button>
        </div>
      </div>

      <div className={`load-bar${totalBoxes === 2288 ? ' complete' : ''}`}>
        <span>Regla de carga: 22 pallets = 2,288 cajas (22.88 TN)</span>
        <span className="right">Configurado: <strong>{totalBoxes.toLocaleString('en-US')} / 2,288 cajas</strong> ({totalPallets} / 22 pallets — {totalTons} TN)</span>
      </div>

      {selectedCalibers.length === 0 ? (
        <div className="empty">Agregá los calibres desde "+ Agregar calibre".</div>
      ) : (
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Calibre</th>
                <th>Denominación</th>
                <th className="num">Cajas 10 kg</th>
                <th className="num">USD / kg</th>
                <th className="num">Subtotal USD</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {selectedCalibers.map(c => (
                <tr key={c.code}>
                  <td className="strong">{c.code}</td>
                  <td>{c.label}</td>
                  <td className="num">
                    <input aria-label={`Cajas ${c.code}`} type="number" min="0" value={calibres[c.code].boxes} onChange={e => handleCaliberBoxChange(c.code, e.target.value)} />
                  </td>
                  <td className="num">
                    <input aria-label={`USD por kg ${c.code}`} type="number" min="0" step="0.01" value={calibres[c.code].priceKg} onChange={e => handleCaliberPriceChange(c.code, e.target.value)} />
                  </td>
                  <td className="num">{formatUsd(calibres[c.code].boxes * 10 * calibres[c.code].priceKg)}</td>
                  <td>
                    <button type="button" className="icon-btn" aria-label={`Quitar calibre ${c.code}`} title="Quitar" onClick={() => handleRemoveCaliber(c.code)}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 6 6 18" />
                        <path d="M6 6l12 12" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
