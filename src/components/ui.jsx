import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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

const EYE = ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'];
const EYE_OFF = [
  'M3 3l18 18',
  'M10.6 5.1A9.9 9.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1',
  'M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6',
  'M9.9 9.9a3 3 0 0 0 4.2 4.2'
];

// Campo de contraseña con un botón para mostrarla u ocultarla
export function PasswordInput(props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <input {...props} type={visible ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button
        type="button"
        className="password-toggle"
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        title={visible ? 'Ocultar' : 'Mostrar'}
        onClick={() => setVisible(!visible)}
      >
        <Icon paths={visible ? EYE_OFF : EYE} size={17} />
      </button>
    </div>
  );
}

// Foto si la hay; si falta o no carga, las iniciales
export function AvatarImage({ className, name, src }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const showImage = src && failedSrc !== src;

  return (
    <span className={className} aria-hidden="true">
      {showImage
        ? <img className="avatar-photo" src={src} alt="" onError={() => setFailedSrc(src)} />
        : initials(name)}
    </span>
  );
}

// Foto del usuario con sesión, o de otro usuario para un administrador
export const ownAvatarUrl = (user) => (user.hasAvatar ? `/api/auth/avatar?v=${encodeURIComponent(user.avatarVersion)}` : null);
export const userAvatarUrl = (user) => (user.hasAvatar ? `/api/users/${user.id}/avatar?v=${encodeURIComponent(user.avatarVersion)}` : null);

// Nombre con su inicial y, debajo, un dato secundario
export function Entity({ name, detail, image }) {
  return (
    <span className="entity">
      <AvatarImage className="entity-avatar" name={name} src={image} />
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

// Foto a pantalla completa: se cierra con la X, tocando afuera o con Escape
export function PhotoViewer({ src, alt, onClose }) {
  const closeButton = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    closeButton.current.focus();
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      opener?.focus();
    };
  }, [onClose]);

  // Va en el body: la animación de entrada de cada pantalla encerraría al visor dentro de la sección
  return createPortal(
    <div className="overlay photo-viewer" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}>
      <button ref={closeButton} type="button" className="photo-viewer-close" aria-label="Cerrar" onClick={onClose}>×</button>
      <img src={src} alt={alt} onClick={e => e.stopPropagation()} />
    </div>,
    document.body
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
