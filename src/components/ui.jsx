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

export const ICONS = {
  prospects: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'M14 2v6h6', 'M9 13h6', 'M9 17h6'],
  shipments: ['M2 20h20', 'M4 20l-1-6h18l-2 6', 'M6 14V8h12v6', 'M12 8V3'],
  collections: ['M12 2v20', 'M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'],
  clients: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  calibers: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  users: ['M12 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M5 21a7 7 0 0 1 14 0', 'M12 2v2'],
  box: ['M21 8 12 3 3 8v8l9 5 9-5V8Z', 'M3 8l9 5 9-5', 'M12 13v8'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 7v5l3 2'],
  check: ['M20 6 9 17l-5-5'],
  alert: ['M12 3 2 20h20L12 3Z', 'M12 10v4', 'M12 17h.01'],
  trend: ['M23 6 13.5 15.5 8.5 10.5 1 18', 'M17 6h6v6'],
  globe: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M2 12h20', 'M12 2c3 3 4 6 4 10s-1 7-4 10c-3-3-4-6-4-10s1-7 4-10Z'],
  star: ['M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z'],
  shield: ['M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z'],
  tag: ['M3 12V3h9l9 9-9 9-9-9Z', 'M8 8h.01'],
  scale: ['M12 3v18', 'M7 21h10', 'M5 7h14', 'M5 7l-3 7a3.5 3.5 0 0 0 6 0L5 7', 'M19 7l-3 7a3.5 3.5 0 0 0 6 0l-3-7']
};

export function Icon({ paths, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map(d => <path key={d} d={d} />)}
    </svg>
  );
}

export function PageHeader({ icon, title, description, children }) {
  return (
    <header className="page-title">
      <span className="page-title-icon"><Icon paths={icon} size={21} /></span>
      <div className="page-title-text">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="page-title-actions">{children}</div>}
    </header>
  );
}

export function Stat({ icon, label, value, sub, tone }) {
  return (
    <div className={`kpi stat${tone ? ` stat-${tone}` : ''}`}>
      <span className="kpi-icon"><Icon paths={icon} /></span>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();

// Nombre con su inicial y, debajo, un dato secundario
export function Entity({ name, detail }) {
  return (
    <span className="entity">
      <span className="entity-avatar" aria-hidden="true">{initials(name)}</span>
      <span className="entity-text">
        <span className="entity-name">{name}</span>
        {detail && <span className="entity-detail">{detail}</span>}
      </span>
    </span>
  );
}

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
