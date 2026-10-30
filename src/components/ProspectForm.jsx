import { useState } from 'react';
import { CaliberEditor, getCaliberTotals } from './CaliberEditor';
import { useProductSelect } from './ProductSelect';
import { formatUsd } from './ui';

export const PROSPECT_STATUSES = ['Nuevo', 'Cotizado', 'En negociación', 'Perdido'];

export function ProspectForm({ prospect, clients, products, onSave, onCancel, onCreateProduct }) {
  const [form, setForm] = useState({
    clientId: prospect?.clientId ?? '',
    company: prospect?.company || '',
    country: prospect?.country || '',
    contact: prospect?.contact || '',
    email: prospect?.email || '',
    product: prospect?.product || products[0]?.name || 'Kiwi',
    condition: prospect?.condition || 'Venta',
    deal: prospect?.deal || 'Precio Cerrado',
    transport: prospect?.transport || 'Marítimo',
    port: prospect?.port || '',
    loadWeek: prospect?.loadWeek ?? '',
    deliveryDate: prospect?.deliveryDate || '',
    validUntil: prospect?.validUntil || '',
    paymentTerms: prospect?.paymentTerms || '',
    variance: prospect?.variance ?? 2.0,
    status: prospect?.status || 'Nuevo',
    notes: prospect?.notes || ''
  });
  const [calibres, setCalibres] = useState(prospect?.calibres || {});
  const [saving, setSaving] = useState(false);

  const { boxes: totalBoxes, usd: totalUsd } = getCaliberTotals(calibres);
  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const productSelect = useProductSelect({
    value: form.product,
    onChange: product => setForm(prev => ({ ...prev, product })),
    products,
    onCreateProduct
  });

  const handleClientChange = (e) => {
    const clientId = e.target.value ? Number(e.target.value) : '';
    const client = clients.find(c => c.id === clientId);
    setForm(prev => ({
      ...prev,
      clientId,
      paymentTerms: client ? client.defaultPayment : prev.paymentTerms
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave({
      ...form,
      clientId: form.clientId || null,
      loadWeek: form.loadWeek === '' ? null : Number(form.loadWeek),
      variance: Number(form.variance) || 0,
      calibres
    });
    setSaving(false);
  };

  return (
    <>
    <form onSubmit={handleSubmit} style={{ maxWidth: 1000 }}>
      <div className="page-header">
        <h1>{prospect ? 'Editar prospecto' : 'Nuevo prospecto'}</h1>
      </div>

      <div className="section">
        <div className="section-header"><h2>Posible cliente</h2></div>
        <div className="section-body form-grid">
          <div>
            <label htmlFor="prospectClient">Cliente</label>
            <select id="prospectClient" value={form.clientId} onChange={handleClientChange}>
              <option value="">Empresa nueva</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.company} ({c.country})</option>
              ))}
            </select>
          </div>

          {!form.clientId && (
            <>
              <div>
                <label htmlFor="company">Empresa</label>
                <input id="company" type="text" value={form.company} onChange={update('company')} required />
              </div>
              <div>
                <label htmlFor="country">País</label>
                <input id="country" type="text" value={form.country} onChange={update('country')} required />
              </div>
              <div>
                <label htmlFor="contact">Contacto</label>
                <input id="contact" type="text" value={form.contact} onChange={update('contact')} required />
              </div>
            </>
          )}

          <div>
            <label htmlFor="email">Email de contacto (opcional)</label>
            <input id="email" type="email" value={form.email} onChange={update('email')} />
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-header"><h2>Condiciones de la propuesta</h2></div>
        <div className="section-body form-grid">
          {productSelect.field}

          <div>
            <label htmlFor="condition">Condición comercial</label>
            <select id="condition" value={form.condition} onChange={update('condition')}>
              <option value="Venta">Venta</option>
              <option value="Compra">Compra</option>
              <option value="Intercambio">Intercambio</option>
            </select>
          </div>

          <div>
            <label htmlFor="deal">Modalidad de precio</label>
            <select id="deal" value={form.deal} onChange={update('deal')}>
              <option value="Precio Cerrado">Precio Cerrado</option>
              <option value="Intercambio MG">Intercambio MG (Mínimo Garantizado)</option>
            </select>
          </div>

          <div>
            <label htmlFor="transport">Tipo de transporte</label>
            <select id="transport" value={form.transport} onChange={update('transport')}>
              <option value="Aéreo">Aéreo</option>
              <option value="Marítimo">Marítimo</option>
              <option value="Terrestre">Terrestre</option>
            </select>
          </div>

          <div>
            <label htmlFor="port">Puerto de destino</label>
            <input id="port" type="text" placeholder="Ej: Rotterdam / Shanghai" value={form.port} onChange={update('port')} />
          </div>

          <div>
            <label htmlFor="loadWeek">Semana de salida (1-52)</label>
            <input id="loadWeek" type="number" min="1" max="52" value={form.loadWeek} onChange={update('loadWeek')} />
          </div>

          <div>
            <label htmlFor="deliveryDate">Fecha de entrega estimada</label>
            <input id="deliveryDate" type="date" value={form.deliveryDate} onChange={update('deliveryDate')} />
          </div>

          <div>
            <label htmlFor="paymentTerms">Condición de pago</label>
            <input id="paymentTerms" type="text" value={form.paymentTerms} onChange={update('paymentTerms')} />
          </div>

          <div>
            <label htmlFor="variance">Tolerancia de diferencia de carga (%)</label>
            <input id="variance" type="number" min="0" step="0.1" value={form.variance} onChange={update('variance')} />
          </div>

          <div>
            <label htmlFor="validUntil">Validez de la propuesta</label>
            <input id="validUntil" type="date" value={form.validUntil} onChange={update('validUntil')} />
          </div>

          <div>
            <label htmlFor="status">Estado</label>
            <select id="status" value={form.status} onChange={update('status')}>
              {PROSPECT_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
        </div>
      </div>

      <CaliberEditor calibres={calibres} setCalibres={setCalibres} />

      <div className="section">
        <div className="section-header"><h2>Notas</h2></div>
        <div className="section-body">
          <textarea aria-label="Notas" rows="3" placeholder="Próximos pasos, requisitos del cliente, competencia…" value={form.notes} onChange={update('notes')} />
        </div>
      </div>

      <div className="form-footer">
        <div className="total">Presupuesto: {formatUsd(totalUsd)} USD · {totalBoxes.toLocaleString('en-US')} cajas</div>
        <button type="button" className="btn btn-subtle" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar prospecto'}</button>
      </div>
    </form>
    {productSelect.modal}
    </>
  );
}
