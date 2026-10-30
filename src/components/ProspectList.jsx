import { useState } from 'react';
import { PROSPECT_STATUSES } from './ProspectForm';
import { formatDate, formatUsd } from './ui';

const STATUS_CLASS = {
  'Nuevo': 'gray',
  'Cotizado': 'pend',
  'En negociación': 'brand',
  'Perdido': 'alert',
  'Convertido': 'ok'
};

const isOpen = (prospect) => prospect.status !== 'Perdido' && prospect.status !== 'Convertido';

export function ProspectList({ prospects, onNew, onEdit, onDelete, onCreateShipment, onOpenShipment }) {
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [convertingId, setConvertingId] = useState(null);

  const today = new Date().toLocaleDateString('en-CA');
  const filters = ['Todos', ...PROSPECT_STATUSES, 'Convertido'];
  const visible = statusFilter === 'Todos' ? prospects : prospects.filter(p => p.status === statusFilter);

  const open = prospects.filter(isOpen);
  const openUsd = open.reduce((sum, p) => sum + p.totalUsd, 0);
  const openBoxes = open.reduce((sum, p) => sum + p.boxes, 0);
  const converted = prospects.filter(p => p.status === 'Convertido').length;

  const handleCreateShipment = async (prospect) => {
    setConvertingId(prospect.id);
    await onCreateShipment(prospect);
    setConvertingId(null);
  };

  return (
    <section>
      <div className="page-header">
        <h1>Prospectos</h1>
        <div className="right">
          <button className="btn btn-primary" onClick={onNew}>+ Nuevo prospecto</button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Prospectos abiertos</div>
          <div className="kpi-value">{open.length}</div>
          <div className="kpi-sub">Nuevos, cotizados o en negociación</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Valor en cartera</div>
          <div className="kpi-value">{formatUsd(openUsd)}</div>
          <div className="kpi-sub">Suma de presupuestos abiertos</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Volumen en cartera</div>
          <div className="kpi-value">{openBoxes.toLocaleString('en-US')}</div>
          <div className="kpi-sub">Cajas de 10 kg</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Convertidos</div>
          <div className="kpi-value">{converted}</div>
          <div className="kpi-sub">Con embarque creado</div>
        </div>
      </div>

      <div className="pills page-filter">
        {filters.map(status => (
          <button key={status} className={statusFilter === status ? 'active' : ''} onClick={() => setStatusFilter(status)}>
            {status}
          </button>
        ))}
      </div>

      <div className="section">
        {visible.length === 0 ? (
          <div className="empty">{prospects.length === 0 ? 'Todavía no hay prospectos. Creá el primero con "+ Nuevo prospecto".' : 'No hay prospectos con este estado.'}</div>
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Producto</th>
                  <th>Puerto</th>
                  <th>Validez</th>
                  <th>Estado</th>
                  <th className="num">Cajas</th>
                  <th className="num">Presupuesto USD</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {visible.map(p => {
                  const expired = isOpen(p) && p.validUntil && p.validUntil < today;
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="strong">{p.company}</div>
                        <div className="kpi-sub">{[p.country, p.contact].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td>{p.product}</td>
                      <td>{p.port || '—'}</td>
                      <td>
                        {formatDate(p.validUntil)}
                        {expired && <> <span className="badge alert">Vencida</span></>}
                      </td>
                      <td><span className={`badge ${STATUS_CLASS[p.status] || 'gray'}`}>{p.status}</span></td>
                      <td className="num">{p.boxes.toLocaleString('en-US')}</td>
                      <td className="num strong">{formatUsd(p.totalUsd)}</td>
                      <td>
                        <div className="row-actions">
                          {p.shipmentId ? (
                            <button className="btn btn-small" onClick={() => onOpenShipment(p.shipmentId)}>Ver embarque</button>
                          ) : (
                            <>
                              {isOpen(p) && (
                                <button className="btn btn-small btn-primary" disabled={convertingId === p.id} onClick={() => handleCreateShipment(p)}>
                                  Crear embarque
                                </button>
                              )}
                              <button className="btn btn-small" onClick={() => onEdit(p)}>Editar</button>
                            </>
                          )}
                          <button
                            className="icon-btn"
                            aria-label={`Eliminar prospecto ${p.company}`}
                            title="Eliminar"
                            onClick={() => onDelete(p)}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M19 6l-1 14H6L5 6" />
                            </svg>
                          </button>
                        </div>
                      </td>
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
