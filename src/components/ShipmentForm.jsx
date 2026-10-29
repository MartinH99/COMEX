import React, { useState } from 'react';
import { CALIBERS_MASTER } from '../data/mockData';

export function ShipmentForm({ clients, onSave }) {
  const [formData, setFormData] = useState({
    clientId: clients[0]?.id || 1,
    condition: 'Venta',
    deal: 'Precio Cerrado',
    product: 'Kiwi Hayward Green',
    fruitType: 'Convencional',
    category: 'Cat 1',
    loadWeek: 18,
    etaWeek: 'Semana 20',
    transport: 'Marítimo',
    port: '',
    paymentTerms: clients[0]?.defaultPayment || '50/50; 15 días llegada',
    variance: 2.0
  });

  const [calibres, setCalibres] = useState(() => {
    const init = {};
    CALIBERS_MASTER.forEach(c => {
      init[c.code] = { boxes: 0, priceKg: c.defaultPriceKg };
    });
    return init;
  });

  const handleClientChange = (e) => {
    const cId = parseInt(e.target.value, 10);
    const selected = clients.find(c => c.id === cId);
    setFormData(prev => ({
      ...prev,
      clientId: cId,
      paymentTerms: selected ? selected.defaultPayment : prev.paymentTerms
    }));
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

  const distributeEquitativeMix = () => {
    const target = ['C27', 'C30', 'C33', 'C36'];
    const boxesEach = Math.floor(2288 / target.length);
    setCalibres(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(code => {
        updated[code].boxes = target.includes(code) ? boxesEach : 0;
      });
      return updated;
    });
  };

  const totalBoxes = Object.values(calibres).reduce((sum, item) => sum + item.boxes, 0);
  const totalUsd = Object.values(calibres).reduce((sum, item) => sum + (item.boxes * 10 * item.priceKg), 0);
  const totalPallets = (totalBoxes / 104).toFixed(1);
  const totalTons = ((totalBoxes * 10) / 1000).toFixed(2);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (totalBoxes === 0) {
      alert('Ingresa la cantidad de cajas en al menos un calibre.');
      return;
    }

    const payload = {
      ...formData,
      boxes: totalBoxes,
      calibres,
      totalUsd
    };

    onSave(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="card">
      <h2>➕ Registrar Nuevo Embarque</h2>
      
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="clientId">Cliente</label>
          <select id="clientId" value={formData.clientId} onChange={handleClientChange} required>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.company} ({c.country})</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="condition">Condición Comercial</label>
          <select id="condition" value={formData.condition} onChange={e => setFormData({...formData, condition: e.target.value})}>
            <option value="Venta">Venta</option>
            <option value="Compra">Compra</option>
            <option value="Intercambio">Intercambio</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="deal">Modalidad de Precio</label>
          <select id="deal" value={formData.deal} onChange={e => setFormData({...formData, deal: e.target.value})}>
            <option value="Precio Cerrado">Precio Cerrado</option>
            <option value="Intercambio MG">Intercambio MG (Mínimo Garantizado)</option>
          </select>
        </div>

        <div className="form-group">
  <label htmlFor="transport">Tipo de Transporte</label>
  <select id="transport" value={formData.transport} onChange={e => setFormData({...formData, transport: e.target.value})}>
    <option value="Aéreo">Aéreo</option>
    <option value="Marítimo">Marítimo</option>
    <option value="Terrestre">Terrestre</option>
  </select>
</div>

        <div className="form-group">
          <label htmlFor="loadWeek">Semana de Carga (1-52)</label>
          <input id="loadWeek" type="number" min="1" max="52" value={formData.loadWeek} onChange={e => setFormData({...formData, loadWeek: parseInt(e.target.value, 10)})} required />
        </div>

        <div className="form-group">
          <label htmlFor="port">Puerto de Destino</label>
          <input id="port" type="text" placeholder="Ej: Rotterdam / Shanghai" value={formData.port} onChange={e => setFormData({...formData, port: e.target.value})} required />
        </div>

        <div className="form-group">
          <label htmlFor="paymentTerms">Condición de Pago</label>
          <input id="paymentTerms" type="text" value={formData.paymentTerms} onChange={e => setFormData({...formData, paymentTerms: e.target.value})} required />
        </div>
      </div>

      <div className="pallet-spec-box" style={{ marginTop: '1.5rem' }}>
        <div className="flex-between">
          <div>
            <strong>Regla de Carga:</strong> 22 Pallets = 2,288 Cajas (22.88 Toneladas)
          </div>
          <button type="button" className="btn btn-secondary" onClick={distributeEquitativeMix}>⚡ Distribuir Homogéneo</button>
        </div>
        <div style={{ marginTop: '0.5rem', fontWeight: 'bold', color: totalBoxes === 2288 ? 'green' : 'red' }}>
          Configurado: {totalBoxes} / 2,288 Cajas ({totalPallets} / 22 Pallets — {totalTons} TN)
        </div>
      </div>

      <div className="caliber-matrix">
        {CALIBERS_MASTER.map(c => (
          <div key={c.code} className="caliber-card">
            <div className="cal-title">{c.code} ({c.label})</div>
            <label htmlFor={`boxes-${c.code}`}>Cajas 10kg:</label>
            <input id={`boxes-${c.code}`} type="number" min="0" value={calibres[c.code].boxes} onChange={e => handleCaliberBoxChange(c.code, e.target.value)} />
            <label htmlFor={`price-${c.code}`}>USD / Kg:</label>
            <input id={`price-${c.code}`} type="number" step="0.01" value={calibres[c.code].priceKg} onChange={e => handleCaliberPriceChange(c.code, e.target.value)} />
          </div>
        ))}
      </div>

      <div className="form-footer">
        <div className="total-usd-display">Total USD: ${totalUsd.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
        <button type="submit" className="btn btn-primary">💾 Guardar Embarque en BD</button>
      </div>
    </form>
  );
}