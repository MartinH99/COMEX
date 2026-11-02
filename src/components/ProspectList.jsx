import { useState } from 'react';
import { buildProspectSheets, downloadExcel } from '../lib/excelExport';
import { downloadProspectPdf } from '../lib/prospectPdf';
import { ListFilters, matchesDateRange, matchesSearch } from './ListFilters';
import { Pagination, usePagination } from './Pagination';
import { PROSPECT_STATUSES } from './ProspectForm';
import { Entity, ICONS, PageHeader, Stat, formatDate, formatUsd } from './ui';

const STATUS_CLASS = {
  'Nuevo': 'gray',
  'Cotizado': 'pend',
  'En negociación': 'brand',
  'Perdido': 'alert',
  'Convertido': 'ok'
};

const isOpen = (prospect) => prospect.status !== 'Perdido' && prospect.status !== 'Convertido';

export function ProspectList({ prospects, readOnly, onNew, onEdit, onDelete, onCreateShipment, onOpenShipment }) {
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [convertingId, setConvertingId] = useState(null);
  const [filters, setFilters] = useState({ search: '', from: '', to: '' });
  const [pdfId, setPdfId] = useState(null);
  const [pdfError, setPdfError] = useState(null);

  const handleDownloadPdf = async (prospect) => {
    setPdfId(prospect.id);
    setPdfError(null);
    try {
      await downloadProspectPdf(prospect);
    } catch (err) {
      console.error('Error al generar el PDF:', err);
      setPdfError(`No se pudo generar el PDF de ${prospect.company}. Probá de nuevo.`);
    } finally {
      setPdfId(null);
    }
  };

  const today = new Date().toLocaleDateString('en-CA');
  const statusOptions = readOnly
    ? ['Todos', 'Cotizado', 'En negociación', 'Convertido']
    : ['Todos', ...PROSPECT_STATUSES, 'Convertido'];
  const visible = prospects.filter(p => {
    if (statusFilter !== 'Todos' && p.status !== statusFilter) return false;
    return matchesSearch(filters.search, [p.company, p.country, p.contact, p.email, p.product, p.port])
      && matchesDateRange(p.validUntil, filters.from, filters.to);
  });

  const { pageItems, page, totalPages, setPage } = usePagination(visible, JSON.stringify([statusFilter, filters]));

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
      <PageHeader
        icon={ICONS.prospects}
        title={readOnly ? 'Mis prospectos' : 'Prospectos'}
        description={readOnly ? 'Las propuestas que te enviamos.' : 'Presupuestos y oportunidades antes de convertirse en embarque.'}
      >
        {!readOnly && <button className="btn btn-primary" onClick={onNew}>+ Nuevo prospecto</button>}
      </PageHeader>

      <div className="kpi-grid stat-grid">
        <Stat icon={ICONS.prospects} label="Prospectos abiertos" value={open.length} sub="Nuevos, cotizados o en negociación" />
        <Stat icon={ICONS.collections} label="Valor en cartera" value={formatUsd(openUsd)} sub="Suma de presupuestos abiertos" />
        <Stat icon={ICONS.box} label="Volumen en cartera" value={openBoxes.toLocaleString('en-US')} sub="Cajas de 10 kg" />
        <Stat icon={ICONS.check} label="Convertidos" value={converted} sub="Con embarque creado" />
      </div>

      <div className="pills page-filter">
        {statusOptions.map(status => (
          <button key={status} className={statusFilter === status ? 'active' : ''} onClick={() => setStatusFilter(status)}>
            {status}
          </button>
        ))}
      </div>

      <ListFilters
        filters={filters}
        setFilters={setFilters}
        searchPlaceholder="Empresa, contacto, producto o puerto"
        dateLabel="Validez"
        total={prospects.length}
        shown={visible.length}
        onExport={() => downloadExcel(buildProspectSheets(visible, { includeNotes: !readOnly }), 'Prospectos')}
      />

      {pdfError && <div className="action-error" role="alert">{pdfError}</div>}

      <div className="section">
        {visible.length === 0 ? (
          <div className="empty">{prospects.length > 0
            ? 'No hay prospectos con este estado.'
            : (readOnly ? 'Todavía no tenés propuestas.' : 'Todavía no hay prospectos. Creá el primero con "+ Nuevo prospecto".')}</div>
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
                {pageItems.map(p => {
                  const expired = isOpen(p) && p.validUntil && p.validUntil < today;
                  return (
                    <tr key={p.id}>
                      <td>
                        <Entity name={p.company} detail={[p.country, p.contact].filter(Boolean).join(' · ')} />
                      </td>
                      <td data-label="Producto">{p.product}</td>
                      <td data-label="Puerto">{p.port || '—'}</td>
                      <td data-label="Validez">
                        <span>
                          {formatDate(p.validUntil)}
                          {expired && <> <span className="badge alert">Vencida</span></>}
                        </span>
                      </td>
                      <td data-label="Estado"><span className={`badge ${STATUS_CLASS[p.status] || 'gray'}`}>{p.status}</span></td>
                      <td data-label="Cajas" className="num">{p.boxes.toLocaleString('en-US')}</td>
                      <td data-label="Presupuesto USD" className="num strong">{formatUsd(p.totalUsd)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="btn btn-small"
                            disabled={p.boxes === 0 || pdfId === p.id}
                            title={p.boxes === 0 ? 'Agregá calibres con cajas para generar el presupuesto' : undefined}
                            onClick={() => handleDownloadPdf(p)}
                          >
                            {pdfId === p.id ? 'Generando…' : 'PDF'}
                          </button>
                          {p.shipmentId ? (
                            <button className="btn btn-small" onClick={() => onOpenShipment(p.shipmentId)}>Ver embarque</button>
                          ) : !readOnly && (
                            <>
                              {isOpen(p) && (
                                <button className="btn btn-small btn-primary" disabled={convertingId === p.id} onClick={() => handleCreateShipment(p)}>
                                  Crear embarque
                                </button>
                              )}
                              <button className="btn btn-small" onClick={() => onEdit(p)}>Editar</button>
                            </>
                          )}
                          {!readOnly && (
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
                          )}
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

      <Pagination page={page} totalPages={totalPages} setPage={setPage} />
    </section>
  );
}
