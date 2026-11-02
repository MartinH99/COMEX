import { useState } from 'react';

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Sin distinguir mayúsculas ni acentos; todas las palabras deben aparecer en algún campo
export function matchesSearch(query, fields) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const haystack = normalize(fields.join(' '));
  return words.every(word => haystack.includes(word));
}

// Fechas 'AAAA-MM-DD': se comparan como texto. Con un rango activo, un registro sin fecha queda afuera
export function matchesDateRange(value, from, to) {
  if (!from && !to) return true;
  if (!value) return false;
  return (!from || value >= from) && (!to || value <= to);
}

export function ListFilters({ filters, setFilters, searchPlaceholder, dateLabel, total, shown, onExport }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  const update = (field) => (e) => setFilters({ ...filters, [field]: e.target.value });
  const hasFilters = filters.search || filters.from || filters.to;

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      await onExport();
    } catch (err) {
      console.error('Error al exportar:', err);
      setError('No se pudo generar el archivo. Probá de nuevo.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="list-filters">
      <div className="list-filters-search">
        <label htmlFor="listSearch">Buscar</label>
        <input id="listSearch" type="search" placeholder={searchPlaceholder} value={filters.search} onChange={update('search')} />
      </div>
      <div className="list-filters-date">
        <label htmlFor="listFrom">{dateLabel} desde</label>
        <input id="listFrom" type="date" max={filters.to || undefined} value={filters.from} onChange={update('from')} />
      </div>
      <div className="list-filters-date">
        <label htmlFor="listTo">{dateLabel} hasta</label>
        <input id="listTo" type="date" min={filters.from || undefined} value={filters.to} onChange={update('to')} />
      </div>
      <div className="list-filters-actions">
        {hasFilters && (
          <button type="button" className="btn btn-subtle" onClick={() => setFilters({ search: '', from: '', to: '' })}>Limpiar</button>
        )}
        <button type="button" className="btn" disabled={shown === 0 || exporting} onClick={handleExport}>
          {exporting ? 'Generando…' : 'Exportar a Excel'}
        </button>
      </div>
      <div className="list-filters-count" role="status">
        Mostrando {shown} de {total}
        {error && <span className="list-filters-error"> · {error}</span>}
      </div>
    </div>
  );
}
