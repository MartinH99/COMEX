import { useState } from 'react';
import { CaliberEditor, getCaliberTotals } from './CaliberEditor';
import { useProductSelect } from './ProductSelect';
import { formatUsd } from './ui';

export function ShipmentForm({ clients, products, draft, onSave, onCancel, onError, onCreateProduct }) {
  const [formData, setFormData] = useState(() => {
    const client = clients.find(c => c.id === draft?.clientId) || clients[0];
    return {
      clientId: client?.id || 1,
      condition: draft?.condition || 'Venta',
      deal: draft?.deal || 'Precio Cerrado',
      product: draft?.product || products[0]?.name || 'Kiwi',
      fruitType: 'Convencional',
      category: 'Cat 1',
      loadWeek: draft?.loadWeek || 18,
      deliveryDate: draft?.deliveryDate || '',
      transport: draft?.transport || 'Marítimo',
      port: draft?.port || '',
      paymentTerms: draft?.paymentTerms || client?.defaultPayment || '50/50; 15 días llegada',
      variance: draft?.variance ?? 2.0
    };
  });

  const [calibres, setCalibres] = useState(draft?.calibres || {});
  const { boxes: totalBoxes, usd: totalUsd } = getCaliberTotals(calibres);

  const productSelect = useProductSelect({
    value: formData.product,
    onChange: product => setFormData(prev => ({ ...prev, product })),
    products,
    onCreateProduct
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

  const handleSubmit = (e) => {
    e.preventDefault();
    if (totalBoxes === 0) {
      onError('Ingresá la cantidad de cajas en al menos un calibre.');
      return;
    }

    const payload = {
      ...formData,
      boxes: totalBoxes,
      calibres,
      totalUsd,
      prospectId: draft?.prospectId
    };

    onSave(payload);
  };

  return (
    <>
    <form onSubmit={handleSubmit} style={{ maxWidth: 1000 }}>
      <div className="page-header">
        <h1>Nuevo embarque</h1>
        {draft && <span className="badge brand">Desde prospecto: {draft.company}</span>}
      </div>

      <div className="section">
        <div className="section-header"><h2>Datos comerciales</h2></div>
        <div className="section-body form-grid">
          <div>
            <label htmlFor="clientId">Cliente</label>
            <select id="clientId" value={formData.clientId} onChange={handleClientChange} required>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.company} ({c.country})</option>
              ))}
            </select>
          </div>

          {productSelect.field}

          <div>
            <label htmlFor="condition">Condición comercial</label>
            <select id="condition" value={formData.condition} onChange={e => setFormData({...formData, condition: e.target.value})}>
              <option value="Venta">Venta</option>
              <option value="Compra">Compra</option>
              <option value="Intercambio">Intercambio</option>
            </select>
          </div>

          <div>
            <label htmlFor="deal">Modalidad de precio</label>
            <select id="deal" value={formData.deal} onChange={e => setFormData({...formData, deal: e.target.value})}>
              <option value="Precio Cerrado">Precio Cerrado</option>
              <option value="Intercambio MG">Intercambio MG (Mínimo Garantizado)</option>
            </select>
          </div>

          <div>
            <label htmlFor="transport">Tipo de transporte</label>
            <select id="transport" value={formData.transport} onChange={e => setFormData({...formData, transport: e.target.value})}>
              <option value="Aéreo">Aéreo</option>
              <option value="Marítimo">Marítimo</option>
              <option value="Terrestre">Terrestre</option>
            </select>
          </div>

          <div>
            <label htmlFor="loadWeek">Semana de salida (1-52)</label>
            <input id="loadWeek" type="number" min="1" max="52" value={formData.loadWeek} onChange={e => setFormData({...formData, loadWeek: parseInt(e.target.value, 10)})} required />
          </div>

          <div>
            <label htmlFor="deliveryDate">Fecha de entrega estimada</label>
            <input id="deliveryDate" type="date" value={formData.deliveryDate} onChange={e => setFormData({...formData, deliveryDate: e.target.value})} required />
          </div>

          <div>
            <label htmlFor="variance">Tolerancia de diferencia de carga (%)</label>
            <input id="variance" type="number" min="0" step="0.1" value={formData.variance} onChange={e => setFormData({...formData, variance: parseFloat(e.target.value) || 0})} required />
          </div>

          <div>
            <label htmlFor="port">Puerto de destino</label>
            <input id="port" type="text" placeholder="Ej: Rotterdam / Shanghai" value={formData.port} onChange={e => setFormData({...formData, port: e.target.value})} required />
          </div>

          <div>
            <label htmlFor="paymentTerms">Condición de pago</label>
            <input id="paymentTerms" type="text" value={formData.paymentTerms} onChange={e => setFormData({...formData, paymentTerms: e.target.value})} required />
          </div>
        </div>
      </div>

      <CaliberEditor calibres={calibres} setCalibres={setCalibres} />

      <div className="form-footer">
        <div className="total">Total: {formatUsd(totalUsd)} USD</div>
        <button type="button" className="btn btn-subtle" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn-primary">Guardar embarque</button>
      </div>
    </form>
    {productSelect.modal}
    </>
  );
}
