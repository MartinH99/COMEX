export const formatUsd = (value) =>
  `$${(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Recibe 'AAAA-MM-DD'; se parte a mano para que la zona horaria no corra el día
export const formatDate = (value) => {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};

// Recibe el CURRENT_TIMESTAMP de SQLite, que está en UTC
export const formatDateTime = (value) =>
  new Date(`${value.replace(' ', 'T')}Z`).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });

const STATUS_CLASS = {
  'Programado': 'pend',
  'En Tránsito': 'brand',
  'Entregado': 'ok'
};

export function StatusBadge({ status }) {
  return <span className={`badge ${STATUS_CLASS[status] || 'gray'}`}>{status}</span>;
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="overlay" onClick={onClose} onKeyDown={e => e.key === 'Escape' && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}>
        <h2 id="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p>{message}</p>
      <div className="modal-actions">
        <button className="btn btn-subtle" autoFocus onClick={onCancel}>Cancelar</button>
        <button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

export function Toasts({ toasts }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}
    </div>
  );
}
