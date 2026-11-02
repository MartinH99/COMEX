import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import { formatDateTime } from './ui';

const CATEGORIES = ['Factura', 'Packing list', 'Certificado fitosanitario', 'Bill of lading', 'Otro'];
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc,.csv,.txt';

const formatSize = (bytes) => (bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);

export function ShipmentDocuments({ shipment, readOnly }) {
  const [documents, setDocuments] = useState(null);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [visibleToClient, setVisibleToClient] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    let ignore = false;
    apiFetch(`/api/shipments/${shipment.id}/documents`)
      .then(response => {
        if (!response.ok) throw new Error('No se pudieron cargar los documentos.');
        return response.json();
      })
      .then(data => { if (!ignore) setDocuments(data); })
      .catch(err => { if (!ignore) setError(err.message); });
    return () => { ignore = true; };
  }, [shipment.id]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > MAX_BYTES) {
      setError('El archivo supera el máximo de 4 MB.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const params = new URLSearchParams({ name: file.name, category, visibleToClient: visibleToClient ? '1' : '0' });
      const response = await apiFetch(`/api/shipments/${shipment.id}/documents?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo subir el archivo.');
      setDocuments(prev => [data, ...(prev || [])]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (doc) => {
    setError(null);
    const response = await apiFetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
    if (response.ok) {
      setDocuments(prev => prev.filter(item => item.id !== doc.id));
    } else {
      setError('No se pudo eliminar el documento.');
    }
  };

  return (
    <div className="documents">
      <h3>Documentos</h3>

      {!readOnly && (
        <div className="documents-upload">
          <div>
            <label htmlFor={`doc-category-${shipment.id}`}>Tipo</label>
            <select id={`doc-category-${shipment.id}`} value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <label className="documents-check">
            <input type="checkbox" checked={visibleToClient} onChange={e => setVisibleToClient(e.target.checked)} />
            Visible para el cliente
          </label>
          <input ref={fileInput} className="documents-file" type="file" aria-label="Elegir archivo" accept={ACCEPTED} onChange={handleUpload} />
          <button type="button" className="btn btn-small" disabled={saving} onClick={() => fileInput.current.click()}>
            {saving ? 'Subiendo…' : 'Subir archivo'}
          </button>
          <span className="kpi-sub">Máximo 4 MB</span>
        </div>
      )}

      {error && <div className="action-error" role="alert">{error}</div>}

      {documents?.length === 0 && <span className="kpi-sub">Todavía no hay documentos.</span>}
      {documents?.length > 0 && (
        <ul className="documents-list">
          {documents.map(doc => (
            <li key={doc.id}>
              <span className="documents-info">
                <a href={`/api/documents/${doc.id}/download`}>{doc.fileName}</a>
                <span className="kpi-sub">
                  {doc.category} · {formatSize(doc.sizeBytes)} · {formatDateTime(doc.createdAt)}
                  {!readOnly && !doc.visibleToClient && ' · Solo interno'}
                </span>
              </span>
              {!readOnly && (
                <button type="button" className="icon-btn" aria-label={`Eliminar ${doc.fileName}`} title="Eliminar" onClick={() => handleDelete(doc)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 6 6 18" />
                    <path d="M6 6l12 12" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
